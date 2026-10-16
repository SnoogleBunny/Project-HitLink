import { createHash, timingSafeEqual } from "node:crypto";
import {
  createEmailNotificationAdapter,
  expireWorkspaceDataExports,
  expireMemberDataExports,
  expireCoachingRecordExports,
  prisma,
  processNotificationOutbox,
  shouldDeliverNotification,
  reconcileCoachingDelivery,
  reconcileSourceMembershipLifecycle,
} from "@flowstate/db";
import { reconcileDueMembershipLifecycle } from "@flowstate/payments";
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
  if (cursor && (cursor.length > 150 || !/^[\w-]+$/.test(cursor)))
    return Response.json({ error: "Invalid cursor." }, { status: 400 });
  await expireWorkspaceDataExports();
  await expireMemberDataExports();
  await expireCoachingRecordExports();
  const workspace = await prisma.workspace.findFirst({
    where: {
      status: "ACTIVE",
      migration: { stage: "COMPLETE" },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!workspace) return Response.json({ done: true, nextCursor: null });
  const result: {
    nextCursor: string;
    email: unknown;
    billing: unknown;
    coaching: unknown;
  } = {
    nextCursor: workspace.id,
    email: "not_configured",
    billing: "not_configured",
    coaching: "pending",
  };
  let failed = false;
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
