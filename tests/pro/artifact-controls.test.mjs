import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { Prisma } from "../../packages/pro-db/generated/client/index.js";

test("canonical fixtures and Pro artifact checks reject data and credential canaries", async (t) => {
  const {
    admitFixture,
    createFixture,
    canary,
    assertSyntheticEnvironment,
    assertIsolatedNetwork,
  } = await import("./fixtures/synthetic.mjs");
  const { scanArtifacts } = await import("./fixtures/artifact-guard.mjs");
  assertSyntheticEnvironment();
  if (process.env.FLOWSTATE_PRO_REQUIRE_NETWORK_ISOLATION === "1")
    assertIsolatedNetwork();
  const bundle = createFixture();
  assert.deepEqual(admitFixture(JSON.stringify(bundle)), bundle);
  assert.throws(
    () => admitFixture('{"recordRef":"unapproved-input"}'),
    /canonical synthetic fixture/,
  );
  assert.throws(
    () => admitFixture(JSON.stringify({ ...bundle, plane: "remote" })),
    /canonical synthetic fixture/,
  );
  assert.doesNotThrow(() => assertSyntheticEnvironment({ PATH: "/example" }));
  for (const key of [
    "DATABASE_URL",
    "FLOWSTATE_PRO_US_DATABASE_URL",
    "FLOWSTATE_PRO_CA_STRIPE_SECRET_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ]) {
    assert.throws(
      () => assertSyntheticEnvironment({ [key]: "inert-reference" }),
      /credential configuration/,
    );
  }

  assert.deepEqual(
    Object.keys(bundle.records).sort(),
    Prisma.dmmf.datamodel.models.map(({ name }) => name).sort(),
  );
  for (const { name, fields } of Prisma.dmmf.datamodel.models) {
    const expected = fields
      .filter(({ kind }) => kind !== "object")
      .map(({ name: key }) => key)
      .sort();
    for (const row of bundle.records[name])
      assert.deepEqual(Object.keys(row).sort(), expected, name);
  }
  assert.deepEqual(Object.keys(bundle.cases).sort(), [
    "adult",
    "billing",
    "draft",
    "file",
    "final",
    "hold",
    "minor",
    "provider",
    "proxy",
    "rights",
    "transfer",
  ]);

  const directory = mkdtempSync(path.join(tmpdir(), "pro-artifacts-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, "clean.log"), "safe status");
  assert.deepEqual(scanArtifacts(directory), []);
  for (const [file, content] of Object.entries({
    "build.js": `const status = "${canary}";`,
    "events.log": canary,
    "report.json": JSON.stringify({
      escaped: canary.replaceAll(" ", "\\u0020"),
    }),
    "trace.trace": JSON.stringify({ field: canary }),
  }))
    writeFileSync(path.join(directory, file), content);
  execFileSync("zip", ["-q", "trace.zip", "trace.trace"], { cwd: directory });
  rmSync(path.join(directory, "trace.trace"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 960, height: 180 },
    });
    await page.setContent(
      `<p style="font: bold 36px sans-serif; color: black">${canary}</p>`,
    );
    await page.screenshot({ path: path.join(directory, "screenshot.png") });
  } finally {
    await browser.close();
  }
  assert.deepEqual(scanArtifacts(directory), [
    "build.js",
    "events.log",
    "report.json",
    "screenshot.png",
    "trace.zip!trace.trace",
  ]);
  assert.throws(
    () => scanArtifacts(path.join(directory, "missing")),
    /Artifact input/,
  );
  const scanner = fileURLToPath(
    new URL("./fixtures/artifact-guard.mjs", import.meta.url),
  );
  const run = (target) =>
    spawnSync(process.execPath, [scanner, target], { encoding: "utf8" });
  assert.equal(run(path.join(directory, "clean.log")).status, 0);
  const rejected = run(path.join(directory, "events.log"));
  assert.equal(rejected.status, 1);
  assert.ok(!rejected.stderr.includes(canary));

  writeFileSync(path.join(directory, "unknown.bin"), "unsupported");
  assert.equal(run(path.join(directory, "unknown.bin")).status, 2);
  assert.throws(() => scanArtifacts(directory), /Unsupported artifact/);
});
