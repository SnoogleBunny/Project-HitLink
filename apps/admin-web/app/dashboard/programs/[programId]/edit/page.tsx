import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@hitlink/db";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { archiveProgramAction } from "../../actions";
import { ProgramEditForm } from "../../program-edit-form";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{
    programId: string;
  }>;
}) {
  const { programId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      workspaceId: workspace.id,
    },
  });

  if (!program) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Programs"
      title={`Edit ${program.name}`}
      description="Keep program details simple for now so class templates can depend on them next."
      actions={
        <Link className="button button-secondary" href="/dashboard/programs">
          Back to programs
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Program details</p>
          <h3>Update settings</h3>
          <ProgramEditForm program={program} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Lifecycle</p>
          <h3>Archive program</h3>
          <p className="management-copy">
            Archived programs stay out of future schedule builders and keep
            their names reserved.
          </p>

          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{program.archivedAt ? "Archived" : "Unarchived"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(program.createdAt)}</dd>
            </div>
            <div>
              <dt>Archived at</dt>
              <dd>{program.archivedAt ? formatDate(program.archivedAt) : "Not archived"}</dd>
            </div>
          </dl>

          {program.archivedAt ? (
            <p className="empty-state">
              This program is already archived. Restore is intentionally deferred
              until a later slice.
            </p>
          ) : (
            <form action={archiveProgramAction} className="inline-form">
              <input name="programId" type="hidden" value={program.id} />
              <button className="button button-danger" type="submit">
                Archive program
              </button>
            </form>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
