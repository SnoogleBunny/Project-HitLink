interface HealthDependencies {
  getDatabaseUrl: () => string | undefined;
  probeDatabase: () => Promise<void>;
}

const unavailableDatabaseResponse = () =>
  Response.json(
    {
      status: "unready",
      dependency: "database",
    },
    { status: 503 },
  );

async function probeRequiredDatabase() {
  const { prisma } =
    await import("../../../../../../packages/db/src/client.js");

  await prisma.$queryRaw`SELECT 1`;
}

export function createHealthHandler(dependencies: HealthDependencies) {
  return async function healthHandler() {
    if (!dependencies.getDatabaseUrl()?.trim()) {
      return unavailableDatabaseResponse();
    }

    try {
      await dependencies.probeDatabase();
      return Response.json({ status: "ready" });
    } catch {
      return unavailableDatabaseResponse();
    }
  };
}

export const GET = createHealthHandler({
  getDatabaseUrl: () => process.env.DATABASE_URL,
  probeDatabase: probeRequiredDatabase,
});
