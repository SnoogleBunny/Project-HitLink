import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const db = fileURLToPath(new URL("../../packages/pro-db/", import.meta.url));
const prisma = path.join(db, "node_modules/prisma/build/index.js");
const bin = process.env.FLOWSTATE_PRO_TEST_PG_BIN;
const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const person = "00000000-0000-4000-8000-000000000004";

test("Pro Prisma deployments and trusted repositories preserve tenant isolation", async (t) => {
  const scratch = mkdtempSync("/tmp/pro-pg-");
  const pg = (tool, args) =>
    execFileSync(bin ? path.join(bin, tool) : tool, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  let started = false;
  t.after(() => {
    try {
      if (started)
        pg("pg_ctl", ["-D", scratch + "/data", "-m", "immediate", "stop"]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
  pg("initdb", [
    "-D",
    scratch + "/data",
    "-A",
    "trust",
    "-U",
    "pro_test_owner",
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  pg("pg_ctl", [
    "-D",
    scratch + "/data",
    "-l",
    scratch + "/server.log",
    "-o",
    `-k ${scratch} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  started = true;
  const sql = (statement, database = "postgres", user = "pro_test_owner") =>
    pg("psql", [
      "-X",
      "-h",
      scratch,
      "-U",
      user,
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      statement,
    ]).trim();
  const url = (database, user) =>
    `postgresql://${user}@localhost/${database}?host=${encodeURIComponent(scratch)}&connection_limit=1`;
  const deploy = (schema, database) =>
    execFileSync(
      process.execPath,
      [prisma, "migrate", "deploy", "--schema", schema],
      {
        cwd: db,
        env: {
          ...process.env,
          FLOWSTATE_PRO_MIGRATION_DATABASE_URL: url(database, "pro_test_owner"),
        },
        encoding: "utf8",
      },
    );

  sql(
    "CREATE ROLE flowstate_pro_runtime NOLOGIN; CREATE ROLE pro_test_runtime LOGIN INHERIT IN ROLE flowstate_pro_runtime",
  );
  sql("CREATE DATABASE pro_fresh");
  sql("CREATE DATABASE pro_upgrade");

  const source = path.join(db, "prisma");
  const staged = path.join(scratch, "prisma");
  mkdirSync(path.join(staged, "migrations"), { recursive: true });
  copyFileSync(
    path.join(source, "schema.prisma"),
    path.join(staged, "schema.prisma"),
  );
  copyFileSync(
    path.join(source, "migrations/migration_lock.toml"),
    path.join(staged, "migrations/migration_lock.toml"),
  );
  const first = readdirSync(path.join(source, "migrations"))
    .filter((item) => /^\d/.test(item))
    .sort()[0];
  cpSync(
    path.join(source, "migrations", first),
    path.join(staged, "migrations", first),
    { recursive: true },
  );
  deploy(path.join(staged, "schema.prisma"), "pro_upgrade");

  const seed = (database) =>
    sql(
      `
    INSERT INTO "Organization" ("tenantId","externalRef") VALUES ('${tenantA}','synthetic-a'), ('${tenantB}','synthetic-b');
    INSERT INTO "Patient" ("tenantId","id","recordRef") VALUES ('${tenantA}','${person}','synthetic-patient-a'), ('${tenantB}','${person}','synthetic-patient-b'), ('${tenantB}','${actor}','synthetic-b-only');
    INSERT INTO "Identity" ("tenantId","id","kind","subjectRef") VALUES ('${tenantB}','${actor}','WORKFORCE','synthetic-subject-b');
  `,
      database,
    );

  seed("pro_upgrade");
  for (const database of ["pro_fresh", "pro_upgrade"])
    deploy(path.join(source, "schema.prisma"), database);
  seed("pro_fresh");

  const { createPatientRepository } =
    await import("../../packages/pro-db/src/patients.mjs");
  for (const database of ["pro_fresh", "pro_upgrade"]) {
    const runtime = (statement) => sql(statement, database, "pro_test_runtime");
    assert.equal(runtime('SELECT count(*) FROM "Patient"'), "0");
    assert.equal(
      runtime(
        `SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user`,
      ),
      "f",
    );
    assert.equal(
      runtime(
        "SELECT count(*) = 13 AND bool_and(relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner) <> current_user) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname <> '_prisma_migrations'",
      ),
      "t",
    );
    assert.throws(
      () =>
        runtime(
          `INSERT INTO "Patient" ("tenantId","id","recordRef") VALUES ('${tenantA}','${actor}','synthetic-unscoped')`,
        ),
      /row-level security/,
    );
    assert.equal(
      runtime(
        `BEGIN; SET LOCAL flowstate_pro.tenant_id = 'malformed'; SELECT count(*) FROM "Patient"; ROLLBACK;`,
      )
        .split("\n")
        .at(-2),
      "0",
    );
    assert.throws(
      () =>
        runtime(
          `BEGIN; SELECT set_config('flowstate_pro.tenant_id','${tenantA}',true); INSERT INTO "Patient" ("tenantId","id","recordRef") VALUES ('${tenantB}','${actor}','synthetic-cross-tenant'); COMMIT;`,
        ),
      /row-level security/,
    );
    assert.throws(
      () =>
        runtime(
          `BEGIN; SELECT set_config('flowstate_pro.tenant_id','${tenantA}',true); INSERT INTO "RoleAssignment" ("tenantId","id","identityId","role") VALUES ('${tenantA}','${person}','${actor}','synthetic-role'); COMMIT;`,
        ),
      /foreign key constraint/,
    );
    assert.deepEqual(
      runtime(
        `BEGIN; SET LOCAL flowstate_pro.tenant_id = '${tenantB}'; SELECT count(*) FROM "Patient"; COMMIT; SELECT count(*) FROM "Patient";`,
      )
        .split("\n")
        .filter((line) => /^\d+$/.test(line)),
      ["2", "0"],
    );
    assert.throws(
      () => runtime('ALTER TABLE "Patient" DISABLE ROW LEVEL SECURITY'),
      /must be owner/,
    );
    assert.throws(
      () => runtime('DELETE FROM "AuditEvent"'),
      /permission denied/,
    );

    const repo = createPatientRepository(url(database, "pro_test_runtime"));
    try {
      const context = {
        tenantId: tenantA,
        actorId: actor,
        purpose: "synthetic-verification",
      };
      assert.equal(
        (await repo.findPatient(context, person)).recordRef,
        "synthetic-patient-a",
      );
      assert.equal(await repo.findPatient(context, actor), null);
      assert.equal(
        (await repo.findPatient({ ...context, tenantId: tenantB }, person))
          .recordRef,
        "synthetic-patient-b",
      );
      assert.equal(
        (await repo.findPatient(context, person)).recordRef,
        "synthetic-patient-a",
      );
      await assert.rejects(
        repo.findPatient({ ...context, tenantId: "invalid" }, person),
        /trusted context/,
      );
      await assert.rejects(
        repo.findPatient(context, { tenantId: tenantB, id: person }),
        /patient ID/,
      );
    } finally {
      await repo.close();
    }
  }
});
