import Link from "next/link";
import { prisma } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";

export default async function EmailDeliveryPage() {
  const context = await requireOwnerWorkspaceContext();
  const [failed, pending, jobs] = await Promise.all([
    prisma.notificationJob.count({
      where: {
        workspaceId: context.workspace.id,
        status: "FAILED",
        nextAttemptAt: null,
      },
    }),
    prisma.notificationJob.count({
      where: {
        workspaceId: context.workspace.id,
        status: { in: ["PENDING", "SENDING", "FAILED"] },
        nextAttemptAt: { not: null },
      },
    }),
    prisma.notificationJob.findMany({
      where: { workspaceId: context.workspace.id, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        recipientEmail: true,
        attempts: true,
        nextAttemptAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const connected = Boolean(
    process.env.RESEND_API_KEY &&
    process.env.HITLINK_EMAIL_FROM &&
    process.env.HITLINK_WORKER_SECRET,
  );
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Email delivery"
      description="Check queued messages and delivery problems."
    >
      <Link href="/dashboard/settings" className="text-link">
        Back to settings
      </Link>
      {!connected && (
        <section className="management-card">
          <h2>Email delivery is not connected</h2>
          <p>
            Messages stay queued until delivery is set up. Contact your HitLink
            administrator to connect email and scheduled processing.
          </p>
        </section>
      )}
      <section className="management-card">
        <h2>
          {failed
            ? `${failed} ${failed === 1 ? "message needs" : "messages need"} attention`
            : "No messages need manual review"}
        </h2>
        <p>
          {pending} queued or awaiting another delivery attempt. A provider
          receipt confirms acceptance, not arrival in an inbox.
        </p>
        {failed > 0 && (
          <p>
            Check the recipient address and contact your HitLink administrator
            with the message reference. Confirm whether the original was
            accepted before sending it again.
          </p>
        )}
      </section>
      <section className="management-card">
        <h2>Recent delivery problems</h2>
        {jobs.length ? (
          <div className="form-stack">
            {jobs.map((job) => (
              <article className="record-card" key={job.id}>
                <h3>{job.subject}</h3>
                <p>{job.recipientEmail}</p>
                <p>
                  {job.nextAttemptAt ? "Retry scheduled" : "Needs review"} ·{" "}
                  {job.attempts} delivery{" "}
                  {job.attempts === 1 ? "attempt" : "attempts"}
                </p>
                <p>
                  Reference: <code>{job.id}</code>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p>No failed deliveries to show.</p>
        )}
      </section>
    </AdminShell>
  );
}
