import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function readPackageJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(`../../${relativePath}`, import.meta.url)),
  );
}

test("root app commands load .env cross-platform without leaking or overriding values", async () => {
  const rootPackage = await readPackageJson("package.json");
  const dotenvCli = fileURLToPath(
    new URL("../../node_modules/dotenv-cli/cli.js", import.meta.url),
  );
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "flowstate-env-probe-"),
  );
  const envPath = path.join(tempDirectory, ".env");
  const fileValue = "root-file-sentinel-do-not-emit";
  const exportedValue = "exported-sentinel-do-not-emit";
  const privateValue = "private-sentinel-do-not-emit";

  assert.equal(rootPackage.devDependencies["dotenv-cli"], "10.0.0");
  assert.equal(rootPackage.scripts.dev, "dotenv -e .env -- turbo run dev");
  assert.equal(rootPackage.scripts.build, "dotenv -e .env -- turbo run build");

  await writeFile(
    envPath,
    `FLOWSTATE_ENV_PROBE=${fileValue}\nFLOWSTATE_ENV_PRIVATE_PROBE=${privateValue}\n`,
  );

  try {
    const probeScript = [
      "const result = {",
      `  fileLoaded: process.env.FLOWSTATE_ENV_PRIVATE_PROBE === ${JSON.stringify(privateValue)},`,
      `  exportedPreserved: process.env.FLOWSTATE_ENV_PROBE === ${JSON.stringify(exportedValue)},`,
      "};",
      "process.stdout.write(JSON.stringify(result));",
    ].join("\n");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [dotenvCli, "-e", envPath, "--", process.execPath, "-e", probeScript],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          FLOWSTATE_ENV_PROBE: exportedValue,
        },
      },
    );
    const combinedOutput = `${stdout}\n${stderr}`;

    assert.deepEqual(JSON.parse(stdout), {
      fileLoaded: true,
      exportedPreserved: true,
    });
    assert.doesNotMatch(combinedOutput, new RegExp(fileValue));
    assert.doesNotMatch(combinedOutput, new RegExp(exportedValue));
    assert.doesNotMatch(combinedOutput, new RegExp(privateValue));
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
});

test("Turbo exposes only the declared application runtime environment", async () => {
  const turboConfig = JSON.parse(
    await readFile(new URL("../../turbo.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(turboConfig.globalEnv, [
    "DATABASE_URL",
    "NODE_ENV",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_FLOWSTATE_APP_URL",
    "NEXT_PUBLIC_MEMBER_APP_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "FORMS_MAGIC_LINK_SECRET",
    "FLOWSTATE_WAITLIST_PATH",
  ]);
  assert.equal(turboConfig.globalPassThroughEnv, undefined);
});

test("the declared toolchain and Prisma bootstrap are reproducible", async () => {
  const rootPackage = await readPackageJson("package.json");
  const dbPackage = await readPackageJson("packages/db/package.json");

  assert.equal(rootPackage.packageManager, "pnpm@10.33.0");
  assert.deepEqual(rootPackage.engines, {
    node: "^20.0.0 || ^22.0.0",
    pnpm: "10.33.0",
  });
  assert.equal(
    rootPackage.devDependencies["@prisma/client"],
    dbPackage.dependencies["@prisma/client"],
  );
  for (const scriptName of [
    "db:generate",
    "db:migrate",
    "db:migrate:deploy",
    "db:reset:demo",
    "db:seed",
    "db:validate",
  ]) {
    assert.equal(
      rootPackage.scripts[scriptName],
      `corepack pnpm --filter @flowstate/db ${scriptName}`,
      `${scriptName} must not fall back to a global pnpm executable`,
    );
  }
  assert.equal(
    dbPackage.scripts["db:generate"],
    "prisma generate --schema prisma/schema.prisma",
  );
  assert.doesNotMatch(dbPackage.scripts["db:validate"], /\bsh\s+-c\b/);
  assert.equal(rootPackage.scripts.postinstall, undefined);
});

test("canonical type checks generate Prisma before Turbo starts", async () => {
  const rootPackage = await readPackageJson("package.json");

  assert.equal(
    rootPackage.scripts["check-types"],
    "corepack pnpm db:generate && turbo run check-types",
  );
  assert.doesNotMatch(rootPackage.scripts["check-types"], /\bsh\s+-c\b/);
});

test("migration integration evidence requires an explicit disposable database", async () => {
  const rootPackage = await readPackageJson("package.json");
  const adminPackage = await readPackageJson("apps/admin-web/package.json");
  const integrationScript = adminPackage.scripts["test:migration:integration"];

  assert.equal(
    rootPackage.scripts["test:migration:integration"],
    "corepack pnpm --filter admin-web test:migration:integration",
  );
  assert.match(integrationScript, /process\.env\.TEST_DATABASE_URL/);
  assert.match(
    integrationScript,
    /TEST_DATABASE_URL is required for migration integration tests\./,
  );
  assert.match(integrationScript, /workspace-migration\.integration\.test\.ts/);
  assert.match(
    integrationScript,
    /workspace-migration-operations\.integration\.test\.ts/,
  );
});

test("E2E orchestration stays on the Corepack-pinned pnpm toolchain", async () => {
  const rootPackage = await readPackageJson("package.json");
  const dbPackage = await readPackageJson("packages/db/package.json");
  const playwrightConfig = await readFile(
    new URL("../../playwright.config.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    rootPackage.scripts["test:e2e"],
    "corepack pnpm db:reset:demo && playwright test",
  );
  assert.equal(
    rootPackage.scripts["db:reset:demo"],
    "corepack pnpm --filter @flowstate/db db:reset:demo",
  );
  assert.match(
    dbPackage.scripts["db:reset:demo"],
    /&& corepack pnpm run db:seed$/,
  );
  assert.doesNotMatch(
    dbPackage.scripts["db:reset:demo"],
    /&& pnpm run db:seed$/,
  );
  assert.match(
    playwrightConfig,
    /command:\s*"corepack pnpm exec dotenv -e \.env -- turbo run dev --env-mode=loose"/,
  );
  assert.doesNotMatch(playwrightConfig, /command:\s*"pnpm\b/);
  assert.match(
    playwrightConfig,
    /FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL:\s*"migration-corrections@example\.test"/,
  );
});

test("app lifecycle scripts invoke Next directly on exact ports", async () => {
  const appPorts = {
    "admin-web": 3000,
    "member-web": 3001,
    api: 3002,
    "landing-web": 3003,
  };

  for (const [app, port] of Object.entries(appPorts)) {
    const appPackage = await readPackageJson(`apps/${app}/package.json`);
    assert.equal(appPackage.scripts.build, "next build", `${app} build script`);
    assert.doesNotMatch(
      appPackage.scripts.build,
      /\bsh\s+-c\b/,
      `${app} build wrapper`,
    );
    assert.equal(
      appPackage.scripts.dev,
      `next dev --port ${port}`,
      `${app} dev script`,
    );
    assert.doesNotMatch(
      appPackage.scripts.dev,
      /\bsh\s+-c\b/,
      `${app} dev wrapper`,
    );
    assert.equal(
      appPackage.scripts.start,
      `next start --port ${port}`,
      `${app} start script`,
    );
    assert.doesNotMatch(
      appPackage.scripts.start,
      /\b(?:sh|source)\b/,
      `${app} start wrapper`,
    );
  }
});

test("Next apps pin Turbopack to the monorepo instead of an ancestor lockfile", async () => {
  for (const app of ["admin-web", "member-web", "landing-web", "api"]) {
    const configUrl = new URL(
      `../../apps/${app}/next.config.js`,
      import.meta.url,
    );
    const { default: nextConfig } = await import(configUrl);
    const expectedRoot = fileURLToPath(new URL("../../", configUrl));
    const configuredRoot = nextConfig.turbopack?.root;

    assert.equal(
      typeof configuredRoot,
      "string",
      `${app} Turbopack root is declared`,
    );
    assert.ok(
      path.isAbsolute(configuredRoot),
      `${app} Turbopack root is absolute`,
    );
    assert.equal(
      path.resolve(configuredRoot),
      path.resolve(expectedRoot),
      `${app} Turbopack root`,
    );
  }
});

test("generated dependency directories are not tracked", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const trackedNodeModules = stdout
    .split("\0")
    .filter((trackedPath) => /(^|\/)node_modules\//.test(trackedPath));

  assert.deepEqual(trackedNodeModules, []);
});
