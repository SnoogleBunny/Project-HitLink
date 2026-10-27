import { encodeGraceMaintenanceCursor, encodeReminderMaintenanceCursor, parseMaintenanceCursor } from "./grace-cursor";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createEmailNotificationAdapter,
  expireWorkspaceDataExports,
  expireMemberDataExports,
  expireCoachingRecordExports,
  prisma,
  isWorkspaceOperationallyReady,
  processNotificationOutbox,
  processAccountSetupNotificationOutbox,
  processWorkspaceWaitlists,
  processMembershipGraceDisposition,
  processClassBookingReminders,
  processFormRequirementWarnings,
  shouldDeliverNotification,
  reconcileCoachingDelivery,
  reconcileSourceMembershipLifecycle,
} from "@flowstate/db";
import {
  reconcileDueMembershipLifecycle,
  reconcileWorkspacePaymentDisputes,
} from "@flowstate/payments";
import {
  cleanupPublicAuthThrottleBuckets,
  processPasswordRecoveryOutbox,
} from "@flowstate/auth";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.HITLINK_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return Response.json(
      { error: "Background processing is not configured." },
      { status: 503 },
    );
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(token), digest(secret)))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const cursor = new URL(request.url).searchParams.get("cursor");
  const position = parseMaintenanceCursor(cursor);
  if (!position)
    return Response.json({ error: "Invalid cursor." }, { status: 400 });
  let failed = false;
  let accountRecovery: unknown;
  if (!cursor) {
    try {
      await cleanupPublicAuthThrottleBuckets({ limit: 500 });
    } catch {
      failed = true;
    }
  }
  let accountSetup: unknown;
  if (!cursor && process.env.RESEND_API_KEY && process.env.HITLINK_EMAIL_FROM) {
    try {
      accountRecovery = await processPasswordRecoveryOutbox({
        adapter: createEmailNotificationAdapter({
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.HITLINK_EMAIL_FROM,
        }),
        limit: 5,
      });
    } catch {
      accountRecovery = "retry_required";
      failed = true;
    }
  }
  if (!cursor && process.env.RESEND_API_KEY && process.env.HITLINK_EMAIL_FROM) {
    try {
      accountSetup = await processAccountSetupNotificationOutbox({
        db: prisma,
        adapter: createEmailNotificationAdapter({
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.HITLINK_EMAIL_FROM,
        }),
        limit: 5,
      });
    } catch {
      accountSetup = "retry_required";
      failed = true;
    }
  }
  await expireWorkspaceDataExports();
  await expireMemberDataExports();
  await expireCoachingRecordExports();
  const workspace = await prisma.workspace.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { migration: { stage: "COMPLETE" } },
        { setupActivation: { isNot: null } },
      ],
      ...(position.grace ? { id: position.grace.workspaceId } : position.reminders ? { id: position.reminders.workspaceId } : position.afterWorkspaceId ? { id: { gt: position.afterWorkspaceId } } : {}),
    },
    orderBy: { id: "asc" },
    include: { migration: true, setupActivation: true },
  });
  if (!workspace && (position.grace || position.reminders)) return Response.json({ nextCursor: position.grace?.workspaceId ?? position.reminders!.workspaceId }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  if (!workspace)
    return Response.json(
      {
        done: !failed,
        nextCursor: null,
        ...(accountRecovery !== undefined ? { accountRecovery } : {}),
        ...(accountSetup !== undefined ? { accountSetup } : {}),
      },
      { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  if (
    !isWorkspaceOperationallyReady({
      workspaceStatus: workspace.status,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
      setupActivation: workspace.setupActivation,
    })
  )
    return Response.json(
      {
        nextCursor: workspace.id,
        skipped: "workspace_not_ready",
        ...(accountRecovery !== undefined ? { accountRecovery } : {}),
        ...(accountSetup !== undefined ? { accountSetup } : {}),
      },
      { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  const result: {
    nextCursor: string;
    email: unknown;
    billing: unknown;
    coaching: unknown;
    waitlist: unknown;
    disputes: unknown;
    forms: unknown;
    grace: unknown;
    reminders?: unknown;
    accountRecovery?: unknown;
    accountSetup?: unknown;
  } = {
    nextCursor: workspace.id,
    email: "not_configured",
    billing: "not_configured",
    coaching: "pending",
    waitlist: "pending",
    disputes: "not_configured",
    forms: "not_configured",
    grace: position.reminders ? "completed_before_reminder_continuation" : "pending",
    ...(accountRecovery !== undefined ? { accountRecovery } : {}),
    ...(accountSetup !== undefined ? { accountSetup } : {}),
  };
  if (!position.reminders) try {
    const grace = await processMembershipGraceDisposition({ db: prisma, workspaceId: workspace.id, afterBookingId: position.grace?.afterBookingId, throughBookingId: position.grace?.throughBookingId, limit: 100 });
    result.grace = grace;
    if (grace.workspaceNotReady) return Response.json({ ...result, nextCursor: workspace.id, skipped: "workspace_not_ready" }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
    if (grace.nextBookingId) return Response.json({ ...result, nextCursor: encodeGraceMaintenanceCursor(workspace.id, grace.nextBookingId, grace.throughBookingId!) }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ...result, ...(position.grace ? { nextCursor: cursor } : {}), grace: "retry_required" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const reminders = await processClassBookingReminders({ db: prisma, workspaceId: workspace.id, limit: 100, cursor: position.reminders?.cursor });
    result.reminders = reminders;
    if (reminders.workspaceNotReady) return Response.json({ ...result, nextCursor: workspace.id, skipped: "workspace_not_ready" }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
    if (reminders.nextCursor) return Response.json({ ...result, nextCursor: encodeReminderMaintenanceCursor(workspace.id, reminders.nextCursor) }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ...result, nextCursor: position.reminders ? cursor : encodeReminderMaintenanceCursor(workspace.id), reminders: "retry_required" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const portalOrigin = process.env.NEXT_PUBLIC_MEMBER_WEB_URL ?? process.env.NEXT_PUBLIC_MEMBER_APP_URL;
    if (portalOrigin) result.forms = await processFormRequirementWarnings({ db: prisma, workspaceId: workspace.id, portalOrigin, limit: 100 });
  } catch {
    result.forms = "retry_required";
    failed = true;
  }
  try {
    if (process.env.STRIPE_SECRET_KEY)
      result.disputes = await reconcileWorkspacePaymentDisputes({
        workspaceId: workspace.id,
      });
  } catch {
    result.disputes = "retry_required";
    failed = true;
  }
  try {
    result.waitlist = await processWorkspaceWaitlists(workspace.id);
  } catch {
    result.waitlist = "retry_required";
    failed = true;
  }
  try {
    result.coaching = await reconcileCoachingDelivery(workspace.id);
  } catch {
    result.coaching = "retry_required";
    failed = true;
  }
  if (process.env.RESEND_API_KEY && process.env.HITLINK_EMAIL_FROM) {
    try {
      result.email = await processNotificationOutbox({
        db: prisma,
        workspaceId: workspace.id,
        adapter: createEmailNotificationAdapter({
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.HITLINK_EMAIL_FROM,
        }),
        limit: 5,
        shouldSend: (job) => shouldDeliverNotification(job),
      });
    } catch {
      result.email = "retry_required";
      failed = true;
    }
  }
  try {
    // The provider sweep already includes source changes. Run the source-only
    // sweep without Stripe so reviewed access boundaries still take effect.
    const configured = !!process.env.STRIPE_SECRET_KEY;
    const reconciled = configured
      ? await reconcileDueMembershipLifecycle({
          workspaceId: workspace.id,
          limit: 10,
        })
      : await reconcileSourceMembershipLifecycle({
          workspaceId: workspace.id,
          limit: 10,
        });
    result.billing = {
      reconciled: reconciled.length,
      ...(!configured ? { provider: "not_configured" } : {}),
    };
  } catch {
    result.billing = "retry_required";
    failed = true;
  }
  return Response.json(result, {
    status: failed ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
