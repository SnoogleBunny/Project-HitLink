import { ClassReminderSettingsForm } from "./reminder-form";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma, getClassReminderSettings } from "@flowstate/db";
import { Money } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { retryEmailDeliveryAction } from "./actions";

export default async function EmailDeliveryPage({
  searchParams,
}: { searchParams?: Promise<{ queued?: string; error?: string }> } = {}) {
  const context = await requireOwnerWorkspaceContext();
  const [failed, pending, jobs, confirmations, feedback, reminders] = await Promise.all([
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
      where: { workspaceId: context.workspace.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        recipientEmail: true,
        attempts: true,
        nextAttemptAt: true,
        updatedAt: true,
        status: true,
        context: true,
        providerMessageId: true,
        lastError: true,
      },
    }),
    prisma.paymentConfirmation.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        payerAccount: { select: { user: { select: { email: true } } } },
      },
    }),
    searchParams ?? Promise.resolve({} as { queued?: string; error?: string }),
    getClassReminderSettings({ workspaceId: context.workspace.id, userId: context.session.userId }),
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
      {feedback.queued === "1" ? (
        <p role="status">
          The same message is queued for another delivery attempt. No charge,
          credit or booking was repeated.
        </p>
      ) : null}
      {feedback.error ? <p role="alert">{feedback.error}</p> : null}
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
        <h2>Class and trial reminders</h2>
        <p>New gyms start with reminders 24 hours before class and trial bookings. You can change the interval or turn reminders off. Saving a setting records the change; it does not confirm inbox delivery.</p>
        <ClassReminderSettingsForm version={reminders.version} leadMinutes={reminders.leadMinutes} />
      </section>
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
        <h2>Recent delivery activity</h2>
        {jobs.length ? (
          <div className="form-stack">
            {jobs.map((job) => {
              const deliveryContext = job.context as {
                kind?: string;
                confirmationId?: string;
              } | null;
              const freshLinkRequired =
                !deliveryContext?.kind ||
                [
                  "STAFF_INVITE",
                  "WORKSPACE_SETUP",
                  "PUBLIC_VERIFICATION",
                  "COACHING_VERIFICATION",
                  "COACHING_PAYER_VERIFICATION",
                ].includes(deliveryContext.kind);
              return (
                <article className="record-card" key={job.id}>
                  <h3>{job.subject}</h3>
                  <p>{job.recipientEmail}</p>
                  <p>
                    {job.status === "SENT"
                      ? "Accepted by provider"
                      : job.status === "CANCELLED"
                        ? "Superseded or expired"
                        : job.nextAttemptAt
                          ? "Retry scheduled or in progress"
                          : "Needs review"}{" "}
                    · {job.attempts} delivery{" "}
                    {job.attempts === 1 ? "attempt" : "attempts"}
                  </p>
                  <p>
                    Reference: <code>{job.id}</code>
                  </p>
                  {job.providerMessageId ? (
                    <p>
                      Provider reference: <code>{job.providerMessageId}</code>
                    </p>
                  ) : null}
                  {job.lastError ? <p>{job.lastError}</p> : null}
                  {deliveryContext?.kind === "PAYMENT_CONFIRMATION" &&
                  deliveryContext.confirmationId ? (
                    <Link
                      className="text-link"
                      href={`/dashboard/billing/receipts/${encodeURIComponent(deliveryContext.confirmationId)}`}
                    >
                      View payment confirmation
                    </Link>
                  ) : null}
                  {job.status === "FAILED" && !job.nextAttemptAt ? (
                    freshLinkRequired ? (
                      <p>
                        This message needs a fresh invitation or a current
                        supported notification. Reissue it from its original
                        workflow.
                      </p>
                    ) : (
                      <form
                        action={retryEmailDeliveryAction}
                        className="form-stack"
                      >
                        <input
                          type="hidden"
                          name="notificationJobId"
                          value={job.id}
                        />
                        <input
                          type="hidden"
                          name="updatedAt"
                          value={job.updatedAt.toISOString()}
                        />
                        <input
                          type="hidden"
                          name="operationId"
                          value={randomUUID()}
                        />
                        <label className="field">
                          <span>Reason for retry</span>
                          <input name="reason" required maxLength={500} />
                        </label>
                        <p>
                          The same message and provider reference will be
                          reused. If an earlier response was lost, another email
                          can arrive; this never repeats the business action.
                        </p>
                        <button
                          type="submit"
                          className="button button-secondary"
                        >
                          Retry delivery
                        </button>
                      </form>
                    )
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p>No delivery activity to show.</p>
        )}
      </section>
      <section className="management-card" id="payment-confirmations">
        <h2>Recent payment confirmations</h2>
        <p>
          Copies are sent only to the verified payer. These records remain
          separate from delivery status.
        </p>
        {confirmations.length ? (
          <div className="stack-list">
            {confirmations.map((item) => (
              <article className="record-card" key={item.id}>
                <p>
                  {item.payerAccount.user.email} ·{" "}
                  <Money
                    amountMinor={item.amountMinor}
                    currency={item.currency}
                  />
                </p>
                <Link
                  href={`/dashboard/billing/receipts/${encodeURIComponent(item.id)}`}
                  className="text-link"
                >
                  View payment confirmation
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p>No verified payment confirmations yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
