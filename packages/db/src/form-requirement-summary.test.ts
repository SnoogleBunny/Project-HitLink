import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authority: vi.fn(), bindings: vi.fn() }));
vi.mock("./staff-access.js", () => ({
  requireActiveStaffAccessTx: mocks.authority,
}));
vi.mock("./form-requirement-bindings.js", () => ({
  listEffectiveFormAssignments: mocks.bindings,
}));
import {
  buildRequiredFormsMemberFilterTx,
  summarizeRequiredFormsForMembersTx,
} from "./form-requirement-summary.js";
import type { Prisma } from "@prisma/client";
const now = new Date("2026-10-26T12:00:00.000Z"),
  actor = { workspaceId: "gym", userId: "coach" };
const binding = (overrides = {}) => ({
  id: "rev:MEMBER",
  requirementTarget: "MEMBER",
  requirementRevisionId: "rev",
  acceptanceCycleKey: "rev",
  revisionHash: "a".repeat(64),
  effectiveAt: new Date("2026-10-26T00:00:00Z"),
  publishedAt: new Date("2026-10-25T00:00:00Z"),
  consentValidUntil: new Date("2026-11-26T00:00:00Z"),
  upcoming: false,
  formDocument: {
    id: "doc",
    name: "Waiver",
    formType: "WAIVER",
    description: null,
    currentVersionId: "pdf",
    currentVersion: { id: "pdf", versionNumber: 1, createdAt: now },
  },
  ...overrides,
});
const member = (id: string, overrides = {}) => ({
  id,
  workspaceId: "gym",
  userId: id,
  fullName: "Fictional member",
  email: "fictional@example.test",
  status: "ACTIVE",
  dateOfBirth: new Date("1990-01-01Z"),
  familyLinks: [],
  ...overrides,
});
const proof = (memberId: string, overrides = {}) => ({
  memberId,
  formVersionId: "pdf",
  requirementRevisionId: "rev",
  acceptanceCycleKey: "rev",
  signerKind: "MEMBER",
  signedAt: new Date("2026-10-25T12:00:00Z"),
  validUntil: new Date("2026-11-26T00:00:00Z"),
  ...overrides,
});
function database(members: unknown[] = [], proofs: unknown[] = []) {
  const calls = {
    member: vi.fn().mockResolvedValue(members),
    proofs: vi.fn().mockResolvedValue(proofs),
  };
  return {
    db: {
      member: { findMany: calls.member },
      signedDocument: { findMany: calls.proofs },
    } as unknown as Prisma.TransactionClient,
    calls,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authority.mockResolvedValue({ role: "COACH" });
  mocks.bindings.mockResolvedValue([binding()]);
});
describe("role-scoped aggregate forms status", () => {
  it("builds a correlated exact-cycle predicate without collecting tenant member IDs", async () => {
    const { db, calls } = database();
    const filter = await buildRequiredFormsMemberFilterTx({
      db,
      actor,
      now,
      state: "ACTION_REQUIRED",
    });
    expect(filter).toMatchObject({
      AND: [{ workspaceId: "gym" }, { OR: expect.any(Array) }],
    });
    const text = JSON.stringify(filter);
    expect(text).toContain('"signedDocuments"');
    expect(text).toContain('"acceptanceCycleKey":"rev"');
    expect(text).toContain('"requirementRevisionId":"rev"');
    expect(text).toContain('"signerKind":"GUARDIAN"');
    expect(text).toContain('"signerKind":"MEMBER"');
    expect(text).toContain('"gte":"2026-10-25T00:00:00.000Z"');
    expect(calls.member).not.toHaveBeenCalled();
    expect(calls.proofs).not.toHaveBeenCalled();
    expect(mocks.authority).toHaveBeenCalledWith(db, {
      ...actor,
      capability: "OPERATIONS",
    });
  });
  it("keeps a future requirement separate and rejects a same-PDF legacy proof for the new cycle", async () => {
    mocks.bindings.mockResolvedValue([
      binding(),
      binding({
        id: "future",
        requirementRevisionId: "future",
        acceptanceCycleKey: "future",
        effectiveAt: new Date("2026-11-01T00:00:00Z"),
        upcoming: true,
      }),
    ]);
    const { db, calls } = database(
      [member("signed"), member("legacy")],
      [
        proof("signed"),
        proof("legacy", {
          requirementRevisionId: null,
          acceptanceCycleKey: "legacy",
          validUntil: null,
        }),
      ],
    );
    const summaries = await summarizeRequiredFormsForMembersTx({
      db,
      actor,
      memberIds: ["signed", "legacy"],
      now,
      includeUpcoming: true,
    });
    expect(summaries.get("signed")).toMatchObject({
      state: "COMPLETE",
      requiredCount: 1,
      missingCount: 0,
      upcomingCount: 1,
      nextExpiryAt: new Date("2026-11-26T00:00:00Z"),
    });
    expect(summaries.get("legacy")).toMatchObject({
      state: "ACTION_REQUIRED",
      requiredCount: 1,
      missingCount: 1,
      upcomingCount: 1,
      nextExpiryAt: null,
    });
    expect(calls.member).toHaveBeenCalledOnce();
    expect(calls.proofs).toHaveBeenCalledOnce();
    expect(mocks.bindings).toHaveBeenCalledOnce();
    expect(calls.member).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "gym", id: { in: ["signed", "legacy"] } },
      }),
    );
  });
  it("requires guardian proof for a minor and counts overlapping targets once per exact signer cycle", async () => {
    mocks.bindings.mockResolvedValue([
      binding(),
      binding({ requirementTarget: "GUARDIAN", id: "rev:GUARDIAN" }),
    ]);
    const child = member("child", {
      userId: null,
      dateOfBirth: new Date("2016-01-01Z"),
      familyLinks: [
        {
          guardian: {
            id: "guardian",
            fullName: "Fictional guardian",
            email: null,
          },
        },
      ],
    });
    const { db } = database(
      [child],
      [proof("child", { signerKind: "GUARDIAN" })],
    );
    expect(
      (
        await summarizeRequiredFormsForMembersTx({
          db,
          actor,
          memberIds: ["child"],
          now,
        })
      ).get("child"),
    ).toMatchObject({ state: "COMPLETE", requiredCount: 1 });
  });
  it("uses the exclusive consent-expiry boundary and never turns link expiry into consent expiry", async () => {
    mocks.bindings.mockResolvedValue([binding({ consentValidUntil: now })]);
    const { db } = database(
      [member("member")],
      [proof("member", { validUntil: now })],
    );
    expect(
      (
        await summarizeRequiredFormsForMembersTx({
          db,
          actor,
          memberIds: ["member"],
          now,
        })
      ).get("member"),
    ).toMatchObject({
      state: "EXPIRED",
      expiredCount: 1,
      missingCount: 1,
      nextExpiryAt: null,
    });
    const filter = await buildRequiredFormsMemberFilterTx({
      db,
      actor,
      now,
      state: "EXPIRED",
    });
    expect(filter).toEqual({
      AND: [{ workspaceId: "gym" }, { OR: [{ status: { not: "TRIAL" } }] }],
    });
  });
  it("bounds page work and refuses changed staff access before any forms read", async () => {
    const { db, calls } = database();
    await expect(
      summarizeRequiredFormsForMembersTx({
        db,
        actor,
        memberIds: Array.from({ length: 501 }, (_, i) => String(i)),
        now,
      }),
    ).rejects.toThrow("500");
    expect(mocks.bindings).not.toHaveBeenCalled();
    expect(calls.member).not.toHaveBeenCalled();
    mocks.authority.mockRejectedValue(new Error("staff access changed"));
    await expect(
      buildRequiredFormsMemberFilterTx({ db, actor, state: "COMPLETE", now }),
    ).rejects.toThrow("staff access changed");
    expect(mocks.bindings).not.toHaveBeenCalled();
  });
});
