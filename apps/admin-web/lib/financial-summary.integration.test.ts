import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import type { PrismaClient } from "@flowstate/db";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "owner financial summary against PostgreSQL",
  () => {
    let db: PrismaClient;
    let api: typeof import("./financial-summary");
    let workspaceId: string,
      foreignId: string,
      ownerId: string,
      coachId: string,
      memberId: string;
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      db = (await import("@flowstate/db")).prisma;
      api = await import("./financial-summary");
    });
    beforeEach(async () => {
      const key = randomUUID();
      ownerId = `${key}-owner`;
      coachId = `${key}-coach`;
      await db.user.createMany({
        data: [ownerId, coachId].map((id) => ({
          id,
          email: `${id}@example.test`,
        })),
      });
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional reports",
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
          members: { create: { fullName: "Fictional payer" } },
        },
        include: { members: true },
      });
      workspaceId = workspace.id;
      memberId = workspace.members[0]!.id;
      foreignId = (
        await db.workspace.create({ data: { name: "Other business" } })
      ).id;
    });
    afterEach(async () => {
      await db.workspace.deleteMany({
        where: { id: { in: [workspaceId, foreignId] } },
      });
      await db.user.deleteMany({ where: { id: { in: [ownerId, coachId] } } });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    const actor = () => ({ workspaceId, actorUserId: ownerId, db });
    it("reconciles currencies and source ledgers without adding pending effects or credit to collected cash", async () => {
      const payment = await db.payment.create({
        data: {
          workspaceId,
          status: "PARTIALLY_REFUNDED",
          amountCents: 10000,
          refundedAmountCents: 2000,
          currency: "cad",
        },
      });
      await db.payment.createMany({
        data: [
          {
            workspaceId,
            status: "PENDING",
            amountCents: 5000,
            currency: "cad",
          },
          { workspaceId, status: "FAILED", amountCents: 2500, currency: "cad" },
          {
            workspaceId,
            status: "IMPORTED",
            source: "IMPORTED",
            amountCents: 20000,
            refundedAmountCents: 4000,
            currency: "cad",
          },
          {
            workspaceId,
            status: "SUCCEEDED",
            amountCents: 3000,
            currency: "usd",
          },
          {
            workspaceId: foreignId,
            status: "SUCCEEDED",
            amountCents: 999999,
            currency: "cad",
          },
        ],
      });
      await db.refund.createMany({
        data: [
          {
            workspaceId,
            paymentId: payment.id,
            status: "SUCCEEDED",
            amountCents: 2000,
            currency: "cad",
          },
          {
            workspaceId,
            paymentId: payment.id,
            status: "PENDING",
            amountCents: 1000,
            currency: "cad",
          },
          {
            workspaceId,
            source: "IMPORTED",
            status: "IMPORTED",
            amountCents: 4000,
            currency: "cad",
          },
          {
            workspaceId: foreignId,
            status: "SUCCEEDED",
            amountCents: 90000,
            currency: "cad",
          },
        ],
      });
      await db.invoice.createMany({
        data: [
          {
            workspaceId,
            status: "PAID",
            subtotalCents: 10000,
            taxCents: 1300,
            totalCents: 11300,
            amountPaidCents: 11300,
            amountDueCents: 0,
            currency: "cad",
          },
          {
            workspaceId,
            status: "OPEN",
            subtotalCents: 4000,
            totalCents: 4000,
            amountDueCents: 4000,
            currency: "cad",
          },
          {
            workspaceId,
            status: "DRAFT",
            subtotalCents: 7000,
            totalCents: 7000,
            amountDueCents: 7000,
            currency: "cad",
          },
          {
            workspaceId,
            status: "VOID",
            subtotalCents: 9000,
            totalCents: 9000,
            amountDueCents: 9000,
            currency: "cad",
          },
        ],
      });
      await db.accountCredit.createMany({
        data: [
          {
            workspaceId,
            memberId,
            originalAmountCents: 1000,
            remainingAmountCents: 400,
            currency: "cad",
          },
          {
            workspaceId,
            memberId,
            status: "APPLIED",
            originalAmountCents: 5000,
            remainingAmountCents: 0,
            currency: "cad",
          },
        ],
      });
      await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "test",
          kind: "REFUND",
          status: "REVIEW_REQUIRED",
          amountCents: 3000,
          currency: "cad",
          providerIdempotencyKey: randomUUID(),
          payload: {},
        },
      });
      const report = await api.getFinancialSummary(actor());
      expect(report.ledgers).toHaveLength(3);
      expect(
        report.ledgers.find(
          (r) => r.source === "CURRENT" && r.currency === "cad",
        ),
      ).toMatchObject({
        gross: 10000,
        refunded: 2000,
        net: 8000,
        refundDifference: 0,
        paymentCount: 1,
        refundCount: 1,
        invoiceDue: 4000,
        paidInvoiceTax: 1300,
        pendingPayments: 5000,
        pendingRefunds: 1000,
      });
      expect(report.ledgers.find((r) => r.source === "IMPORTED")).toMatchObject(
        { gross: 20000, refunded: 4000, net: 16000 },
      );
      expect(report.ledgers.find((r) => r.currency === "usd")).toMatchObject({
        gross: 3000,
        net: 3000,
      });
      expect(
        report.credits.find((r) => r.status === "ACTIVE")?._sum
          .remainingAmountCents,
      ).toBe(400);
      expect(report.operations).toMatchObject([
        {
          kind: "REFUND",
          status: "REVIEW_REQUIRED",
          _sum: { amountCents: 3000 },
        },
      ]);
    });
    it("surfaces discrepancies rather than treating a payment mirror as confirmed refund evidence", async () => {
      await db.payment.create({
        data: {
          workspaceId,
          status: "PARTIALLY_REFUNDED",
          amountCents: 1000,
          refundedAmountCents: 100,
          currency: "cad",
        },
      });
      await db.refund.create({
        data: {
          workspaceId,
          status: "SUCCEEDED",
          amountCents: 200,
          currency: "cad",
        },
      });
      const report = await api.getFinancialSummary(actor());
      expect(report.ledgers[0]).toMatchObject({
        refunded: 200,
        recordedRefunds: 100,
        refundDifference: -100,
        net: 800,
      });
    });
    it("requires a current active owner for aggregates and paginated detail", async () => {
      const query = api.financialSummaryQuery({});
      for (const actorUserId of [coachId, "unknown"]) {
        await expect(
          api.getFinancialSummary({ ...actor(), actorUserId }),
        ).rejects.toThrow("Owner access required");
        await expect(
          api.getFinancialSummaryRecords({ ...actor(), actorUserId, query }),
        ).rejects.toThrow("Owner access required");
      }
      await expect(
        api.getFinancialSummary({ ...actor(), workspaceId: foreignId }),
      ).rejects.toThrow("Owner access required");
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: ownerId },
        data: { isActive: false },
      });
      await expect(api.getFinancialSummary(actor())).rejects.toThrow(
        "Owner access required",
      );
    });
    it("detects per-payment refund errors even when currency totals cancel out", async () => {
      const first = await db.payment.create({
        data: {
          workspaceId,
          status: "PARTIALLY_REFUNDED",
          amountCents: 1000,
          refundedAmountCents: 100,
          currency: "cad",
        },
      });
      const second = await db.payment.create({
        data: {
          workspaceId,
          status: "PARTIALLY_REFUNDED",
          amountCents: 1000,
          refundedAmountCents: 200,
          currency: "cad",
        },
      });
      await db.refund.createMany({
        data: [
          {
            workspaceId,
            paymentId: first.id,
            status: "SUCCEEDED",
            amountCents: 200,
            currency: "cad",
          },
          {
            workspaceId,
            paymentId: second.id,
            status: "SUCCEEDED",
            amountCents: 100,
            currency: "cad",
          },
        ],
      });
      const summary = await api.getFinancialSummary(actor());
      expect(summary.ledgers[0]?.refundDifference).toBe(0);
      expect(summary.refundChecks).toHaveLength(2);
      expect(summary.refundChecks.every((r) => r.total === 2)).toBe(true);
      expect(summary.refundChecks.find((r) => r.id === first.id)).toMatchObject(
        { mirrored: 100, confirmed: 200 },
      );
      expect(
        summary.refundChecks.find((r) => r.id === second.id),
      ).toMatchObject({ mirrored: 200, confirmed: 100 });
    });
    it("keeps dispute case exposure separate from collections, refunds and provider test/live modes", async () => {
      await db.payment.create({
        data: {
          workspaceId,
          status: "SUCCEEDED",
          amountCents: 1000,
          currency: "cad",
        },
      });
      await db.paymentDispute.createMany({
        data: [false, true].map((livemode) => ({
          workspaceId,
          providerAccountId: `acct-${randomUUID()}`,
          livemode,
          providerDisputeId: `dp-${randomUUID()}`,
          chargeId: "ch-fixture",
          providerStatus: "under_review",
          reason: "fraudulent",
          amountCents: 500,
          currency: "cad",
          chargeAmountCents: 1000,
          isChargeRefundable: false,
          evidence: {},
          evidenceHash: "a".repeat(64),
          accessState: "LINKAGE_REVIEW",
          moneyState: "PENDING",
        })),
      });
      const summary = await api.getFinancialSummary(actor());
      expect(summary.ledgers[0]).toMatchObject({
        gross: 1000,
        refunded: 0,
        net: 1000,
      });
      expect(summary.disputes).toHaveLength(2);
      expect(summary.disputes.map((r) => r.livemode).sort()).toEqual([
        false,
        true,
      ]);
      expect(
        summary.disputes.every(
          (r) => r._sum.amountCents === 500 && r.moneyState === "PENDING",
        ),
      ).toBe(true);
    });
    it("counts every record beyond a detail page and exposes stable complete pagination", async () => {
      await db.payment.createMany({
        data: Array.from({ length: 75 }, (_, i) => ({
          workspaceId,
          status: "SUCCEEDED",
          amountCents: i + 1,
          currency: "cad",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        })),
      });
      const summary = await api.getFinancialSummary(actor());
      expect(summary.ledgers[0]).toMatchObject({
        gross: 2850,
        paymentCount: 75,
      });
      const page1 = await api.getFinancialSummaryRecords({
        ...actor(),
        query: api.financialSummaryQuery({ currency: "cad" }),
      });
      const page2 = await api.getFinancialSummaryRecords({
        ...actor(),
        query: api.financialSummaryQuery({ currency: "cad", page: "2" }),
      });
      expect(page1.count).toBe(75);
      expect(page1.records).toHaveLength(50);
      expect(page2.records).toHaveLength(25);
      expect(
        new Set([...page1.records, ...page2.records].map((r) => r.id)).size,
      ).toBe(75);
      expect(
        api.financialSummaryQuery({
          records: "unknown",
          page: "-7",
          source: "foreign",
          currency: "<bad>",
        }),
      ).toEqual({
        view: "payments",
        page: 1,
        source: "CURRENT",
        currency: null,
      });
    });
  },
);
