import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type FinancialOperation,
} from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { issuePaymentConfirmationTx } from "./payment-confirmations.js";
import {
  expireDropInBookingPayment,
  finalizeDropInBookingPayment,
  finalizePunchCardCheckoutPurchase,
} from "./class-access.js";
import {
  FinancialError,
  lockFinancialAccount,
  queueFinancialReview,
  requireFinancialPayer,
  reserveFinancialOperation,
  transitionFinancialOperation,
} from "./financial-operations.js";

export interface CheckoutEvidence {
  id: string;
  state: "open" | "complete" | "expired";
  paid: boolean;
  url: string | null;
  amountCents: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  operationId: string | null;
  payerAccountId: string | null;
  expiresAt: Date | null;
}
export interface CheckoutRequest {
  accountId: string;
  operationId: string;
  payerAccountId: string;
  customerId: string | null;
  email: string;
  name: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
  metadata: Record<string, string>;
}
export interface CheckoutGateway {
  create(
    request: CheckoutRequest,
    idempotencyKey: string,
  ): Promise<CheckoutEvidence>;
  retrieve(accountId: string, sessionId: string): Promise<CheckoutEvidence>;
  expire(accountId: string, sessionId: string): Promise<void>;
}
export interface PurchaseArgs {
  workspaceId: string;
  actorUserId: string;
  payerMemberId: string;
  memberId: string;
  successUrl: string;
  cancelUrl: string;
  requestId?: string;
  bookingId?: string;
  punchCardProductId?: string;
  db?: PrismaClient;
  gateway: CheckoutGateway;
  now?: Date;
}
export type CheckoutResult =
  | { status: "ok"; url: string }
  | { status: "error"; message: string };

function requestOf(operation: FinancialOperation): CheckoutRequest {
  return (operation.payload as unknown as { request: CheckoutRequest }).request;
}
function withOperation(url: string, operationId: string) {
  const result = new URL(url);
  if (
    result.protocol !== "https:" &&
    !(
      result.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(result.hostname)
    )
  )
    throw new FinancialError(
      "The payment return address is not configured correctly.",
    );
  result.searchParams.set("operation", operationId);
  return result.toString();
}

async function reservePurchase(args: PurchaseArgs) {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    const { payer } = await requireFinancialPayer(tx, {
      ...args,
      beneficiaryMemberId: args.memberId,
    });
    await lockFinancialAccount(tx, args.workspaceId);
    const settings = await tx.workspaceStripeSettings.findUnique({
      where: { workspaceId: args.workspaceId },
    });
    if (
      !settings?.stripeAccountId ||
      settings.connectionStatus !== "ACTIVE" ||
      !settings.chargesEnabled
    )
      throw new FinancialError(
        "Online payments are not connected for this gym yet.",
      );
    const account = await tx.financialAccount.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: args.workspaceId,
          userId: args.actorUserId,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        userId: args.actorUserId,
        memberId: payer.id,
        stripeAccountId: settings.stripeAccountId,
      },
      update: {},
    });
    if (
      account.memberId !== payer.id ||
      (account.stripeAccountId &&
        account.stripeAccountId !== settings.stripeAccountId)
    )
      throw new FinancialError(
        "The payment account needs the gym's review before another purchase.",
      );
    const targetId = args.bookingId ?? args.punchCardProductId;
    if (
      !targetId ||
      Boolean(args.bookingId) === Boolean(args.punchCardProductId)
    )
      throw new FinancialError("Choose the purchase you want to make.");
    const existing = await tx.financialOperation.findFirst({
      where: {
        workspaceId: args.workspaceId,
        kind: "CHECKOUT",
        targetId,
        beneficiaryMemberId: args.memberId,
        ...(args.requestId && !args.bookingId
          ? { operationKey: `pack:${account.id}:${args.requestId}` }
          : { status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] } }),
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (existing.payerAccountId !== account.id)
        throw new FinancialError(
          "Another account is already paying for this booking. Ask the gym to review it before starting a new payment.",
        );
      return existing;
    }
    let amountCents: number;
    let currency: string;
    let name: string;
    let units: number | undefined;
    let metadata: Record<string, string>;
    let operationKey: string;
    let acceptedTerms: Prisma.InputJsonObject | null = null;
    if (args.bookingId) {
      const booking = await tx.classBooking.findFirst({
        where: {
          id: args.bookingId,
          workspaceId: args.workspaceId,
          memberId: args.memberId,
          bookingType: "DROP_IN",
          status: "PENDING_PAYMENT",
        },
        include: { dropInProduct: true },
      });
      if (
        !booking?.dropInProduct ||
        !booking.pendingPaymentExpiresAt ||
        booking.pendingPaymentExpiresAt <= now ||
        booking.dropInPriceCents === null ||
        !booking.dropInCurrency
      )
        throw new FinancialError(
          "This booking no longer has a reserved place. Check the class before paying.",
        );
      if (booking.dropInCheckoutSessionId)
        throw new FinancialError(
          "This booking already has a payment request. Ask the gym to check its status.",
        );
      amountCents = booking.dropInPriceCents;
      currency = booking.dropInCurrency.toLowerCase();
      name = booking.dropInProduct.name;
      operationKey = `drop-in:${booking.id}:${booking.pendingPaymentExpiresAt.toISOString()}`;
      metadata = {
        checkoutType: "drop_in_booking",
        bookingId: booking.id,
        dropInProductId: booking.dropInProductId!,
      };
    } else {
      const product = await tx.punchCardProduct.findFirst({
        where: {
          id: args.punchCardProductId,
          workspaceId: args.workspaceId,
          isEnabled: true,
          archivedAt: null,
        },
        include: { programRestrictions: { select: { programId: true } } },
      });
      if (!product)
        throw new FinancialError("This class pack is no longer available.");
      amountCents = product.priceCents;
      currency = product.currency.toLowerCase();
      name = product.name;
      units = product.punchesIncluded;
      operationKey = `pack:${account.id}:${args.requestId ?? randomUUID()}`;
      metadata = {
        checkoutType: "punch_card_purchase",
        punchCardProductId: product.id,
        punchesIncluded: String(units),
        priceCents: String(amountCents),
        currency,
      };
      acceptedTerms = {
        version: product.termsVersion,
        priceCents: amountCents,
        currency,
        originalPunches: units,
        restrictionMode: product.restrictionMode,
        programIds: product.programRestrictions.map((item) => item.programId),
        lateCancellationConsumesPunch: product.lateCancellationConsumesPunch,
        noShowConsumesPunch: product.noShowConsumesPunch,
        capturedAt: now.toISOString(),
      };
    }
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      !/^[a-z]{3}$/.test(currency)
    )
      throw new FinancialError(
        "The price needs the gym's review before checkout.",
      );
    // Store the complete request before its first network call; every retry sends identical data.
    const operation = await reserveFinancialOperation(tx, {
      workspaceId: args.workspaceId,
      operationKey,
      kind: "CHECKOUT",
      actorUserId: args.actorUserId,
      payerAccountId: account.id,
      beneficiaryMemberId: args.memberId,
      targetId,
      amountCents,
      currency,
      units,
      providerAccountId: settings.stripeAccountId,
      expiresAt: new Date(now.getTime() + 31 * 60_000),
      payload: {},
    });
    const request: CheckoutRequest = {
      accountId: settings.stripeAccountId,
      operationId: operation.id,
      payerAccountId: account.id,
      customerId: account.stripeCustomerId,
      email: payer.user!.email,
      name,
      amountCents,
      currency,
      successUrl: withOperation(args.successUrl, operation.id),
      cancelUrl: withOperation(args.cancelUrl, operation.id),
      expiresAt: Math.floor(now.getTime() / 1000) + 31 * 60,
      metadata: {
        ...metadata,
        operationId: operation.id,
        payerAccountId: account.id,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
      },
    };
    return tx.financialOperation.update({
      where: { id: operation.id },
      data: {
        payload: {
          request: request as unknown as Prisma.InputJsonObject,
          acceptedTerms,
        },
      },
    });
  });
}

export async function startDurableCheckout(
  args: PurchaseArgs,
): Promise<CheckoutResult> {
  try {
    const operation = await reservePurchase(args);
    return await resumeCheckoutOperation({
      operationId: operation.id,
      workspaceId: args.workspaceId,
      actorUserId: args.actorUserId,
      db: args.db,
      gateway: args.gateway,
      now: args.now,
    });
  } catch (error) {
    if (error instanceof FinancialError)
      return { status: "error", message: error.message };
    throw error;
  }
}

async function hasCurrentCheckoutHold(
  db: PrismaClient,
  operation: FinancialOperation,
  now: Date,
) {
  if (operation.expiresAt && operation.expiresAt <= now) return false;
  if (requestOf(operation).metadata.checkoutType !== "drop_in_booking")
    return true;
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, operation.workspaceId);
    return Boolean(
      await tx.classBooking.findFirst({
        where: {
          id: operation.targetId!,
          workspaceId: operation.workspaceId,
          memberId: operation.beneficiaryMemberId!,
          status: "PENDING_PAYMENT",
          pendingPaymentExpiresAt: { gt: now },
          OR: [
            { dropInCheckoutSessionId: null },
            { dropInCheckoutSessionId: operation.providerReference },
          ],
        },
      }),
    );
  });
}

async function quarantineCheckout(
  db: PrismaClient,
  operation: FinancialOperation,
  reason: string,
) {
  await db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, operation.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (["SUCCEEDED", "FAILED"].includes(current.status)) return;
    await transitionFinancialOperation(
      tx,
      current,
      "REVIEW_REQUIRED",
      { reason },
      { providerUrl: null },
    );
    await queueFinancialReview(tx, {
      workspaceId: current.workspaceId,
      sourceKey: `unknown-checkout:${current.id}`,
      operationId: current.id,
      payerAccountId: current.payerAccountId,
      memberId: current.beneficiaryMemberId,
      reason,
    });
  });
}

export async function resumeCheckoutOperation(args: {
  operationId: string;
  workspaceId: string;
  actorUserId: string;
  gateway: CheckoutGateway;
  db?: PrismaClient;
  now?: Date;
}): Promise<CheckoutResult> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  let operation = await db.financialOperation.findFirst({
    where: {
      id: args.operationId,
      workspaceId: args.workspaceId,
      kind: "CHECKOUT",
      payerAccount: { userId: args.actorUserId },
    },
    include: { payerAccount: true },
  });
  if (!operation?.payerAccount || !operation.beneficiaryMemberId)
    return {
      status: "error",
      message: "Payment request not found for this account.",
    };
  await db.$transaction(async (tx) => {
    await requireFinancialPayer(tx, {
      workspaceId: args.workspaceId,
      actorUserId: args.actorUserId,
      payerMemberId: operation!.payerAccount!.memberId,
      beneficiaryMemberId: operation!.beneficiaryMemberId!,
    });
  });
  if (operation.status === "SUCCEEDED")
    return { status: "ok", url: requestOf(operation).successUrl };
  if (operation.status === "FAILED")
    return {
      status: "error",
      message:
        "This payment request has ended. Check your booking or class pack before starting another.",
    };
  if (operation.status === "REVIEW_REQUIRED")
    return {
      status: "error",
      message: "The gym is reviewing this payment. Please do not pay again.",
    };
  if (
    !operation.providerReference &&
    now.getTime() - operation.createdAt.getTime() >= 23 * 60 * 60_000
  ) {
    await db.$transaction(async (tx) => {
      await lockFinancialAccount(tx, args.workspaceId);
      const current = await tx.financialOperation.findUniqueOrThrow({
        where: { id: operation!.id },
      });
      if (current.providerReference || current.status === "SUCCEEDED") return;
      await transitionFinancialOperation(tx, current, "REVIEW_REQUIRED", {
        reason:
          "Provider response was not recovered inside the safe retry window.",
      });
      await queueFinancialReview(tx, {
        workspaceId: args.workspaceId,
        sourceKey: `unknown-checkout:${current.id}`,
        operationId: current.id,
        payerAccountId: current.payerAccountId,
        memberId: current.beneficiaryMemberId,
        reason:
          "Find the original processor checkout before allowing another payment.",
      });
    });
    return {
      status: "error",
      message: "The gym needs to check this payment before you try again.",
    };
  }
  try {
    if (
      !operation.providerReference &&
      !(await hasCurrentCheckoutHold(db, operation, now))
    ) {
      // There may already be an unacknowledged session. Never create a new one after its local hold ends.
      await quarantineCheckout(
        db,
        operation,
        "The local reservation ended before the processor checkout was recovered. Find the original payment before allowing another purchase.",
      );
      return {
        status: "error",
        message:
          "This reservation ended. The gym needs to check the original payment before you try again.",
      };
    }
    const evidence = operation.providerReference
      ? await args.gateway.retrieve(
          operation.providerAccountId!,
          operation.providerReference,
        )
      : await args.gateway.create(
          requestOf(operation),
          operation.providerIdempotencyKey,
        );
    await saveCheckoutEvidence({
      db,
      operationId: operation.id,
      accountId: operation.providerAccountId!,
      evidence,
      now,
    });
    operation = await db.financialOperation.findUnique({
      where: { id: operation.id },
      include: { payerAccount: true },
    });
    if (operation?.status === "SUCCEEDED")
      return { status: "ok", url: requestOf(operation).successUrl };
    if (operation?.status === "REVIEW_REQUIRED")
      return {
        status: "error",
        message: operation.paymentId
          ? "Payment received. The gym needs to review your access; please do not pay again."
          : "The gym is reviewing this payment. Please do not pay again.",
      };
    if (evidence.state === "open" && evidence.url) {
      if (!operation || operation.status === "FAILED")
        return {
          status: "error",
          message:
            "This checkout has ended. Check your booking before starting again.",
        };
      if (!(await hasCurrentCheckoutHold(db, operation, now))) {
        // Stripe's minimum checkout lifetime can outlast a class reservation. Reconcile a concurrent payment,
        // but never send the payer back to an open session after the place has been released.
        try {
          await args.gateway.expire(operation.providerAccountId!, evidence.id);
        } catch {
          /* Fresh retrieval resolves expiry/payment races. */
        }
        const settled = await saveCheckoutEvidence({
          db,
          operationId: operation.id,
          accountId: operation.providerAccountId!,
          evidence: await args.gateway.retrieve(
            operation.providerAccountId!,
            evidence.id,
          ),
          now,
        });
        if (settled.status === "SUCCEEDED")
          return { status: "ok", url: requestOf(settled).successUrl };
        if (settled.paymentId)
          return {
            status: "error",
            message:
              "Payment received. The gym needs to review your access; please do not pay again.",
          };
        if (settled.status !== "FAILED")
          await quarantineCheckout(
            db,
            settled,
            "The reservation ended but the processor checkout could not be confirmed expired. Reconcile it before another purchase.",
          );
        return {
          status: "error",
          message:
            "This reservation has ended. Check its payment status before starting again.",
        };
      }
      return { status: "ok", url: evidence.url };
    }
    return {
      status: "error",
      message:
        evidence.state === "expired"
          ? "This checkout has expired. Check your booking before starting again."
          : "Your payment is being confirmed. Check its status before trying again.",
    };
  } catch (error) {
    if (error instanceof FinancialError)
      return { status: "error", message: error.message };
    // A timeout does not prove failure. Keep the same operation and seat hold recoverable.
    await db.$transaction(async (tx) => {
      await lockFinancialAccount(tx, args.workspaceId);
      const current = await tx.financialOperation.findUniqueOrThrow({
        where: { id: args.operationId },
      });
      if (current.status === "RESERVED" || current.status === "SUBMITTED")
        await transitionFinancialOperation(
          tx,
          current,
          current.status,
          { action: "provider_response_uncertain" },
          {
            lastError:
              "The processor response was not confirmed. Resume this request to check it.",
          },
        );
    });
    return {
      status: "error",
      message:
        "We could not confirm the payment response. Use Resume payment to check the same request; do not start another.",
    };
  }
}

/** Evidence must come from a fresh provider retrieval on the stored Connect account. */
export async function saveCheckoutEvidence(args: {
  operationId: string;
  accountId: string;
  evidence: CheckoutEvidence;
  db?: PrismaClient;
  now?: Date;
}) {
  const db = args.db ?? prisma;
  const accessDb = db as unknown as NonNullable<
    Parameters<typeof finalizeDropInBookingPayment>[0]["db"]
  >;
  const now = args.now ?? new Date();
  const loaded = await db.financialOperation.findUnique({
    where: { id: args.operationId },
  });
  if (!loaded) throw new FinancialError("Payment request not found.");
  const evidence = args.evidence;
  const operation = await db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, loaded.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({
      where: { id: loaded.id },
    });
    if (
      current.kind !== "CHECKOUT" ||
      current.providerAccountId !== args.accountId ||
      evidence.operationId !== current.id ||
      evidence.payerAccountId !== current.payerAccountId ||
      (current.providerReference &&
        current.providerReference !== evidence.id) ||
      evidence.amountCents !== current.amountCents ||
      evidence.currency?.toLowerCase() !== current.currency
    )
      throw new FinancialError(
        "The processor response does not match this payment request.",
      );
    if (current.status === "SUCCEEDED") return current;
    const payment =
      evidence.paid && evidence.state === "complete" && evidence.paymentIntentId
        ? await tx.payment.upsert({
            where: {
              workspaceId_importedExternalId: {
                workspaceId: current.workspaceId,
                importedExternalId: `checkout:${evidence.id}`,
              },
            },
            update: {},
            create: {
              workspaceId: current.workspaceId,
              memberId: current.beneficiaryMemberId,
              payerAccountId: current.payerAccountId,
              amountCents: current.amountCents!,
              currency: current.currency!,
              status: "SUCCEEDED",
              paidAt: now,
              stripePaymentIntentId: evidence.paymentIntentId,
              importedExternalId: `checkout:${evidence.id}`,
            },
          })
        : null;
    if (
      payment &&
      (payment.amountCents !== current.amountCents ||
        payment.payerAccountId !== current.payerAccountId ||
        payment.stripePaymentIntentId !== evidence.paymentIntentId)
    )
      throw new FinancialError(
        "This payment has conflicting evidence and needs review.",
      );
    if (payment) await issuePaymentConfirmationTx(tx, { paymentId: payment.id, description: requestOf(current).name, now });
    if (evidence.customerId && current.payerAccountId)
      await tx.financialAccount.updateMany({
        where: { id: current.payerAccountId, stripeCustomerId: null },
        data: {
          stripeCustomerId: evidence.customerId,
          stripeAccountId: args.accountId,
        },
      });
    const state =
      current.status === "REVIEW_REQUIRED" ||
      (current.status === "FAILED" && payment)
        ? "REVIEW_REQUIRED"
        : current.status === "FAILED" ||
            (evidence.state === "expired" && !payment)
          ? "FAILED"
          : "SUBMITTED";
    return transitionFinancialOperation(
      tx,
      current,
      state,
      {
        action: payment ? "payment_confirmed" : "checkout_checked",
        providerReference: evidence.id,
      },
      {
        providerReference: evidence.id,
        providerUrl: state === "REVIEW_REQUIRED" ? null : evidence.url,
        paymentId: payment?.id,
        submittedAt: current.submittedAt ?? now,
        lastError: null,
      },
    );
  });
  const request = requestOf(operation);
  if (operation.status === "SUCCEEDED") return operation;
  if (operation.status === "REVIEW_REQUIRED") {
    if (operation.paymentId)
      await db.$transaction(async (tx) => {
        await lockFinancialAccount(tx, operation.workspaceId);
        await queueFinancialReview(tx, {
          workspaceId: operation.workspaceId,
          sourceKey: `paid-access:${operation.id}`,
          operationId: operation.id,
          payerAccountId: operation.payerAccountId,
          memberId: operation.beneficiaryMemberId,
          paymentId: operation.paymentId,
          bookingId:
            request.metadata.checkoutType === "drop_in_booking"
              ? operation.targetId
              : null,
          amountCents: operation.amountCents,
          currency: operation.currency,
          reason:
            "Payment is confirmed but access needs review. Resolve the original case; do not charge again.",
        });
      });
    return operation;
  }
  if (operation.status === "FAILED") {
    if (request.metadata.checkoutType === "drop_in_booking")
      await expireDropInBookingPayment({
        workspaceId: operation.workspaceId,
        bookingId: operation.targetId!,
        checkoutSessionId: evidence.id,
        db: accessDb,
      });
    return operation;
  }
  if (!operation.paymentId) {
    if (request.metadata.checkoutType === "drop_in_booking")
      await db.classBooking.updateMany({
        where: {
          id: operation.targetId!,
          workspaceId: operation.workspaceId,
          memberId: operation.beneficiaryMemberId!,
          status: "PENDING_PAYMENT",
          OR: [
            { dropInCheckoutSessionId: null },
            { dropInCheckoutSessionId: evidence.id },
          ],
        },
        data: { dropInCheckoutSessionId: evidence.id },
      });
    return operation;
  }
  let fulfilled = false;
  if (request.metadata.checkoutType === "drop_in_booking") {
    // A webhook may beat the create response; attach only to this still-pending reservation.
    await db.classBooking.updateMany({
      where: {
        id: operation.targetId!,
        workspaceId: operation.workspaceId,
        memberId: operation.beneficiaryMemberId!,
        status: "PENDING_PAYMENT",
        dropInCheckoutSessionId: null,
      },
      data: { dropInCheckoutSessionId: evidence.id },
    });
    const result = await finalizeDropInBookingPayment({
      workspaceId: operation.workspaceId,
      bookingId: operation.targetId!,
      checkoutSessionId: evidence.id,
      amountCents: operation.amountCents!,
      currency: operation.currency!,
      paymentIntentId: evidence.paymentIntentId,
      now,
      db: accessDb,
    });
    fulfilled = result === "booked" || result === "already_booked";
  } else if (request.metadata.checkoutType === "punch_card_purchase") {
    const result = await finalizePunchCardCheckoutPurchase({
      workspaceId: operation.workspaceId,
      memberId: operation.beneficiaryMemberId!,
      punchCardProductId: operation.targetId!,
      originalPunches: operation.units!,
      priceCents: operation.amountCents!,
      currency: operation.currency!,
      checkoutSessionId: evidence.id,
      acceptedTerms: (operation.payload as Prisma.JsonObject).acceptedTerms,
      now,
      db: accessDb,
    });
    fulfilled =
      result.status === "created" || result.status === "already_exists";
  }
  return db.$transaction(async (tx) => {
    await lockFinancialAccount(tx, operation.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (current.status === "SUCCEEDED" || current.status === "REVIEW_REQUIRED")
      return current;
    if (!fulfilled)
      await queueFinancialReview(tx, {
        workspaceId: current.workspaceId,
        sourceKey: `paid-access:${current.id}`,
        operationId: current.id,
        payerAccountId: current.payerAccountId,
        memberId: current.beneficiaryMemberId,
        paymentId: current.paymentId,
        bookingId:
          request.metadata.checkoutType === "drop_in_booking"
            ? current.targetId
            : null,
        amountCents: current.amountCents,
        currency: current.currency,
        reason:
          "Payment settled after the reservation changed or expired. Arrange access or a refund; do not charge again.",
      });
    return transitionFinancialOperation(
      tx,
      current,
      fulfilled ? "SUCCEEDED" : "REVIEW_REQUIRED",
      { action: fulfilled ? "access_confirmed" : "paid_access_review" },
      {
        settledAt: now,
        result: { paymentConfirmed: true, accessConfirmed: fulfilled },
      },
    );
  });
}
