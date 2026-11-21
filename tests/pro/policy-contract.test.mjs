import assert from "node:assert/strict";
import test from "node:test";
import { authorizePolicyRequest } from "../../apps/pro-api/src/modules/policy/authorize.mjs";

const context = {
  actorId: "actor",
  tenantId: "tenant",
  role: "PROVIDER",
  plane: "us",
  profileVersion: "profile-1",
  policyVersion: "policy-1",
  purpose: "synthetic-purpose",
  mfaVerifiedAt: 1_500,
};
const resource = {
  tenantId: "tenant",
  type: "patient",
  id: "synthetic-patient",
};
const now = 2_000;
const rule = {
  ...context,
  resourceType: resource.type,
  resourceId: resource.id,
  action: "read",
  status: "approved",
  destinationRef: null,
  authorityRef: "synthetic-reviewed-authority",
  relationshipRef: "synthetic-reviewed-relationship",
  effectiveAt: 1_000,
  expiresAt: 3_000,
  fields: ["id", "summary"],
  assurance: "mfa",
};
const run = (overrides = {}) =>
  authorizePolicyRequest({
    context,
    resource,
    action: "read",
    fields: ["id"],
    now,
    readDecision: async () => rule,
    ...overrides,
  });

test("verified policy produces only the requested approved projection", async () => {
  for (const role of [
    "PATIENT",
    "PROVIDER",
    "CLINICAL_SUPPORT",
    "BILLING_STAFF",
    "ORGANIZATION_ADMIN",
    "PRIVACY_OFFICER",
  ]) {
    const requestContext = { ...context, role };
    assert.deepEqual(
      await run({
        context: requestContext,
        readDecision: async (binding) => {
          assert.equal(binding.tenantId, context.tenantId);
          assert.equal(binding.role, role);
          assert.equal(binding.resourceId, resource.id);
          return { ...rule, role };
        },
      }),
      { fields: ["id"] },
    );
  }
  assert.equal(
    await run({ context: { ...context, mfaVerifiedAt: null } }),
    null,
  );
  assert.equal(
    await run({
      resource: { ...resource, destinationRef: "unknown-destination" },
    }),
    null,
  );
  assert.equal(await run({ fields: ["id", "unapproved"] }), null);
  assert.equal(
    await run({ resource: { ...resource, tenantId: "other" } }),
    null,
  );
  assert.equal(await run({ context: { ...context, role: "OWNER" } }), null);
  assert.equal(
    await run({
      readDecision: async () => {
        throw new Error("synthetic lookup failure");
      },
    }),
    null,
  );
});

test("unverified scope, stale versions, and stale or missing representative authority deny", async () => {
  for (const patch of [
    { policyVersion: "old" },
    { profileVersion: "other" },
    { status: "pending" },
    { expiresAt: now },
    { authorityRef: "" },
    { relationshipRef: "" },
    { assurance: "missing" },
    { purpose: "unknown" },
    { resourceId: "other" },
    { action: "write" },
  ])
    assert.equal(
      await run({ readDecision: async () => ({ ...rule, ...patch }) }),
      null,
    );
  const proxy = { ...context, role: "GUARDIAN_OR_PROXY" };
  const grant = {
    tenantId: context.tenantId,
    actorId: context.actorId,
    resourceType: resource.type,
    resourceId: resource.id,
    policyVersion: context.policyVersion,
    action: "read",
    fields: ["id"],
    effectiveAt: 1_000,
    expiresAt: 3_000,
    revokedAt: null,
    recheckAt: 2_500,
    evidenceRef: "synthetic-verified-grant",
  };
  const asProxy = (authority, fields = ["id"]) =>
    run({
      context: proxy,
      fields,
      readDecision: async () => ({
        ...rule,
        role: proxy.role,
        representative: authority,
      }),
    });
  assert.deepEqual(await asProxy(grant), { fields: ["id"] });
  assert.equal(await asProxy(undefined), null);
  assert.equal(await asProxy({ ...grant, recheckAt: now }), null);
  assert.equal(await asProxy({ ...grant, revokedAt: now - 1 }), null);
  assert.equal(await asProxy({ ...grant, evidenceRef: "" }), null);
  assert.equal(await asProxy(grant, ["summary"]), null);
});
