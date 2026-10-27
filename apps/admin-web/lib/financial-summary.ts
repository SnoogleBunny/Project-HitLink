import { prisma, Prisma, type BillingSource } from "@flowstate/db";

const confirmedPaymentStatuses = [
  "SUCCEEDED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;
export type FinancialSummaryView =
  | "payments"
  | "refunds"
  | "invoices"
  | "credits";
export function financialSummaryQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const view: FinancialSummaryView = [
    "payments",
    "refunds",
    "invoices",
    "credits",
  ].includes(String(input.records))
    ? (input.records as FinancialSummaryView)
    : "payments";
  const page =
    typeof input.page === "string" && /^\d{1,6}$/.test(input.page)
      ? Math.max(1, Number(input.page))
      : 1;
  const source: BillingSource =
    input.source === "IMPORTED" ? "IMPORTED" : "CURRENT";
  const currency =
    typeof input.currency === "string" && /^[a-zA-Z]{3}$/.test(input.currency)
      ? input.currency.toLowerCase()
      : null;
  return { view, page, source, currency };
}

/** Independent ledgers from one consistent snapshot; currencies and imported evidence never mix. */
export async function getFinancialSummary(args: {
  workspaceId: string;
  actorUserId: string;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  return db.$transaction(
    async (tx) => {
      if (
        !(await tx.workspaceUser.findFirst({
          where: {
            workspaceId: args.workspaceId,
            userId: args.actorUserId,
            role: "OWNER",
            isActive: true,
          },
          select: { id: true },
        }))
      )
        throw new Error("Owner access required.");
      const where = { workspaceId: args.workspaceId };
      const [
        payments,
        refunds,
        invoices,
        credits,
        operations,
        openReviews,
        disputes,
        refundChecks,
      ] = await Promise.all([
        tx.payment.groupBy({
          by: ["source", "currency", "status"],
          where,
          _sum: { amountCents: true, refundedAmountCents: true },
          _count: { _all: true },
        }),
        tx.refund.groupBy({
          by: ["source", "currency", "status"],
          where,
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        tx.invoice.groupBy({
          by: ["source", "currency", "status"],
          where,
          _sum: {
            amountDueCents: true,
            amountPaidCents: true,
            totalCents: true,
            taxCents: true,
          },
          _count: { _all: true },
        }),
        tx.accountCredit.groupBy({
          by: ["currency", "status"],
          where,
          _sum: { originalAmountCents: true, remainingAmountCents: true },
          _count: { _all: true },
        }),
        tx.financialOperation.groupBy({
          by: ["currency", "kind", "status"],
          where: {
            ...where,
            status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
          },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        tx.financialReviewCase.count({
          where: { ...where, resolvedAt: null },
        }),
        tx.paymentDispute.groupBy({
          by: ["currency", "livemode", "providerStatus", "moneyState"],
          where,
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        tx.$queryRaw<
          Array<{
            id: string;
            currency: string;
            mirrored: number;
            confirmed: bigint;
            invalidLinks: bigint;
            total: bigint;
          }>
        >`
            WITH ledger AS (
              SELECT p.id, p.currency, p."refundedAmountCents" AS mirrored,
                COALESCE(SUM(r."amountCents") FILTER (WHERE r."workspaceId" = p."workspaceId"
                  AND r.currency = p.currency AND r.source = p.source
                  AND (r.status = 'SUCCEEDED' OR (r.source = 'IMPORTED' AND r.status = 'IMPORTED'))), 0) AS confirmed,
                COUNT(r.id) FILTER (WHERE r."workspaceId" <> p."workspaceId" OR r.currency <> p.currency OR r.source <> p.source) AS "invalidLinks"
              FROM payments p LEFT JOIN refunds r ON r."paymentId" = p.id
              WHERE p."workspaceId" = ${args.workspaceId}
              GROUP BY p.id
            )
            SELECT *, COUNT(*) OVER () AS total FROM ledger
            WHERE mirrored <> confirmed OR "invalidLinks" > 0
            ORDER BY id LIMIT 50
          `,
      ]);
      const keys = new Set(
        [...payments, ...refunds, ...invoices].map(
          (row) => `${row.source}:${row.currency}`,
        ),
      );
      const ledgers = [...keys].sort().map((key) => {
        const [source, currency] = key.split(":") as [BillingSource, string];
        const paid = payments.filter(
          (row) =>
            row.source === source &&
            row.currency === currency &&
            (confirmedPaymentStatuses.includes(
              row.status as (typeof confirmedPaymentStatuses)[number],
            ) ||
              (source === "IMPORTED" && row.status === "IMPORTED")),
        );
        const confirmedRefunds = refunds.filter(
          (row) =>
            row.source === source &&
            row.currency === currency &&
            (row.status === "SUCCEEDED" ||
              (source === "IMPORTED" && row.status === "IMPORTED")),
        );
        const due = invoices.filter(
          (row) =>
            row.source === source &&
            row.currency === currency &&
            ["OPEN", "UNCOLLECTIBLE", "IMPORTED"].includes(row.status),
        );
        const paidInvoices = invoices.filter(
          (row) =>
            row.source === source &&
            row.currency === currency &&
            row.status === "PAID",
        );
        const gross = paid.reduce(
          (sum, row) => sum + (row._sum.amountCents ?? 0),
          0,
        );
        const refunded = confirmedRefunds.reduce(
          (sum, row) => sum + (row._sum.amountCents ?? 0),
          0,
        );
        const recordedRefunds = paid.reduce(
          (sum, row) => sum + (row._sum.refundedAmountCents ?? 0),
          0,
        );
        return {
          source,
          currency,
          gross,
          refunded,
          net: gross - refunded,
          recordedRefunds,
          refundDifference: recordedRefunds - refunded,
          paymentCount: paid.reduce((sum, row) => sum + row._count._all, 0),
          refundCount: confirmedRefunds.reduce(
            (sum, row) => sum + row._count._all,
            0,
          ),
          invoiceDue: due.reduce(
            (sum, row) => sum + (row._sum.amountDueCents ?? 0),
            0,
          ),
          paidInvoiceTax: paidInvoices.reduce(
            (sum, row) => sum + (row._sum.taxCents ?? 0),
            0,
          ),
          pendingPayments: payments
            .filter(
              (row) =>
                row.source === source &&
                row.currency === currency &&
                row.status === "PENDING",
            )
            .reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0),
          pendingRefunds: refunds
            .filter(
              (row) =>
                row.source === source &&
                row.currency === currency &&
                row.status === "PENDING",
            )
            .reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0),
        };
      });
      return {
        ledgers,
        credits,
        operations,
        openReviews,
        disputes,
        refundChecks: refundChecks.map((row) => ({
          ...row,
          confirmed: Number(row.confirmed),
          invalidLinks: Number(row.invalidLinks),
          total: Number(row.total),
        })),
        capturedAt: new Date(),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function getFinancialSummaryRecords(args: {
  workspaceId: string;
  actorUserId: string;
  query: ReturnType<typeof financialSummaryQuery>;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  return db.$transaction(
    async (tx) => {
      if (
        !(await tx.workspaceUser.findFirst({
          where: {
            workspaceId: args.workspaceId,
            userId: args.actorUserId,
            role: "OWNER",
            isActive: true,
          },
          select: { id: true },
        }))
      )
        throw new Error("Owner access required.");
      const { query } = args;
      const common = {
        workspaceId: args.workspaceId,
        ...(query.currency ? { currency: query.currency } : {}),
      };
      const where = { ...common, source: query.source };
      const page = {
        take: 50,
        skip: (query.page - 1) * 50,
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      };
      if (query.view === "payments") {
        const [count, records] = await Promise.all([
          tx.payment.count({ where }),
          tx.payment.findMany({
            where,
            ...page,
            select: {
              id: true,
              status: true,
              amountCents: true,
              refundedAmountCents: true,
              currency: true,
              paidAt: true,
              memberId: true,
              invoiceId: true,
            },
          }),
        ]);
        return {
          count,
          records: records.map((r) => ({
            id: r.id,
            status: r.status,
            amount: r.amountCents,
            currency: r.currency,
            detail: "Confirmed refunds recorded",
            detailAmount: r.refundedAmountCents,
            memberId: r.memberId,
          })),
        };
      }
      if (query.view === "refunds") {
        const [count, records] = await Promise.all([
          tx.refund.count({ where }),
          tx.refund.findMany({
            where,
            ...page,
            select: {
              id: true,
              status: true,
              amountCents: true,
              currency: true,
              paymentId: true,
              memberId: true,
            },
          }),
        ]);
        return {
          count,
          records: records.map((r) => ({
            id: r.id,
            status: r.status,
            amount: r.amountCents,
            currency: r.currency,
            detail: r.paymentId
              ? `Payment ${r.paymentId}`
              : "No linked payment; review source evidence",
            detailAmount: null,
            memberId: r.memberId,
          })),
        };
      }
      if (query.view === "invoices") {
        const [count, records] = await Promise.all([
          tx.invoice.count({ where }),
          tx.invoice.findMany({
            where,
            ...page,
            select: {
              id: true,
              status: true,
              amountDueCents: true,
              currency: true,
              taxCents: true,
              memberId: true,
            },
          }),
        ]);
        return {
          count,
          records: records.map((r) => ({
            id: r.id,
            status: r.status,
            amount: r.amountDueCents,
            currency: r.currency,
            detail: "Invoice tax recorded",
            detailAmount: r.taxCents,
            memberId: r.memberId,
          })),
        };
      }
      const [count, records] = await Promise.all([
        tx.accountCredit.count({ where: common }),
        tx.accountCredit.findMany({
          where: common,
          ...page,
          select: {
            id: true,
            status: true,
            remainingAmountCents: true,
            currency: true,
            memberId: true,
          },
        }),
      ]);
      return {
        count,
        records: records.map((r) => ({
          id: r.id,
          status: r.status,
          amount: r.remainingAmountCents,
          currency: r.currency,
          detail:
            "Remaining payer credit; credit is separate from cash collected",
          detailAmount: null,
          memberId: r.memberId,
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
