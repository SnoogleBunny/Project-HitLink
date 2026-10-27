import { PrismaClient } from "@prisma/client";
import { projectDatabaseErrorLog } from "./database-error-logging.js";

function createDatabaseClient() {
  const client = new PrismaClient({ log: [{ emit: "event", level: "error" }] });
  client.$on("error", (event) => {
    console.error(JSON.stringify(projectDatabaseErrorLog(event)));
  });
  return client;
}

// A separate cache key cannot reuse an older client configured to print raw errors.
const globalForPrisma = globalThis as typeof globalThis & {
  prismaSafeErrorsV1?: ReturnType<typeof createDatabaseClient>;
};
export const prisma =
  globalForPrisma.prismaSafeErrorsV1 ?? createDatabaseClient();
globalForPrisma.prismaSafeErrorsV1 = prisma;
