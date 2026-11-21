import assert from "node:assert/strict";
import test from "node:test";
import { runAuditedOperation } from "../../apps/pro-api/src/modules/audit/operation.mjs";

const ids = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000002",
  operationId: "00000000-0000-4000-8000-000000000003",
};
const request = {
  ...ids,
  action: "patient_read",
  ignored: "synthetic clinical canary",
};

test("audit intent is reserved before execution and metadata excludes payloads", async () => {
  const events = [];
  const audit = {
    async reserveIntent(metadata) {
      events.push(["intent", metadata]);
      return "reserved";
    },
    async appendOutcome(metadata, outcome) {
      events.push(["outcome", metadata, outcome]);
    },
  };
  const result = await runAuditedOperation({
    request,
    audit,
    execute: async () => {
      events.push(["execution"]);
      return { status: "succeeded", payload: "synthetic clinical canary" };
    },
  });
  const metadata = { ...ids, action: request.action };
  assert.deepEqual(events, [
    ["intent", metadata],
    ["execution"],
    ["outcome", metadata, "succeeded"],
  ]);
  assert.deepEqual(result, { status: "succeeded" });
  assert.doesNotMatch(JSON.stringify(events), /clinical canary/);
});

test("unavailable audit, duplicate operation, and uncertain outcomes fail closed", async () => {
  let count = 0;
  const execute = async () => {
    count++;
    return { status: "succeeded" };
  };
  const input = {
    request,
    execute,
    audit: {
      reserveIntent: async () => "reserved",
      appendOutcome: async () => {},
    },
  };
  for (const reserveIntent of [
    async () => "duplicate",
    async () => {
      throw Error("synthetic outage");
    },
  ]) {
    const result = await runAuditedOperation({
      ...input,
      audit: { ...input.audit, reserveIntent },
    });
    assert.notEqual(result.status, "succeeded");
  }
  assert.equal(
    (
      await runAuditedOperation({
        ...input,
        request: { ...request, action: "free text canary" },
      })
    ).status,
    "invalid_metadata",
  );
  assert.equal(count, 0);
  assert.equal(
    (
      await runAuditedOperation({
        ...input,
        audit: {
          ...input.audit,
          appendOutcome: async () => {
            throw Error("synthetic outage");
          },
        },
      })
    ).status,
    "reconciliation_required",
  );
  assert.equal(count, 1);
  assert.equal(
    (
      await runAuditedOperation({
        ...input,
        execute: async () => {
          throw Error("unknown result");
        },
      })
    ).status,
    "reconciliation_required",
  );
});
