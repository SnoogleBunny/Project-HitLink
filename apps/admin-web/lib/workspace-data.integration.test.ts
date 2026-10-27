import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, WorkspaceDataActor } from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory";
import type {
  OffboardingSubscription,
  WorkspaceOffboardingGateway,
} from "@flowstate/payments";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("workspace exports, offboarding and support access", () => {
  let api: typeof import("@flowstate/db"),
    payments: typeof import("@flowstate/payments"),
    db: PrismaClient;
  let workspaceId: string,
    ownerId: string,
    secondOwnerId: string,
    supportId: string,
    memberId: string,
    ownerWorkspaceUserId: string;
  let actor: WorkspaceDataActor;
  const tag = `data-${randomUUID()}`,
    now = new Date("2026-11-01T12:00:00Z"),
    end = new Date("2026-11-02T12:00:00Z");
  const formBytes = Buffer.from(
    "%PDF-1.4\nexact signed document content\n%%EOF",
  );
  let exportId: string,
    checksum: string,
    planVersion = 0;
  let platform: OffboardingSubscription,
    customerSubscriptions: OffboardingSubscription[] = [],
    stopCalls = 0;
  const gateway: WorkspaceOffboardingGateway = {
    async retrievePlatform() {
      return { ...platform };
    },
    async stopPlatform(_id, at) {
      stopCalls++;
      platform = { ...platform, cancelAt: at };
    },
    async listCustomerSubscriptions() {
      return customerSubscriptions;
    },
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    api = await import("@flowstate/db");
    payments = await import("@flowstate/payments");
    db = api.prisma;
    workspaceId = (
      await db.workspace.create({
        data: { name: "Data export test gym", status: "ACTIVE" },
      })
    ).id;
    await db.workspaceSetting.create({
      data: {
        workspaceId,
        contactEmail: "gym-contact@example.test",
        contactPhone: "+1 555 0100",
        currency: "cad",
        locale: "en-CA",
        identityVersion: 2,
      },
    });
    const users = await Promise.all(
      ["owner", "second-owner", "support"].map((name) =>
        db.user.create({
          data: {
            email: `${tag}-${name}@example.test`,
            fullName: name,
            passwordHash: "AUTH_SECRET_SENTINEL",
          },
        }),
      ),
    );
    [ownerId, secondOwnerId, supportId] = users.map((user) => user.id) as [
      string,
      string,
      string,
    ];
    actor = { workspaceId, userId: ownerId };
    ownerWorkspaceUserId = (
      await db.workspaceUser.create({
        data: { workspaceId, userId: ownerId, role: "OWNER" },
      })
    ).id;
    await db.workspaceUser.create({
      data: { workspaceId, userId: secondOwnerId, role: "OWNER" },
    });
    await db.workspaceUser.create({
      data: { workspaceId, userId: supportId, role: "COACH" },
    });
    memberId = (
      await db.member.create({
        data: {
          workspaceId,
          fullName: "=SUM(1,1)",
          email: `${tag}-member@example.test`,
        },
      })
    ).id;
    const form = await db.formDocument.create({
      data: { workspaceId, name: "Exact waiver", formType: "WAIVER" },
    });
    const version = await db.formVersion.create({
      data: {
        workspaceId,
        formDocumentId: form.id,
        versionNumber: 1,
        fileName: "waiver.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: formBytes.length,
        fileSha256: createHash("sha256").update(formBytes).digest("hex"),
        fileData: formBytes,
        uploadedByWorkspaceUserId: ownerWorkspaceUserId,
      },
    });
    await db.signedDocument.create({
      data: {
        workspaceId,
        formVersionId: version.id,
        memberId,
        signerKind: "MEMBER",
        signerNameSnapshot: "Member",
        signatureMethod: "TYPED_NAME",
        signedAt: now,
      },
    });
    const program = await db.coachingProgram.create({
      data: { workspaceId, name: "Structured plan" },
    });
    const programVersion = await db.coachingProgramVersion.create({
      data: {
        programId: program.id,
        number: 1,
        durationDays: 1,
        deliveryWeekdays: [1],
        responseHours: 24,
        goals: "Goal",
        milestones: [],
        priceCents: 0,
        currency: "cad",
        terms: "Terms",
      },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId,
        memberId,
        programVersionId: programVersion.id,
        startsOn: now,
        endsOn: now,
        timezone: "UTC",
        status: "CLOSED",
        closedAt: now,
        retrievalUntil: now,
        caseOwnerWorkspaceUserId: ownerWorkspaceUserId,
      },
    });
    await db.coachingPrivateNote.create({
      data: {
        enrollmentId: enrollment.id,
        authorWorkspaceUserId: ownerWorkspaceUserId,
        body: "PRIVATE_NOTE_SENTINEL",
        localDate: now,
      },
    });
    await db.coachingIntake.create({
      data: { enrollmentId: enrollment.id, content: "INTAKE_SENTINEL" },
    });
    await db.workspaceStripeSettings.create({
      data: {
        workspaceId,
        stripeAccountId: `acct_${tag}`,
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
      },
    });
    platform = {
      id: `sub_platform_${tag}`,
      customerId: `cus_${tag}`,
      workspaceId,
      status: "active",
      cancelAt: null,
      endedAt: null,
      openInvoiceCount: 0,
    };
  });
  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.$transaction(
      async (tx) => {
        const inventory = await inspectRetentionInventory(tx, workspaceId);
        await deleteReviewedWorkspaceRecords(
          tx,
          workspaceId,
          inventory.fingerprint,
        );
      },
      { timeout: 120000 },
    );
    await db.user.deleteMany({
      where: { id: { in: [ownerId, secondOwnerId, supportId] } },
    });
  });
  it("exports stable relational records, safe CSV and exact signed files without secrets or coaching content", async () => {
    const setupTokenHash = createHash("sha256")
      .update(`SETUP_PRIVATE_SENTINEL:${randomUUID()}`)
      .digest("hex");
    const setup = await db.workspaceSetup.create({
      data: {
        workspaceId,
        ownerUserId: ownerId,
        serviceMode: "COACHING",
        version: 2,
        verificationHash: setupTokenHash,
      },
    });
    await db.workspaceSetupActivation.create({
      data: {
        workspaceId,
        setupId: setup.id,
        ownerUserId: ownerId,
        setupVersion: 2,
        serviceMode: "COACHING",
        verifiedEmailHash: setupTokenHash,
        ownerVerifiedAt: now,
        acceptedAt: now,
        activatedAt: now,
        snapshotHash: "d".repeat(64),
        snapshot: {
          businessName: "Fictional coaching",
          serviceMode: "COACHING",
          timezone: "UTC",
          ownerUserIds: [ownerId],
          privateVerification: "SETUP_PRIVATE_SENTINEL",
        },
      },
    });
    const payment = await db.payment.create({
      data: {
        workspaceId,
        memberId,
        status: "SUCCEEDED",
        amountCents: 1000,
        currency: "cad",
      },
    });
    const dispute = await db.paymentDispute.create({
      data: {
        workspaceId,
        providerAccountId: `acct-${tag}`,
        livemode: false,
        providerDisputeId: `dp-${tag}`,
        chargeId: `ch-${tag}`,
        paymentId: payment.id,
        providerStatus: "won",
        reason: "fraudulent",
        amountCents: 1000,
        currency: "cad",
        chargeAmountCents: 1000,
        isChargeRefundable: true,
        evidenceHash: "a".repeat(64),
        accessState: "RELEASED",
        moneyState: "WON",
        resolvedAt: now,
        evidence: {
          id: `dp-${tag}`,
          amountCents: 1000,
          PRIVATE_PROVIDER_EVIDENCE: "DISPUTE_PRIVATE_SENTINEL",
          balanceTransactions: [
            {
              id: "bt-fixture",
              amount: 1000,
              fee: 0,
              net: 1000,
              currency: "cad",
              type: "dispute",
              privateText: "DISPUTE_PRIVATE_SENTINEL",
            },
          ],
        },
      },
    });
    await db.paymentDisputeAllocation.create({
      data: {
        workspaceId,
        disputeId: dispute.id,
        paymentId: payment.id,
        fundedAmountCents: 1000,
      },
    });
    await db.paymentDisputeEvent.create({
      data: {
        workspaceId,
        disputeId: dispute.id,
        requestKey: "fixture",
        payloadHash: "b".repeat(64),
        kind: "PROVIDER_VERIFIED",
        actorUserId: ownerId,
        before: {},
        after: { status: "won", privateEvidence: "DISPUTE_PRIVATE_SENTINEL" },
      },
    });
    await expect(
      api.createWorkspaceDataExport(
        { workspaceId, userId: supportId },
        "test",
        { db, now },
      ),
    ).rejects.toThrow("owner");
    const job = await api.createWorkspaceDataExport(
      actor,
      "Migration archive",
      { db, now },
    );
    exportId = job.id;
    checksum = job.sha256!;
    await expect(
      api.confirmWorkspaceExportReceipt(actor, exportId, checksum, { db, now }),
    ).rejects.toThrow("Download");
    const download = await api.downloadWorkspaceDataExport(actor, exportId, {
      db,
      now,
    });
    const text = gunzipSync(download.bytes).toString("utf8"),
      archive = JSON.parse(text);
    expect(text).not.toContain("PRIVATE_NOTE_SENTINEL");
    expect(text).not.toContain("INTAKE_SENTINEL");
    expect(text).not.toContain("AUTH_SECRET_SENTINEL");
    expect(text).not.toContain("DISPUTE_PRIVATE_SENTINEL");
    expect(text).not.toContain("SETUP_PRIVATE_SENTINEL");
    expect(text).not.toContain(setupTokenHash);
    expect(archive.tables.WorkspaceSetup[0]).not.toHaveProperty(
      "verificationHash",
    );
    expect(archive.tables.WorkspaceSetupActivation[0].snapshot).toEqual({
      businessName: "Fictional coaching",
      serviceMode: "COACHING",
      timezone: "UTC",
      ownerUserIds: [ownerId],
    });
    expect(archive.tables.PaymentDispute).toEqual([
      expect.objectContaining({
        id: dispute.id,
        providerStatus: "won",
        moneyState: "WON",
        evidence: expect.objectContaining({
          balanceTransactions: [
            {
              id: "bt-fixture",
              amount: 1000,
              fee: 0,
              net: 1000,
              currency: "cad",
              type: "dispute",
            },
          ],
        }),
      }),
    ]);
    expect(archive.tables.PaymentDisputeAllocation).toEqual([
      expect.objectContaining({
        paymentId: payment.id,
        fundedAmountCents: 1000,
      }),
    ]);
    expect(archive.tables.PaymentDisputeEvent[0].after).toEqual({
      status: "won",
    });
    expect(archive.tables.WorkspaceSetting).toEqual([
      expect.objectContaining({
        workspaceId,
        contactEmail: "gym-contact@example.test",
        currency: "cad",
        locale: "en-CA",
        identityVersion: 2,
      }),
    ]);
    expect(archive.tables).not.toHaveProperty("PasswordResetChallenge");
    expect(archive.tables).not.toHaveProperty("AuthRecoveryDelivery");
    expect(archive.tables).not.toHaveProperty("AccountSecurityEvent");
    expect(archive.tables).not.toHaveProperty("PublicAuthThrottleBucket");
    expect(archive.tables.Member[0].fullName).toBe("=SUM(1,1)");
    expect(archive.csv["Member.csv"]).toContain("'=SUM(1,1)");
    expect(Buffer.from(archive.files[0].base64, "base64")).toEqual(formBytes);
    expect(archive.tables.SignedDocument[0].formVersionId).toBe(
      archive.files[0].id,
    );
    expect(archive.manifest.files[0].sha256).toBe(
      createHash("sha256").update(formBytes).digest("hex"),
    );
    await expect(
      api.downloadWorkspaceDataExport(
        { workspaceId: "other", userId: ownerId },
        exportId,
        { db, now },
      ),
    ).rejects.toThrow("owner");
    await expect(
      api.confirmWorkspaceExportReceipt(actor, exportId, "bad", { db, now }),
    ).rejects.toThrow("exact archive");
    await api.confirmWorkspaceExportReceipt(actor, exportId, checksum, {
      db,
      now,
    });
  });
  it("requires all owner confirmations, real platform identity and customer stop evidence", async () => {
    const plan = await api.saveWorkspaceOffboarding(
      actor,
      {
        expectedVersion: 0,
        accessEndsAt: end.toISOString(),
        retentionUntil: "2027-11-02T12:00:00Z",
        retentionReason:
          "Agreed review of accounting and signed-form retention with records custodian",
        recordsContact: "records@example.test",
        exportJobId: exportId,
      },
      { db, now },
    );
    planVersion = plan.version;
    expect(
      (await api.getWorkspaceDataManagement(actor, { db, now })).blockers.join(
        " ",
      ),
    ).toContain("Every active owner");
    await expect(
      payments.stopWorkspacePlatformBilling(actor, planVersion, {
        db,
        now,
        gateway,
      }),
    ).rejects.toThrow("verify platform billing");
    platform.workspaceId = "other";
    await expect(
      payments.registerWorkspacePlatformBilling(actor, platform.id, {
        db,
        now,
        gateway,
      }),
    ).rejects.toThrow("not verified");
    platform.workspaceId = workspaceId;
    await payments.registerWorkspacePlatformBilling(actor, platform.id, {
      db,
      now,
      gateway,
    });
    await api.confirmWorkspaceOffboarding(actor, planVersion, { db, now });
    await expect(
      payments.stopWorkspacePlatformBilling(actor, planVersion, {
        db,
        now,
        gateway,
      }),
    ).rejects.toThrow("Every active owner");
    await api.confirmWorkspaceOffboarding(
      { workspaceId, userId: secondOwnerId },
      planVersion,
      { db, now },
    );
    await payments.stopWorkspacePlatformBilling(actor, planVersion, {
      db,
      now,
      gateway,
    });
    await payments.stopWorkspacePlatformBilling(actor, planVersion, {
      db,
      now,
      gateway,
    });
    expect(stopCalls).toBe(1);
    customerSubscriptions = [
      { ...platform, id: "customer-active", cancelAt: null },
    ];
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, planVersion, {
        db,
        now,
        gateway,
      }),
    ).rejects.toThrow("remain open");
    customerSubscriptions = [];
    await payments.verifyWorkspaceCustomerBilling(actor, planVersion, {
      db,
      now,
      gateway,
    });
    await expect(
      api.finalizeWorkspaceOffboarding(actor, planVersion, { db, now }),
    ).rejects.toThrow("has not arrived");
  });
  it("support requires a named unexpired grant, logs reads and immediately respects revocation", async () => {
    await expect(
      api.grantWorkspaceSupportAccess(
        actor,
        {
          supportUserId: supportId,
          purpose: "Diagnose failed delivery",
          expiresAt: "2026-11-03T12:00:00Z",
        },
        { db, now },
      ),
    ).rejects.toThrow("24 hours");
    const grant = await api.grantWorkspaceSupportAccess(
      actor,
      {
        supportUserId: supportId,
        purpose: "Diagnose failed delivery",
        expiresAt: "2026-11-01T14:00:00Z",
      },
      { db, now },
    );
    await expect(
      api.readWorkspaceSupportDiagnostics(ownerId, grant.id, { db, now }),
    ).rejects.toThrow("unavailable");
    const result = await api.readWorkspaceSupportDiagnostics(
      supportId,
      grant.id,
      { db, now },
    );
    expect(result.workspace.id).toBe(workspaceId);
    expect(JSON.stringify(result)).not.toContain("INTAKE_SENTINEL");
    expect(
      await db.supportAccessEvent.count({
        where: { grantId: grant.id, action: "DIAGNOSTICS_READ" },
      }),
    ).toBe(1);
    await expect(
      api.readWorkspaceSupportDiagnostics(supportId, grant.id, {
        db,
        now: end,
      }),
    ).rejects.toThrow("expired");
    await api.revokeWorkspaceSupportAccess(actor, grant.id, { db, now });
    await expect(
      api.readWorkspaceSupportDiagnostics(supportId, grant.id, { db, now }),
    ).rejects.toThrow("unavailable");
  });
  it("keeps unused packs and monetary credit in the offboarding inventory even when a pack is archived", async () => {
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId,
        name: "Exit obligations",
        punchesIncluded: 2,
        priceCents: 4000,
        currency: "cad",
      },
    });
    const pack = await db.memberPunchCard.create({
      data: {
        workspaceId,
        memberId,
        punchCardProductId: product.id,
        originalPunches: 2,
        remainingPunches: 2,
        purchasePriceCents: 4000,
        status: "ARCHIVED",
      },
    });
    const credit = await db.accountCredit.create({
      data: {
        workspaceId,
        memberId,
        originalAmountCents: 500,
        remainingAmountCents: 500,
        currency: "cad",
      },
    });
    try {
      const data = await api.getWorkspaceDataManagement(actor, { db, now });
      expect(data.blockers.join(" ")).toContain("unused class-pack units");
      expect(data.blockers.join(" ")).toContain("remaining account credits");
      await expect(
        api.finalizeWorkspaceOffboarding(actor, planVersion, { db, now: end }),
      ).rejects.toThrow("unused class-pack units");
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .status,
      ).toBe("ACTIVE");
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: pack.id } }))
          .remainingPunches,
      ).toBe(2);
      expect(
        (await db.accountCredit.findUniqueOrThrow({ where: { id: credit.id } }))
          .remainingAmountCents,
      ).toBe(500);
    } finally {
      await db.accountCredit.delete({ where: { id: credit.id } });
      await db.memberPunchCard.delete({ where: { id: pack.id } });
      await db.punchCardProduct.delete({ where: { id: product.id } });
    }
  });
  it("blocks stale exports, then revokes access only after fresh verified receipt and fresh billing evidence", async () => {
    await db.member.update({
      where: { id: memberId },
      data: { fullName: "Updated member" },
    });
    await payments.stopWorkspacePlatformBilling(actor, planVersion, {
      db,
      now: end,
      gateway,
    });
    await payments.verifyWorkspaceCustomerBilling(actor, planVersion, {
      db,
      now: end,
      gateway,
    });
    await expect(
      api.finalizeWorkspaceOffboarding(actor, planVersion, { db, now: end }),
    ).rejects.toThrow("Records changed");
    const job = await api.createWorkspaceDataExport(actor, "Final archive", {
      db,
      now: end,
    });
    await api.downloadWorkspaceDataExport(actor, job.id, { db, now: end });
    await api.confirmWorkspaceExportReceipt(actor, job.id, job.sha256!, {
      db,
      now: end,
    });
    const plan = await api.saveWorkspaceOffboarding(
      actor,
      {
        expectedVersion: planVersion,
        accessEndsAt: end.toISOString(),
        retentionUntil: "2027-11-02T12:00:00Z",
        retentionReason: "Reviewed retention",
        recordsContact: "records@example.test",
        exportJobId: job.id,
      },
      { db, now: end },
    );
    planVersion = plan.version;
    await api.confirmWorkspaceOffboarding(actor, planVersion, { db, now: end });
    await api.confirmWorkspaceOffboarding(
      { workspaceId, userId: secondOwnerId },
      planVersion,
      { db, now: end },
    );
    await payments.stopWorkspacePlatformBilling(actor, planVersion, {
      db,
      now: end,
      gateway,
    });
    await payments.verifyWorkspaceCustomerBilling(actor, planVersion, {
      db,
      now: end,
      gateway,
    });
    const done = await api.finalizeWorkspaceOffboarding(actor, planVersion, {
      db,
      now: end,
    });
    expect(done.state).toBe("ACCESS_REVOKED");
    expect(done.deletionState).toBe("RETAINED");
    expect(
      (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
        .status,
    ).toBe("DISABLED");
    expect(await db.member.count({ where: { workspaceId } })).toBe(1);
    await expect(
      api.downloadWorkspaceDataExport(actor, job.id, { db, now: end }),
    ).rejects.toThrow("owner");
    await api.expireWorkspaceDataExports({
      db,
      now: new Date("2026-11-04T12:00:00Z"),
    });
    expect(
      (
        await db.workspaceDataExport.findUniqueOrThrow({
          where: { id: job.id },
        })
      ).artifact,
    ).toBeNull();
  }, 30000);
});
