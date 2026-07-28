/* global console */
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { runGuardedDemoAction } from "./demo-database-safety.mjs";

const prismaCliPath = fileURLToPath(
  import.meta.resolve("prisma/build/index.js"),
);
const schemaPath = fileURLToPath(new URL("./schema.prisma", import.meta.url));

function runPrismaReset({ env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        prismaCliPath,
        "migrate",
        "reset",
        "--schema",
        schemaPath,
        "--force",
        "--skip-seed",
      ],
      {
        env,
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const result = code === null ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`Prisma migrate reset failed with ${result}.`));
    });
  });
}

export async function resetDemoDatabase({
  env = process.env,
  runReset = runPrismaReset,
} = {}) {
  return runGuardedDemoAction({
    actionName: "reset demo database",
    env,
    action: () => runReset({ env }),
  });
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  resetDemoDatabase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
