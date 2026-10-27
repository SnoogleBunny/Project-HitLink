import Link from "next/link";
import { getCoachingWorkspace, getCoachingPayerRequests } from "@flowstate/db";
import { Badge, resolveDisplayLocale } from "@flowstate/ui";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  coachingDayLabel as knownCoachingDayLabel,
  coachingLabel,
} from "../../../lib/coaching-fields";
import { coachingHref } from "./navigation";
export default async function CoachingPage() {
  const context = await requireMemberPortalContext({ scope: "account" });
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const coachingDayLabel = (value: Date) =>
    knownCoachingDayLabel(value, locale);
  const data = await getCoachingWorkspace({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const paymentRequests = await getCoachingPayerRequests({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  return (
    <MemberShell
      context={context}
      title="My coaching"
      description="Your programs and notes are private to your own account."
    >
      {paymentRequests.length ? (
        <section className="member-card">
          <h2>Payment requests</h2>
          {paymentRequests.map((request) => (
            <p key={request.id}>
              <Link href={`/app/coaching/payments/${request.id}`}>
                Review coaching payment request
              </Link>
            </p>
          ))}
        </section>
      ) : null}
      <section className="member-card">
        <h2>My programs</h2>
        {data.enrollments.length ? (
          <div className="member-stack-list">
            {data.enrollments.map((enrollment) => (
              <article className="member-stack-item" key={enrollment.id}>
                <div>
                  <h3>
                    <Link
                      href={coachingHref(
                        enrollment.id,
                        enrollment.status === "ACTIVE" ||
                          enrollment.status === "PAUSED"
                          ? "notes"
                          : "program",
                      )}
                    >
                      {enrollment.programName}
                    </Link>
                  </h3>
                  <p>
                    {enrollment.coachName} ·{" "}
                    {coachingDayLabel(enrollment.startsOn)} –{" "}
                    {coachingDayLabel(enrollment.endsOn)}
                  </p>
                </div>
                <Badge>{coachingLabel(enrollment.status)}</Badge>
              </article>
            ))}
          </div>
        ) : (
          <p>
            You have no coaching programs yet. Your gym can offer a program to
            this account.
          </p>
        )}
      </section>
    </MemberShell>
  );
}
