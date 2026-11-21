import assert from "node:assert/strict";
import test from "node:test";
import { authenticateProSession } from "../../apps/pro-api/src/modules/auth/session.mjs";

const minute = 60_000;
const now = 2_000 * minute;
const workforce = [
  "ORGANIZATION_ADMIN",
  "PROVIDER",
  "CLINICAL_SUPPORT",
  "ADMINISTRATIVE_STAFF",
  "BILLING_STAFF",
  "PRIVACY_OFFICER",
];
const patient = ["PATIENT", "GUARDIAN_OR_PROXY"];
const base = {
  sessionId: "synthetic-session",
  tenantId: "synthetic-tenant",
  actorId: "synthetic-actor",
  issuedAt: now - 60 * minute,
  lastActivityAt: now - minute,
  mfaVerifiedAt: now - 60 * minute,
  stepUpAt: now - 2 * minute,
  revokedAt: null,
};
const evaluate = (session, options = {}) =>
  authenticateProSession({
    findVerifiedSession: async () => session,
    reference: "synthetic-reference",
    tenantId: base.tenantId,
    surface: "provider",
    now,
    ...options,
  });

test("an authoritative synthetic session is isolated by tenant and surface", async () => {
  for (const [surface, roles] of [
    ["provider", workforce],
    ["patient", patient],
  ]) {
    for (const role of roles) {
      const result = await evaluate({ ...base, surface, role }, { surface });
      assert.deepEqual(result, {
        sessionId: base.sessionId,
        actorId: base.actorId,
        tenantId: base.tenantId,
        role,
        surface,
        mfaVerifiedAt: base.mfaVerifiedAt,
      });
    }
  }
  const session = { ...base, surface: "provider", role: "PROVIDER" };
  assert.equal(await evaluate(session, { tenantId: "another-tenant" }), null);
  assert.equal(await evaluate(session, { surface: "patient" }), null);
  assert.equal(await evaluate({ ...session, role: "OWNER" }), null);
  assert.equal(await evaluate({ ...session, role: "PATIENT" }), null);
  assert.equal(await evaluate(null), null);
  assert.equal(
    await evaluate(session, {
      findVerifiedSession: async () => {
        throw Error("synthetic failure");
      },
    }),
    null,
  );
});

test("idle, absolute, MFA, revocation, and step-up limits are enforced at their boundaries", async () => {
  const provider = { ...base, surface: "provider", role: "PROVIDER" };
  const portal = { ...base, surface: "patient", role: "PATIENT" };
  for (const [surface, session, idle, absolute] of [
    ["provider", provider, 15 * minute, 12 * 60 * minute],
    ["patient", portal, 30 * minute, 24 * 60 * minute],
  ]) {
    assert.ok(
      await evaluate(
        { ...session, lastActivityAt: now - idle + 1 },
        { surface },
      ),
    );
    assert.equal(
      await evaluate({ ...session, lastActivityAt: now - idle }, { surface }),
      null,
    );
    assert.ok(
      await evaluate({ ...session, issuedAt: now - absolute + 1 }, { surface }),
    );
    assert.equal(
      await evaluate({ ...session, issuedAt: now - absolute }, { surface }),
      null,
    );
  }
  assert.equal(await evaluate({ ...provider, mfaVerifiedAt: null }), null);
  assert.equal(await evaluate({ ...provider, mfaVerifiedAt: now + 1 }), null);
  assert.equal(await evaluate({ ...provider, revokedAt: now }), null);
  assert.equal(
    await evaluate(
      { ...provider, stepUpAt: now - 5 * minute },
      { requireStepUp: true },
    ),
    null,
  );
  assert.equal(
    await evaluate({ ...provider, stepUpAt: null }, { requireStepUp: true }),
    null,
  );
  assert.ok(await evaluate(provider, { requireStepUp: true }));
  assert.equal(await evaluate(provider, { limits: { idleMs: minute } }), null);
  assert.equal(
    await evaluate(provider, { limits: { idleMs: 16 * minute } }),
    null,
  );
});
