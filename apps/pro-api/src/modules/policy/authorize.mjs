import { isProRole } from "../auth/session.mjs";

const nonempty = (value) => typeof value === "string" && value.trim() !== "";
const time = (value) => Number.isSafeInteger(value) && value > 0;
const timeWindow = (record, now) =>
  time(record.effectiveAt) &&
  record.effectiveAt <= now &&
  time(record.expiresAt) &&
  now < record.expiresAt;
const fieldList = (list) =>
  Array.isArray(list) &&
  list.length > 0 &&
  list.every(
    (field) =>
      typeof field === "string" &&
      /^[A-Za-z][A-Za-z0-9_]*$/.test(field) &&
      !Object.hasOwn(Object.prototype, field),
  ) &&
  new Set(list).size === list.length;

function representativeAllows(grant, binding, fields, now) {
  return (
    grant &&
    [
      "tenantId",
      "actorId",
      "resourceType",
      "resourceId",
      "action",
      "policyVersion",
    ].every((key) => grant[key] === binding[key]) &&
    nonempty(grant.evidenceRef) &&
    grant.revokedAt === null &&
    timeWindow(grant, now) &&
    (grant.recheckAt === null ||
      (time(grant.recheckAt) && now < grant.recheckAt)) &&
    fieldList(grant.fields) &&
    fields.every((field) => grant.fields.includes(field))
  );
}

/**
 * Preflight for a trusted, versioned policy reader. The reader verifies the
 * approved profile, legal authority, relationship, disposition and destination
 * evidence before returning an approved decision. No input here creates or
 * approves legal rules or invokes data access.
 */
export async function authorizePolicyRequest({
  context,
  resource,
  action,
  fields,
  now,
  readDecision,
}) {
  if (
    !context ||
    !resource ||
    context.tenantId !== resource.tenantId ||
    !isProRole(context.role) ||
    !["us", "ca"].includes(context.plane) ||
    !time(now) ||
    !time(context.mfaVerifiedAt) ||
    context.mfaVerifiedAt > now ||
    !fieldList(fields) ||
    typeof readDecision !== "function"
  )
    return null;

  const binding = {
    tenantId: context.tenantId,
    actorId: context.actorId,
    role: context.role,
    plane: context.plane,
    profileVersion: context.profileVersion,
    policyVersion: context.policyVersion,
    purpose: context.purpose,
    resourceType: resource.type,
    resourceId: resource.id,
    action,
  };
  const destinationRef = resource.destinationRef ?? null;
  if (
    !Object.values(binding).every(nonempty) ||
    (destinationRef !== null && !nonempty(destinationRef))
  )
    return null;
  const scope = { ...binding, destinationRef };

  let decision;
  try {
    decision = await readDecision(scope);
  } catch {
    return null;
  }

  if (
    !decision ||
    decision.status !== "approved" ||
    !Object.entries(scope).every(([key, value]) => decision[key] === value) ||
    !nonempty(decision.authorityRef) ||
    !nonempty(decision.relationshipRef) ||
    !timeWindow(decision, now) ||
    !fieldList(decision.fields) ||
    !fields.every((field) => decision.fields.includes(field))
  )
    return null;

  if (decision.assurance === "step_up") {
    if (
      !time(context.stepUpAt) ||
      context.stepUpAt < context.mfaVerifiedAt ||
      context.stepUpAt > now ||
      now - context.stepUpAt >= 5 * 60_000
    )
      return null;
  } else if (decision.assurance !== "mfa") {
    return null;
  }

  if (
    context.role === "GUARDIAN_OR_PROXY" &&
    !representativeAllows(decision.representative, binding, fields, now)
  )
    return null;
  return Object.freeze({ fields: Object.freeze([...fields]) });
}
