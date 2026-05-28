import Link from "next/link";
import { prisma } from "@flowstate/db";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { ProgramCreateForm } from "./program-create-form";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

export default async function ProgramsPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [programs, archivedPrograms] = await Promise.all([
    prisma.program.findMany({
      where: {
        workspaceId: workspace.id,
        archivedAt: null,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.program.findMany({
      where: {
        workspaceId: workspace.id,
        archivedAt: {
          not: null,
        },
      },
      orderBy: {
        archivedAt: "desc",
      },
    }),
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Programs"
      title="Program management"
      description="Create the programs that the next schedule slice will attach to class templates."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create program</p>
          <h3>New program</h3>
          <p className="management-copy">
            Keep this lightweight for now: name, optional labels, and progress
            tracking.
          </p>
          <ProgramCreateForm />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Active programs</p>
          <h3>Ready for schedule setup</h3>
          <p className="management-copy">
            Only unarchived programs should be available when class templates
            arrive in the next slice.
          </p>

          {programs.length === 0 ? (
            <p className="empty-state">
              No programs yet. Create the first one to prepare for weekly
              schedule setup.
            </p>
          ) : (
            <div className="stack-list">
              {programs.map((program) => (
                <article key={program.id} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{program.name}</h4>
                      <span className="status-pill status-pill-success">
                        Live
                      </span>
                    </div>
                    <p>
                      {program.description ||
                        "No description yet. This program can still be used in scheduling."}
                    </p>
                    <dl className="inline-meta">
                      <div>
                        <dt>Age label</dt>
                        <dd>{program.ageGroupLabel ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Level</dt>
                        <dd>{program.levelLabel ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Progress</dt>
                        <dd>
                          {program.progressTrackingEnabled ? "Enabled" : "Off"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <Link
                    className="button button-secondary"
                    href={`/dashboard/programs/${program.id}/edit`}
                  >
                    Edit program
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Archived programs</p>
        <h3>Kept out of future scheduling</h3>

        {archivedPrograms.length === 0 ? (
          <p className="empty-state">
            No archived programs yet. Archived programs stay reserved by name and
            out of schedule builders.
          </p>
        ) : (
          <div className="stack-list">
            {archivedPrograms.map((program) => (
              <article key={program.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{program.name}</h4>
                    <span className="status-pill">Archived</span>
                  </div>
                  <p>
                    Archived on{" "}
                    {program.archivedAt
                      ? formatDate(program.archivedAt)
                      : "an earlier date"}
                    .
                  </p>
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/programs/${program.id}/edit`}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
