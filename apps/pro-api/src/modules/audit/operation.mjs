const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const auditedActions = new Set(["patient_read", "organization_review"]);
const terminalOutcomes = new Set(["succeeded", "failed"]);

function auditMetadata(request) {
  const { tenantId, actorId, operationId, action } = request ?? {};
  if (
    !auditedActions.has(action) ||
    ![tenantId, actorId, operationId].every(
      (value) => typeof value === "string" && uuid.test(value),
    )
  )
    return null;

  return Object.freeze({ tenantId, actorId, operationId, action });
}

/**
 * Local append-only audit adapter contract. The trusted store reserves one
 * durable intent per tenant and operation ID and appends at most one terminal
 * outcome. Resolution means durable persistence. Replay or unknown outcome
 * must enter reconciliation without running the operation again.
 */
export async function runAuditedOperation({ request, audit, execute }) {
  const metadata = auditMetadata(request);
  if (!metadata) return { status: "invalid_metadata" };
  if (
    typeof audit?.reserveIntent !== "function" ||
    typeof audit?.appendOutcome !== "function" ||
    typeof execute !== "function"
  )
    return { status: "audit_unavailable" };

  let reservation;
  try {
    reservation = await audit.reserveIntent(metadata);
  } catch {
    return { status: "audit_unavailable" };
  }
  if (reservation !== "reserved") {
    return {
      status:
        reservation === "duplicate"
          ? "reconciliation_required"
          : "audit_unavailable",
    };
  }

  try {
    const result = await execute();
    if (!terminalOutcomes.has(result?.status))
      return { status: "reconciliation_required" };
    const outcome = result.status;
    await audit.appendOutcome(metadata, outcome);
    return { status: outcome };
  } catch {
    return { status: "reconciliation_required" };
  }
}
