import Stripe from "stripe";
import { createHash } from "node:crypto";
import {
  CoachingError,
  getCoachingDetail,
  lockClassSchedule,
  prisma,
  type CoachingActor,
} from "@flowstate/db";

function stripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new CoachingError(
      "Online payments are not configured. Your program is still awaiting payment.",
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
function memberOrigin() {
  const origin =
    process.env.NEXT_PUBLIC_MEMBER_WEB_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin)
    throw new CoachingError(
      "The member portal payment return URL is not configured.",
    );
  const url = new URL(origin);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new CoachingError("The member portal must use HTTPS for payments.");
  return url.origin;
}

export async function startCoachingPayment(
  actor: CoachingActor,
  enrollmentId: string,
): Promise<string> {
  const detail = await getCoachingDetail(actor, enrollmentId);
  if (
    !detail.own ||
    !detail.contactVerified ||
    !detail.accepted ||
    !detail.coachAccepted ||
    detail.closedAt
  )
    throw new CoachingError(
      "Accept your program from your own account before paying.",
    );
  if (detail.paymentState === "PAID")
    throw new CoachingError("This program has already been paid.");
  const stripe = stripeClient();
  // One stable provider key per offered enrollment. A retry after an unknown response recovers the same checkout.
  const current = await prisma.coachingEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      programVersion: { include: { program: true } },
      member: { include: { user: true } },
    },
  });
  const settings = await prisma.workspaceStripeSettings.findUnique({
    where: { workspaceId: actor.workspaceId },
  });
  if (
    !settings?.stripeAccountId ||
    settings.connectionStatus !== "ACTIVE" ||
    !settings.chargesEnabled
  )
    throw new CoachingError(
      "The gym's online payment account is not ready. Your program remains awaiting payment.",
    );
  const stripeAccount = current.checkoutAccountId ?? settings.stripeAccountId;
  if (current.checkoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(
      current.checkoutSessionId,
      {},
      { stripeAccount },
    );
    if (existing.status === "open" && existing.url) return existing.url;
    if (existing.payment_status === "paid") {
      await reconcileCoachingPayment(current.id);
      throw new CoachingError(
        "Payment confirmed. Reload your program to see its start date.",
      );
    }
    if (existing.status !== "expired")
      throw new CoachingError(
        "Payment is still being confirmed. Check its status before trying again.",
      );
  }
  const attempt = current.checkoutSessionId ?? "first";
  const operationKey = `coaching-checkout:${current.id}:${attempt}`;
  const checkoutRequest = {
    mode: "payment" as const,
    customer_email: current.member.user?.email,
    client_reference_id: current.id,
    line_items: [{ quantity: 1, price_data: { currency: current.programVersion.currency, unit_amount: current.programVersion.priceCents, product_data: { name: current.programVersion.program.name } } }],
    metadata: { purpose: "coaching", workspaceId: actor.workspaceId, enrollmentId: current.id, memberId: current.memberId, programVersionId: current.programVersionId },
    payment_intent_data: { metadata: { purpose: "coaching", workspaceId: actor.workspaceId, enrollmentId: current.id } },
    success_url: `${memberOrigin()}/app/coaching/${current.id}?payment=returned`,
    cancel_url: `${memberOrigin()}/app/coaching/${current.id}?payment=cancelled`,
  };
  const reservation = await prisma.$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    const prior = await db.financialOperation.findUnique({ where: { workspaceId_operationKey: { workspaceId: actor.workspaceId, operationKey } } });
    if (prior) {
      const tooOld = !prior.providerReference && prior.submittedAt && Date.now() - prior.submittedAt.getTime() >= 23 * 3600000;
      if (tooOld || prior.status === "REVIEW_REQUIRED") {
        await db.financialOperation.update({ where: { id: prior.id }, data: { status: "REVIEW_REQUIRED", lastError: "Checkout outcome is unknown beyond the safe provider replay window." } });
        await db.financialReviewCase.upsert({ where: { workspaceId_sourceKey: { workspaceId: actor.workspaceId, sourceKey: operationKey } }, create: { workspaceId: actor.workspaceId, sourceKey: operationKey, reason: "Coaching checkout outcome is unknown. Check the provider before creating another charge.", memberId: current.memberId, operationId: prior.id, amountCents: current.programVersion.priceCents, currency: current.programVersion.currency }, update: {} });
        return { operation: prior, reviewRequired: true };
      }
      return { operation: prior, reviewRequired: false };
    }
    const fresh = await db.coachingEnrollment.findUniqueOrThrow({ where: { id: current.id } });
    if (fresh.closedAt || !fresh.acceptedAt || fresh.programVersionId !== current.programVersionId) throw new CoachingError("The program changed. Reload it before paying.");
    const payload = JSON.parse(JSON.stringify(checkoutRequest));
    const operation = await db.financialOperation.create({ data: { workspaceId: actor.workspaceId, operationKey, requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), kind: "CHECKOUT", status: "SUBMITTED", actorUserId: actor.userId, beneficiaryMemberId: current.memberId, targetId: current.id, amountCents: current.programVersion.priceCents, currency: current.programVersion.currency, providerAccountId: stripeAccount, providerIdempotencyKey: operationKey, payload, submittedAt: new Date() } });
    return { operation, reviewRequired: false };
  });
  if (reservation.reviewRequired) throw new CoachingError("The earlier payment attempt needs owner review before another checkout can be created. No new charge was started.");
  if (reservation.operation.providerAccountId !== stripeAccount) throw new CoachingError("The payment account changed. The owner must review this attempt.");
  const session = reservation.operation.providerReference ? await stripe.checkout.sessions.retrieve(reservation.operation.providerReference, {}, { stripeAccount }) : await stripe.checkout.sessions.create(
    reservation.operation.payload as unknown as Parameters<Stripe["checkout"]["sessions"]["create"]>[0],
    { stripeAccount, idempotencyKey: reservation.operation.providerIdempotencyKey },
  );
  if (!session.url)
    throw new CoachingError("The payment page is not ready. Please try again.");
  await prisma.$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    const fresh = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: current.id },
    });
    if (
      fresh.closedAt ||
      fresh.programVersionId !== current.programVersionId ||
      fresh.memberId !== detail.memberId
    )
      throw new CoachingError(
        "Your program changed while payment was starting. Reload it before paying.",
      );
    await db.coachingEnrollment.update({
      where: { id: current.id },
      data: {
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        checkoutAccountId: stripeAccount,
        paymentState: "PENDING",
        version: { increment: 1 },
      },
    });
    await db.financialOperation.update({ where: { id: reservation.operation.id }, data: { providerReference: session.id, providerUrl: session.url, expiresAt: new Date(session.expires_at * 1000) } });
  });
  return session.url;
}

/** Provider-authoritative reconciliation. Call only after authenticated ownership or a verified Stripe webhook. */
async function reconcileCoachingPayment(
  enrollmentId: string,
): Promise<"PAID" | "PENDING"> {
  const current = await prisma.coachingEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { programVersion: true },
  });
  if (current.paymentId && current.paymentState === "PAID") return "PAID";
  if (!current.checkoutSessionId || !current.checkoutAccountId)
    return "PENDING";
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(
    current.checkoutSessionId,
    { expand: ["payment_intent"] },
    { stripeAccount: current.checkoutAccountId },
  );
  const intent =
    typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (
    session.mode !== "payment" ||
    session.client_reference_id !== current.id ||
    session.metadata?.purpose !== "coaching" ||
    session.metadata.workspaceId !== current.workspaceId ||
    session.metadata.enrollmentId !== current.id ||
    session.metadata.memberId !== current.memberId ||
    session.metadata.programVersionId !== current.programVersionId ||
    session.amount_total !== current.programVersion.priceCents ||
    session.currency !== current.programVersion.currency
  )
    throw new CoachingError(
      "The provider payment details do not match this program. The owner must review the payment.",
    );
  if (
    !intent ||
    session.payment_status !== "paid" ||
    intent.status !== "succeeded"
  )
    return "PENDING";
  if (
    intent.amount !== current.programVersion.priceCents ||
    intent.currency !== current.programVersion.currency ||
    intent.amount_received !== current.programVersion.priceCents
  )
    throw new CoachingError(
      "The provider settlement does not match this program. The owner must review the payment.",
    );
  await prisma.$transaction(async (db) => {
    await lockClassSchedule(db, current.workspaceId);
    const fresh = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: current.id },
    });
    if (fresh.paymentId) return;
    if (
      fresh.checkoutSessionId !== session.id ||
      fresh.programVersionId !== current.programVersionId
    )
      throw new CoachingError(
        "The enrollment changed. Payment requires review.",
      );
    const payment = await db.payment.create({
      data: {
        workspaceId: current.workspaceId,
        memberId: current.memberId,
        status: "SUCCEEDED",
        amountCents: intent.amount_received,
        currency: intent.currency,
        paidAt: new Date(),
        stripePaymentIntentId: intent.id,
      },
    });
    await db.coachingEnrollment.update({
      where: { id: current.id },
      data: {
        paymentId: payment.id,
        paymentState: "PAID",
        version: { increment: 1 },
        ...(fresh.closedAt
          ? {
              settlementState: "REVIEW_REQUIRED",
              settlementNote:
                "Payment arrived after closure; review refund obligations.",
            }
          : {}),
      },
    });
    await db.coachingEvent.create({
      data: {
        workspaceId: current.workspaceId,
        enrollmentId: current.id,
        operationId: `provider:${session.id}`,
        actorUserId: "stripe-provider",
        kind: "PAYMENT_VERIFIED",
        inputHash: session.id,
        resultId: payment.id,
      },
    });
    await db.financialOperation.updateMany({ where: { workspaceId: current.workspaceId, providerReference: session.id, kind: "CHECKOUT" }, data: { status: "SUCCEEDED", paymentId: payment.id, settledAt: new Date() } });
  });
  return "PAID";
}

export async function checkCoachingPayment(
  actor: CoachingActor,
  enrollmentId: string,
) {
  const detail = await getCoachingDetail(actor, enrollmentId);
  if (!detail.own)
    throw new CoachingError("Check payment from the client's own account.");
  return reconcileCoachingPayment(enrollmentId);
}

/** The caller must verify the Stripe signature before forwarding the event. */
export async function handleCoachingCheckoutWebhook(
  event: Stripe.Event,
): Promise<boolean> {
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  )
    return false;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.purpose !== "coaching") return false;
  let enrollment = await prisma.coachingEnrollment.findUnique({
    where: { checkoutSessionId: session.id },
  });
  if (!event.account) return false;
  if (enrollment?.checkoutAccountId && enrollment.checkoutAccountId !== event.account) return false;
  if (!enrollment && session.metadata?.enrollmentId) {
    const candidate = await prisma.coachingEnrollment.findUnique({ where: { id: session.metadata.enrollmentId } });
    if (!candidate || candidate.workspaceId !== session.metadata.workspaceId || candidate.memberId !== session.metadata.memberId) throw new CoachingError("The coaching checkout cannot yet be linked to its enrollment. Retry reconciliation.");
    const operation = await prisma.financialOperation.findFirst({ where: { workspaceId: candidate.workspaceId, targetId: candidate.id, kind: "CHECKOUT", providerAccountId: event.account, OR: [{ providerReference: session.id }, { providerReference: null }] }, orderBy: { createdAt: "desc" } });
    const request = operation?.payload as { metadata?: Record<string, string>; client_reference_id?: string } | undefined;
    if (!operation || request?.client_reference_id !== candidate.id || request.metadata?.enrollmentId !== candidate.id || request.metadata.programVersionId !== candidate.programVersionId) throw new CoachingError("The coaching payment request is not yet available. Retry reconciliation.");
    const retrieved = await stripeClient().checkout.sessions.retrieve(session.id, {}, { stripeAccount: event.account });
    if (retrieved.metadata?.enrollmentId !== candidate.id || retrieved.metadata.workspaceId !== candidate.workspaceId || retrieved.metadata.programVersionId !== candidate.programVersionId || retrieved.client_reference_id !== candidate.id || retrieved.amount_total !== operation.amountCents || retrieved.currency !== operation.currency) throw new CoachingError("The coaching checkout does not match its durable payment request.");
    await prisma.$transaction(async (db) => {
      await lockClassSchedule(db, candidate.workspaceId);
      const fresh = await db.coachingEnrollment.findUniqueOrThrow({ where: { id: candidate.id } });
      if (fresh.checkoutSessionId && fresh.checkoutSessionId !== session.id) throw new CoachingError("Another checkout is linked to this enrollment. Payment requires review.");
      await db.coachingEnrollment.update({ where: { id: candidate.id }, data: { checkoutSessionId: session.id, checkoutAccountId: event.account, checkoutUrl: retrieved.url, version: { increment: 1 } } });
      await db.financialOperation.update({ where: { id: operation.id }, data: { providerReference: session.id, providerUrl: retrieved.url } });
    });
    enrollment = { ...candidate, checkoutSessionId: session.id, checkoutAccountId: event.account };
  }
  if (!enrollment) throw new CoachingError("The coaching enrollment is not yet linked. Retry reconciliation.");
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const retrieved = await stripeClient().checkout.sessions.retrieve(session.id, {}, { stripeAccount: event.account });
    if (retrieved.payment_status === "paid") { await reconcileCoachingPayment(enrollment.id); return true; }
    if (event.type === "checkout.session.expired" && retrieved.status !== "expired") throw new CoachingError("Checkout expiry is not confirmed by the provider.");
    await prisma.$transaction(async (db) => {
      await lockClassSchedule(db, enrollment!.workspaceId);
      await db.coachingEnrollment.updateMany({ where: { id: enrollment!.id, checkoutSessionId: session.id, paymentState: { not: "PAID" } }, data: { paymentState: event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED", version: { increment: 1 } } });
      await db.financialOperation.updateMany({ where: { workspaceId: enrollment!.workspaceId, providerReference: session.id, status: { not: "SUCCEEDED" } }, data: { status: "FAILED", lastError: event.type === "checkout.session.expired" ? "Checkout expired before payment." : "Provider reported asynchronous payment failure." } });
    });
    return true;
  }
  await reconcileCoachingPayment(enrollment.id);
  return true;
}
