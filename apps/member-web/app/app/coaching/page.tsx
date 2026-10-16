import Link from "next/link";
import { getCoachingWorkspace } from "@flowstate/db";
import { Badge } from "@flowstate/ui";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { coachingDay, coachingLabel } from "../../../lib/coaching-fields";
export default async function CoachingPage() {
  const context = await requireMemberPortalContext({ scope: "account" });
  const data = await getCoachingWorkspace({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  return (
    <MemberShell
      context={context}
      title="My coaching"
      description="Your programs and notes are private to your own account."
    >
      <section className="member-card">
        <h2>My programs</h2>
        {data.enrollments.length ? (
          <div className="member-stack-list">
            {data.enrollments.map((enrollment) => (
              <article className="member-stack-item" key={enrollment.id}>
                <div>
                  <h3>
                    <Link href={`/app/coaching/${enrollment.id}`}>
                      {enrollment.programName}
                    </Link>
                  </h3>
                  <p>
                    {enrollment.coachName} · {coachingDay(enrollment.startsOn)}{" "}
                    – {coachingDay(enrollment.endsOn)}
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
