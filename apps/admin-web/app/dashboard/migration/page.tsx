import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  getMigrationDashboard,
  getMigrationStageLabel,
  migrationRecordKindOptions,
  migrationStages,
} from "../../../lib/workspace-migration";
import { markMigrationReadyAction, runMigrationImportAction } from "./actions";
import { MigrationStageForm } from "./migration-stage-form";
import { MigrationUploadForm } from "./migration-upload-form";

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function formatDateInput(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function getLaunchStatusLabel(status: string): string {
  return status === "ACTIVE" ? "Operational" : "Pre-launch";
}

function getJobTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "COMPLETED") {
    return "success";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "danger";
  }

  if (status === "MAPPED") {
    return "warning";
  }

  return "info";
}

function getStageTone(
  currentStage: string,
  stage: string,
): "success" | "warning" | "neutral" {
  const currentIndex = migrationStages.indexOf(
    currentStage as (typeof migrationStages)[number],
  );
  const stageIndex = migrationStages.indexOf(
    stage as (typeof migrationStages)[number],
  );

  if (stageIndex < currentIndex || currentStage === "COMPLETE") {
    return "success";
  }

  if (stageIndex === currentIndex) {
    return "warning";
  }

  return "neutral";
}

export default async function MigrationPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const dashboard = await getMigrationDashboard({
    workspaceId: workspace.id,
  });
  const migration = dashboard.migration;

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Migration service"
      title="Migration handoff"
      description="A shared view of the owner handoff and the internal workbench Flowstate uses to stage, validate, reconcile, and approve launch readiness."
      actions={
        <Link className="button button-secondary" href="/dashboard">
          Daily dashboard
        </Link>
      }
    >
      {!migration ? (
        <section className="command-panel">
          <p className="dashboard-card-label">No migration record</p>
          <h3>This gym is already operational or predates migration intake.</h3>
          <p className="management-copy">
            New owner accounts create a migration record during onboarding. Use
            the normal admin areas for this gym.
          </p>
        </section>
      ) : (
        <>
          <section className="migration-hero" aria-labelledby="migration-title">
            <div className="migration-hero-copy">
              <p className="dashboard-card-label">
                Included white-glove migration
              </p>
              <h3 id="migration-title">
                {getMigrationStageLabel(migration.stage)}
              </h3>
              <p>{migration.nextOwnerAction}</p>
            </div>
            <dl className="migration-hero-meta">
              <div>
                <dt>Current software</dt>
                <dd>{migration.currentSoftware ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Target go-live</dt>
                <dd>{formatDate(migration.targetGoLiveDate)}</dd>
              </div>
              <div>
                <dt>Launch status</dt>
                <dd>{getLaunchStatusLabel(workspace.status)}</dd>
              </div>
            </dl>
          </section>

          <section className="command-panel" aria-labelledby="timeline-title">
            <div className="command-panel-header">
              <div>
                <p className="dashboard-card-label">Migration stages</p>
                <h3 id="timeline-title">Launch path</h3>
              </div>
              <span className="command-status-chip command-status-chip-warning">
                <span className="command-status-dot" aria-hidden="true" />
                Operator approval
              </span>
            </div>
            <div className="migration-stage-grid">
              {migrationStages.map((stage) => {
                const tone = getStageTone(migration.stage, stage);

                return (
                  <div
                    key={stage}
                    className={`migration-stage-card migration-stage-card-${tone}`}
                  >
                    <span
                      className={`command-status-dot command-status-dot-${tone}`}
                    />
                    <strong>{getMigrationStageLabel(stage)}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="management-grid migration-management-grid">
            <section className="management-card">
              <p className="dashboard-card-label">Owner handoff</p>
              <h3>Service brief</h3>
              <p className="management-copy">
                These notes are the requirements and pricing context Flowstate
                uses internally. The owner&apos;s job is to share access; the
                migration team owns the import quality.
              </p>
              <dl className="detail-list">
                <div>
                  <dt>Members</dt>
                  <dd>{migration.memberCountEstimate ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Billing</dt>
                  <dd>{migration.billingStatus ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>{migration.scheduleComplexity ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Forms</dt>
                  <dd>{migration.formsAndWaivers ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Access notes</dt>
                  <dd>{migration.accessInstructions ?? "Not set"}</dd>
                </div>
              </dl>
              <div className="command-chip-row">
                {migration.dataScope.length === 0 ? (
                  <span className="command-status-chip command-status-chip-neutral">
                    <span className="command-status-dot" aria-hidden="true" />
                    No scope selected
                  </span>
                ) : (
                  migration.dataScope.map((scope) => (
                    <span
                      key={scope}
                      className="command-status-chip command-status-chip-info"
                    >
                      <span className="command-status-dot" aria-hidden="true" />
                      {scope}
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="management-card">
              <p className="dashboard-card-label">Internal workbench</p>
              <h3>Stage export</h3>
              <MigrationUploadForm recordKinds={migrationRecordKindOptions} />
            </section>
          </div>

          <section className="command-panel" aria-labelledby="jobs-title">
            <div className="command-panel-header">
              <div>
                <p className="dashboard-card-label">Import jobs</p>
                <h3 id="jobs-title">Staging and reconciliation</h3>
              </div>
            </div>

            {dashboard.importJobs.length === 0 ? (
              <div className="command-empty-state">
                <h4>No exports uploaded yet</h4>
                <p>
                  Internal operators can upload canonical CSVs after the owner
                  shares exports or access instructions.
                </p>
              </div>
            ) : (
              <div className="stack-list">
                {dashboard.importJobs.map((job) => (
                  <article key={job.id} className="stack-item">
                    <div className="stack-item-copy">
                      <div className="stack-item-heading">
                        <h4>{job.name}</h4>
                        <span
                          className={`status-pill status-pill-${getJobTone(
                            job.status,
                          )}`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <dl className="inline-meta">
                        <div>
                          <dt>Staged</dt>
                          <dd>{job.stagedCount}</dd>
                        </div>
                        <div>
                          <dt>Ready</dt>
                          <dd>{job.readyCount}</dd>
                        </div>
                        <div>
                          <dt>Imported</dt>
                          <dd>{job.importedCount}</dd>
                        </div>
                      </dl>
                      <div className="command-chip-row">
                        <span className="command-status-chip command-status-chip-danger">
                          <span
                            className="command-status-dot"
                            aria-hidden="true"
                          />
                          {job.issueCounts.ERROR} errors
                        </span>
                        <span className="command-status-chip command-status-chip-warning">
                          <span
                            className="command-status-dot"
                            aria-hidden="true"
                          />
                          {job.issueCounts.WARNING} warnings
                        </span>
                        <span className="command-status-chip command-status-chip-info">
                          <span
                            className="command-status-dot"
                            aria-hidden="true"
                          />
                          {job.issueCounts.INFO} notes
                        </span>
                      </div>
                      {job.validationIssues.length > 0 ? (
                        <ul className="callout-list">
                          {job.validationIssues.map((issue) => (
                            <li key={issue.id}>
                              {issue.severity}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {job.reconciliationReports[0] ? (
                        <p className="management-copy">
                          Latest reconciliation:{" "}
                          {JSON.stringify(job.reconciliationReports[0].summary)}
                        </p>
                      ) : null}
                    </div>

                    <div className="stack-item-actions">
                      <form action={runMigrationImportAction}>
                        <input
                          name="importJobId"
                          type="hidden"
                          value={job.id}
                        />
                        <button
                          className="button button-secondary"
                          disabled={
                            job.status !== "VALIDATED" || job.readyCount === 0
                          }
                          type="submit"
                        >
                          Run import
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="management-grid migration-management-grid">
            <section className="management-card">
              <p className="dashboard-card-label">Operator controls</p>
              <h3>Update service status</h3>
              <MigrationStageForm
                currentStage={migration.stage}
                expectedNextMilestone={migration.expectedNextMilestone}
                flowstateResponsibility={migration.flowstateResponsibility}
                goLiveScheduledFor={formatDateInput(
                  migration.goLiveScheduledFor,
                )}
                nextOwnerAction={migration.nextOwnerAction}
                stages={migrationStages.map((stage) => ({
                  value: stage,
                  label: getMigrationStageLabel(stage),
                }))}
              />
            </section>

            <section className="management-card">
              <p className="dashboard-card-label">Service approval</p>
              <h3>Complete handoff</h3>
              <p className="management-copy">
                Internal operators have the final say. Completing the handoff
                activates daily operations and queues an owner notification for
                review readiness.
              </p>
              <dl className="detail-list">
                <div>
                  <dt>Operationally ready</dt>
                  <dd>{formatDate(migration.operationallyReadyAt)}</dd>
                </div>
                <div>
                  <dt>Flowstate responsibility</dt>
                  <dd>{migration.flowstateResponsibility}</dd>
                </div>
                <div>
                  <dt>Next milestone</dt>
                  <dd>{migration.expectedNextMilestone ?? "Not set"}</dd>
                </div>
              </dl>
              <form action={markMigrationReadyAction}>
                <button
                  className="button"
                  disabled={Boolean(migration.operationallyReadyAt)}
                  type="submit"
                >
                  Complete handoff and notify owner
                </button>
              </form>
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}
