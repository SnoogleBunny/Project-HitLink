import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, MembershipLifecycleActor, MembershipLifecycleProviderEvidence } from "@flowstate/db";
import type { MembershipLifecycleGateway } from "@flowstate/payments";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("membership notice and finite freeze lifecycle", () => {
  let api: typeof import("@flowstate/db"), payments: typeof import("@flowstate/payments"), db: PrismaClient;
  const tag = `lifecycle-${randomUUID()}`, workspaceId = `${tag}-gym`;
  const owner: MembershipLifecycleActor = { workspaceId, userId: `${tag}-owner` }, member: MembershipLifecycleActor = { workspaceId, userId: `${tag}-member` }, stranger: MembershipLifecycleActor = { workspaceId, userId: `${tag}-stranger` };
  const memberId = `${tag}-member-record`;
  const now = new Date("2030-01-16T12:00:00Z");
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    api = await import("@flowstate/db"); payments = await import("@flowstate/payments"); db = api.prisma;
    await db.workspace.create({ data: { id: workspaceId, name: "Lifecycle test", status: "ACTIVE", location: { create: { name: "Test", timezone: "UTC" } }, stripeSettings: { create: { stripeAccountId: `acct_${tag}`, connectionStatus: "ACTIVE" } } } });
    for (const actor of [owner, member, stranger]) {
      await db.user.create({ data: { id: actor.userId, email: `${actor.userId}@example.test` } });
      await db.workspaceUser.create({ data: { workspaceId, userId: actor.userId, role: actor === owner ? "OWNER" : "CUSTOMER" } });
    }
    await db.member.create({ data: { id: memberId, workspaceId, userId: member.userId, fullName: "Lifecycle member", email: "member@example.test" } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.membershipLifecycleEvent.deleteMany({ where: { request: { workspaceId } } });
    await db.membershipLifecycleRequest.deleteMany({ where: { workspaceId } });
    await db.financialReviewCase.deleteMany({ where: { workspaceId } });
    await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
    await db.financialEntitlementHold.deleteMany({ where: { workspaceId } });
    await db.financialOperation.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [owner.userId, member.userId, stranger.userId] } } });
  });
  async function membership(suffix: string, policy = api.defaultMembershipLifecyclePolicy) {
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: suffix, monthlyPriceCents: 12000, currency: "cad", lifecyclePolicy: JSON.parse(JSON.stringify(policy)), cancellationPolicyReference: "Accepted notice policy" } });
    return db.memberMembership.create({ data: { workspaceId, memberId, membershipPlanId: plan.id, currentMembershipSlot: null, startedAt: new Date("2029-12-01"), allowanceAnchorDate: new Date("2029-12-01"), allowanceTimezone: "UTC", nextBillingDate: new Date("2030-02-01"), stripeCustomerId: `cus_${tag}`, stripeSubscriptionId: `sub_${suffix}`, acceptedTerms: JSON.parse(JSON.stringify(api.snapshotMembershipTerms(plan))) } });
  }
  function gateway(subscriptionId: string, options: { fail?: boolean; failDebt?: boolean; periodEnd?: string } = {}) {
    let state: MembershipLifecycleProviderEvidence = { accountId: `acct_${tag}`, subscriptionId, customerId: `cus_${tag}`, status: "active", cancelAt: null, pauseBehavior: null, pauseResumesAt: null, currentPeriodEnd: Date.parse(options.periodEnd ?? "2030-02-01") / 1000, existingDebtCollectionStopped: true };
    const changes: unknown[] = [];
    const adapter: MembershipLifecycleGateway = { retrieve: async () => ({ ...state }), change: async (request, key) => {
      changes.push({ request, key }); if (options.fail) throw new Error("response lost");
      if (request.providerAction === "STOP_DEBT_COLLECTION") { if (options.failDebt) throw new Error("debt stop response lost"); state.existingDebtCollectionStopped = true; return; }
      if (request.kind === "CANCEL") { state.cancelAt = Date.parse(request.effectiveOn) / 1000; if (request.providerAction === "CANCEL_NOW") state.status = "canceled"; if (request.noticeBillingDecision === "WAIVE_FUTURE") state.pauseBehavior = "void"; }
      if (request.kind === "FREEZE") { state.pauseBehavior = "void"; state.pauseResumesAt = Date.parse(request.resumeOn!) / 1000; }
      if (request.kind === "WITHDRAW") { state.cancelAt = null; state.pauseBehavior = request.preservePauseUntil ? "void" : null; }
      if (request.kind === "RESUME") state.pauseBehavior = null;
    } };
    return { adapter, changes, set: (value: Partial<MembershipLifecycleProviderEvidence>) => { state = { ...state, ...value }; } };
  }
  it("distinguishes calendar months, billing cycles and clamped month ends", () => {
    expect(api.defaultMembershipLifecyclePolicy.collectExistingDebt).toBe(false);
    const policy = { ...api.defaultMembershipLifecyclePolicy, alignment: "EXACT_DATE" as const };
    expect(api.membershipCancellationDates({ receivedOn: "2030-01-31", anchor: "2030-01-15", policy })).toEqual({ noticeEndsOn: "2030-03-31", effectiveOn: "2030-03-31" });
    expect(api.membershipCancellationDates({ receivedOn: "2030-01-31", anchor: "2030-01-15", policy: { ...policy, noticeUnit: "BILLING_CYCLES" } }).effectiveOn).toBe("2030-03-15");
    expect(api.shiftLifecycleMonth("2030-01-31", 1)).toBe("2030-02-28");
    expect(api.lifecycleBillingBoundary("2030-01-31", "2030-03-01")).toBe("2030-03-31");
  });
  it("preserves notice-period collection and uses a distinct durable stop only at termination", async () => {
    const contract = await membership("debt-boundary"); const mock = gateway(contract.stripeSubscriptionId!);
    mock.set({ existingDebtCollectionStopped: false });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "debt-boundary" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    expect(review.debtCollection).toBe(false);
    expect((await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now })).state).toBe("CONFIRMED");
    expect(mock.changes).toHaveLength(1);
    const original = await db.financialOperation.findUniqueOrThrow({ where: { workspaceId_operationKey: { workspaceId, operationKey: `membership-lifecycle:${request.id}` } } });
    expect(await db.financialOperation.count({ where: { workspaceId, operationKey: `membership-lifecycle-debt:${request.id}` } })).toBe(0);
    mock.set({ status: "canceled" });
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-01") })).state).toBe("COMPLETE");
    expect(mock.changes).toHaveLength(2);
    const debtStop = await db.financialOperation.findUniqueOrThrow({ where: { workspaceId_operationKey: { workspaceId, operationKey: `membership-lifecycle-debt:${request.id}` } } });
    expect(debtStop.status).toBe("SUCCEEDED"); expect(debtStop.providerIdempotencyKey).not.toBe(original.providerIdempotencyKey);
    expect((await db.financialOperation.findUniqueOrThrow({ where: { id: original.id } })).payload).toEqual(original.payload);
    await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-02") });
    expect(mock.changes).toHaveLength(2);
    const notices = await db.notificationJob.findMany({ where: { workspaceId, dedupeKey: { startsWith: `membership-lifecycle:${request.id}:` } } });
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((job) => job.recipientEmail === `${member.userId}@example.test` && (job.context as { kind: string }).kind === "MEMBER_ACCESS")).toBe(true);
    expect(notices.some((job) => job.recipientEmail === "member@example.test")).toBe(false);
  });
  it("preserves an explicitly accepted continuing-collection policy", async () => {
    const contract = await membership("debt-continue", { ...api.defaultMembershipLifecyclePolicy, collectExistingDebt: true }); const mock = gateway(contract.stripeSubscriptionId!);
    mock.set({ existingDebtCollectionStopped: false });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "debt-continue" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    expect(review.debtCollection).toBe(true);
    await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now });
    mock.set({ status: "canceled" });
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-01") })).state).toBe("COMPLETE");
    expect(mock.changes).toHaveLength(1);
  });
  it("retains remaining debt for a named review after collection stops", async () => {
    const contract = await membership("debt-review"); const mock = gateway(contract.stripeSubscriptionId!);
    const invoice = await db.invoice.create({ data: { workspaceId, memberId, memberMembershipId: contract.id, subtotalCents: 12000, totalCents: 12000, amountDueCents: 12000, currency: "cad", issuedAt: new Date("2030-01-01") } });
    mock.set({ existingDebtCollectionStopped: false });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "debt-review" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now });
    mock.set({ status: "canceled" });
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-01") })).state).toBe("RECONCILIATION_REQUIRED");
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("CANCELLED");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountDueCents).toBe(12000);
    const recovery = await db.financialReviewCase.findUniqueOrThrow({ where: { workspaceId_sourceKey: { workspaceId, sourceKey: `lifecycle-debt:${request.id}:${invoice.id}` } } });
    expect(recovery.resolvedAt).toBeNull(); expect(recovery.amountCents).toBe(12000);
  });
  it("changes invoice auto-collection only through the separate Stripe stop action and verifies flags", async () => {
    const updates: Array<{ id: string; params: unknown; options: unknown }> = [];
    const subscriptions: unknown[] = [];
    let advances = true;
    const stripe = {
      subscriptions: {
        retrieve: async () => ({ id: "sub_adapter", customer: "cus_adapter", status: "active", cancel_at: Date.parse("2030-04-01") / 1000, pause_collection: null, items: { data: [{ current_period_end: Date.parse("2030-02-01") / 1000, price: { recurring: { interval: "month", interval_count: 1 } } }] } }),
        update: async (...args: unknown[]) => { subscriptions.push(args); },
      },
      invoices: {
        list: () => (async function* () { yield { id: "in_adapter", auto_advance: advances }; })(),
        update: async (id: string, params: unknown, options: unknown) => { updates.push({ id, params, options }); advances = false; },
      },
    };
    const adapter = payments.createStripeMembershipLifecycleGateway(stripe as unknown as Parameters<typeof payments.createStripeMembershipLifecycleGateway>[0]);
    const request = { accountId: "acct_adapter", subscriptionId: "sub_adapter", customerId: "cus_adapter", kind: "CANCEL", effectiveOn: "2030-04-01", resumeOn: null, timezone: "UTC", noticeBillingDecision: "CONTINUE", collectExistingDebt: false };
    await adapter.change({ ...request, providerAction: "UPDATE" }, "schedule-key");
    expect(subscriptions).toHaveLength(1); expect(updates).toHaveLength(0);
    expect((await adapter.retrieve(request)).existingDebtCollectionStopped).toBe(false);
    await adapter.change({ ...request, providerAction: "STOP_DEBT_COLLECTION" }, "debt-key");
    expect(subscriptions).toHaveLength(1);
    expect(updates).toEqual([{ id: "in_adapter", params: { auto_advance: false }, options: { stripeAccount: "acct_adapter", idempotencyKey: "debt-key:invoice:in_adapter" } }]);
    expect((await adapter.retrieve(request)).existingDebtCollectionStopped).toBe(true);
  });
  it("keeps uncertain old-debt collection open without replaying the original subscription mutation", async () => {
    const contract = await membership("debt-uncertain"); const mock = gateway(contract.stripeSubscriptionId!, { failDebt: true });
    mock.set({ existingDebtCollectionStopped: false });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "debt-uncertain" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now });
    mock.set({ status: "canceled" });
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-01") })).state).toBe("PENDING_PROVIDER");
    expect((await db.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: request.id } })).completedAt).toBeNull();
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-02") })).state).toBe("REVIEW_REQUIRED");
    expect(mock.changes).toHaveLength(2);
    expect(await db.financialReviewCase.count({ where: { workspaceId, sourceKey: `lifecycle-debt:${request.id}:provider`, resolvedAt: null } })).toBe(1);
  });
  it("records one stable receipt and holds the accepted policy despite owner delay or new plan settings", async () => {
    const contract = await membership("receipt");
    const input = { membershipId: contract.id, kind: "CANCEL" as const, operationKey: "receipt" };
    const request = await api.requestMembershipLifecycleChange(member, input, { now });
    const replay = await api.requestMembershipLifecycleChange(member, input, { now: new Date("2030-02-20") });
    expect(replay.id).toBe(request.id); expect(replay.receivedAt).toEqual(now);
    await db.membershipPlan.update({ where: { id: contract.membershipPlanId }, data: { lifecyclePolicy: { ...api.defaultMembershipLifecyclePolicy, noticeLength: 8 } } });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now: new Date("2030-02-20") });
    expect(review.effectiveOn).toBe("2030-04-01"); expect(review.acceptedPolicyVersion).toBe(1);
    expect(review.renewals.map((r) => r.date)).toEqual(["2030-02-01", "2030-03-01"]);
    await expect(api.requestMembershipLifecycleChange(stranger, { ...input, operationKey: "steal" }, { now })).rejects.toThrow("permission");
    await expect(api.approveMembershipLifecycleChange(member, { requestId: request.id, reviewToken: review.reviewToken }, { now })).rejects.toThrow("owner");
  });
  it("rejects stale review and adverse exceptions before any processor mutation", async () => {
    const contract = await membership("stale");
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "stale" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    await db.memberMembership.update({ where: { id: contract.id }, data: { nextBillingDate: new Date("2030-03-01") } });
    await expect(api.approveMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { now })).rejects.toThrow("changed");
    await expect(api.reviewMembershipLifecycleChange(owner, { requestId: request.id, override: { effectiveOn: "2030-05-01", reason: "late approval" } }, { now })).rejects.toThrow("cannot extend");
    expect(await db.financialOperation.count({ where: { workspaceId, targetId: contract.id } })).toBe(0);
  });
  it("keeps access pending until verified stop, then preserves its exact boundary through replay", async () => {
    const contract = await membership("verified"); const mock = gateway(contract.stripeSubscriptionId!);
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "verified" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    const result = await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now });
    expect(result.state).toBe("CONFIRMED"); expect(mock.changes).toHaveLength(1);
    const current = await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } }); expect(current.endedAt?.toISOString()).toBe("2030-04-01T00:00:00.000Z"); expect(current.status).toBe("ACTIVE");
    await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now }); expect(mock.changes).toHaveLength(1);
    mock.set({ status: "canceled" });
    expect((await payments.retryMembershipLifecycleChange(member, request.id, { gateway: mock.adapter, now: new Date("2030-04-02") })).state).toBe("COMPLETE");
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("CANCELLED");
  });
  it("does not blindly retry unknown processor mutations beyond the key retention window", async () => {
    const contract = await membership("uncertain"); const mock = gateway(contract.stripeSubscriptionId!, { fail: true });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "uncertain" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    expect((await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now })).state).toBe("PENDING_PROVIDER");
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } })).endedAt).toBeNull();
    expect((await payments.retryMembershipLifecycleChange(owner, request.id, { gateway: mock.adapter, now: new Date(now.getTime() + 24 * 3600000) })).state).toBe("REVIEW_REQUIRED");
    expect(mock.changes).toHaveLength(1);
  });
  it("defers a later freeze, confirms finite billing pause, and resumes without quota or seat creation", async () => {
    const contract = await membership("freeze"); const mock = gateway(contract.stripeSubscriptionId!);
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "FREEZE", fromDate: "2030-03-01", toDate: "2030-05-01", operationKey: "freeze" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    expect((await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now })).state).toBe("SCHEDULED"); expect(mock.changes).toHaveLength(0);
    mock.set({ currentPeriodEnd: Date.parse("2030-03-01") / 1000 });
    expect((await payments.retryMembershipLifecycleChange(owner, request.id, { gateway: mock.adapter, now: new Date("2030-02-02") })).state).toBe("CONFIRMED");
    await payments.retryMembershipLifecycleChange(owner, request.id, { gateway: mock.adapter, now: new Date("2030-03-05") });
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("FROZEN");
    mock.set({ pauseBehavior: null, pauseResumesAt: null });
    expect((await payments.retryMembershipLifecycleChange(owner, request.id, { gateway: mock.adapter, now: new Date("2030-05-01") })).state).toBe("COMPLETE");
    const resumed = await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } }); expect(resumed.status).toBe("ACTIVE"); expect(resumed.allowanceAnchorDate).toEqual(contract.allowanceAnchorDate);
    expect(await db.membershipAllowanceAllocation.count({ where: { memberMembershipId: contract.id } })).toBe(0);
  });
  it("withdraws a future cancellation without recreating cancelled reservations", async () => {
    const contract = await membership("withdraw"); const mock = gateway(contract.stripeSubscriptionId!);
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "withdraw-cancel" }, { now });
    const review = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now });
    await payments.processMembershipLifecycleChange(owner, { requestId: request.id, reviewToken: review.reviewToken }, { gateway: mock.adapter, now });
    const withdrawal = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "WITHDRAW", parentRequestId: request.id, operationKey: "withdraw" }, { now });
    const changed = await api.reviewMembershipLifecycleChange(owner, { requestId: withdrawal.id }, { now });
    expect((await payments.processMembershipLifecycleChange(owner, { requestId: withdrawal.id, reviewToken: changed.reviewToken }, { gateway: mock.adapter, now })).state).toBe("COMPLETE");
    expect((await db.memberMembership.findUniqueOrThrow({ where: { id: contract.id } })).endedAt).toBeNull();
    expect((await db.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: request.id } })).state).toBe("WITHDRAWN");
  });
  it("does not impose default notice on a legacy contract without accepted policy", async () => {
    const contract = await membership("legacy"); await db.memberMembership.update({ where: { id: contract.id }, data: { acceptedTerms: { version: 1, programIds: [], weeklyClassLimit: null, monthlyClassLimit: null, allowanceCountingMode: "ATTENDANCE" } } });
    const request = await api.requestMembershipLifecycleChange(member, { membershipId: contract.id, kind: "CANCEL", operationKey: "legacy" }, { now });
    expect(request.receivedAt).toEqual(now);
    await expect(api.reviewMembershipLifecycleChange(owner, { requestId: request.id }, { now })).rejects.toThrow("Legacy");
    const waived = await api.reviewMembershipLifecycleChange(owner, { requestId: request.id, override: { effectiveOn: "2030-01-16", reason: "Unknown historical policy; owner waives notice", noticeBillingDecision: "WAIVE_FUTURE" } }, { now });
    expect(waived.effectiveOn).toBe("2030-01-16"); expect(waived.acceptedPolicyVersion).toBe(0);
  });
});
