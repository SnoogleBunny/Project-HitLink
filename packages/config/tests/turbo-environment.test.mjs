import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const turboConfig = JSON.parse(
  await readFile(new URL("../../../turbo.json", import.meta.url), "utf8"),
);

test("standard Turbo tasks allowlist DATABASE_URL in strict environment mode", () => {
  assert.ok(Array.isArray(turboConfig.globalEnv));
  assert.deepEqual(
    turboConfig.globalEnv.filter((name) => name === "DATABASE_URL"),
    ["DATABASE_URL"],
  );
  assert.ok(
    !(turboConfig.globalPassThroughEnv ?? []).includes("DATABASE_URL"),
    "DATABASE_URL must remain hash-aware rather than using pass-through mode",
  );
});
