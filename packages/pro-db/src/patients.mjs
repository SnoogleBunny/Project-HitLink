import { PrismaClient } from "../generated/client/index.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === "string" && uuid.test(value);

export function createPatientRepository(databaseUrl) {
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new Error("A Pro runtime database URL is required");
  }
  const client = new PrismaClient({ datasourceUrl: databaseUrl });

  return {
    // The Pro API supplies an authenticated and authorized server context.
    // No HTTP adapter or caller-supplied tenant selection is exposed here.
    async findPatient(context, patientId) {
      const { tenantId, actorId, purpose } = context ?? {};
      if (
        !isUuid(tenantId) ||
        !isUuid(actorId) ||
        typeof purpose !== "string" ||
        !purpose.trim()
      ) {
        throw new Error("Pro trusted context is required");
      }
      if (!isUuid(patientId)) throw new Error("Invalid Pro patient ID");

      return client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT
          set_config('flowstate_pro.tenant_id', ${tenantId}, true),
          set_config('flowstate_pro.actor_id', ${actorId}, true),
          set_config('flowstate_pro.purpose', ${purpose}, true)`;
        return tx.patient.findUnique({
          where: { tenantId_id: { tenantId, id: patientId } },
          select: { id: true, recordRef: true, version: true },
        });
      });
    },
    close: () => client.$disconnect(),
  };
}
