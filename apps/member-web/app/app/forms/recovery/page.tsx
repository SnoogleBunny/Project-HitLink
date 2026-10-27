import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  prisma,
  listBookingFormRecoveries,
  addDays,
  getWorkspaceDateString,
} from "@flowstate/db";
import { resolveDisplayLocale } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import { listEligibleSelfServiceOccurrences } from "../../../../lib/self-service-bookings";
import { FormRecoveryChoices, FormRecoveryFeedback } from "./recovery-form";
export default async function FormRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; history?: string }>;
}) {
  const context = await requireMemberPortalContext({ permission: "book" });
  const query = await searchParams,
    locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const cases = await listBookingFormRecoveries({
    db: prisma,
    workspaceId: context.workspace.id,
    actorUserId: context.session.userId,
    memberId: context.member.id,
    after: query.after,
    history: query.history === "1",
  });
  const today = getWorkspaceDateString(new Date(), context.location.timezone);
  const schedule = await listEligibleSelfServiceOccurrences({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
    locale,
    fromDate: today,
    toDate: addDays(today, 55),
  });
  const replacements = schedule.occurrences
    .filter((row) => row.bookingState === "AVAILABLE")
    .map((row) => ({
      value: `${row.classTemplateId}|${row.scheduledForDate}`,
      label: `${row.displayTitle} · ${row.dateLabel} · ${row.timeLabel}`,
    }));
  const format = (value: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: context.location.timezone,
    }).format(new Date(value));
  return (
    <MemberShell
      context={context}
      title="Form-related booking recovery"
      description="Review accepted bookings affected by a later gym requirement. Signing and money authority remain separate."
    >
      <FormRecoveryFeedback>
        <section className="member-card">
          <Link href="/app/forms">Review current and scheduled forms</Link>
          <p className="member-copy">
            A valid new acceptance before class can resolve its form obstacle.
            Refund review remains open until the payment outcome is verified.
          </p>
          {!cases.items.length ? (
            <p>
              No {query.history === "1" ? "recorded" : "open"} form recoveries
              for this participant.
            </p>
          ) : (
            <div className="member-stack-list">
              {cases.items.map((item) => (
                <article key={item.id} className="member-stack-item">
                  <div className="member-stack-copy">
                    <h3>
                      {item.booking.classTemplate.title ??
                        item.booking.classTemplate.program.name}
                    </h3>
                    <p>
                      {format(item.serviceAt)} ·{" "}
                      {item.state.toLowerCase().replaceAll("_", " ")}
                    </p>
                    <p>
                      {item.requirementRevision.formDocument.name}, requirement
                      revision {item.requirementRevision.version}, effective{" "}
                      {format(item.requirementRevision.effectiveAt)}.
                    </p>
                    <p>
                      Named reviewer:{" "}
                      {item.assignedTo.user.fullName ??
                        item.assignedTo.user.email}
                      .
                    </p>
                    {item.remedyAvailable ? (
                      <FormRecoveryChoices
                        memberId={context.member.id}
                        recoveryId={item.id}
                        version={item.version}
                        operationId={randomUUID()}
                        replacements={replacements}
                      />
                    ) : (
                      <p>
                        {item.state === "REFUND_REVIEW"
                          ? "The money review remains open. No completed refund is claimed."
                          : "This recovery no longer has an open booking action. Its history remains recorded."}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {cases.nextCursor ? (
            <Link
              href={`/app/forms/recovery?after=${encodeURIComponent(cases.nextCursor)}${query.history === "1" ? "&history=1" : ""}`}
            >
              Next recoveries
            </Link>
          ) : null}
          <p>
            <Link href="/app/forms/recovery?history=1">
              Include recovery history
            </Link>
          </p>
        </section>
      </FormRecoveryFeedback>
    </MemberShell>
  );
}
