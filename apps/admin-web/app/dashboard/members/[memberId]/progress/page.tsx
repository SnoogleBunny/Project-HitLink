import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMemberProgramProgress,
  getWorkspaceDateString,
  prisma,
  ProgramProgressError,
} from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import { PromotionForm, EligibilityExceptionForm } from "./promotion-form";
export default async function MemberProgress({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ classTemplateId?: string; date?: string }>;
}) {
  const { memberId } = await params,
    query = await searchParams,
    context = await requireOperationsWorkspaceContext(),
    actor = {
      workspaceId: context.workspace.id,
      userId: context.session.userId,
    };
  let progress;
  try {
    progress = await getMemberProgramProgress(actor, memberId);
  } catch (error) {
    if (error instanceof ProgramProgressError) notFound();
    throw error;
  }
  const [member, coaches, viewer] = await Promise.all([
    prisma.member.findFirst({
      where: { id: memberId, workspaceId: context.workspace.id },
      select: { fullName: true },
    }),
    prisma.workspaceUser.findMany({
      where: {
        workspaceId: context.workspace.id,
        isActive: true,
        role: { in: ["OWNER", "COACH"] },
      },
      include: { user: true },
    }),
    prisma.workspaceUser.findUnique({ where: { id: context.workspaceUserId } }),
  ]);
  if (!member) notFound();
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title={`${member.fullName} · Progress`}
      description="Manual promotion decisions and their history."
    >
      {context.workspaceUserRole === "OWNER" ? (
        <Link href={`/dashboard/members/${memberId}`} className="text-link">
          Back to member
        </Link>
      ) : (
        <Link href="/dashboard" className="text-link">
          Back to today
        </Link>
      )}
      {query.classTemplateId &&
      query.date &&
      (viewer?.role === "OWNER" || viewer?.canOverridePrerequisites) ? (
        <section className="management-card">
          <EligibilityExceptionForm
            memberId={memberId}
            classTemplateId={query.classTemplateId}
            date={query.date}
          />
        </section>
      ) : null}
      {!progress.length ? (
        <section className="management-card">
          <p>No rank system is enabled for this gym’s programs.</p>
        </section>
      ) : (
        progress.map((program) => (
          <section key={program.id} className="management-card form-stack">
            <h2>{program.name}</h2>
            <p>
              Current rank:{" "}
              {program.history[0]
                ? `${program.history[0].rankName} · ${program.history[0].stripeCount} stripes`
                : "Unranked"}
            </p>
            {program.canRecord ? (
              <PromotionForm
                memberId={memberId}
                programId={program.id}
                ranks={program.policy.ranks}
                coaches={coaches.map((coach) => ({
                  id: coach.id,
                  name: coach.user.fullName ?? coach.user.email,
                }))}
                today={getWorkspaceDateString(
                  new Date(),
                  context.location.timezone,
                )}
              />
            ) : null}
            {program.history.map((entry) => (
              <article className="stack-item" key={entry.id}>
                <div>
                  <h3>
                    {entry.rankName} · {entry.stripeCount} stripes
                  </h3>
                  <p>
                    {entry.effectiveOn} · Awarded by {entry.awardedBy}
                  </p>
                  {entry.publicNote ? <p>{entry.publicNote}</p> : null}
                  {"internalNote" in entry && entry.internalNote ? (
                    <p>Internal: {entry.internalNote}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ))
      )}
    </AdminShell>
  );
}
