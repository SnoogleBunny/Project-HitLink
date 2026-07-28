import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

import { runGuardedDemoAction } from "./demo-database-safety.mjs";

const approvedLocalEnvironment = {
  DATABASE_URL:
    "postgresql://postgres:test@localhost:5432/flowstate_demo_safety?schema=public",
  FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT:
    "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE",
  FLOWSTATE_DEMO_DATABASE_NAME: "flowstate_demo_safety",
  NODE_ENV: "test",
};

const targetChangingHostUrls = [
  {
    label: "a host query parameter",
    value:
      "postgresql://safety-user:not-for-error-output@localhost:1/flowstate_demo_safety?schema=public&host=target-host.invalid",
  },
  {
    label: "repeated host query parameters",
    value:
      "postgresql://safety-user:not-for-error-output@localhost:1/flowstate_demo_safety?host=localhost&host=target-host.invalid&schema=public",
  },
  {
    label: "an encoded host query parameter",
    value:
      "postgresql://safety-user:not-for-error-output@localhost:1/flowstate_demo_safety?schema=public&%68%6f%73%74=target%2Dhost%2Einvalid",
  },
  {
    label: "a local-valued host query parameter",
    value:
      "postgresql://safety-user:not-for-error-output@localhost:1/flowstate_demo_safety?schema=public&host=127.0.0.1",
  },
];

function assertConnectionDetailsAreRedacted(output, databaseUrl) {
  const parsedDatabaseUrl = new URL(databaseUrl);

  assert.equal(output.includes(databaseUrl), false);
  assert.equal(output.includes("postgresql://"), false);
  assert.equal(output.includes(parsedDatabaseUrl.username), false);
  assert.equal(output.includes(parsedDatabaseUrl.password), false);

  for (const [key, value] of parsedDatabaseUrl.searchParams) {
    if (key.toLowerCase() === "host") {
      assert.equal(output.includes(value), false);
    }
  }
}

test("production mode rejects before the seed action can mutate data", async () => {
  let mutationAttempted = false;

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "seed demo data",
      env: {
        ...approvedLocalEnvironment,
        NODE_ENV: "production",
      },
      action: async () => {
        mutationAttempted = true;
      },
    }),
    /disabled.*production/i,
  );

  assert.equal(mutationAttempted, false);
});

test("missing destructive acknowledgement rejects before mutation", async () => {
  let mutationAttempted = false;
  const env = { ...approvedLocalEnvironment };
  delete env.FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT;

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "reset demo database",
      env,
      action: async () => {
        mutationAttempted = true;
      },
    }),
    /FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT/,
  );

  assert.equal(mutationAttempted, false);
});

test("non-local databases reject before mutation", async () => {
  let mutationAttempted = false;

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "reset demo database",
      env: {
        ...approvedLocalEnvironment,
        DATABASE_URL:
          "postgresql://postgres:test@db.example.com:5432/flowstate_demo_safety",
      },
      action: async () => {
        mutationAttempted = true;
      },
    }),
    /local PostgreSQL/i,
  );

  assert.equal(mutationAttempted, false);
});

test("the approved database name must exactly match DATABASE_URL", async () => {
  let mutationAttempted = false;

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "seed demo data",
      env: {
        ...approvedLocalEnvironment,
        FLOWSTATE_DEMO_DATABASE_NAME: "flowstate_demo_other",
      },
      action: async () => {
        mutationAttempted = true;
      },
    }),
    /FLOWSTATE_DEMO_DATABASE_NAME.*exact/i,
  );

  assert.equal(mutationAttempted, false);
});

test("an explicitly named but non-disposable development database rejects", async () => {
  let mutationAttempted = false;

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "reset demo database",
      env: {
        ...approvedLocalEnvironment,
        DATABASE_URL: "postgresql://postgres:test@localhost:5432/flowstate_dev",
        FLOWSTATE_DEMO_DATABASE_NAME: "flowstate_dev",
      },
      action: async () => {
        mutationAttempted = true;
      },
    }),
    /demo or test database name/i,
  );

  assert.equal(mutationAttempted, false);
});

test("the seed entry point rejects production before Prisma can connect", () => {
  const seedScriptPath = fileURLToPath(
    new URL("./seed-demo.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [seedScriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...approvedLocalEnvironment,
      DATABASE_URL:
        "postgresql://postgres:test@127.0.0.1:1/flowstate_demo_safety",
      NODE_ENV: "production",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /disabled.*production/i);
  assert.doesNotMatch(result.stderr, /PrismaClient/);
});

test("the reset entry point rejects before invoking Prisma migrate reset", async () => {
  const { resetDemoDatabase } = await import("./reset-demo.mjs");
  let resetAttempted = false;

  await assert.rejects(
    resetDemoDatabase({
      env: {
        ...approvedLocalEnvironment,
        NODE_ENV: "production",
      },
      runReset: async () => {
        resetAttempted = true;
      },
    }),
    /disabled.*production/i,
  );

  assert.equal(resetAttempted, false);
});

test("seed and reset entry points reject target-changing host options before guarded actions", async (t) => {
  const seedScriptPath = fileURLToPath(
    new URL("./seed-demo.mjs", import.meta.url),
  );
  const { resetDemoDatabase } = await import("./reset-demo.mjs");

  for (const scenario of targetChangingHostUrls) {
    await t.test(`${scenario.label} cannot reach the seed action`, () => {
      const result = spawnSync(process.execPath, [seedScriptPath], {
        encoding: "utf8",
        env: {
          ...process.env,
          ...approvedLocalEnvironment,
          DATABASE_URL: scenario.value,
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;

      assert.equal(result.status, 1);
      assert.match(
        output,
        /target-changing PostgreSQL connection options/i,
      );
      assert.doesNotMatch(output, /PrismaClient|P1001/);
      assertConnectionDetailsAreRedacted(output, scenario.value);
    });

    await t.test(`${scenario.label} cannot reach the reset action`, async () => {
      let resetAttempted = false;

      await assert.rejects(
        resetDemoDatabase({
          env: {
            ...approvedLocalEnvironment,
            DATABASE_URL: scenario.value,
          },
          runReset: async () => {
            resetAttempted = true;
          },
        }),
        (error) => {
          assert.match(
            error.message,
            /target-changing PostgreSQL connection options/i,
          );
          assertConnectionDetailsAreRedacted(error.message, scenario.value);
          return true;
        },
      );

      assert.equal(resetAttempted, false);
    });
  }
});

test("package reset and test commands cannot bypass the safety entry point", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const resetCommand = packageJson.scripts["db:reset:demo"];

  assert.match(resetCommand, /node prisma\/reset-demo\.mjs/);
  assert.doesNotMatch(resetCommand, /prisma migrate reset/);
  assert.match(packageJson.scripts.test, /test:demo-safety/);
  assert.equal(
    packageJson.scripts["test:demo-safety"],
    "node --test prisma/demo-database-safety.test.mjs",
  );
});

test("canonical local disposable database targets can run the action", async () => {
  const localDatabaseUrls = [
    "postgresql://postgres:test@localhost:5432/flowstate_demo_safety?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/flowstate_demo_safety?schema=public",
    "postgresql://postgres:test@[::1]:5432/flowstate_demo_safety?schema=public",
  ];

  for (const databaseUrl of localDatabaseUrls) {
    let actionCalls = 0;

    const result = await runGuardedDemoAction({
      actionName: "seed demo data",
      env: {
        ...approvedLocalEnvironment,
        DATABASE_URL: databaseUrl,
      },
      action: async () => {
        actionCalls += 1;
        return "seeded";
      },
    });

    assert.equal(result, "seeded");
    assert.equal(actionCalls, 1);
  }
});

test("guard errors never include database credentials", async () => {
  const credential = "not-for-error-output";

  await assert.rejects(
    runGuardedDemoAction({
      actionName: "seed demo data",
      env: {
        ...approvedLocalEnvironment,
        DATABASE_URL: `postgresql://safety-user:${credential}@db.example.com:5432/flowstate_demo_safety`,
      },
      action: async () => {},
    }),
    (error) => {
      assert.doesNotMatch(error.message, /safety-user/);
      assert.doesNotMatch(error.message, new RegExp(credential));
      return true;
    },
  );
});

test("the seed logger never interpolates demo password values", async () => {
  const seedSource = await readFile(
    new URL("./seed-demo.mjs", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    seedSource,
    /console\.log\([^\n]*(?:ownerPassword|memberPassword)/,
  );
});
