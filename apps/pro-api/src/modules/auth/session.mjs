const minute = 60_000;
const rolesBySurface = new Map([
  [
    "provider",
    new Set([
      "ORGANIZATION_ADMIN",
      "PROVIDER",
      "CLINICAL_SUPPORT",
      "ADMINISTRATIVE_STAFF",
      "BILLING_STAFF",
      "PRIVACY_OFFICER",
    ]),
  ],
  ["patient", new Set(["PATIENT", "GUARDIAN_OR_PROXY"])],
]);
export function isProRole(role) {
  return [...rolesBySurface.values()].some((roles) => roles.has(role));
}

const ceilings = {
  provider: {
    idleMs: 15 * minute,
    absoluteMs: 12 * 60 * minute,
    stepUpMs: 5 * minute,
  },
  patient: {
    idleMs: 30 * minute,
    absoluteMs: 24 * 60 * minute,
    stepUpMs: 5 * minute,
  },
};

const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const timestamp = (value) => Number.isSafeInteger(value) && value > 0;

function sessionLimits(surface, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    return null;
  const maximum = ceilings[surface];
  for (const [key, value] of Object.entries(overrides)) {
    if (
      !Object.hasOwn(maximum, key) ||
      !timestamp(value) ||
      value > maximum[key]
    )
      return null;
  }
  return { ...maximum, ...overrides };
}

/**
 * Local contract for a future authoritative identity/session adapter.
 * The caller supplies the tenant, surface and step-up requirement from trusted
 * server routing and policy. The adapter verifies the credential before it
 * returns a session record. This check does not issue or activate sessions.
 */
export async function authenticateProSession({
  findVerifiedSession,
  reference,
  tenantId,
  surface,
  now,
  requireStepUp = false,
  limits = {},
}) {
  const roles = rolesBySurface.get(surface);
  if (
    !roles ||
    !nonempty(tenantId) ||
    !nonempty(reference) ||
    !timestamp(now) ||
    typeof requireStepUp !== "boolean" ||
    typeof findVerifiedSession !== "function"
  )
    return null;

  const limitsForSurface = sessionLimits(surface, limits);
  if (!limitsForSurface) return null;

  let session;
  try {
    session = await findVerifiedSession({ reference, tenantId, surface });
  } catch {
    return null;
  }
  if (
    !session ||
    session.tenantId !== tenantId ||
    session.surface !== surface ||
    !roles.has(session.role)
  ) {
    return null;
  }
  const {
    sessionId,
    actorId,
    role,
    issuedAt,
    lastActivityAt,
    mfaVerifiedAt,
    stepUpAt,
    revokedAt,
  } = session;
  if (
    !nonempty(sessionId) ||
    !nonempty(actorId) ||
    revokedAt !== null ||
    !timestamp(issuedAt) ||
    !timestamp(lastActivityAt) ||
    !timestamp(mfaVerifiedAt) ||
    issuedAt > lastActivityAt ||
    lastActivityAt > now ||
    mfaVerifiedAt > lastActivityAt ||
    now - issuedAt >= limitsForSurface.absoluteMs ||
    now - lastActivityAt >= limitsForSurface.idleMs
  )
    return null;
  if (
    requireStepUp &&
    (!timestamp(stepUpAt) ||
      stepUpAt < Math.max(issuedAt, mfaVerifiedAt) ||
      stepUpAt > lastActivityAt ||
      now - stepUpAt >= limitsForSurface.stepUpMs)
  )
    return null;

  return Object.freeze({
    sessionId,
    actorId,
    tenantId,
    role,
    surface,
    mfaVerifiedAt,
  });
}
