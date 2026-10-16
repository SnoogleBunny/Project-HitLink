import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  Prisma,
  prisma,
  lockClassSchedule,
  lockFinancialAccount,
  requireWorkspaceDataOwner,
  WorkspaceDataError,
  type WorkspaceDataActor,
} from "@flowstate/db";
import { paymentProvider } from "./index.js";

export interface OffboardingSubscription {
  id: string;
  customerId: string;
  status: string;
  cancelAt: number | null;
  endedAt: number | null;
  workspaceId: string | null;
  openInvoiceCount: number;
}
export interface WorkspaceOffboardingGateway {
  retrievePlatform(subscriptionId: string): Promise<OffboardingSubscription>;
  stopPlatform(
    subscriptionId: string,
    at: number,
    now: number,
    key: string,
  ): Promise<void>;
  listCustomerSubscriptions(
    accountId: string,
  ): Promise<OffboardingSubscription[]>;
}
function objectId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : (value?.id ?? "");
}
export function createStripeWorkspaceOffboardingGateway(
  stripe = paymentProvider(),
): WorkspaceOffboardingGateway {
  const record = (
    sub: Stripe.Subscription,
    openInvoiceCount: number,
  ): OffboardingSubscription => ({
    id: sub.id,
    customerId: objectId(sub.customer),
    status: sub.status,
    cancelAt: sub.cancel_at,
    endedAt: sub.ended_at,
    workspaceId: sub.metadata.workspaceId ?? null,
    openInvoiceCount,
  });
  return {
    async retrievePlatform(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      let count = 0;
      for await (const invoice of stripe.invoices.list({
        subscription: subscriptionId,
        status: "open",
        limit: 100,
      }))
        if (invoice.status === "open") count++;
      return record(sub, count);
    },
    async stopPlatform(subscriptionId, at, now, key) {
      if (at <= now)
        await stripe.subscriptions.cancel(
          subscriptionId,
          { invoice_now: false, prorate: false },
          { idempotencyKey: key },
        );
      else
        await stripe.subscriptions.update(
          subscriptionId,
          { cancel_at: at, proration_behavior: "none" },
          { idempotencyKey: key },
        );
    },
    async listCustomerSubscriptions(accountId) {
      const result: OffboardingSubscription[] = [];
      for await (const sub of stripe.subscriptions.list(
        { status: "all", limit: 100 },
        { stripeAccount: accountId },
      )) {
        let count = 0;
        for await (const invoice of stripe.invoices.list(
          { subscription: sub.id, status: "open", limit: 100 },
          { stripeAccount: accountId },
        ))
          if (invoice.status === "open") count++;
        result.push(record(sub, count));
      }
      return result;
    },
  };
}
type Options = {
  db?: typeof prisma;
  gateway?: WorkspaceOffboardingGateway;
  now?: Date;
};
function stopsBy(subscription: OffboardingSubscription, end: number) {
  return (
    ["canceled", "incomplete_expired"].includes(subscription.status) ||
    (subscription.cancelAt !== null && subscription.cancelAt <= end)
  );
}
/** Register only a freshly retrieved platform subscription bound to this workspace by provider metadata. */
export async function registerWorkspacePlatformBilling(
  actor: WorkspaceDataActor,
  subscriptionId: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    gateway = options.gateway ?? createStripeWorkspaceOffboardingGateway(),
    now = options.now ?? new Date();
  await requireWorkspaceDataOwner(db, actor);
  const evidence = await gateway.retrievePlatform(subscriptionId);
  if (
    evidence.id !== subscriptionId ||
    evidence.workspaceId !== actor.workspaceId ||
    !evidence.customerId
  )
    throw new WorkspaceDataError(
      "The platform subscription is not verified for this gym. Ask the records contact to reconcile it.",
    );
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    const prior = await tx.workspacePlatformBilling.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    if (
      prior?.stripeSubscriptionId &&
      prior.stripeSubscriptionId !== evidence.id
    )
      throw new WorkspaceDataError(
        "A different platform subscription is already registered. Reconcile it before changing billing identity.",
      );
    const data = {
      stripeCustomerId: evidence.customerId,
      stripeSubscriptionId: evidence.id,
      status: "VERIFIED",
      verifiedAt: now,
      evidence: JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue,
    };
    const saved = await tx.workspacePlatformBilling.upsert({
      where: { workspaceId: actor.workspaceId },
      create: { workspaceId: actor.workspaceId, ...data },
      update: data,
    });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: "PLATFORM_BILLING_VERIFIED",
        metadata: { subscriptionId: evidence.id },
      },
    });
    return saved;
  });
}
export async function stopWorkspacePlatformBilling(
  actor: WorkspaceDataActor,
  version: number,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    gateway = options.gateway ?? createStripeWorkspaceOffboardingGateway(),
    now = options.now ?? new Date();
  const operation = await db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    await lockFinancialAccount(tx, actor.workspaceId);
    const plan = await tx.workspaceOffboarding.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    const billing = await tx.workspacePlatformBilling.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    if (
      !plan ||
      plan.version !== version ||
      !billing?.stripeSubscriptionId ||
      !billing.stripeCustomerId
    )
      throw new WorkspaceDataError(
        "Review the current plan and verify platform billing first.",
      );
    const confirmations = await tx.workspaceDataEvent.findMany({
      where: {
        workspaceId: actor.workspaceId,
        kind: "OFFBOARDING_OWNER_CONFIRMED",
      },
    });
    const owners = await tx.workspaceUser.findMany({
      where: { workspaceId: actor.workspaceId, role: "OWNER", isActive: true },
    });
    if (
      owners.some(
        (owner) =>
          !confirmations.some(
            (event) =>
              event.actorUserId === owner.userId &&
              (event.metadata as { version?: number }).version === version,
          ),
      )
    )
      throw new WorkspaceDataError(
        "Every active owner must confirm this plan before platform billing changes.",
      );
    const payload = {
      purpose: "workspace_platform_stop",
      workspaceId: actor.workspaceId,
      planId: plan.id,
      version,
      subscriptionId: billing.stripeSubscriptionId,
      customerId: billing.stripeCustomerId,
      at: Math.floor(+plan.accessEndsAt / 1000),
      requestedNow: Math.floor(+now / 1000),
    };
    const operationKey = `workspace-platform-stop:${plan.id}:${version}`;
    const prior = await tx.financialOperation.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: actor.workspaceId,
          operationKey,
        },
      },
    });
    if (prior) return prior;
    const created = await tx.financialOperation.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        operationKey,
        requestHash: createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex"),
        kind: "STOP_RENEWALS",
        targetId: actor.workspaceId,
        providerReference: billing.stripeSubscriptionId,
        providerIdempotencyKey: `hitlink:${operationKey}`,
        payload,
      },
    });
    await tx.workspacePlatformBilling.update({
      where: { workspaceId: actor.workspaceId },
      data: { operationId: created.id },
    });
    return created;
  });
  const request = operation.payload as {
    subscriptionId: string;
    customerId: string;
    at: number;
    requestedNow: number;
    version: number;
  };
  let evidence = await gateway.retrievePlatform(request.subscriptionId);
  if (
    evidence.workspaceId !== actor.workspaceId ||
    evidence.customerId !== request.customerId
  )
    throw new WorkspaceDataError(
      "Platform billing identity changed. Reconciliation is required.",
    );
  if (!stopsBy(evidence, request.at)) {
    if (
      operation.submittedAt &&
      +now - +operation.submittedAt >= 23 * 3600000
    ) {
      await db.financialOperation.update({
        where: { id: operation.id },
        data: {
          status: "REVIEW_REQUIRED",
          lastError:
            "The provider has not confirmed the old stop request. Review it before any new submission.",
        },
      });
      throw new WorkspaceDataError(
        "The platform stop request needs reconciliation; it has not been replayed.",
      );
    }
    await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, actor.workspaceId);
      await requireWorkspaceDataOwner(tx, actor);
      await lockFinancialAccount(tx, actor.workspaceId);
      const currentPlan = await tx.workspaceOffboarding.findUniqueOrThrow({
        where: { workspaceId: actor.workspaceId },
      });
      if (currentPlan.version !== request.version)
        throw new WorkspaceDataError(
          "The plan changed before provider submission. Review the current dates.",
        );
      const current = await tx.financialOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
      if (current.status === "REVIEW_REQUIRED")
        throw new WorkspaceDataError(
          "This stop request requires reconciliation before another submission.",
        );
      await tx.financialOperation.update({
        where: { id: current.id },
        data: { status: "SUBMITTED", submittedAt: current.submittedAt ?? now },
      });
    });
    await gateway.stopPlatform(
      request.subscriptionId,
      request.at,
      request.requestedNow,
      operation.providerIdempotencyKey,
    );
    evidence = await gateway.retrievePlatform(request.subscriptionId);
  }
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    await lockFinancialAccount(tx, actor.workspaceId);
    const plan = await tx.workspaceOffboarding.findUniqueOrThrow({
      where: { workspaceId: actor.workspaceId },
    });
    const confirmed =
      plan.version === request.version &&
      evidence.workspaceId === actor.workspaceId &&
      evidence.customerId === request.customerId &&
      stopsBy(evidence, request.at) &&
      evidence.openInvoiceCount === 0;
    const stopsAt = new Date(
      (evidence.endedAt ?? evidence.cancelAt ?? request.at) * 1000,
    );
    await tx.financialOperation.update({
      where: { id: operation.id },
      data: {
        status: confirmed ? "SUCCEEDED" : "REVIEW_REQUIRED",
        settledAt: confirmed ? now : null,
        result: JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue,
      },
    });
    await tx.workspacePlatformBilling.update({
      where: { workspaceId: actor.workspaceId },
      data: {
        status: confirmed ? "STOP_CONFIRMED" : "REVIEW_REQUIRED",
        stopsAt: confirmed ? stopsAt : null,
        verifiedAt: now,
        evidence: JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue,
      },
    });
    await tx.workspaceOffboarding.update({
      where: { id: plan.id },
      data: { platformBillingConfirmedAt: confirmed ? now : null },
    });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: confirmed
          ? "PLATFORM_STOP_CONFIRMED"
          : "PLATFORM_STOP_REVIEW_REQUIRED",
        metadata: { operationId: operation.id, subscriptionId: evidence.id },
      },
    });
    return {
      status: confirmed ? "STOP_CONFIRMED" : "REVIEW_REQUIRED",
      stopsAt,
    };
  });
}
/** Customer subscriptions are stopped through their accepted membership lifecycle; this check never silently cancels them. */
export async function verifyWorkspaceCustomerBilling(
  actor: WorkspaceDataActor,
  version: number,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    gateway = options.gateway ?? createStripeWorkspaceOffboardingGateway(),
    now = options.now ?? new Date();
  await requireWorkspaceDataOwner(db, actor);
  const [settings, plan] = await Promise.all([
    db.workspaceStripeSettings.findUnique({
      where: { workspaceId: actor.workspaceId },
    }),
    db.workspaceOffboarding.findUnique({
      where: { workspaceId: actor.workspaceId },
    }),
  ]);
  if (!plan || plan.version !== version)
    throw new WorkspaceDataError(
      "Review the current plan before checking customer renewals.",
    );
  if (!settings?.stripeAccountId)
    throw new WorkspaceDataError(
      "Customer billing has no verified processor account. Reconcile its absence before offboarding.",
    );
  const subscriptions = await gateway.listCustomerSubscriptions(
    settings.stripeAccountId,
  );
  if (
    subscriptions.some(
      (sub) =>
        !stopsBy(sub, Math.floor(+plan.accessEndsAt / 1000)) ||
        sub.openInvoiceCount > 0,
    )
  )
    throw new WorkspaceDataError(
      "Customer renewals or invoice balances remain open. Use the accepted membership cancellation and billing workflows to resolve them.",
    );
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    await lockFinancialAccount(tx, actor.workspaceId);
    const current = await tx.workspaceOffboarding.findUniqueOrThrow({
      where: { workspaceId: actor.workspaceId },
    });
    if (current.version !== version)
      throw new WorkspaceDataError(
        "The offboarding plan changed during processor verification.",
      );
    const currentSettings = await tx.workspaceStripeSettings.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    if (currentSettings?.stripeAccountId !== settings.stripeAccountId)
      throw new WorkspaceDataError(
        "The processor account changed during verification. Check the new account before continuing.",
      );
    const linked = await tx.memberMembership.findMany({
      where: {
        workspaceId: actor.workspaceId,
        stripeSubscriptionId: { not: null },
      },
      select: { stripeSubscriptionId: true, stripeCustomerId: true },
    });
    if (
      linked.some(
        (member) =>
          !subscriptions.some(
            (sub) =>
              sub.id === member.stripeSubscriptionId &&
              sub.customerId === member.stripeCustomerId,
          ),
      )
    )
      throw new WorkspaceDataError(
        "A linked customer subscription is missing from processor evidence. Reconciliation is required.",
      );
    await tx.workspaceOffboarding.update({
      where: { id: current.id },
      data: {
        customerBillingEvidence: {
          verifiedAt: now.toISOString(),
          version,
          accountId: settings.stripeAccountId,
          subscriptions: JSON.parse(
            JSON.stringify(subscriptions),
          ) as Prisma.InputJsonValue,
        },
      },
    });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: "CUSTOMER_RENEWALS_STOP_VERIFIED",
        metadata: {
          version,
          accountId: settings.stripeAccountId,
          count: subscriptions.length,
        },
      },
    });
    return { status: "VERIFIED", count: subscriptions.length };
  });
}
