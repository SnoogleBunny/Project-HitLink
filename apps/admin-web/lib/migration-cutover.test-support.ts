import type { PrismaClient } from "@flowstate/db";
import { captureCutoverState, type CutoverEvidence } from "./migration-cutover";
/** Old activation fixtures contain no source entitlements; give them explicit empty-source reconciliation. */
export async function cutoverSnapshotFixture(
  db: PrismaClient,
  workspaceId: string,
) {
  const state = await captureCutoverState(db, workspaceId);
  const evidence: CutoverEvidence = {
    version: 1,
    sourceTotals: state.totals,
    sourceReferences: {
      people: "Fixture source checked",
      contracts: "No contracts",
      money: "No balances",
      units: "No entitlements",
      futureBookings: "No bookings",
      familyAuthority: "No dependents",
      consent: "No consent carried over",
    },
    recordDisposition: {
      sourceCount: state.importedSourceCount,
      importedCount: state.importedSourceCount,
      excluded: [],
      quarantinedCount: 0,
    },
    billingOwners: [],
    backupReference: "Fixture backup",
    restoreRehearsalReference: "Fixture restore",
    finalDeltaReference: "Fixture delta",
    supportContact: "fixture@example.test",
  };
  return db.migrationCutoverSnapshot.create({
    data: {
      workspaceId,
      actorOperatorId: "fixture-operator",
      sourceFingerprint: state.fingerprint,
      evidence: JSON.parse(JSON.stringify(evidence)),
    },
  });
}
