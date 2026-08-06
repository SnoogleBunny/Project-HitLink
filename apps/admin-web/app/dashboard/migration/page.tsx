import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  getMigrationDashboard,
  getMigrationStageLabel,
  migrationStages,
  type MigrationScheduleFailureReason,
  type OwnerMigrationResultsProjection,
} from "../../../lib/workspace-migration";
import {
  getMigrationCorrectionChannelProjection,
  type MigrationCorrectionChannelProjection,
} from "../../../lib/migration-correction-channel";
import { acknowledgeMigrationReviewAction } from "./actions";
import { MigrationAcknowledgmentForm } from "./migration-acknowledgment-form";
import { MigrationRecoveryAlert } from "./migration-recovery-alert";

const completedFlowstateResponsibility =
  "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.";

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function getLaunchStatusLabel(status: string): string {
  return status === "ACTIVE" ? "Operational" : "Pre-launch";
}

function getScheduleReviewCopy(reason: MigrationScheduleFailureReason) {
  if (reason === "schedule-passed") {
    return {
      heading: "Scheduled date passed — Flowstate review required",
      body: "The scheduled go-live date has passed, but this migration is not complete. Flowstate needs to confirm the schedule. Use the migration correction action below if your timing has changed.",
    };
  }

  if (reason === "launch-timezone-invalid") {
    return {
      heading: "Schedule needs Flowstate review",
      body: "Flowstate needs to confirm the launch timezone before the go-live schedule can be reviewed. Use the migration correction action below if your timing has changed.",
    };
  }

  return {
    heading: "Schedule needs Flowstate review",
    body: "Flowstate still needs to confirm the go-live schedule.",
  };
}

function isDateOnlyBeforeNow(args: {
  date: Date | null | undefined;
  now: Date;
  timezone: string | null | undefined;
}): boolean {
  if (!args.date || !args.timezone?.trim()) {
    return false;
  }

  try {
    const localParts = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone: args.timezone,
      year: "numeric",
    }).formatToParts(args.now);
    const values = new Map(localParts.map((part) => [part.type, part.value]));
    const todayKey = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
    const dateKey = [
      args.date.getUTCFullYear().toString().padStart(4, "0"),
      (args.date.getUTCMonth() + 1).toString().padStart(2, "0"),
      args.date.getUTCDate().toString().padStart(2, "0"),
    ].join("-");

    return dateKey < todayKey;
  } catch {
    return false;
  }
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

function MigrationResultsSection({
  results,
}: {
  results: OwnerMigrationResultsProjection;
}) {
  if (results.status === "results-in-progress") {
    return (
      <div className="command-empty-state">
        <h4>Migration results in progress</h4>
        <p>
          Flowstate is preparing and checking your migration results. No owner
          action is needed here.
        </p>
      </div>
    );
  }

  if (
    results.status === "needs-flowstate-review" ||
    results.status === "no-results-recorded"
  ) {
    return (
      <div className="command-empty-state">
        <h4>Migration results need Flowstate review</h4>
        <p>
          Flowstate is reviewing the recorded migration results before showing a
          summary. No owner action is needed.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-list">
      <div className="stack-item">
        <div className="stack-item-copy">
          <h4>Import summary</h4>
          <p className="management-copy">
            These totals include completed imports only.
          </p>
          <dl className="inline-meta">
            <div>
              <dt>Records added</dt>
              <dd>{results.recordsAdded}</dd>
            </div>
            <div>
              <dt>Records updated</dt>
              <dd>{results.recordsUpdated}</dd>
            </div>
            <div>
              <dt>Records not imported</dt>
              <dd>{results.recordsNotImported}</dd>
            </div>
          </dl>
          <p className="management-copy">
            {results.recordsNotImported === 0
              ? "All records in the completed imports were added or updated."
              : "Records marked not imported are not part of the reviewed migration snapshot."}
          </p>
          {results.earlierIncompleteAttemptCount > 0 ? (
            <p className="management-copy">
              {results.earlierIncompleteAttemptCount === 1
                ? "1 earlier import attempt did not complete and is excluded from these results."
                : `${results.earlierIncompleteAttemptCount} earlier import attempts did not complete and are excluded from these results.`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MigrationCorrectionChannel({
  projection,
}: {
  projection: MigrationCorrectionChannelProjection;
}) {
  if (projection.status === "unavailable") {
    return (
      <div className="owner-review-blocker" role="alert">
        <strong>Migration correction channel unavailable</strong>
        <p>{projection.message}</p>
      </div>
    );
  }

  return (
    <div className="owner-review-correction">
      <a className="text-link" href={projection.href}>
        {projection.label}
      </a>
      <p className="management-copy">{projection.helper}</p>
    </div>
  );
}

interface MigrationPageProps {
  searchParams: Promise<{
    reason?: string;
    review?: string;
  }>;
}

export default async function MigrationPage({
  searchParams,
}: MigrationPageProps) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const params = await searchParams;
  const pageNow = new Date();
  const dashboard = await getMigrationDashboard({
    workspaceId: workspace.id,
    now: pageNow,
  });
  const migration = dashboard.migration;
  const isCompletedOwnerReview =
    dashboard.ownerReview.status === "acknowledged" &&
    migration?.stage === "COMPLETE" &&
    workspace.status === "ACTIVE" &&
    dashboard.migrationResults.status === "ready";
  const isInconsistentCompletion =
    (migration?.stage === "COMPLETE" || workspace.status === "ACTIVE") &&
    !isCompletedOwnerReview;
  const correctionChannel = migration
    ? getMigrationCorrectionChannelProjection({
        gymDisplayName: workspace.name,
        phase:
          dashboard.ownerReview.status === "acknowledged"
            ? "post-lock"
            : "pre-lock",
      })
    : null;
  const heroTitle = isCompletedOwnerReview
    ? "Migration handoff complete"
    : isInconsistentCompletion
      ? "Migration completion needs Flowstate review"
      : migration
        ? getMigrationStageLabel(migration.stage)
        : "Migration intake not found";
  const heroDescription = isCompletedOwnerReview
    ? "Your migration handoff is complete. Daily operations are active, and no further owner review is pending."
    : isInconsistentCompletion
      ? "Flowstate must reconcile this completion record before the migration can be treated as operational. No owner action is available yet."
      : (migration?.nextOwnerAction ??
        "Complete onboarding to start the migration service.");
  const launchStatus = isInconsistentCompletion
    ? "Needs Flowstate review"
    : getLaunchStatusLabel(workspace.status);
  const scheduleReviewCopy =
    dashboard.ownerReview.status === "unavailable" &&
    dashboard.ownerReview.reason
      ? getScheduleReviewCopy(dashboard.ownerReview.reason)
      : null;
  const preferredDatePassed =
    !isCompletedOwnerReview &&
    !migration?.goLiveScheduledFor &&
    isDateOnlyBeforeNow({
      date: migration?.targetGoLiveDate,
      now: pageNow,
      timezone: migration?.workspace.location?.timezone,
    });
  const scheduledDatePassed =
    !isCompletedOwnerReview &&
    isDateOnlyBeforeNow({
      date: migration?.goLiveScheduledFor,
      now: pageNow,
      timezone: migration?.workspace.location?.timezone,
    });
  const recoveryReason = params.reason;

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Migration service"
      title="Migration handoff"
      description={
        isCompletedOwnerReview
          ? "Review the completed migration handoff and its recorded launch status."
          : "Track what Flowstate is handling, review your migration summary, and confirm it when it is ready."
      }
      actions={
        <Link className="button button-secondary" href="/dashboard">
          Daily dashboard
        </Link>
      }
    >
      {params.review === "acknowledged" ? (
        <div className="form-success" role="status" aria-live="polite">
          <strong>Owner review acknowledged.</strong>
          <p>
            {isCompletedOwnerReview
              ? "Flowstate recorded your acknowledgment. Daily operations are active, and the reviewed data snapshot remains locked."
              : "Flowstate recorded your acknowledgment. Daily operations are still pre-launch while Flowstate completes the remaining readiness checks."}
          </p>
        </div>
      ) : null}
      {params.review === "blocked" ? (
        <MigrationRecoveryAlert reason={recoveryReason} />
      ) : null}

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
              <p className="dashboard-card-label">Migration service</p>
              <h3 id="migration-title">{heroTitle}</h3>
              <p>{heroDescription}</p>
            </div>
            <dl className="migration-hero-meta">
              <div>
                <dt>Current software</dt>
                <dd>{migration.currentSoftware ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Preferred go-live</dt>
                <dd>{formatDate(migration.targetGoLiveDate)}</dd>
              </div>
              <div>
                <dt>Scheduled go-live</dt>
                <dd>
                  {migration.goLiveScheduledFor
                    ? formatDate(migration.goLiveScheduledFor)
                    : "Not scheduled"}
                </dd>
              </div>
              <div>
                <dt>Launch status</dt>
                <dd>{launchStatus}</dd>
              </div>
            </dl>
          </section>

          {preferredDatePassed ? (
            <div className="owner-review-blocker" role="status">
              <strong>Preferred date passed</strong>
              <p>
                Your preferred go-live date has passed. Flowstate still needs to
                confirm a scheduled go-live. Use the migration correction action
                below if your preferred timing has changed.
              </p>
            </div>
          ) : null}

          {scheduledDatePassed ? (
            <div className="owner-review-blocker" role="status">
              <strong>Scheduled date passed — Flowstate review required</strong>
              <p>
                The scheduled go-live date has passed, but this migration is not
                complete. Flowstate needs to confirm the schedule. Use the
                migration correction action below if your timing has changed.
              </p>
            </div>
          ) : null}

          <section className="command-panel" aria-labelledby="timeline-title">
            <div className="command-panel-header">
              <div>
                <p className="dashboard-card-label">Migration stages</p>
                <h3 id="timeline-title">Launch path</h3>
              </div>
              <span
                className={`command-status-chip ${
                  isCompletedOwnerReview
                    ? "command-status-chip-success"
                    : isInconsistentCompletion
                      ? "command-status-chip-neutral"
                      : "command-status-chip-warning"
                }`}
              >
                <span className="command-status-dot" aria-hidden="true" />
                {isCompletedOwnerReview
                  ? "Handoff complete"
                  : isInconsistentCompletion
                    ? "Flowstate review"
                    : "Launch in progress"}
              </span>
            </div>
            <div className="migration-stage-grid">
              {migrationStages.map((stage) => {
                const tone = isInconsistentCompletion
                  ? stage === migration.stage
                    ? "warning"
                    : "neutral"
                  : getStageTone(migration.stage, stage);

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
                {isCompletedOwnerReview
                  ? "The reviewed migration handoff is complete. These notes preserve the service brief that Flowstate used to prepare the workspace for daily operations."
                  : isInconsistentCompletion
                    ? "Flowstate is reviewing this completion record. Daily operations remain unavailable until the recorded readiness details are coherent."
                    : "These notes summarize the information Flowstate is migrating. Your job is to share access and review the final summary; the migration team owns the import quality and corrections."}
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

            <section className="management-card" id="owner-review">
              <p className="dashboard-card-label">Owner review</p>
              <h3>
                {isInconsistentCompletion
                  ? "Review record needs attention"
                  : dashboard.ownerReview.status === "acknowledged"
                    ? "Migration summary locked"
                    : dashboard.ownerReview.status === "blocked"
                      ? "Review not available yet"
                      : dashboard.ownerReview.status === "unavailable"
                        ? (scheduleReviewCopy?.heading ??
                          "Waiting for Flowstate review")
                        : "Review and lock migration summary"}
              </h3>
              {isInconsistentCompletion ? (
                <>
                  <p className="management-copy">
                    Flowstate must reconcile the completion and owner
                    acknowledgment records before this migration can be treated
                    as operational. No owner action is available yet.
                  </p>
                  <span className="status-pill status-pill-neutral">
                    Flowstate review required
                  </span>
                  {dashboard.ownerReview.status === "acknowledged" &&
                  correctionChannel ? (
                    <MigrationCorrectionChannel
                      projection={correctionChannel}
                    />
                  ) : null}
                </>
              ) : dashboard.ownerReview.status === "acknowledged" ? (
                <>
                  <p className="management-copy">
                    {isCompletedOwnerReview
                      ? `You acknowledged this summary on ${formatDate(migration.ownerReviewAcknowledgedAt)}. The reviewed snapshot remains locked, and daily operations are active.`
                      : `You acknowledged this summary on ${formatDate(migration.ownerReviewAcknowledgedAt)}. The reviewed snapshot cannot be changed. Daily operations remain pre-launch until Flowstate completes the remaining launch checks.`}
                  </p>
                  <div className="owner-review-status-panel">
                    <div>
                      <strong>Data snapshot locked</strong>
                      <p>
                        The migration data you reviewed is locked after
                        acknowledgment.
                      </p>
                    </div>
                    <div>
                      <strong>
                        {isCompletedOwnerReview
                          ? "Daily operations active"
                          : "Operational readiness pending"}
                      </strong>
                      {isCompletedOwnerReview ? (
                        <p>
                          Flowstate completed the readiness checks and activated
                          this workspace for daily operations.
                        </p>
                      ) : (
                        <p>
                          Flowstate must complete the remaining readiness checks
                          before daily operations can start.
                        </p>
                      )}
                    </div>
                    <p className="owner-review-launch-status">
                      Launch status:{" "}
                      <strong>
                        {isCompletedOwnerReview ? "Active" : "Pre-launch"}
                      </strong>
                    </p>
                  </div>
                  <span className="status-pill status-pill-success">
                    Acknowledged{" "}
                    {formatDate(migration.ownerReviewAcknowledgedAt)}
                  </span>
                  {correctionChannel ? (
                    <MigrationCorrectionChannel
                      projection={correctionChannel}
                    />
                  ) : null}
                </>
              ) : dashboard.ownerReview.status === "eligible" ? (
                <>
                  <p className="management-copy">
                    Check the migration summary before continuing. When you
                    acknowledge it, the reviewed snapshot is locked and
                    Flowstate cannot change these migration results.
                    Acknowledgment does not start daily operations; Flowstate
                    must complete the remaining launch checks.
                  </p>
                  {correctionChannel ? (
                    <MigrationCorrectionChannel
                      projection={correctionChannel}
                    />
                  ) : null}
                  {correctionChannel?.status === "available" ? (
                    <MigrationAcknowledgmentForm
                      action={acknowledgeMigrationReviewAction}
                    />
                  ) : null}
                </>
              ) : dashboard.ownerReview.status === "blocked" ? (
                <>
                  <div className="owner-review-blocker" role="status">
                    <strong>Waiting for Flowstate</strong>
                    <p>
                      Flowstate is completing the remaining migration checks
                      before you can acknowledge the summary. No owner action is
                      needed.
                    </p>
                  </div>
                  {correctionChannel ? (
                    <MigrationCorrectionChannel
                      projection={correctionChannel}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <p className="management-copy">
                    {scheduleReviewCopy?.body ??
                      "Flowstate is checking the migration summary and import results. No owner action is needed yet. The acknowledgment step will appear here after Flowstate schedules go-live."}
                  </p>
                  {correctionChannel ? (
                    <MigrationCorrectionChannel
                      projection={correctionChannel}
                    />
                  ) : null}
                </>
              )}
            </section>
          </div>

          <section className="command-panel" aria-labelledby="results-title">
            <div className="command-panel-header">
              <div>
                <p className="dashboard-card-label">Migration results</p>
                <h3 id="results-title">Reviewed import outcomes</h3>
              </div>
            </div>
            <MigrationResultsSection results={dashboard.migrationResults} />
          </section>

          <div className="management-grid migration-management-grid">
            <section className="management-card">
              <p className="dashboard-card-label">
                {isCompletedOwnerReview ? "Service status" : "Service approval"}
              </p>
              {isCompletedOwnerReview ? (
                <>
                  <h3>Handoff complete</h3>
                  <p className="management-copy">
                    The acknowledged migration handoff is complete. Daily
                    operations are active.
                  </p>
                  <dl className="detail-list">
                    <div>
                      <dt>Completion recorded</dt>
                      <dd>{formatDate(migration.operationallyReadyAt)}</dd>
                    </div>
                    <div>
                      <dt>Flowstate responsibility</dt>
                      <dd>{completedFlowstateResponsibility}</dd>
                    </div>
                    <div>
                      <dt>Current status</dt>
                      <dd>Daily operations are active in Flowstate.</dd>
                    </div>
                  </dl>
                  <span className="status-pill status-pill-success">
                    Handoff complete
                  </span>
                </>
              ) : isInconsistentCompletion ? (
                <>
                  <h3>Readiness record needs attention</h3>
                  <p className="management-copy">
                    Flowstate must reconcile the completion, owner
                    acknowledgment, and activation records before this handoff
                    can be treated as operational.
                  </p>
                  <span className="status-pill status-pill-neutral">
                    Flowstate review required
                  </span>
                </>
              ) : (
                <>
                  <h3>Complete handoff</h3>
                  <p className="management-copy">
                    Daily operations remain pre-launch while Flowstate completes
                    the remaining launch checks. No owner action is needed here.
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
                  <button className="button" disabled type="button">
                    Waiting for Flowstate launch checks
                  </button>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}
