import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import { requireActiveStaffAccessTx } from "./staff-access.js";
import { enqueueNotificationJob } from "./notification-outbox.js";
import { shouldDeliverNotification } from "./notification-context.js";
import {
  financialRequestHash,
  queueFinancialReview,
} from "./financial-operations.js";

type Tx = Prisma.TransactionClient;
export class PaymentConfirmationError extends Error {}
export interface PaymentConfirmationSnapshot {
  version: 1;
  businessName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  beneficiaryName: string | null;
  description: string;
  invoiceNumber: string | null;
  providerReference: string;
  timezone: string;
  locale: string;
}
const hash = financialRequestHash;
const label = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, 240);
export function readPaymentConfirmationSnapshot(
  value: unknown,
): PaymentConfirmationSnapshot {
  const v = value as Partial<PaymentConfirmationSnapshot> | null;
  if (
    !v ||
    Object.keys(v).sort().join(",") !==
      [
        "version",
        "businessName",
        "contactEmail",
        "contactPhone",
        "beneficiaryName",
        "description",
        "invoiceNumber",
        "providerReference",
        "timezone",
        "locale",
      ]
        .sort()
        .join(",") ||
    v.version !== 1 ||
    ![
      v.businessName,
      v.description,
      v.providerReference,
      v.timezone,
      v.locale,
    ].every((item) => typeof item === "string" && item.length > 0) ||
    ![v.contactEmail, v.contactPhone, v.beneficiaryName, v.invoiceNumber].every(
      (item) => item === null || typeof item === "string",
    )
  )
    throw new PaymentConfirmationError(
      "This payment confirmation needs review.",
    );
  return v as PaymentConfirmationSnapshot;
}
function portalLink(id: string) {
  const configured =
    process.env.NEXT_PUBLIC_MEMBER_APP_URL ??
    process.env.NEXT_PUBLIC_MEMBER_WEB_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return null;
    return `${url.origin}/app/billing/receipts/${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}
export function formatPaymentConfirmation(args: {
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: Date;
  snapshot: unknown;
}) {
  const snapshot = readPaymentConfirmationSnapshot(args.snapshot);
  const formatter = new Intl.NumberFormat(snapshot.locale, {
    style: "currency",
    currency: args.currency.toUpperCase(),
  });
  const amount = formatter.format(
    args.amountMinor /
      10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2),
  );
  const paidAt = new Intl.DateTimeFormat(snapshot.locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: snapshot.timezone,
  }).format(args.paidAt);
  return {
    snapshot,
    amount,
    paidAt,
    body: [
      `Payment received by ${snapshot.businessName}`,
      `${amount} · ${paidAt}`,
      snapshot.description,
      snapshot.beneficiaryName ? `For: ${snapshot.beneficiaryName}` : null,
      snapshot.invoiceNumber ? `Invoice: ${snapshot.invoiceNumber}` : null,
      `Payment reference: ${snapshot.providerReference}`,
      `Confirmation: ${args.id}`,
      "This confirms money received. Service access and any subsequent refunds are shown separately in your account.",
      portalLink(args.id),
      snapshot.contactEmail ? `Contact: ${snapshot.contactEmail}` : null,
      snapshot.contactPhone,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Called only from verified settlement transactions, never from a return page or mail worker. */
export async function issuePaymentConfirmationTx(
  tx: Tx,
  args: { paymentId: string; description: string; now?: Date },
) {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: args.paymentId },
    include: {
      payerAccount: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      member: { select: { fullName: true } },
      invoice: { select: { invoiceNumber: true } },
      workspace: { include: { settings: true, location: true } },
    },
  });
  if (
    payment.source !== "CURRENT" ||
    !["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status) ||
    !payment.paidAt ||
    !payment.stripePaymentIntentId ||
    !Number.isSafeInteger(payment.amountCents) ||
    payment.amountCents <= 0
  )
    return null;
  const existing = await tx.paymentConfirmation.findUnique({
    where: { paymentId: payment.id },
  });
  if (existing) return existing;
  const payer = payment.payerAccount;
  if (!payer || payer.workspaceId !== payment.workspaceId) {
    await queueFinancialReview(tx, {
      workspaceId: payment.workspaceId,
      sourceKey: `payment-confirmation:${payment.id}`,
      memberId: payment.memberId,
      payerAccountId: payment.payerAccountId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      reason:
        "Payment received without a verified payer account. Review receipt attribution; no alternative contact was emailed.",
    });
    return null;
  }
  let locale = payment.workspace.settings?.locale ?? "en-CA";
  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    locale = "en-CA";
  }
  const snapshot: PaymentConfirmationSnapshot = {
    version: 1,
    businessName: label(payment.workspace.name),
    contactEmail: payment.workspace.settings?.contactEmail ?? null,
    contactPhone: payment.workspace.settings?.contactPhone ?? null,
    beneficiaryName: payment.member?.fullName ?? null,
    description: label(args.description) || "Payment",
    invoiceNumber: payment.invoice?.invoiceNumber ?? null,
    providerReference: payment.stripePaymentIntentId,
    timezone: await resolveWorkspaceClockTimezone({
      workspaceId: payment.workspaceId,
      baselineTimezone: payment.workspace.location?.timezone ?? "UTC",
      now: payment.paidAt,
      db: tx as unknown as PrismaClient,
    }),
    locale,
  };
  const created = await tx.paymentConfirmation.createMany({
    data: [
      {
        workspaceId: payment.workspaceId,
        paymentId: payment.id,
        payerAccountId: payer.id,
        payerUserId: payer.userId,
        amountMinor: payment.amountCents,
        currency: payment.currency.toLowerCase(),
        paidAt: payment.paidAt,
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
        snapshotHash: hash(snapshot),
      },
    ],
    skipDuplicates: true,
  });
  const confirmation = await tx.paymentConfirmation.findUniqueOrThrow({
    where: { paymentId: payment.id },
  });
  const rendered = formatPaymentConfirmation(confirmation);
  await enqueueNotificationJob({
    db: tx as unknown as PrismaClient,
    now: args.now,
    input: {
      workspaceId: payment.workspaceId,
      templateKind: "ANNOUNCEMENT",
      recipientEmail: payer.user.email,
      recipientName: payer.user.fullName,
      subject: `Payment confirmation · ${rendered.snapshot.businessName}`,
      body: rendered.body,
      dedupeKey: `payment-confirmation:${payment.id}`,
      context: {
        kind: "PAYMENT_CONFIRMATION",
        confirmationId: confirmation.id,
        snapshotHash: confirmation.snapshotHash,
        payerUserId: payer.userId,
      },
    },
  });
  if (created.count)
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: payment.workspaceId,
        kind: "PAYMENT_CONFIRMATION_CREATED",
        metadata: {
          confirmationId: confirmation.id,
          paymentId: payment.id,
          payerAccountId: payer.id,
          snapshotHash: confirmation.snapshotHash,
        },
      },
    });
  return confirmation;
}

export type ConfirmationActor = {
  workspaceId: string;
  userId: string;
  kind: "OWNER" | "PAYER";
};
async function authorizedConfirmation(
  tx: Tx,
  actor: ConfirmationActor,
  id: string,
) {
  if (actor.kind === "OWNER")
    await requireActiveStaffAccessTx(tx, {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      capability: "OWNER",
    });
  else if (
    !(await tx.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        role: "CUSTOMER",
        isActive: true,
      },
      select: { id: true },
    }))
  )
    throw new PaymentConfirmationError("Payment confirmation not found.");
  const confirmation = await tx.paymentConfirmation.findFirst({
    where: {
      id,
      workspaceId: actor.workspaceId,
      ...(actor.kind === "PAYER"
        ? {
            payerUserId: actor.userId,
            payerAccount: {
              workspaceId: actor.workspaceId,
              userId: actor.userId,
            },
          }
        : {}),
    },
    include: {
      payment: { select: { refundedAmountCents: true, status: true } },
      payerAccount: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
    },
  });
  if (!confirmation)
    throw new PaymentConfirmationError("Payment confirmation not found.");
  if (
    hash(readPaymentConfirmationSnapshot(confirmation.snapshot)) !==
    confirmation.snapshotHash
  )
    throw new PaymentConfirmationError(
      "This payment confirmation needs review.",
    );
  return confirmation;
}
export async function getPaymentConfirmation(args: {
  actor: ConfirmationActor;
  confirmationId: string;
  db?: PrismaClient;
}) {
  return (args.db ?? prisma).$transaction((tx) =>
    authorizedConfirmation(tx, args.actor, args.confirmationId),
  );
}
function operation(value: string) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(value))
    throw new PaymentConfirmationError("Reload this form before trying again.");
}
async function priorOperation(
  tx: Tx,
  workspaceId: string,
  kind: string,
  operationId: string,
  inputHash: string,
) {
  const event = await tx.workspaceDataEvent.findFirst({
    where: {
      workspaceId,
      kind,
      metadata: { path: ["operationId"], equals: operationId },
    },
  });
  if (
    event &&
    (event.metadata as { inputHash?: string }).inputHash !== inputHash
  )
    throw new PaymentConfirmationError(
      "This request changed. Reload before trying again.",
    );
  return event;
}
export async function queuePaymentConfirmationCopy(args: {
  actor: ConfirmationActor;
  confirmationId: string;
  operationId: string;
  db?: PrismaClient;
  now?: Date;
}) {
  operation(args.operationId);
  return (args.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, args.actor.workspaceId);
    const confirmation = await authorizedConfirmation(
      tx,
      args.actor,
      args.confirmationId,
    );
    const payer = confirmation.payerAccount;
    if (payer.userId !== confirmation.payerUserId)
      throw new PaymentConfirmationError(
        "The payer account changed. Review before sending another copy.",
      );
    if (
      !(await tx.workspaceUser.findFirst({
        where: {
          workspaceId: args.actor.workspaceId,
          userId: payer.userId,
          role: "CUSTOMER",
          isActive: true,
        },
        select: { id: true },
      }))
    )
      throw new PaymentConfirmationError(
        "The payer account cannot receive a copy. Review its access first.",
      );
    const inputHash = hash({
      confirmationId: confirmation.id,
      actorUserId: args.actor.userId,
      recipient: payer.user.email.toLowerCase(),
    });
    const kind = "PAYMENT_CONFIRMATION_COPY_QUEUED";
    const prior = await priorOperation(
      tx,
      args.actor.workspaceId,
      kind,
      args.operationId,
      inputHash,
    );
    if (prior)
      return {
        notificationJobId: (prior.metadata as { notificationJobId: string })
          .notificationJobId,
      };
    const rendered = formatPaymentConfirmation(confirmation);
    const result = await enqueueNotificationJob({
      db: tx as unknown as PrismaClient,
      now: args.now,
      input: {
        workspaceId: args.actor.workspaceId,
        templateKind: "ANNOUNCEMENT",
        recipientEmail: payer.user.email,
        recipientName: payer.user.fullName,
        subject: `Payment confirmation · ${rendered.snapshot.businessName}`,
        body: rendered.body,
        dedupeKey: `payment-confirmation-copy:${confirmation.id}:${args.operationId}`,
        context: {
          kind: "PAYMENT_CONFIRMATION",
          confirmationId: confirmation.id,
          snapshotHash: confirmation.snapshotHash,
          payerUserId: confirmation.payerUserId,
        },
      },
    });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: args.actor.workspaceId,
        actorUserId: args.actor.userId,
        kind,
        metadata: {
          operationId: args.operationId,
          inputHash,
          confirmationId: confirmation.id,
          notificationJobId: result.notificationJobId,
          snapshotHash: confirmation.snapshotHash,
        },
      },
    });
    return result;
  });
}

export async function retryFailedNotification(args: {
  workspaceId: string;
  actorUserId: string;
  notificationJobId: string;
  expectedUpdatedAt: Date;
  operationId: string;
  reason: string;
  db?: PrismaClient;
  now?: Date;
}) {
  operation(args.operationId);
  const reason = args.reason.trim();
  if (
    !reason ||
    reason.length > 500 ||
    !Number.isFinite(args.expectedUpdatedAt.getTime())
  )
    throw new PaymentConfirmationError(
      "Add a reason and reload the current delivery record.",
    );
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    const selected = await tx.notificationJob.findFirst({ where: { id: args.notificationJobId, workspaceId: args.workspaceId }, select: { context: true } });
    if ((selected?.context as { kind?: string } | null)?.kind === "CLASS_SERVICE_NOTICE") {
      const { lockMembershipGraceResourcesTx } = await import("./membership-grace-disposition.js");
      await lockMembershipGraceResourcesTx(tx, args.workspaceId);
    }
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.actorUserId,
      capability: "OWNER",
    });
    const kind = "NOTIFICATION_RETRY_REQUESTED";
    const inputHash = hash({
      actorUserId: args.actorUserId,
      id: args.notificationJobId,
      updatedAt: args.expectedUpdatedAt.toISOString(),
      reason,
    });
    if (
      await priorOperation(
        tx,
        args.workspaceId,
        kind,
        args.operationId,
        inputHash,
      )
    )
      return { status: "queued" as const };
    const job = await tx.notificationJob.findFirst({
      where: { id: args.notificationJobId, workspaceId: args.workspaceId },
    });
    const context = job?.context as { kind?: string } | null;
    if (
      !job ||
      job.status !== "FAILED" ||
      job.nextAttemptAt ||
      job.updatedAt.getTime() !== args.expectedUpdatedAt.getTime() ||
      !job.body ||
      !context?.kind ||
      [
        "STAFF_INVITE",
        "WORKSPACE_SETUP",
        "PUBLIC_VERIFICATION",
        "COACHING_VERIFICATION",
        "COACHING_PAYER_VERIFICATION",
      ].includes(context.kind) ||
      (job.expiresAt && job.expiresAt <= now) ||
      job.attemptLimit >= 1000 ||
      !(context.kind === "CLASS_SERVICE_NOTICE"
        ? await (await import("./class-booking-notifications.js")).canRetryClassBookingNotice(job, tx, args.now)
        : await shouldDeliverNotification(job, tx as unknown as PrismaClient, now))
    )
      throw new PaymentConfirmationError(
        "This delivery changed, expired, or needs a fresh message. Reload before retrying.",
      );
    const attemptLimit = Math.min(
      1000,
      Math.max(job.attemptLimit, job.attempts) + 6,
    );
    const updated = await tx.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: args.workspaceId,
        status: "FAILED",
        updatedAt: args.expectedUpdatedAt,
        attempts: job.attempts,
        attemptLimit: job.attemptLimit,
        nextAttemptAt: null,
      },
      data: { attemptLimit, nextAttemptAt: now, lastError: null },
    });
    if (!updated.count)
      throw new PaymentConfirmationError(
        "This delivery changed. Reload before retrying.",
      );
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: args.workspaceId,
        actorUserId: args.actorUserId,
        kind,
        metadata: {
          operationId: args.operationId,
          inputHash,
          notificationJobId: job.id,
          previousAttempts: job.attempts,
          attemptLimit,
          reason,
        },
      },
    });
    return { status: "queued" as const };
  });
}
