import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@flowstate/db";
import type { PublicMembershipGateway, PublicMembershipEvidence } from "@flowstate/payments";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("verified public recurring memberships", () => {
  let api: typeof import("@flowstate/db"), pay: typeof import("@flowstate/payments"), db: PrismaClient;
  const tag = `public-pay-${randomUUID()}`, workspaceId = `${tag}-gym`, ownerId = `${tag}-owner`, ownerStaffId = `${tag}-staff`, accountId = `acct_${tag}`, now = new Date("2030-01-16T12:00:00Z");
  const users = [ownerId], previousOrigin = process.env.NEXT_PUBLIC_MEMBER_WEB_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl; process.env.NEXT_PUBLIC_MEMBER_WEB_URL = "http://localhost:3201";
    api = await import("@flowstate/db"); pay = await import("@flowstate/payments"); db = api.prisma;
    await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.test` } });
    await db.workspace.create({ data: { id: workspaceId, name: "Public payment test", status: "ACTIVE", location: { create: { name: "Gym", timezone: "America/Vancouver" } }, migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Complete", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: ownerId, operationallyReadyAt: now, operationallyReadyByUserId: ownerId } }, stripeSettings: { create: { stripeAccountId: accountId, chargesEnabled: true, connectionStatus: "ACTIVE" } }, workspaceUsers: { create: { id: ownerStaffId, userId: ownerId, role: "OWNER" } } } });
  });
  afterAll(async () => {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_MEMBER_WEB_URL; else process.env.NEXT_PUBLIC_MEMBER_WEB_URL = previousOrigin;
    if (!db) return;
    await db.publicEnrollment.deleteMany({ where: { workspaceId } });
    await db.financialReviewCase.deleteMany({ where: { workspaceId } }); await db.financialOperationEvent.deleteMany({ where: { workspaceId } }); await db.financialOperation.deleteMany({ where: { workspaceId } });
    await db.payment.deleteMany({ where: { workspaceId } }); await db.invoice.deleteMany({ where: { workspaceId } });
    await db.billingRecord.deleteMany({ where: { workspaceId } }); await db.membershipBillingState.deleteMany({ where: { workspaceId } }); await db.memberMembership.deleteMany({ where: { workspaceId } });
    await db.financialAccount.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: users } } });
  });
  async function fixture(label: string) {
    const userId = `${tag}-${label}`, memberId = `${userId}-member`; users.push(userId);
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } }, member: { create: { id: memberId, workspaceId, fullName: label, dateOfBirth: new Date("2000-01-01"), email: `${userId}@example.test` } } } });
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: label, monthlyPriceCents: 9900, currency: "cad", weeklyClassLimit: 2, cancellationPolicyReference: "Two calendar months", lifecyclePolicy: JSON.parse(JSON.stringify(api.defaultMembershipLifecyclePolicy)) }, include: { programRestrictions: true } });
    const offer = api.websiteOfferFromPlan(plan, { visible: true });
    const content = { title: "Test", description: "Test gym", headline: "Train", introduction: "Test", contactEmail: "gym@example.test", seoTitle: "Test", seoDescription: "Test gym", shareImageUrl: "", offers: [offer] };
    await db.workspaceWebsite.upsert({ where: { workspaceId }, create: { workspaceId, slug: tag, draft: JSON.parse(JSON.stringify(content)), published: JSON.parse(JSON.stringify(content)), publishedAt: now, publishedVersion: 1 }, update: { published: JSON.parse(JSON.stringify(content)) } });
    const enrollment = await db.publicEnrollment.create({ data: { workspaceId, kind: "MEMBERSHIP", status: "FORMS_REQUIRED", accessTokenHash: randomUUID(), email: `${userId}@example.test`, verificationCodeHash: "verified-test-fixture", verificationExpiresAt: now, verifiedAt: now, createdAt: now, memberId, participant: { fullName: label, dateOfBirth: "2000-01-01", email: `${userId}@example.test`, phone: "", guardianFullName: "", relationshipLabel: "", classTemplateId: "", scheduledForDate: "", offerId: plan.id, termsFingerprint: offer.termsFingerprint, accountUserId: userId, payerMemberId: memberId }, acceptedTerms: JSON.parse(JSON.stringify({ registrationConsent: true, membership: { ...api.snapshotMembershipTerms(plan), acceptedByUserId: userId, beneficiaryMemberId: memberId, acceptanceMethod: "PUBLIC_VERIFIED_ACCOUNT" } })) } });
    return { userId, memberId, enrollmentId: enrollment.id, planId: plan.id, start: { workspaceId, enrollmentId: enrollment.id, actorUserId: userId, returnUrl: "http://localhost:3201/gym/test/join/return", now } };
  }
  function gateway(label: string, initial: "open" | "paid" = "open") {
    let metadata: Record<string, string> = {}; let state: "open" | "paid" | "expired" = initial; let mismatch = false, fail = false;
    const creates: Array<{ key: string; params: unknown }> = [];
    const sessionId = `cs_${tag}_${label}`, subscriptionId = `sub_${tag}_${label}`, customerId = `cus_${tag}_${label}`;
    const adapter: PublicMembershipGateway = { create: async (_account, params, key) => { metadata = params.metadata as Record<string, string>; creates.push({ key, params }); if (fail) throw new Error("Lost response"); return { id: sessionId }; }, retrieve: async () => {
      const paid = state === "paid";
      const firstInvoice: PublicMembershipEvidence["firstInvoice"] = paid ? { id: `in_${tag}_${label}`, accountId, subscriptionId, customerId, status: "PAID", number: "INV-001", currency: "cad", subtotalCents: 9900, taxCents: 0, totalCents: 9900, amountPaidCents: 9900, amountDueCents: 0, issuedAt: now, dueAt: null, paidAt: now, voidedAt: null, failureCode: null, failureMessage: null, payments: [{ allocationId: `alloc_${label}`, paymentIntentId: `pi_${tag}_${label}`, amountCents: 9900, paidAt: now }] } : null;
      return { id: sessionId, status: state === "expired" ? "expired" : paid ? "complete" : "open", paymentStatus: paid ? "paid" : "unpaid", url: paid ? null : "https://checkout.stripe.test/session", expiresAt: now.getTime() / 1000 + 1860, amountTotal: mismatch ? 100 : 9900, currency: "cad", customerId: paid ? customerId : null, metadata,
        subscription: paid ? { id: subscriptionId, status: "active", customerId, metadata, startsAt: now.getTime() / 1000, billingAnchor: now.getTime() / 1000, currentPeriodStart: now.getTime() / 1000, currentPeriodEnd: Date.parse("2030-02-16T12:00:00Z") / 1000, itemCount: 1, amountCents: 9900, currency: "cad", interval: "month", intervalCount: 1 } : null, firstInvoice };
    } };
    return { adapter, creates, metadata: () => metadata, sessionId, paid: () => { state = "paid"; }, expire: () => { state = "expired"; }, wrongAmount: () => { mismatch = true; }, fail: () => { fail = true; } };
  }
  it("creates one pending contract and only activates after a paid canonical first invoice", async () => {
    const f = await fixture("normal"), mock = gateway("normal");
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    expect(started.status).toBe("PAYMENT_PENDING"); expect(started.url).toContain("checkout");
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD");
    await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter }); expect(mock.creates).toHaveLength(1);
    mock.paid(); expect((await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now })).status).toBe("COMPLETE");
    const contract = await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } }); expect(contract.status).toBe("ACTIVE"); expect(contract.allowanceAnchorDate?.toISOString().slice(0, 10)).toBe("2030-01-16");
    await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now });
    expect(await db.payment.count({ where: { memberId: f.memberId, status: "SUCCEEDED" } })).toBe(1);
    expect(await db.memberMembership.count({ where: { memberId: f.memberId } })).toBe(1);
  });
  it("rejects changed accepted prices and another user's checkout access", async () => {
    const f = await fixture("changed"), mock = gateway("changed");
    await db.membershipPlan.update({ where: { id: f.planId }, data: { monthlyPriceCents: 10900, termsVersion: { increment: 1 } } });
    await expect(pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter })).rejects.toThrow("changed"); expect(mock.creates).toHaveLength(0);
    await expect(pay.startPublicMembershipCheckout({ ...f.start, actorUserId: ownerId, gateway: mock.adapter })).rejects.toThrow("verified registration account");
  });
  it("rejects mismatched provider amount without activating or fabricating payment", async () => {
    const f = await fixture("mismatch"), mock = gateway("mismatch", "paid"); mock.wrongAmount();
    expect((await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter })).status).toBe("REVIEW_REQUIRED");
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD"); expect(await db.payment.count({ where: { memberId: f.memberId } })).toBe(0);
  });
  it("recovers a webhook before checkout response attachment using immutable operation metadata", async () => {
    const f = await fixture("race"), mock = gateway("race"); mock.fail();
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).providerReference).toBeNull(); mock.paid();
    const event = { type: "checkout.session.completed", account: accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
    expect(await pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, now })).toBe(true);
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("ACTIVE");
  });
  it("never blindly retries an unlinked lost response after23 hours", async () => {
    const f = await fixture("unknown"), mock = gateway("unknown"); mock.fail();
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    expect((await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now: new Date(now.getTime() + 24 * 3600000) })).status).toBe("REVIEW_REQUIRED"); expect(mock.creates).toHaveLength(1);
  });
  it("expires an unpaid checkout without preserving a phantom current membership", async () => {
    const f = await fixture("expired"), mock = gateway("expired"); const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter }); mock.expire();
    expect((await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now })).status).toBe("EXPIRED");
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).currentMembershipSlot).toBeNull();
  });
  it("records settled money but never resurrects a contract that ended while checkout was open", async () => {
    const f = await fixture("ended"), mock = gateway("ended"); const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    await db.memberMembership.updateMany({ where: { memberId: f.memberId }, data: { status: "CANCELLED", endedAt: now, currentMembershipSlot: null } }); mock.paid();
    expect((await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now })).status).toBe("REVIEW_REQUIRED");
    expect(await db.payment.count({ where: { memberId: f.memberId, status: "SUCCEEDED" } })).toBe(1); expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("CANCELLED");
  });
  it("requires new current forms after payment before granting access", async () => {
    const f = await fixture("forms"), mock = gateway("forms"); const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    const document = await db.formDocument.create({ data: { workspaceId, name: "New required terms", formType: "WAIVER" } });
    const version = await db.formVersion.create({ data: { workspaceId, formDocumentId: document.id, versionNumber: 1, fileName: "waiver.pdf", mimeType: "application/pdf", fileSizeBytes: 3, fileSha256: "test", fileData: Buffer.from("pdf"), uploadedByWorkspaceUserId: ownerStaffId } });
    await db.formDocument.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
    const assignment = await db.requiredFormAssignment.create({ data: { workspaceId, formDocumentId: document.id, requirementTarget: "MEMBERSHIP_ACTIVATION" } });
    mock.paid(); expect((await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now })).status).toBe("REVIEW_REQUIRED");
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD"); expect(await db.payment.count({ where: { memberId: f.memberId } })).toBe(1);
    await db.requiredFormAssignment.update({ where: { id: assignment.id }, data: { isActive: false } });
    const retried = await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now });
    expect(retried.status).toBe("REVIEW_REQUIRED"); expect(retried.url).toBeUndefined();
    const event = { type: "checkout.session.completed", account: accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
    await pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, now });
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD");
    expect(await db.payment.count({ where: { memberId: f.memberId } })).toBe(1);
    expect(await db.financialReviewCase.count({ where: { operationId: started.operationId, resolvedAt: null } })).toBe(1);
  });
  it("withholds reviewed unpaid checkout URLs and retains the review after later paid webhook evidence", async () => {
    const f = await fixture("sticky-unpaid"), mock = gateway("sticky-unpaid");
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter });
    await db.financialOperation.update({ where: { id: started.operationId }, data: { status: "REVIEW_REQUIRED" } });
    await db.financialReviewCase.create({ data: { workspaceId, operationId: started.operationId, sourceKey: `public-membership:${started.operationId}`, reason: "Registration authority requires explicit review", memberId: f.memberId } });
    const resumed = await pay.resumePublicMembershipCheckout({ workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, now });
    expect(resumed.status).toBe("REVIEW_REQUIRED"); expect(resumed.url).toBeUndefined();
    mock.paid();
    const event = { type: "checkout.session.completed", account: accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
    await pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, now });
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD");
    expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).status).toBe("REVIEW_REQUIRED");
    expect(await db.payment.count({ where: { memberId: f.memberId } })).toBe(1);
  });

});
