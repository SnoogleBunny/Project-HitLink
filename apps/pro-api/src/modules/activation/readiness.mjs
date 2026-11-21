const requirements = [
  "application",
  "organization_admin",
  "classification",
  "data_flow_destinations",
  "agreements",
  "profile_and_operating_envelope",
  "security_privacy",
  "independent_approval",
  "identity_service",
];

const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const blocked = (reason) => ({ status: "blocked", reason });

/**
 * Provider-independent preflight. Only a trusted evidence reader may supply
 * records. The call does not classify organizations, accept agreements,
 * change activation state, or enable invitations.
 */
export async function evaluateActivationReadiness({
  scope,
  now,
  readVerifiedEvidence,
}) {
  const { tenantId, plane, profileVersion } = scope ?? {};
  if (
    !nonempty(tenantId) ||
    !["us", "ca"].includes(plane) ||
    !nonempty(profileVersion) ||
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    typeof readVerifiedEvidence !== "function"
  )
    return blocked("invalid_scope");

  let evidence;
  try {
    evidence = await readVerifiedEvidence({ tenantId, plane, profileVersion });
  } catch {
    return blocked("evidence_unavailable");
  }
  if (!Array.isArray(evidence)) return blocked("evidence_unavailable");

  const byKind = new Map();
  for (const row of evidence) {
    if (!row || !requirements.includes(row.kind) || byKind.has(row.kind)) {
      return blocked("evidence_conflict");
    }
    byKind.set(row.kind, row);
  }

  for (const kind of requirements) {
    const row = byKind.get(kind);
    if (
      !row ||
      row.status !== "approved" ||
      row.tenantId !== tenantId ||
      row.plane !== plane ||
      row.profileVersion !== profileVersion ||
      !nonempty(row.evidenceRef) ||
      !nonempty(row.reviewerId) ||
      !Number.isSafeInteger(row.effectiveAt) ||
      row.effectiveAt <= 0 ||
      row.effectiveAt > now ||
      !Number.isSafeInteger(row.expiresAt) ||
      row.expiresAt <= now
    )
      return blocked(kind);
  }

  if (
    byKind.get("security_privacy").reviewerId ===
    byKind.get("independent_approval").reviewerId
  ) {
    return blocked("independent_approval");
  }
  return { status: "ready_for_invitation_review" };
}
