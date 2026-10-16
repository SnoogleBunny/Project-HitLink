import Link from "next/link";
import { notFound } from "next/navigation";
import { parseProgramRankPolicy, prisma } from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { RankPolicyForm, ProgressCapabilityForm } from "./rank-policy-form";
export default async function ProgramProgressSettings({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const context = await requireOwnerWorkspaceContext();
  const [program, coaches] = await Promise.all([
    prisma.program.findFirst({
      where: {
        id: programId,
        workspaceId: context.workspace.id,
        archivedAt: null,
      },
    }),
    prisma.workspaceUser.findMany({
      where: {
        workspaceId: context.workspace.id,
        role: "COACH",
        isActive: true,
      },
      include: { user: true },
    }),
  ]);
  if (!program) notFound();
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title={`${program.name} ranks`}
      description="Choose whether this program uses ranks. Promotions are recorded by authorized staff."
    >
      <Link href="/dashboard/programs" className="text-link">
        Back to programs
      </Link>
      <section className="management-card">
        <RankPolicyForm
          programId={programId}
          initial={
            parseProgramRankPolicy(program.rankPolicy) ?? {
              version: 1,
              mode: "OFF",
              ranks: [],
            }
          }
        />
      </section>
      {coaches.length ? (
        <section className="management-card form-stack">
          <h2>Coach permissions</h2>
          {coaches.map((coach) => (
            <ProgressCapabilityForm
              key={coach.id}
              programId={programId}
              coach={{
                id: coach.id,
                name: coach.user.fullName ?? coach.user.email,
                canManageProgress: coach.canManageProgress,
                canOverridePrerequisites: coach.canOverridePrerequisites,
              }}
            />
          ))}
        </section>
      ) : null}
    </AdminShell>
  );
}
