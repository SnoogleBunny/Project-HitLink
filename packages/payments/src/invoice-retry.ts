import { randomUUID } from "node:crypto";
import {
  FinancialError,
  lockFinancialAccount,
  prisma,
  queueFinancialReview,
  reconcileMembershipInvoice,
  reserveFinancialOperation,
  transitionFinancialOperation,
  type InvoiceEvidence,
  type PrismaClient,
} from "@flowstate/db";
import { paymentProvider } from "./index.js";
import { retrieveInvoiceEvidence } from "./membership-reconciliation.js";

export class InvoiceRetryDeclined extends Error {}
export interface InvoiceRetryGateway {
  retrieve(accountId: string, invoiceId: string): Promise<InvoiceEvidence>;
  pay(
    accountId: string,
    invoiceId: string,
    operationKey: string,
  ): Promise<void>;
}
function retryGateway(): InvoiceRetryGateway {
  const stripe = paymentProvider();
  return {
    retrieve: (accountId, invoiceId) =>
      retrieveInvoiceEvidence(
        accountId,
        invoiceId,
        { type: "invoice.updated", created: Math.floor(Date.now() / 1000) },
        stripe,
      ),
    async pay(accountId, invoiceId, operationKey) {
      try {
        await stripe.invoices.pay(
          invoiceId,
          {},
          { stripeAccount: accountId, idempotencyKey: operationKey },
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "type" in error &&
          error.type === "StripeCardError"
        )
          throw new InvoiceRetryDeclined(
            "The payment was declined. Update the payment method before trying again.",
          );
        throw error;
      }
    },
  };
}

export async function retryMembershipInvoice(args: {
  workspaceId: string;
  actorUserId: string;
  membershipBillingStateId?: string;
  memberId?: string;
  db?: PrismaClient;
  gateway?: InvoiceRetryGateway;
  now?: Date;
}): Promise<{ status: "retried" } | { status: "error"; message: string }> {
  const db = args.db ?? prisma,
    now = args.now ?? new Date();
  try {
    const actor = await db.workspaceUser.findFirst({
      where: {
        workspaceId: args.workspaceId,
        userId: args.actorUserId,
        isActive: true,
        role: { in: ["OWNER", "CUSTOMER"] },
      },
    });
    if (!actor)
      throw new FinancialError("This account cannot retry this payment.");
    const state = await db.membershipBillingState.findFirst({
      where: {
        workspaceId: args.workspaceId,
        ...(args.membershipBillingStateId
          ? { id: args.membershipBillingStateId }
          : {
              memberId: args.memberId ?? "",
              member: { userId: args.actorUserId },
            }),
      },
      include: {
        memberMembership: {
          include: { payerAccount: true, member: { select: { userId: true } } },
        },
      },
    });
    if (!state?.latestInvoiceId)
      throw new FinancialError("There is no invoice to retry.");
    const membership = state.memberMembership;
    const payerUserId =
      membership.payerAccount?.userId ?? membership.member.userId;
    if (actor.role !== "OWNER" && payerUserId !== args.actorUserId)
      throw new FinancialError("This invoice belongs to another payer.");
    const settings = await db.workspaceStripeSettings.findUnique({
      where: { workspaceId: args.workspaceId },
    });
    if (
      !settings?.stripeAccountId ||
      settings.connectionStatus !== "ACTIVE" ||
      !settings.chargesEnabled
    )
      throw new FinancialError("Online billing is not available for this gym.");
    const accountId =
      membership.payerAccount?.stripeAccountId ?? settings.stripeAccountId;
    if (accountId !== settings.stripeAccountId)
      throw new FinancialError(
        "This membership belongs to an earlier payment account. The gym must review it before a retry.",
      );
    const gateway = args.gateway ?? retryGateway();
    const canonical = await gateway.retrieve(accountId, state.latestInvoiceId);
    if (
      canonical.id !== state.latestInvoiceId ||
      canonical.accountId !== accountId
    )
      throw new FinancialError(
        "The processor returned another invoice. The gym must review it before a retry.",
      );
    const checked = await reconcileMembershipInvoice({
      workspaceId: args.workspaceId,
      evidence: canonical,
      eventId: `retry-check:${randomUUID()}`,
      db,
      now,
    });
    if (checked.status !== "reconciled")
      throw new FinancialError(
        "The processor returned conflicting payment details. The gym must review this invoice before another retry.",
      );
    if (canonical.status === "PAID" || canonical.amountDueCents === 0)
      return { status: "retried" };
    if (canonical.status !== "OPEN")
      throw new FinancialError(
        "This invoice cannot be paid online. Ask the gym to review it.",
      );
    const operation = await db.$transaction(async (tx) => {
      await lockFinancialAccount(tx, args.workspaceId);
      if (
        !(await tx.workspaceUser.findFirst({
          where: {
            id: actor.id,
            workspaceId: args.workspaceId,
            isActive: true,
            role: actor.role,
          },
        }))
      )
        throw new FinancialError(
          "Your payment permission changed. Reload this page.",
        );
      const current = await tx.memberMembership.findUniqueOrThrow({
        where: { id: membership.id },
        include: { payerAccount: true, member: { select: { userId: true } } },
      });
      if (
        actor.role !== "OWNER" &&
        (current.payerAccount?.userId ?? current.member.userId) !==
          args.actorUserId
      )
        throw new FinancialError("This invoice belongs to another payer.");
      if (
        current.payerAccountId !== membership.payerAccountId ||
        (current.payerAccount?.stripeAccountId ?? accountId) !== accountId ||
        (current.payerAccount?.stripeCustomerId ?? current.stripeCustomerId) !==
          canonical.customerId ||
        current.stripeSubscriptionId !== canonical.subscriptionId
      )
        throw new FinancialError(
          "This invoice's payer changed. Reload its current details before paying.",
        );
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: {
          workspaceId_stripeInvoiceId: {
            workspaceId: args.workspaceId,
            stripeInvoiceId: canonical.id,
          },
        },
      });
      if (invoice.status === "PAID" || invoice.amountDueCents === 0)
        return null;
      if (invoice.status !== "OPEN")
        throw new FinancialError(
          "This invoice is no longer payable. Ask the gym to review it.",
        );
      const existing = await tx.financialOperation.findFirst({
        where: {
          workspaceId: args.workspaceId,
          kind: "RETRY_INVOICE",
          targetId: canonical.id,
          status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
      return reserveFinancialOperation(tx, {
        workspaceId: args.workspaceId,
        kind: "RETRY_INVOICE",
        operationKey: `retry:${invoice.id}:${randomUUID()}`,
        actorUserId: args.actorUserId,
        payerAccountId: current.payerAccountId ?? undefined,
        beneficiaryMemberId: current.memberId,
        invoiceId: invoice.id,
        targetId: canonical.id,
        amountCents: canonical.amountDueCents,
        currency: canonical.currency,
        providerAccountId: settings.stripeAccountId!,
        payload: {
          invoiceId: canonical.id,
          accountId: settings.stripeAccountId!,
        },
      });
    });
    if (!operation) return { status: "retried" };
    if (operation.status === "REVIEW_REQUIRED")
      throw new FinancialError(
        "This invoice retry needs the gym's review. Do not start another payment.",
      );
    if (
      operation.amountCents !== canonical.amountDueCents ||
      operation.currency !== canonical.currency ||
      operation.providerAccountId !== settings.stripeAccountId ||
      now.getTime() - operation.createdAt.getTime() >= 23 * 60 * 60_000
    ) {
      await db.$transaction(async (tx) => {
        await lockFinancialAccount(tx, args.workspaceId);
        const current = await tx.financialOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        await transitionFinancialOperation(tx, current, "REVIEW_REQUIRED", {
          reason: "Retry evidence changed or safe retry window ended.",
        });
        await queueFinancialReview(tx, {
          workspaceId: args.workspaceId,
          sourceKey: `retry-review:${current.id}`,
          operationId: current.id,
          memberId: current.beneficiaryMemberId,
          payerAccountId: current.payerAccountId,
          reason:
            "Reconcile the original invoice retry before allowing another payment.",
        });
      });
      throw new FinancialError(
        "The invoice changed. The gym must check the original retry before you pay again.",
      );
    }
    let declined = false,
      uncertain = false;
    try {
      await gateway.pay(
        settings.stripeAccountId,
        canonical.id,
        operation.providerIdempotencyKey,
      );
    } catch (error) {
      declined = error instanceof InvoiceRetryDeclined;
      uncertain = !declined;
    }
    let evidence: InvoiceEvidence;
    try {
      evidence = await gateway.retrieve(accountId, canonical.id);
    } catch {
      await db.$transaction(async (tx) => {
        await lockFinancialAccount(tx, args.workspaceId);
        const current = await tx.financialOperation.findUniqueOrThrow({
          where: { id: operation.id },
        });
        if (["RESERVED", "SUBMITTED"].includes(current.status))
          await transitionFinancialOperation(
            tx,
            current,
            "SUBMITTED",
            { action: "provider_response_uncertain" },
            {
              submittedAt: current.submittedAt ?? now,
              lastError:
                "The processor response was not confirmed. Resume this same invoice retry.",
            },
          );
      });
      return {
        status: "error",
        message:
          "The payment response is not confirmed. Retry this request to check the same payment.",
      };
    }
    let conflicting =
      evidence.id !== canonical.id || evidence.accountId !== accountId;
    if (!conflicting) {
      try {
        const result = await reconcileMembershipInvoice({
          workspaceId: args.workspaceId,
          evidence,
          eventId: `retry-result:${operation.id}:${randomUUID()}`,
          db,
          now,
        });
        conflicting = result.status !== "reconciled";
      } catch (error) {
        if (error instanceof FinancialError) conflicting = true;
        else throw error;
      }
    }
    const completed = await db.$transaction(async (tx) => {
      await lockFinancialAccount(tx, args.workspaceId);
      const current = await tx.financialOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
      if (
        current.status === "SUCCEEDED" ||
        current.status === "REVIEW_REQUIRED" ||
        (current.status === "FAILED" && evidence.status !== "PAID")
      )
        return current;
      if (conflicting || !["OPEN", "PAID"].includes(evidence.status)) {
        await queueFinancialReview(tx, {
          workspaceId: args.workspaceId,
          sourceKey: `retry-review:${current.id}`,
          operationId: current.id,
          memberId: current.beneficiaryMemberId,
          payerAccountId: current.payerAccountId,
          reason:
            "The invoice response changed during payment. Reconcile the original retry before another payment.",
        });
        return transitionFinancialOperation(
          tx,
          current,
          "REVIEW_REQUIRED",
          { action: "conflicting_invoice_response" },
          { lastError: "Invoice response requires review." },
        );
      }
      return transitionFinancialOperation(
        tx,
        current,
        evidence.status === "PAID"
          ? "SUCCEEDED"
          : declined
            ? "FAILED"
            : "SUBMITTED",
        {
          action:
            evidence.status === "PAID"
              ? "invoice_settled"
              : declined
                ? "declined"
                : "awaiting_confirmation",
        },
        {
          providerReference: canonical.id,
          submittedAt: current.submittedAt ?? now,
          ...(evidence.status === "PAID" ? { settledAt: now } : {}),
          lastError: declined
            ? "Payment declined"
            : uncertain
              ? "Processor response unconfirmed"
              : null,
        },
      );
    });
    if (completed.status === "REVIEW_REQUIRED")
      return {
        status: "error",
        message:
          "This invoice retry needs the gym's review. Please do not pay again.",
      };
    return completed.status === "SUCCEEDED"
      ? { status: "retried" }
      : {
          status: "error",
          message: declined
            ? "The payment was declined. Update your payment method before trying again."
            : "The payment is still being confirmed. The same retry is saved; please do not start another payment.",
        };
  } catch (error) {
    if (error instanceof FinancialError)
      return { status: "error", message: error.message };
    throw error;
  }
}
