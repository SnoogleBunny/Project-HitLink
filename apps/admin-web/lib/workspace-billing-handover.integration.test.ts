import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  PrismaClient,
  SourceHandoverDeclaration,
  WorkspaceDataActor,
} from "@flowstate/db";
import type {
  OffboardingSubscription,
  WorkspaceOffboardingGateway,
} from "@flowstate/payments";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("exact billing handovers", () => {
  let api: typeof import("@flowstate/db"),
    payments: typeof import("@flowstate/payments"),
    db: PrismaClient;
  let pendingFinalTest: Promise<void> | undefined;
  const tag = `handover-${randomUUID()}`,
    workspaceId = `${tag}-gym`,
    ownerId = `${tag}-owner`,
    secondOwnerId = `${tag}-owner2`,
    receiverId = `${tag}-receiver`,
    outsiderId = `${tag}-outsider`,
    payerUserId = `${tag}-payer`;
  const actor: WorkspaceDataActor = { workspaceId, userId: ownerId },
    now = new Date("2032-01-01T12:00:00Z"),
    end = new Date("2032-01-02T12:00:00Z");
  const accountId = `acct_${tag}`,
    customerId = `cus_${tag}`,
    subscriptionId = `sub_${tag}`;
  let memberId: string,
    payerId: string,
    membershipId: string,
    sourceMembershipId: string,
    sourceId: string,
    packId: string,
    creditId: string;
  let subscriptions: OffboardingSubscription[],
    connectedAccountId: string,
    platform: OffboardingSubscription;
  const calls = { list: 0, account: 0, stop: 0 };
  const gateway: WorkspaceOffboardingGateway = {
    async retrievePlatform() {
      return { ...platform };
    },
    async stopPlatform(_id, at) {
      calls.stop++;
      platform = { ...platform, cancelAt: at };
    },
    async listCustomerSubscriptions() {
      calls.list++;
      return subscriptions.map((sub) => ({ ...sub }));
    },
    async retrieveConnectedAccount() {
      calls.account++;
      return { id: connectedAccountId, deleted: false, chargesEnabled: true };
    },
  };
  const sourceDeclarations = (): SourceHandoverDeclaration[] => [
    {
      evidenceId: sourceId,
      sourceAccountReference: "source-gym-account",
      sourceContractReference: "source-contract",
      disposition: "STOP",
      effectiveAt: end.toISOString(),
      evidenceReference:
        "Source provider receipt confirming stop of exact contract",
    },
  ];
  const input = (
    mode:
      | "STOP_AND_REAUTHORIZE"
      | "RETAIN_GYM_PROCESSOR" = "RETAIN_GYM_PROCESSOR",
  ) => ({
    requestId: randomUUID(),
    expectedPlanVersion: 1,
    destinationName: "Receiving gym service",
    receiverUserId: receiverId,
    evidenceReference: "Signed transfer agreement 12",
    payerAuthorityEvidence:
      "Payer authority reviewed in agreement 12; same processor",
    processorMode: mode,
    processorAccountId: accountId,
    sourceDeclarations: sourceDeclarations(),
  });
  async function prepare(
    mode?: "STOP_AND_REAUTHORIZE" | "RETAIN_GYM_PROCESSOR",
  ) {
    const handover = await api.saveWorkspaceBillingHandover(
      actor,
      input(mode),
      { db, now },
    );
    await api.acceptWorkspaceBillingHandover(
      receiverId,
      handover.id,
      handover.obligationFingerprint,
      "Receiver acknowledgement 12",
      { db, now },
    );
    return handover;
  }
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    api = await import("@flowstate/db");
    payments = await import("@flowstate/payments");
    db = api.prisma;
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Handover fixture",
        status: "ACTIVE",
        location: { create: { name: "Gym", timezone: "UTC" } },
        stripeSettings: {
          create: { stripeAccountId: accountId, connectionStatus: "ACTIVE" },
        },
      },
    });
    for (const id of [
      ownerId,
      secondOwnerId,
      receiverId,
      outsiderId,
      payerUserId,
    ])
      await db.user.create({
        data: {
          id,
          email: `${id}@example.test`,
          fullName: id === receiverId ? "Named receiver" : "Fixture account",
        },
      });
    for (const id of [ownerId, secondOwnerId])
      await db.workspaceUser.create({
        data: { workspaceId, userId: id, role: "OWNER" },
      });
    memberId = (
      await db.member.create({
        data: {
          workspaceId,
          userId: payerUserId,
          fullName: "Payer member",
          notes: "STAFF_PRIVATE_NOTE",
        },
      })
    ).id;
    payerId = (
      await db.financialAccount.create({
        data: {
          workspaceId,
          userId: payerUserId,
          memberId,
          stripeAccountId: accountId,
          stripeCustomerId: customerId,
        },
      })
    ).id;
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId,
        name: "Accepted monthly",
        monthlyPriceCents: 10000,
        currency: "cad",
      },
    });
    membershipId = (
      await db.memberMembership.create({
        data: {
          workspaceId,
          memberId,
          membershipPlanId: plan.id,
          payerAccountId: payerId,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          acceptedTerms: JSON.parse(
            JSON.stringify({
              ...api.snapshotMembershipTerms(plan, now),
              internalSecret: "PRIVATE_TERMS_BLOB",
            }),
          ),
        },
      })
    ).id;
    sourceMembershipId = (
      await db.memberMembership.create({
        data: {
          workspaceId,
          memberId,
          membershipPlanId: plan.id,
          currentMembershipSlot: null,
          sourceBillingManaged: true,
        },
      })
    ).id;
    sourceId = (
      await db.sourceBillingEvidence.create({
        data: {
          workspaceId,
          memberMembershipId: sourceMembershipId,
          sourceSystem: "Prior provider",
          sourceContractReference: "source-contract",
          paidFrom: new Date("2031-12-01"),
          paidThrough: new Date("2032-02-01"),
          nextRenewalOn: new Date("2032-02-01"),
          sourceEvidence: "PRIVATE_SOURCE_BLOB",
          acceptanceEvidence: "PRIVATE_ACCEPTANCE_BLOB",
          payerAuthorityEvidence: "PRIVATE_AUTHORITY_BLOB",
          sourceFileHash: "a".repeat(64),
          sourceRowHash: "b".repeat(64),
          actorId: ownerId,
          operationKey: "source-initial",
        },
      })
    ).id;
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId,
        name: "Ten classes",
        punchesIncluded: 10,
        priceCents: 10000,
      },
    });
    packId = (
      await db.memberPunchCard.create({
        data: {
          workspaceId,
          memberId,
          punchCardProductId: product.id,
          originalPunches: 10,
          remainingPunches: 4,
          purchasePriceCents: 10000,
          status: "ARCHIVED",
          acceptedTerms: JSON.parse(
            JSON.stringify(api.snapshotPunchCardTerms(product, now)),
          ),
        },
      })
    ).id;
    creditId = (
      await db.accountCredit.create({
        data: {
          workspaceId,
          memberId,
          payerAccountId: payerId,
          originalAmountCents: 2500,
          remainingAmountCents: 1800,
          currency: "cad",
        },
      })
    ).id;
  });
  beforeEach(async () => {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { status: "ACTIVE" },
    });
    await db.workspaceUser.updateMany({
      where: { workspaceId },
      data: { isActive: true },
    });
    await db.membershipLifecycleEvent.deleteMany({
      where: { request: { workspaceId } },
    });
    await db.membershipLifecycleRequest.deleteMany({ where: { workspaceId } });
    await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
    await db.financialOperation.deleteMany({ where: { workspaceId } });
    await db.workspaceBillingHandover.deleteMany({ where: { workspaceId } });
    await db.workspaceOffboarding.deleteMany({ where: { workspaceId } });
    await db.workspaceDataExport.deleteMany({ where: { workspaceId } });
    await db.workspaceDataEvent.deleteMany({ where: { workspaceId } });
    await db.workspacePlatformBilling.deleteMany({ where: { workspaceId } });
    await db.memberPunchCard.update({
      where: { id: packId },
      data: { remainingPunches: 4, expiresOn: null },
    });
    await db.accountCredit.update({
      where: { id: creditId },
      data: { remainingAmountCents: 1800, payerAccountId: payerId },
    });
    await db.memberMembership.update({
      where: { id: membershipId },
      data: {
        payerAccountId: payerId,
        status: "ACTIVE",
        endedAt: null,
        acceptedTerms: JSON.parse(
          JSON.stringify(
            api.snapshotMembershipTerms(
              { monthlyPriceCents: 10000, currency: "cad" },
              now,
            ),
          ),
        ),
      },
    });
    await db.sourceBillingEvidence.update({
      where: { id: sourceId },
      data: { sourceReceiptHash: null },
    });
    await db.workspaceOffboarding.create({
      data: {
        workspaceId,
        requestedByUserId: ownerId,
        accessEndsAt: end,
        retentionUntil: new Date("2033-01-01"),
        retentionReason: "Agreed accounting and consent retention",
        recordsContact: "Named owner",
      },
    });
    connectedAccountId = accountId;
    subscriptions = [
      {
        id: subscriptionId,
        customerId,
        status: "active",
        cancelAt: null,
        endedAt: null,
        workspaceId,
        openInvoiceCount: 0,
      },
    ];
    platform = {
      id: `platform_${tag}`,
      customerId: `platform_customer_${tag}`,
      status: "active",
      cancelAt: null,
      endedAt: null,
      workspaceId,
      openInvoiceCount: 0,
    };
    calls.list = 0;
    calls.account = 0;
    calls.stop = 0;
  });
  afterAll(async () => {
    if (!db) return;
    // A Vitest timeout does not cancel an in-flight database transaction.
    await pendingFinalTest?.catch(() => undefined);
    await db.membershipLifecycleEvent.deleteMany({
      where: { request: { workspaceId } },
    });
    await db.membershipLifecycleRequest.deleteMany({ where: { workspaceId } });
    await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
    await db.financialOperation.deleteMany({ where: { workspaceId } });
    await db.workspaceOffboarding.deleteMany({ where: { workspaceId } });
    await db.workspaceDataExport.deleteMany({ where: { workspaceId } });
    await db.sourceBillingEvidence.deleteMany({ where: { workspaceId } });
    await db.memberMembership.deleteMany({ where: { workspaceId } });
    await db.memberPunchCard.deleteMany({ where: { workspaceId } });
    await db.accountCredit.deleteMany({ where: { workspaceId } });
    await db.financialAccount.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({
      where: {
        id: {
          in: [ownerId, secondOwnerId, receiverId, outsiderId, payerUserId],
        },
      },
    });
  }, 60000);
  it("creates immutable scope, invalidates owner approval and makes exact retries idempotent", async () => {
    await api.confirmWorkspaceOffboarding(actor, 1, { db, now });
    const request = input();
    const rows = await Promise.all([
      api.saveWorkspaceBillingHandover(actor, request, { db, now }),
      api.saveWorkspaceBillingHandover(actor, request, { db, now }),
    ]);
    expect(rows[0].id).toBe(rows[1].id);
    expect(
      await db.workspaceBillingHandover.count({ where: { workspaceId } }),
    ).toBe(1);
    expect(
      (
        await db.workspaceOffboarding.findUniqueOrThrow({
          where: { workspaceId },
        })
      ).version,
    ).toBe(2);
    expect(
      (await api.getWorkspaceDataManagement(actor, { db, now })).blockers.join(
        " ",
      ),
    ).toContain("Every active owner");
    const text = JSON.stringify(
      (await api.getWorkspaceBillingHandover(receiverId, rows[0].id, { db }))
        .handover.obligationSnapshot,
    );
    for (const secret of [
      "PRIVATE_SOURCE_BLOB",
      "PRIVATE_ACCEPTANCE_BLOB",
      "PRIVATE_AUTHORITY_BLOB",
      "PRIVATE_TERMS_BLOB",
      "STAFF_PRIVATE_NOTE",
    ])
      expect(text).not.toContain(secret);
    expect(text).toContain('"remainingPunches":4');
    expect(text).toContain('"remainingAmountCents":1800');
    await expect(
      api.saveWorkspaceBillingHandover(
        actor,
        {
          ...request,
          sourceDeclarations: [
            { ...sourceDeclarations()[0]!, sourceAccountReference: "changed" },
          ],
        },
        { db, now },
      ),
    ).rejects.toThrow("different source");
  });
  it("allows only the named receiver and rechecks the snapshot at acceptance", async () => {
    const row = await api.saveWorkspaceBillingHandover(actor, input(), {
      db,
      now,
    });
    await expect(
      api.getWorkspaceBillingHandover(outsiderId, row.id, { db }),
    ).rejects.toThrow();
    await expect(
      api.acceptWorkspaceBillingHandover(
        ownerId,
        row.id,
        row.obligationFingerprint,
        "Owner cannot impersonate receiver",
        { db, now },
      ),
    ).rejects.toThrow("named receiving");
    await expect(
      api.acceptWorkspaceBillingHandover(
        receiverId,
        row.id,
        "wrong",
        "receipt",
        { db, now },
      ),
    ).rejects.toThrow("changed");
    await db.memberPunchCard.update({
      where: { id: packId },
      data: { remainingPunches: 3 },
    });
    await expect(
      api.acceptWorkspaceBillingHandover(
        receiverId,
        row.id,
        row.obligationFingerprint,
        "receipt",
        { db, now },
      ),
    ).rejects.toThrow("Obligations changed");
  });
  it("requires exact source contract, account, effective date and stop evidence", async () => {
    await expect(
      api.saveWorkspaceBillingHandover(
        actor,
        { ...input(), sourceDeclarations: [] },
        { db, now },
      ),
    ).rejects.toThrow("every imported receipt");
    await expect(
      api.saveWorkspaceBillingHandover(
        actor,
        {
          ...input(),
          sourceDeclarations: [
            {
              ...sourceDeclarations()[0]!,
              sourceContractReference: "unrelated",
            },
          ],
        },
        { db, now },
      ),
    ).rejects.toThrow("exact imported contract");
    await expect(
      api.saveWorkspaceBillingHandover(
        actor,
        {
          ...input("STOP_AND_REAUTHORIZE"),
          sourceDeclarations: [
            {
              ...sourceDeclarations()[0]!,
              disposition: "CONTINUE_WITH_RECEIVER",
            },
          ],
        },
        { db, now },
      ),
    ).rejects.toThrow("requires evidence");
    await expect(
      api.saveWorkspaceBillingHandover(
        actor,
        {
          ...input(),
          sourceDeclarations: [
            { ...sourceDeclarations()[0]!, effectiveAt: "2033-01-01" },
          ],
        },
        { db, now },
      ),
    ).rejects.toThrow("by the access end");
  });
  it("revokes a replaced receiver's read access and invalidates changed pack expiry", async () => {
    const first = await prepare();
    const second = await api.saveWorkspaceBillingHandover(
      actor,
      { ...input(), expectedPlanVersion: 2, receiverUserId: outsiderId },
      { db, now },
    );
    await expect(
      api.getWorkspaceBillingHandover(receiverId, first.id, { db }),
    ).rejects.toThrow();
    await expect(
      api.acceptWorkspaceBillingHandover(
        receiverId,
        first.id,
        first.obligationFingerprint,
        "old receipt",
        { db, now },
      ),
    ).rejects.toThrow();
    await db.memberPunchCard.update({
      where: { id: packId },
      data: { expiresOn: new Date("2033-01-01") },
    });
    await expect(
      api.acceptWorkspaceBillingHandover(
        outsiderId,
        second.id,
        second.obligationFingerprint,
        "receiver2 receipt",
        { db, now },
      ),
    ).rejects.toThrow("Obligations changed");
  });
  it("blocks an active provider subscription without accepted renewal authority", async () => {
    await db.memberMembership.update({
      where: { id: membershipId },
      data: { status: "ENDED", endedAt: new Date("2031-12-01") },
    });
    await prepare();
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("renewal authority");
  });
  it("requires recorded accepted terms for retained renewal authority", async () => {
    await db.memberMembership.update({
      where: { id: membershipId },
      data: { acceptedTerms: api.Prisma.JsonNull },
    });
    await prepare();
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("missing terms");
  });
  it("verifies retained account, customer and complete subscription set without clearing balances", async () => {
    const row = await prepare();
    connectedAccountId = "acct_wrong";
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("exact existing connected account");
    connectedAccountId = accountId;
    subscriptions[0]!.customerId = "cus_wrong";
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("exact gym contract");
    subscriptions[0]!.customerId = customerId;
    subscriptions.push({ ...subscriptions[0]!, id: "sub_unmapped" });
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("not mapped");
    subscriptions.pop();
    expect(
      (
        await payments.verifyWorkspaceCustomerBilling(actor, 2, {
          db,
          now,
          gateway,
        })
      ).status,
    ).toBe("VERIFIED");
    expect(
      (await db.memberPunchCard.findUniqueOrThrow({ where: { id: packId } }))
        .remainingPunches,
    ).toBe(4);
    expect(
      (await db.accountCredit.findUniqueOrThrow({ where: { id: creditId } }))
        .remainingAmountCents,
    ).toBe(1800);
    expect(
      (await api.getWorkspaceBillingHandover(receiverId, row.id, { db }))
        .handover.receiverAcceptedAt,
    ).toBeTruthy();
    expect(
      (await api.getWorkspaceDataManagement(actor, { db, now })).blockers.join(
        " ",
      ),
    ).not.toMatch(/unused class-pack units|remaining account credits/);
  });
  it("rejects missing payer binding, changed source receipt and stale provider verification", async () => {
    await db.memberMembership.update({
      where: { id: membershipId },
      data: { payerAccountId: null },
    });
    await prepare();
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("payer binding");
    await db.memberMembership.update({
      where: { id: membershipId },
      data: { payerAccountId: payerId },
    });
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("Obligations changed");
  });
  it("requires old renewal stop for reauthorization and keeps unpaid invoice blockers", async () => {
    await prepare("STOP_AND_REAUTHORIZE");
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("Every old processor renewal");
    subscriptions[0]!.cancelAt = +end / 1000;
    subscriptions[0]!.openInvoiceCount = 1;
    await expect(
      payments.verifyWorkspaceCustomerBilling(actor, 2, { db, now, gateway }),
    ).rejects.toThrow("outstanding invoices");
    subscriptions[0]!.openInvoiceCount = 0;
    await payments.verifyWorkspaceCustomerBilling(actor, 2, {
      db,
      now,
      gateway,
    });
    expect(
      (
        await api.getWorkspaceDataManagement(actor, {
          db,
          now: new Date(+now + 301000),
        })
      ).blockers.join(" "),
    ).toContain("freshly verify");
    await db.sourceBillingEvidence.update({
      where: { id: sourceId },
      data: { sourceReceiptHash: "c".repeat(64) },
    });
    expect(
      (await api.getWorkspaceDataManagement(actor, { db, now })).blockers.join(
        " ",
      ),
    ).toContain("Billing obligations changed");
  });
  it("freshly rechecks providers at exit, preserves balances and stops lifecycle workers after handover", () => {
    pendingFinalTest = (async () => {
      const row = await prepare();
      const archive = await api.createWorkspaceDataExport(
        actor,
        "Handover verified record receipt",
        { db, now },
      );
      await api.downloadWorkspaceDataExport(actor, archive.id, { db, now });
      await api.confirmWorkspaceExportReceipt(
        actor,
        archive.id,
        archive.sha256!,
        { db, now },
      );
      await db.workspaceOffboarding.update({
        where: { workspaceId },
        data: { exportJobId: archive.id },
      });
      await api.confirmWorkspaceOffboarding(actor, 2, { db, now });
      await api.confirmWorkspaceOffboarding(
        { workspaceId, userId: secondOwnerId },
        2,
        { db, now },
      );
      await payments.registerWorkspacePlatformBilling(actor, platform.id, {
        db,
        now,
        gateway,
      });
      await payments.stopWorkspacePlatformBilling(actor, 2, {
        db,
        now,
        gateway,
      });
      await payments.verifyWorkspaceCustomerBilling(actor, 2, {
        db,
        now,
        gateway,
      });
      const priorCalls = calls.list;
      subscriptions[0]!.customerId = "cus_changed_at_exit";
      await expect(
        payments.finalizeWorkspaceOffboardingWithBillingChecks(actor, 2, {
          db,
          now: end,
          gateway,
        }),
      ).rejects.toThrow("exact gym contract");
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .status,
      ).toBe("ACTIVE");
      subscriptions[0]!.customerId = customerId;
      await payments.finalizeWorkspaceOffboardingWithBillingChecks(actor, 2, {
        db,
        now: end,
        gateway,
      });
      expect(calls.list).toBeGreaterThan(priorCalls);
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .status,
      ).toBe("DISABLED");
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: packId } }))
          .remainingPunches,
      ).toBe(4);
      expect(
        (await db.accountCredit.findUniqueOrThrow({ where: { id: creditId } }))
          .remainingAmountCents,
      ).toBe(1800);
      expect(
        (await api.getWorkspaceBillingHandover(receiverId, row.id, { db }))
          .accessRevokedAt,
      ).toBeTruthy();
      await db.membershipLifecycleRequest.create({
        data: {
          workspaceId,
          membershipId,
          operationKey: "stale-worker",
          inputHash: "x",
          requesterUserId: ownerId,
          kind: "CANCEL",
          state: "SCHEDULED",
          policy: {},
          policyVersion: 1,
          providerOperationId: randomUUID(),
        },
      });
      const mock = { retrieve: vi.fn(), change: vi.fn() };
      expect(
        await payments.reconcileDueMembershipLifecycle({
          workspaceId,
          gateway: mock,
          now: end,
        }),
      ).toEqual([]);
      expect(mock.retrieve).not.toHaveBeenCalled();
      expect(mock.change).not.toHaveBeenCalled();
    })();
    return pendingFinalTest;
  }, 30000);
});
