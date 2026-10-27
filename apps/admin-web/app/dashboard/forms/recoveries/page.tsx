import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  prisma,
  listBookingFormRecoveries,
  listClassOccurrences,
  addDays,
  getWorkspaceDateString,
  formatMinutesAsTime,
} from "@flowstate/db";
import { resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { OwnerFormRecoveryChoices } from "../recovery-form";
export default async function OwnerFormRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; history?: string }>;
}) {
  const { session, workspace } = await requireOwnerWorkspaceContext(),
    query = await searchParams;
  const cases = await listBookingFormRecoveries({
    db: prisma,
    workspaceId: workspace.id,
    actorUserId: session.userId,
    after: query.after,
    history: query.history === "1",
  });
  const timezone = workspace.location?.timezone ?? "UTC",
    today = getWorkspaceDateString(new Date(), timezone),
    locale = resolveDisplayLocale(workspace.settings?.locale);
  const classes = await listClassOccurrences({
    workspaceId: workspace.id,
    fromDate: today,
    toDate: addDays(today, 55),
  });
  const replacements = classes
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({
      value: `${row.classTemplateId}|${row.scheduledForDate}`,
      label: `${row.displayTitle} · ${row.scheduledForDate} · ${formatMinutesAsTime(row.startTimeMinutes)}`,
    }));
  const format = (at: string | Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(at));
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Forms"
      title="Accepted booking recovery"
      description="Resolve commitments stranded by a later published requirement, preserving consent and original funding."
      actions={
        <Link className="button button-secondary" href="/dashboard/forms">
          Forms
        </Link>
      }
    >
      <section className="management-card">
        <p>
          {cases.items.length
            ? "Each affected commitment keeps a named owner and attributable history."
            : "No matching recovery cases."}
        </p>
        <div className="stack-list">
          {cases.items.map((item) => (
            <article className="stack-item" key={item.id}>
              <div className="stack-item-copy">
                <h3>
                  {item.booking.member.fullName} ·{" "}
                  {item.booking.classTemplate.title ??
                    item.booking.classTemplate.program.name}
                </h3>
                <p>
                  {format(item.serviceAt)} ·{" "}
                  {item.state.toLowerCase().replaceAll("_", " ")}
                </p>
                <p>
                  {item.requirementRevision.formDocument.name}, requirement
                  revision {item.requirementRevision.version}. Named reviewer:{" "}
                  {item.assignedTo.user.fullName ?? item.assignedTo.user.email}.
                </p>
                {item.financialReviewCaseId ? (
                  <p>
                    <Link
                      href={`/dashboard/billing/reviews/${item.financialReviewCaseId}`}
                    >
                      Open the separate payment review
                    </Link>
                  </p>
                ) : null}
                {item.remedyAvailable || item.state === "REFUND_REVIEW" ? (
                  <OwnerFormRecoveryChoices
                    recoveryId={item.id}
                    version={item.version}
                    state={item.state}
                    operationId={randomUUID()}
                    replacements={replacements}
                  />
                ) : (
                  <p>
                    This case is retained as history; no open booking mutation
                    is available.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
        {cases.nextCursor ? (
          <Link
            href={`/dashboard/forms/recoveries?after=${encodeURIComponent(cases.nextCursor)}${query.history === "1" ? "&history=1" : ""}`}
          >
            Next recoveries
          </Link>
        ) : null}
        <p>
          <Link href="/dashboard/forms/recoveries?history=1">
            Include recovery history
          </Link>
        </p>
      </section>
    </AdminShell>
  );
}
