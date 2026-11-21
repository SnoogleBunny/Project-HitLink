import { networkInterfaces } from "node:os";
import { isDeepStrictEqual } from "node:util";

export const canary = "FLOWSTATE PRO SYNTHETIC CANARY";
const ref = (label) => `${canary} ${label}`;
const id = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const timestamp = "2030-01-01T00:00:00.000Z";

function fixtureTenant(offset, plane) {
  const tenantId = id(offset);
  const workforceId = id(offset + 2);
  const adultId = id(offset + 3);
  const minorId = id(offset + 4);
  const proxyId = id(offset + 5);
  const policyId = id(offset + 6);
  const lifecycleId = id(offset + 7);
  const operationId = id(offset + 8);
  const row = (n, fields) => ({ tenantId, id: id(offset + n), ...fields });
  const patient = (n, identityId, label) =>
    row(n, {
      identityId,
      policyId,
      lifecycleId,
      recordRef: ref(label),
      classificationRef: ref("classification"),
      profileRef: ref(plane),
      createdAt: timestamp,
      createdByRef: ref("creator"),
      updatedAt: timestamp,
      updatedByRef: ref("updater"),
      version: 1,
    });

  return {
    Organization: [
      {
        tenantId,
        externalRef: ref(`organization-${plane}`),
        activationRef: ref("inactive"),
        profileRef: ref(plane),
        createdAt: timestamp,
        version: 1,
      },
    ],
    Site: [row(1, { locationRef: ref(`site-${plane}`) })],
    Identity: [
      row(2, { kind: "WORKFORCE", subjectRef: ref("provider") }),
      row(3, { kind: "PATIENT", subjectRef: ref("adult") }),
      row(4, { kind: "PATIENT", subjectRef: ref("minor") }),
      row(5, { kind: "REPRESENTATIVE", subjectRef: ref("proxy") }),
    ],
    Patient: [
      patient(9, adultId, "adult-record"),
      patient(10, minorId, "minor-record"),
    ],
    RoleAssignment: [
      row(11, { identityId: workforceId, role: ref("provider-role") }),
    ],
    Invitation: [
      row(12, { invitationRef: ref("invite-reference"), expiresAt: timestamp }),
    ],
    RepresentativeAuthority: [
      row(13, {
        patientId: id(offset + 10),
        representativeId: proxyId,
        authorityRef: ref("synthetic-authority"),
      }),
    ],
    PolicyVersion: [row(6, { policyRef: ref("policy"), version: 1 })],
    LifecycleReference: [row(7, { lifecycleRef: ref("lifecycle") })],
    Operation: [
      row(8, {
        idempotencyKey: ref("deduplication"),
        intentRef: ref("intent"),
        outcomeRef: ref("outcome"),
        version: 1,
      }),
    ],
    OutboxItem: [
      row(14, {
        operationId,
        intentRef: ref("queued-intent"),
        createdAt: timestamp,
      }),
    ],
    AuditEvent: [
      row(15, {
        operationId,
        eventRef: ref("audit-reference"),
        createdAt: timestamp,
      }),
    ],
    DisclosureRecord: [
      row(16, {
        patientId: id(offset + 9),
        disclosureRef: ref("disclosure-reference"),
        createdAt: timestamp,
      }),
    ],
  };
}

export function createFixture() {
  const us = fixtureTenant(100, "us");
  const ca = fixtureTenant(200, "ca");
  return {
    format: "flowstate-pro-synthetic-v1",
    records: Object.fromEntries(
      Object.entries(us).map(([model, rows]) => [
        model,
        [...rows, ...ca[model]],
      ]),
    ),
    cases: {
      adult: {
        ageBand: "adult",
        patientId: us.Patient[0].id,
        reference: ref("adult-case"),
      },
      minor: {
        ageBand: "minor",
        patientId: us.Patient[1].id,
        reference: ref("minor-case"),
      },
      proxy: {
        authorityId: us.RepresentativeAuthority[0].id,
        reference: ref("proxy-case"),
      },
      provider: {
        identityId: us.Identity[0].id,
        reference: ref("provider-case"),
      },
      draft: { status: "draft", text: ref("draft-case") },
      final: { status: "final", text: ref("final-case") },
      file: { classification: "synthetic", name: ref("file-case") },
      billing: { amountMinor: 100, reference: ref("invoice-case") },
      rights: { type: "access", reference: ref("rights-case") },
      hold: { disposition: "held", reference: ref("hold-case") },
      transfer: {
        source: "us",
        destination: "ca",
        outcome: "denied",
        reference: ref("transfer-case"),
      },
    },
  };
}

export function admitFixture(serialized) {
  let candidate;
  try {
    candidate = JSON.parse(serialized);
  } catch {
    throw new Error("Only the canonical synthetic fixture can be admitted");
  }
  const fixture = createFixture();
  if (!isDeepStrictEqual(candidate, fixture)) {
    throw new Error("Only the canonical synthetic fixture can be admitted");
  }
  return fixture;
}

export function assertSyntheticEnvironment(env = process.env) {
  const prohibited =
    /^(?:DATABASE_URL|DIRECT_URL|STRIPE_(?:SECRET_KEY|WEBHOOK_SECRET)|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|GCP_PROJECT|AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|FLOWSTATE_PRO_.*(?:DATABASE_URL|STRIPE|KEY_REFERENCE|CLIENT_SECRET|TOKEN|CREDENTIAL|PROJECT))/i;
  if (
    Object.entries(env).some(([key, value]) => value && prohibited.test(key))
  ) {
    throw new Error(
      "Synthetic fixture tooling rejects credential configuration",
    );
  }
}

export function assertIsolatedNetwork() {
  if (
    Object.values(networkInterfaces())
      .flat()
      .some((address) => !address.internal)
  ) {
    throw new Error("Pro fixture CI requires a loopback-only network");
  }
}
