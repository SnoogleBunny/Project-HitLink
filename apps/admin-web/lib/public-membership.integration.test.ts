import { createHash, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@flowstate/db";
import type { PublicMembershipGateway, PublicMembershipEvidence } from "@flowstate/payments";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("verified public recurring memberships", () => {
  let api: typeof import("@flowstate/db"), pay: typeof import("@flowstate/payments"), db: PrismaClient;
  const tag = `public-pay-${randomUUID()}`, workspaceId = `${tag}-gym`, ownerId = `${tag}-owner`, ownerStaffId = `${tag}-staff`, accountId = `acct_${tag}`, now = new Date("2030-01-16T12:00:00Z");
  const users = [ownerId], previousOrigin = process.env.NEXT_PUBLIC_MEMBER_WEB_URL;
  const defaultScope = { workspaceId, ownerId, ownerStaffId, accountId, slug: tag };
  const extraWorkspaces: string[] = [];
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl; process.env.NEXT_PUBLIC_MEMBER_WEB_URL = "http://localhost:3201";
    api = await import("@flowstate/db"); pay = await import("@flowstate/payments"); db = api.prisma;
    await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.test` } });
    await db.workspace.create({ data: { id: workspaceId, name: "Public payment test", status: "ACTIVE", location: { create: { name: "Gym", timezone: "America/Vancouver" } }, migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Complete", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: ownerId, operationallyReadyAt: now, operationallyReadyByUserId: ownerId } }, stripeSettings: { create: { stripeAccountId: accountId, chargesEnabled: true, connectionStatus: "ACTIVE" } }, workspaceUsers: { create: { id: ownerStaffId, userId: ownerId, role: "OWNER" } } } });
  });
  afterAll(async () => {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_MEMBER_WEB_URL; else process.env.NEXT_PUBLIC_MEMBER_WEB_URL = previousOrigin;
    if (!db) return;
    for (const workspaceId of [defaultScope.workspaceId, ...extraWorkspaces]) for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await db.$transaction(async tx => {
          await api.lockClassSchedule(tx, workspaceId);
          for (const prefix of ["family-access", "financial", "retention"]) await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))::text", `${prefix}:${workspaceId}`);
          const inventory = await inspectRetentionInventory(tx, workspaceId);
          await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
        }, { isolationLevel: "Serializable", timeout: 120000 });
        break;
      } catch (error) {
        if (!(error instanceof api.Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 11) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(1000, 25 * 2 ** (attempt + 1)) + Math.floor(Math.random() * 100)));
      }
    }
    await db.user.deleteMany({ where: { id: { in: users } } });
  }, 120000);
  async function fixture(label: string, scope = defaultScope) {
    const { workspaceId } = scope;
    const userId = `${tag}-${label}`, memberId = `${userId}-member`; users.push(userId);
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } }, member: { create: { id: memberId, workspaceId, fullName: label, dateOfBirth: new Date("2000-01-01"), email: `${userId}@example.test` } } } });
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: label, monthlyPriceCents: 9900, currency: "cad", weeklyClassLimit: 2, cancellationPolicyReference: "Two calendar months", lifecyclePolicy: JSON.parse(JSON.stringify(api.defaultMembershipLifecyclePolicy)) }, include: { programRestrictions: true } });
    const offer = api.websiteOfferFromPlan(plan, { visible: true });
    const content = { title: "Test", description: "Test gym", headline: "Train", introduction: "Test", contactEmail: "gym@example.test", seoTitle: "Test", seoDescription: "Test gym", shareImageUrl: "", offers: [offer] };
    await db.workspaceWebsite.upsert({ where: { workspaceId }, create: { workspaceId, slug: scope.slug, draft: JSON.parse(JSON.stringify(content)), published: JSON.parse(JSON.stringify(content)), publishedAt: now, publishedVersion: 1 }, update: { published: JSON.parse(JSON.stringify(content)) } });
    const enrollment = await db.publicEnrollment.create({ data: { workspaceId, kind: "MEMBERSHIP", status: "FORMS_REQUIRED", accessTokenHash: randomUUID(), email: `${userId}@example.test`, verificationCodeHash: "verified-test-fixture", verificationExpiresAt: now, verifiedAt: now, createdAt: now, memberId, participant: { fullName: label, dateOfBirth: "2000-01-01", email: `${userId}@example.test`, phone: "", guardianFullName: "", relationshipLabel: "", classTemplateId: "", scheduledForDate: "", offerId: plan.id, termsFingerprint: offer.termsFingerprint, accountUserId: userId, payerMemberId: memberId }, acceptedTerms: JSON.parse(JSON.stringify({ registrationConsent: true, membership: { ...api.snapshotMembershipTerms(plan), acceptedByUserId: userId, beneficiaryMemberId: memberId, acceptanceMethod: "PUBLIC_VERIFIED_ACCOUNT" } })) } });
    return { userId, memberId, enrollmentId: enrollment.id, planId: plan.id, scope, start: { workspaceId, enrollmentId: enrollment.id, actorUserId: userId, returnUrl: "http://localhost:3201/gym/test/join/return", now } };
  }
  function gateway(label: string, initial: "open" | "paid" = "open", scope = defaultScope, clock = now) {
    const { accountId } = scope;
    const now = clock;
    let metadata: Record<string, string> = {}; let state: "open" | "paid" | "expired" = initial; let mismatch = false, fail = false, responsesToLose = 0;
    const creates: Array<{ key: string; params: unknown }> = [];
    const sessionId = `cs_${tag}_${label}`, subscriptionId = `sub_${tag}_${label}`, customerId = `cus_${tag}_${label}`;
    const adapter: PublicMembershipGateway = { create: async (_account, params, key) => { metadata = params.metadata as Record<string, string>; creates.push({ key, params }); if (fail || responsesToLose > 0) { responsesToLose = Math.max(0, responsesToLose - 1); throw new Error("Lost response"); } return { id: sessionId }; }, retrieve: async () => {
      const paid = state === "paid";
      const firstInvoice: PublicMembershipEvidence["firstInvoice"] = paid ? { id: `in_${tag}_${label}`, accountId, subscriptionId, customerId, status: "PAID", number: "INV-001", currency: "cad", subtotalCents: 9900, taxCents: 0, totalCents: 9900, amountPaidCents: 9900, amountDueCents: 0, issuedAt: now, dueAt: null, paidAt: now, voidedAt: null, failureCode: null, failureMessage: null, payments: [{ allocationId: `alloc_${label}`, paymentIntentId: `pi_${tag}_${label}`, amountCents: 9900, paidAt: now }] } : null;
      return { id: sessionId, status: state === "expired" ? "expired" : paid ? "complete" : "open", paymentStatus: paid ? "paid" : "unpaid", url: paid ? null : "https://checkout.stripe.test/session", expiresAt: now.getTime() / 1000 + 1860, amountTotal: mismatch ? 100 : 9900, currency: "cad", customerId: paid ? customerId : null, metadata,
        subscription: paid ? { id: subscriptionId, status: "active", customerId, metadata, startsAt: now.getTime() / 1000, billingAnchor: now.getTime() / 1000, currentPeriodStart: now.getTime() / 1000, currentPeriodEnd: Date.parse("2030-02-16T12:00:00Z") / 1000, itemCount: 1, amountCents: 9900, currency: "cad", interval: "month", intervalCount: 1 } : null, firstInvoice };
    } };
    return { adapter, creates, metadata: () => metadata, sessionId, paid: () => { state = "paid"; }, expire: () => { state = "expired"; }, wrongAmount: () => { mismatch = true; }, fail: () => { fail = true; }, loseResponseOnce: () => { responsesToLose++; } };
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

  // Published requirements also govern the exact durable public-membership path.
  async function isolatedFormFixture(label: string) {
    const key = `${tag}-${label}`;
    const scope = { workspaceId: `${key}-gym`, ownerId: `${key}-owner`, ownerStaffId: `${key}-owner-staff`, accountId: `acct_${key}`, slug: key };
    users.push(scope.ownerId);
    await db.user.create({ data: { id: scope.ownerId, email: `${scope.ownerId}@example.test` } });
    await db.workspace.create({ data: {
      id: scope.workspaceId, name: "Fictional public form-cycle payment gym", status: "ACTIVE",
      location: { create: { name: "Gym", timezone: "America/Vancouver" } },
      migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Complete", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: scope.ownerId, operationallyReadyAt: now, operationallyReadyByUserId: scope.ownerId } },
      stripeSettings: { create: { stripeAccountId: scope.accountId, chargesEnabled: true, connectionStatus: "ACTIVE" } },
      workspaceUsers: { create: { id: scope.ownerStaffId, userId: scope.ownerId, role: "OWNER" } },
    } });
    extraWorkspaces.push(scope.workspaceId);
    return fixture(label, scope);
  }
  type FormFixture = Awaited<ReturnType<typeof isolatedFormFixture>>;
  async function legacyWaiver(f: FormFixture) {
    const document = await db.formDocument.create({ data: { workspaceId: f.scope.workspaceId, name: `Exact same-PDF waiver ${f.memberId}`, formType: "WAIVER" } });
    const bytes = Buffer.from("%PDF-1.7\nFictional same-PDF renewal evidence\n%%EOF\n");
    const pdf = await db.formVersion.create({ data: {
      workspaceId: f.scope.workspaceId, formDocumentId: document.id, versionNumber: 1,
      fileName: "same-waiver.pdf", mimeType: "application/pdf", fileSizeBytes: bytes.length,
      fileSha256: createHash("sha256").update(bytes).digest("hex"), fileData: bytes,
      uploadedByWorkspaceUserId: f.scope.ownerStaffId, createdAt: new Date(+now - 86400000),
    } });
    await db.formDocument.update({ where: { id: document.id }, data: { currentVersionId: pdf.id } });
    await db.requiredFormAssignment.create({ data: { workspaceId: f.scope.workspaceId, formDocumentId: document.id, requirementTarget: "MEMBERSHIP_ACTIVATION" } });
    const request = await db.signatureRequest.create({ data: { workspaceId: f.scope.workspaceId, memberId: f.memberId, formVersionId: pdf.id, signerKind: "MEMBER", accessMethod: "PORTAL" } });
    const signed = await api.recordLocalFormSignature({ workspaceId: f.scope.workspaceId, memberId: f.memberId, requestId: request.id, actorUserId: f.userId, signerName: "Verified fictional participant", db, now: new Date(+now - 3600000) });
    expect(signed.status).toBe("signed");
    if (signed.status !== "signed") throw new Error("Legacy same-PDF positive baseline did not sign");
    const proof = await db.signedDocument.findUniqueOrThrow({ where: { id: signed.signedDocumentId } });
    expect(proof).toMatchObject({ formVersionId: pdf.id, requirementRevisionId: null, acceptanceCycleKey: "legacy", validUntil: null });
    return { document, pdf, proof };
  }
  type WaiverFixture = Awaited<ReturnType<typeof legacyWaiver>>;
  async function publicForms(f: FormFixture, at: Date, ensure = false) {
    return api.getPublicEnrollmentForms({ workspaceId: f.scope.workspaceId, enrollmentId: f.enrollmentId, actorUserId: f.userId, ensure, db, now: at });
  }
  async function publishSamePdf(f: FormFixture, waiver: WaiverFixture, effectiveAt: Date, validUntil: Date | null = null, targets: Array<"MEMBER" | "MEMBERSHIP_ACTIVATION"> = ["MEMBERSHIP_ACTIVATION"]) {
    const head = await db.formRequirementRevision.findFirst({ where: { workspaceId: f.scope.workspaceId, formDocumentId: waiver.document.id }, orderBy: { version: "desc" } });
    const input = {
      publicationId: randomUUID(), formDocumentId: waiver.document.id, formVersionId: waiver.pdf.id,
      expectedHeadHash: head?.revisionHash ?? null, reason: "Reviewed same-PDF membership consent renewal",
      terms: { schemaVersion: 1 as const, targets, effectiveAt: effectiveAt.toISOString(), consentValidUntil: validUntil?.toISOString() ?? null, noticeLeadMinutes: 1, expiryWarningLeadMinutes: 1 },
    };
    const args = { db, workspaceId: f.scope.workspaceId, actorUserId: f.scope.ownerId, input, now: new Date(+effectiveAt - 60000) };
    const preview = await api.previewFormPublication(args);
    const result = await api.publishFormRequirement({ ...args, expectedPreviewHash: preview.previewHash, confirmShortNotice: true, portalOrigin: "http://localhost:3201" });
    const revision = await db.formRequirementRevision.findUniqueOrThrow({ where: { id: result.revisionId } });
    expect(revision.formVersionId).toBe(waiver.pdf.id);
    expect(await db.formVersion.count({ where: { workspaceId: f.scope.workspaceId, formDocumentId: waiver.document.id } })).toBe(1);
    return revision;
  }
  async function acceptExactCycle(f: FormFixture, waiver: WaiverFixture, revisionId: string, at: Date) {
    const forms = await publicForms(f, at, true), form = forms.find((row) => row.name === waiver.document.name);
    expect(form).toMatchObject({ signed: false, version: 1 });
    expect(form?.requestId).toBeTruthy();
    if (!form?.requestId) throw new Error("Current exact acceptance-cycle request was not issued");
    const request = await db.signatureRequest.findUniqueOrThrow({ where: { id: form.requestId } });
    expect(request).toMatchObject({ workspaceId: f.scope.workspaceId, memberId: f.memberId, formVersionId: waiver.pdf.id, requirementRevisionId: revisionId, acceptanceCycleKey: revisionId, signerKind: "MEMBER" });
    const result = await api.recordLocalFormSignature({ workspaceId: f.scope.workspaceId, memberId: f.memberId, requestId: request.id, actorUserId: f.userId, signerName: "Verified fictional participant", db, now: at });
    expect(result.status).toBe("signed");
    if (result.status !== "signed") throw new Error("Current exact acceptance cycle was not signed");
    return db.signedDocument.findUniqueOrThrow({ where: { id: result.signedDocumentId } });
  }
  const immutableCheckout = (operationId: string) => db.financialOperation.findUniqueOrThrow({ where: { id: operationId }, select: { id: true, operationKey: true, requestHash: true, payload: true, providerIdempotencyKey: true, providerAccountId: true, beneficiaryMemberId: true, targetId: true, payerAccountId: true } });
  async function expectSingleReviewedPayment(f: FormFixture, operationId: string, original: Awaited<ReturnType<typeof immutableCheckout>>, mock: ReturnType<typeof gateway>) {
    const scope = { workspaceId: f.scope.workspaceId, memberId: f.memberId };
    expect(await immutableCheckout(operationId)).toEqual(original);
    // A lost response can require another provider call. It must recover the
    // exact original request/key rather than create a distinct checkout.
    expect(mock.creates.length).toBeGreaterThan(0);
    expect([...new Set(mock.creates.map((call) => call.key))]).toEqual([original.providerIdempotencyKey]);
    for (const call of mock.creates) expect(call.params).toEqual(mock.creates[0]!.params);
    expect(await db.financialOperation.count({ where: { workspaceId: f.scope.workspaceId, beneficiaryMemberId: f.memberId, kind: "CHECKOUT" } })).toBe(1);
    expect(await db.memberMembership.findMany({ where: scope })).toMatchObject([{ status: "PENDING_PAYMENT_METHOD", memberId: f.memberId }]);
    expect(await db.invoice.findMany({ where: scope })).toMatchObject([{ status: "PAID", totalCents: 9900, amountPaidCents: 9900, amountDueCents: 0 }]);
    expect(await db.payment.findMany({ where: scope })).toMatchObject([{ status: "SUCCEEDED", amountCents: 9900 }]);
    expect((await db.financialOperation.findUniqueOrThrow({ where: { id: operationId } })).status).toBe("REVIEW_REQUIRED");
    expect(await db.financialReviewCase.count({ where: { workspaceId: f.scope.workspaceId, operationId, resolvedAt: null } })).toBe(1);
    expect((await db.publicEnrollment.findUniqueOrThrow({ where: { id: f.enrollmentId } })).status).not.toBe("COMPLETE");
    expect(await db.notificationJob.count({ where: { workspaceId: f.scope.workspaceId, subject: "Your membership is ready" } })).toBe(0);
  }

  it("[WF07 membership] blocks a newly effective same-PDF cycle before reservation, then accepts its legitimate exact new proof", async () => {
    const f = await isolatedFormFixture("renew-before-reserve"), waiver = await legacyWaiver(f), effectiveAt = new Date(+now + 60000);
    expect(await publicForms(f, now)).toMatchObject([{ signed: true, version: 1 }]);
    const revision = await publishSamePdf(f, waiver, effectiveAt), at = new Date(+effectiveAt + 1);
    expect(await publicForms(f, new Date(+effectiveAt - 1))).toMatchObject([{ signed: true, version: 1 }]);
    const mock = gateway("renew-before-reserve", "paid", f.scope, at);
    await expect(pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db, now: at })).rejects.toThrow("required form");
    expect(mock.creates).toHaveLength(0);
    expect(await db.financialOperation.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
    expect(await db.memberMembership.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
    const proof = await acceptExactCycle(f, waiver, revision.id, at);
    expect(proof).toMatchObject({ formVersionId: waiver.pdf.id, requirementRevisionId: revision.id, acceptanceCycleKey: revision.id, validUntil: null });
    expect(await publicForms(f, at)).toMatchObject([{ signed: true, version: 1 }]);
    expect((await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db, now: at })).status).toBe("COMPLETE");
    expect(mock.creates).toHaveLength(1);
    expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("ACTIVE");
    expect(await db.signedDocument.findUniqueOrThrow({ where: { id: waiver.proof.id } })).toEqual(waiver.proof);
  });

  it.each(["open", "lost response"] as const)("[WF07 membership] records paid money once without activating after same-PDF renewal during %s checkout", async (mode) => {
    const label = mode === "open" ? "renew-open" : "renew-lost", f = await isolatedFormFixture(label), waiver = await legacyWaiver(f), mock = gateway(label, "open", f.scope);
    expect(await publicForms(f, now)).toMatchObject([{ signed: true }]);
    if (mode === "lost response") mock.loseResponseOnce();
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    expect(started.status).toBe("PAYMENT_PENDING");
    const original = await immutableCheckout(started.operationId);
    if (mode === "lost response") expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).providerReference).toBeNull();
    const effectiveAt = new Date(+now + 60000), revision = await publishSamePdf(f, waiver, effectiveAt, null, ["MEMBER"]), at = new Date(+effectiveAt + 1);
    expect(await publicForms(f, at)).toMatchObject([{ signed: false, version: 1 }]);
    mock.paid();
    let resumeAt = at;
    const resume = () => pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db, now: resumeAt });
    expect((await resume()).status).toBe("REVIEW_REQUIRED");
    if (mode === "lost response") expect(mock.creates.length).toBeGreaterThan(1);
    expect((await resume()).status).toBe("REVIEW_REQUIRED");
    const event = { type: "checkout.session.completed", account: f.scope.accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
    expect(await pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, db, now: at })).toBe(true);
    await expectSingleReviewedPayment(f, started.operationId, original, mock);
    // A later legitimate signature does not erase the existing money/access
    // review or manufacture a second purchase while recovering the first one.
    resumeAt = new Date(+now + 25 * 3600000);
    await acceptExactCycle(f, waiver, revision.id, resumeAt);
    expect((await resume()).status).toBe("REVIEW_REQUIRED");
    await expectSingleReviewedPayment(f, started.operationId, original, mock);
    expect(await db.signedDocument.findUniqueOrThrow({ where: { id: waiver.proof.id } })).toEqual(waiver.proof);
  });

  it("[WF07 membership] expires an actually accepted finite proof at its exact boundary before provider reservation", async () => {
    const f = await isolatedFormFixture("expiry-before-reserve"), waiver = await legacyWaiver(f);
    const effectiveAt = new Date(+now - 120000), expiresAt = new Date(+now - 1), signedAt = new Date(+effectiveAt + 1);
    const revision = await publishSamePdf(f, waiver, effectiveAt, expiresAt);
    const proof = await acceptExactCycle(f, waiver, revision.id, signedAt);
    expect(proof.validUntil).toEqual(expiresAt);
    expect(await publicForms(f, new Date(+expiresAt - 1))).toMatchObject([{ signed: true, version: 1 }]);
    expect(await publicForms(f, expiresAt)).toMatchObject([{ signed: false, version: 1 }]);
    const mock = gateway("expiry-before-reserve", "paid", f.scope);
    await expect(pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db, now })).rejects.toThrow("required form");
    expect(mock.creates).toHaveLength(0);
    expect(await db.financialOperation.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
    expect(await db.memberMembership.count({ where: { workspaceId: f.scope.workspaceId } })).toBe(0);
    expect(await db.signedDocument.findUniqueOrThrow({ where: { id: proof.id } })).toEqual(proof);
    expect(await db.signedDocument.findUniqueOrThrow({ where: { id: waiver.proof.id } })).toEqual(waiver.proof);
  });

  it("[WF07 membership] records canonical payment once but cannot activate when accepted proof expires during checkout", async () => {
    const f = await isolatedFormFixture("expiry-open"), waiver = await legacyWaiver(f), expiresAt = new Date(+now + 60000);
    const effectiveAt = new Date(+now - 120000), revision = await publishSamePdf(f, waiver, effectiveAt, expiresAt);
    const proof = await acceptExactCycle(f, waiver, revision.id, new Date(+effectiveAt + 1));
    expect(proof.validUntil).toEqual(expiresAt);
    expect(await publicForms(f, now)).toMatchObject([{ signed: true, version: 1 }]);
    const mock = gateway("expiry-open", "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    expect(started.status).toBe("PAYMENT_PENDING");
    const original = await immutableCheckout(started.operationId), at = new Date(+expiresAt + 1);
    expect(await publicForms(f, at)).toMatchObject([{ signed: false, version: 1 }]);
    mock.paid();
    const resume = () => pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db, now: at });
    expect((await resume()).status).toBe("REVIEW_REQUIRED");
    expect((await resume()).status).toBe("REVIEW_REQUIRED");
    await expectSingleReviewedPayment(f, started.operationId, original, mock);
    expect(await db.signedDocument.findUniqueOrThrow({ where: { id: proof.id } })).toEqual(proof);
  });


  // Fault injection uses supported Prisma query extensions over the actual
  // disposable PG client. It is not a provider call or a claim that the injected
  // exception was emitted by the database engine. All money/review writes and
  // transaction rollback assertions below run through the maintained domain.
  function failPaidActivation(f: FormFixture, operationId: string, original: unknown, reviewFailure?: unknown) {
    return db.$extends({ query: {
      member: { async update({ args, query }) {
        if (args.where.id === f.memberId && args.data.status === "ACTIVE") throw original;
        return query(args);
      } },
      financialReviewCase: { async upsert({ args, query }) {
        const key = args.where.workspaceId_sourceKey;
        if (reviewFailure !== undefined && key?.workspaceId === f.scope.workspaceId && key.sourceKey === `public-membership:${operationId}`) throw reviewFailure;
        return query(args);
      } },
    } });
  }
  // The existing Options seam accepts PrismaClient, while Prisma's extended
  // test client omits base-only methods. This test-only adapter supplies the
  // maintained command seam; no production client/type/factory is changed.
  type ActivationFailureClient = ReturnType<typeof failPaidActivation>;
  const injectedClient = (client: ActivationFailureClient) => client as unknown as PrismaClient;
  const activationReference = /PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
  const activationDiagnostics = (calls: unknown[][]) => calls.flatMap(([line]) => {
    if (typeof line !== "string") return [];
    try {
      const value = JSON.parse(line) as { event?: string; code?: string; diagnosticId?: string };
      return value.event === "public-membership.activation.error" ? [value] : [];
    } catch { return []; }
  });

  it.each(["ordinary", "prisma", "unknown-domain"] as const)("[SO06 consumed] retains exact paid/review/replay accounting without %s failure text", async (kind) => {
    const f = await isolatedFormFixture(`privacy-${kind}`), mock = gateway(`privacy-${kind}`, "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    const originalCheckout = await immutableCheckout(started.operationId);
    const marker = `PRIVATE_ACTIVATION_${kind} BEARER_ACTIVATION_SECRET`;
    const original = kind === "prisma"
      ? new api.Prisma.PrismaClientKnownRequestError(marker, { code: "P2002", clientVersion: "6.19.3", meta: { private: marker } })
      : kind === "unknown-domain" ? new api.FinancialError(marker) : new Error(marker);
    const failing = failPaidActivation(f, started.operationId, original);
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mock.paid();
      const resumed = await pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db: injectedClient(failing), now });
      expect(resumed).toEqual({ status: "REVIEW_REQUIRED", operationId: started.operationId, message: "Your payment was received. The gym must review this registration before access can begin." });
      await expectSingleReviewedPayment(f, started.operationId, originalCheckout, mock);
      const operation = await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } });
      const review = await db.financialReviewCase.findUniqueOrThrow({ where: { workspaceId_sourceKey: { workspaceId: f.scope.workspaceId, sourceKey: `public-membership:${started.operationId}` } } });
      const history = await db.financialOperationEvent.findMany({ where: { operationId: started.operationId, state: "REVIEW_REQUIRED" } });
      const match = activationReference.exec(review.reason);
      expect(match).toBeTruthy();
      expect(operation.lastError).toBe(review.reason);
      expect(history).toHaveLength(1);
      expect(history[0]!.detail).toMatchObject({ action: "public-membership-review", message: review.reason });
      expect(activationDiagnostics(output.mock.calls)).toEqual([expect.objectContaining({ code: "PUBLIC_MEMBERSHIP_ACTIVATION_REVIEW", diagnosticId: match![1] })]);
      expect(JSON.stringify({ resumed, reason: review.reason, lastError: operation.lastError, history: history.map(item => item.detail), logs: output.mock.calls })).not.toMatch(/PRIVATE_ACTIVATION_|BEARER_ACTIVATION_SECRET/);
      // Remove fault injection: the original paid request remains in explicit
      // review rather than activating automatically or making a new checkout.
      expect((await pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db, now })).status).toBe("REVIEW_REQUIRED");
      expect((await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db })).status).toBe("REVIEW_REQUIRED");
      const event = { type: "checkout.session.completed", account: f.scope.accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
      expect(await pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, db, now })).toBe(true);
      await expectSingleReviewedPayment(f, started.operationId, originalCheckout, mock);
      expect(mock.creates).toHaveLength(1);
      expect(activationDiagnostics(output.mock.calls)).toHaveLength(1);
      expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: review.id } })).reason).toBe(review.reason);
    } finally { output.mockRestore(); }
  });

  it.each([
    ["financial", "Complete every current required form before paying for this membership."],
    ["enrollment", "The family relationship changed. Ask the gym to review it."],
  ] as const)("[SO06 consumed] preserves the reviewed %s policy reason after actual transaction rollback", async (kind, reason) => {
    const f = await isolatedFormFixture(`privacy-policy-${kind}`), mock = gateway(`privacy-policy-${kind}`, "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    const originalCheckout = await immutableCheckout(started.operationId);
    const original = kind === "financial" ? new api.FinancialError(reason) : new api.PublicEnrollmentError(reason);
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mock.paid();
      const failing = failPaidActivation(f, started.operationId, original);
      expect((await pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db: injectedClient(failing), now })).status).toBe("REVIEW_REQUIRED");
      const review = await db.financialReviewCase.findUniqueOrThrow({ where: { workspaceId_sourceKey: { workspaceId: f.scope.workspaceId, sourceKey: `public-membership:${started.operationId}` } } });
      expect(review.reason).toBe(reason);
      expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).lastError).toBe(reason);
      expect(activationDiagnostics(output.mock.calls)).toHaveLength(0);
      await expectSingleReviewedPayment(f, started.operationId, originalCheckout, mock);
      expect(mock.creates).toHaveLength(1);
    } finally { output.mockRestore(); }
  });

  it("[SO06 consumed] never claims a saved review or activates when the review write fails", async () => {
    const f = await isolatedFormFixture("privacy-review-write"), mock = gateway("privacy-review-write", "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    const originalCheckout = await immutableCheckout(started.operationId);
    const persistenceFailure = new api.Prisma.PrismaClientKnownRequestError("PRIVATE_REVIEW_WRITE BEARER_REVIEW_WRITE", { code: "P1001", clientVersion: "6.19.3" });
    const failing = failPaidActivation(f, started.operationId, new Error("PRIVATE_ACTIVATION_FAILURE"), persistenceFailure);
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mock.paid();
      const resumed = await pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db: injectedClient(failing), now });
      // Preserve the existing outer resume fallback; importantly, it does not
      // pretend that REVIEW_REQUIRED was durably recorded when its write failed.
      expect(resumed).toEqual({ status: "PAYMENT_PENDING", operationId: started.operationId, message: "The checkout response is still pending. Check this same registration again; do not start another payment." });
      expect(await immutableCheckout(started.operationId)).toEqual(originalCheckout);
      expect(await db.financialReviewCase.count({ where: { operationId: started.operationId } })).toBe(0);
      expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).status).toBe("SUBMITTED");
      expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD");
      expect(await db.invoice.count({ where: { memberId: f.memberId, status: "PAID" } })).toBe(1);
      expect(await db.payment.count({ where: { memberId: f.memberId, status: "SUCCEEDED" } })).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId: f.scope.workspaceId, subject: "Your membership is ready" } })).toBe(0);
      expect(mock.creates).toHaveLength(1);
      expect(activationDiagnostics(output.mock.calls)).toHaveLength(1);
      expect(JSON.stringify({ resumed, logs: output.mock.calls })).not.toMatch(/PRIVATE_|BEARER_/);
    } finally { output.mockRestore(); }
  });

  it("[SO06 consumed] preserves the original review-write exception at the direct webhook boundary", async () => {
    const f = await isolatedFormFixture("privacy-webhook-review-write"), mock = gateway("privacy-webhook-review-write", "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    const originalCheckout = await immutableCheckout(started.operationId);
    const persistenceFailure = new api.Prisma.PrismaClientKnownRequestError("PRIVATE_WEBHOOK_REVIEW_WRITE", { code: "P1001", clientVersion: "6.19.3" });
    const failing = failPaidActivation(f, started.operationId, new Error("PRIVATE_WEBHOOK_ACTIVATION"), persistenceFailure);
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mock.paid();
      const event = { type: "checkout.session.completed", account: f.scope.accountId, data: { object: { id: mock.sessionId, payment_status: "paid", metadata: mock.metadata() } } } as unknown as Stripe.Event & { account: string };
      // This narrow consumed-error repair does not swallow a failed durable
      // review write. The remaining transport boundary must project it safely.
      await expect(pay.handlePublicMembershipCheckoutWebhook(event, { gateway: mock.adapter, db: injectedClient(failing), now })).rejects.toBe(persistenceFailure);
      expect(await immutableCheckout(started.operationId)).toEqual(originalCheckout);
      expect(await db.financialReviewCase.count({ where: { operationId: started.operationId } })).toBe(0);
      expect((await db.financialOperation.findUniqueOrThrow({ where: { id: started.operationId } })).status).toBe("SUBMITTED");
      expect((await db.memberMembership.findFirstOrThrow({ where: { memberId: f.memberId } })).status).toBe("PENDING_PAYMENT_METHOD");
      expect(await db.invoice.count({ where: { memberId: f.memberId, status: "PAID" } })).toBe(1);
      expect(await db.payment.count({ where: { memberId: f.memberId, status: "SUCCEEDED" } })).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId: f.scope.workspaceId, subject: "Your membership is ready" } })).toBe(0);
      expect(mock.creates).toHaveLength(1);
      expect(activationDiagnostics(output.mock.calls)).toHaveLength(1);
      expect(JSON.stringify(output.mock.calls)).not.toContain("PRIVATE_");
    } finally { output.mockRestore(); }
  });

  it("[SO06 consumed] records the safe review while keeping paid access blocked if the diagnostic sink fails", async () => {
    const f = await isolatedFormFixture("privacy-sink"), mock = gateway("privacy-sink", "open", f.scope);
    const started = await pay.startPublicMembershipCheckout({ ...f.start, gateway: mock.adapter, db });
    const originalCheckout = await immutableCheckout(started.operationId);
    const failing = failPaidActivation(f, started.operationId, new Error("PRIVATE_ACTIVATION_SINK"));
    const output = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("PRIVATE_LOG_SINK"); });
    try {
      mock.paid();
      expect((await pay.resumePublicMembershipCheckout({ workspaceId: f.scope.workspaceId, operationId: started.operationId, actorUserId: f.userId, gateway: mock.adapter, db: injectedClient(failing), now })).status).toBe("REVIEW_REQUIRED");
      await expectSingleReviewedPayment(f, started.operationId, originalCheckout, mock);
      const review = await db.financialReviewCase.findUniqueOrThrow({ where: { workspaceId_sourceKey: { workspaceId: f.scope.workspaceId, sourceKey: `public-membership:${started.operationId}` } } });
      expect(review.reason).toMatch(activationReference);
      expect(review.reason).not.toContain("PRIVATE_");
      expect(mock.creates).toHaveLength(1);
    } finally { output.mockRestore(); }
  });

});
