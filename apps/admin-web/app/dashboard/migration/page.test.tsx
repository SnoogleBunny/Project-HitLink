import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMigrationDashboardMock, requireOwnerWorkspaceContextMock } =
  vi.hoisted(() => ({
    getMigrationDashboardMock: vi.fn(),
    requireOwnerWorkspaceContextMock: vi.fn(),
  }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../_components/admin-shell", () => ({
  AdminShell: ({ children }: PropsWithChildren) => <main>{children}</main>,
}));

vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../lib/workspace-migration", () => ({
  getMigrationDashboard: getMigrationDashboardMock,
  getMigrationStageLabel: (stage: string) =>
    ({
      INTAKE_RECEIVED: "Intake received",
      EXPORTS_NEEDED: "Exports needed",
      MIGRATION_IN_PROGRESS: "Migration in progress",
      REVIEW_READY: "Review ready",
      GO_LIVE_SCHEDULED: "Go-live scheduled",
      COMPLETE: "Complete",
    })[stage] ?? stage,
  migrationStages: [
    "INTAKE_RECEIVED",
    "EXPORTS_NEEDED",
    "MIGRATION_IN_PROGRESS",
    "REVIEW_READY",
    "GO_LIVE_SCHEDULED",
    "COMPLETE",
  ],
}));

vi.mock("./actions", () => ({
  acknowledgeMigrationReviewAction: vi.fn(),
}));

vi.mock("./migration-recovery-alert", () => ({
  MigrationRecoveryAlert: ({ reason }: { reason?: string }) => (
    <div role="alert" tabIndex={-1}>
      Migration recovery alert: {reason}
    </div>
  ),
}));

const completedAt = new Date("2026-07-25T12:05:00.000Z");
const acknowledgedAt = new Date("2026-07-25T12:00:00.000Z");

function buildMigration(stage: string) {
  return {
    stage,
    nextOwnerAction:
      stage === "COMPLETE"
        ? "Your migration is ready for review. Flowstate has activated daily operations for launch readiness."
        : "Share export access or handoff instructions so Flowstate can prepare your migration service.",
    currentSoftware: "Zen Planner",
    targetGoLiveDate: new Date("2026-07-30T00:00:00.000Z"),
    goLiveScheduledFor: new Date("2026-07-31T00:00:00.000Z"),
    memberCountEstimate: null,
    billingStatus: null,
    scheduleComplexity: null,
    formsAndWaivers: null,
    accessInstructions: null,
    dataScope: [],
    ownerReviewAcknowledgedAt: stage === "COMPLETE" ? acknowledgedAt : null,
    operationallyReadyAt: stage === "COMPLETE" ? completedAt : null,
    flowstateResponsibility:
      stage === "COMPLETE"
        ? "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations."
        : "Flowstate will collect exports, stage records, validate the import, reconcile issues, and coordinate go-live.",
    expectedNextMilestone:
      stage === "COMPLETE"
        ? "Owner review and daily operations in Flowstate."
        : "Flowstate will confirm the migration review schedule after access or exports are received.",
    workspace: {
      location: { timezone: "America/Vancouver" },
    },
  };
}

async function renderMigrationPage(args: {
  workspaceStatus: "ACTIVE" | "SETUP_INCOMPLETE";
  stage: string;
  ownerReviewStatus: "acknowledged" | "blocked" | "eligible" | "unavailable";
  ownerReviewReason?:
    | "launch-timezone-invalid"
    | "schedule-missing"
    | "schedule-passed";
  migrationOverrides?: Record<string, unknown>;
  migrationResults?: Record<string, unknown>;
  importJobs?: unknown[];
  searchParams?: {
    reason?: string;
    review?: string;
  };
}) {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  requireOwnerWorkspaceContextMock.mockResolvedValue({
    session: { id: "session_1" },
    workspace: {
      id: "workspace_1",
      name: "Demo Flowstate Gym",
      status: args.workspaceStatus,
    },
  });
  getMigrationDashboardMock.mockResolvedValue({
    migration: { ...buildMigration(args.stage), ...args.migrationOverrides },
    ownerReview:
      args.ownerReviewStatus === "blocked"
        ? {
            status: "blocked",
            blockingValidationIssueCount: 1,
            unresolvedJobCount: 1,
          }
        : {
            status: args.ownerReviewStatus,
            ...(args.ownerReviewReason
              ? { reason: args.ownerReviewReason }
              : {}),
          },
    migrationResults:
      args.migrationResults ??
      (args.stage === "COMPLETE"
        ? {
            status: "ready",
            recordsAdded: 1,
            recordsUpdated: 0,
            recordsNotImported: 0,
            earlierIncompleteAttemptCount: 0,
          }
        : { status: "results-in-progress" }),
    importJobs: args.importJobs ?? [],
  });

  const { default: MigrationPage } = await import("./page");
  const page = await MigrationPage({
    searchParams: Promise.resolve(args.searchParams ?? {}),
  });
  return renderToStaticMarkup(page);
}

describe("migration page copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "corrections@example.test",
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders a completed handoff as owner-safe history without technical import data", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "ACTIVE",
      stage: "COMPLETE",
      ownerReviewStatus: "acknowledged",
      migrationOverrides: {
        targetGoLiveDate: new Date("2026-05-30T00:00:00.000Z"),
        goLiveScheduledFor: new Date("2026-05-30T00:00:00.000Z"),
        flowstateResponsibility:
          "Unlimited free amendments and guaranteed launch support.",
      },
      importJobs: [
        {
          id: "raw-job",
          name: "malicious-file-name.csv",
          status: "COMPLETED",
          recordKind: "MEMBER",
          failureReason: "full_name is required.",
          reconciliationReports: [
            { summary: { created: 999, recordKind: "MEMBER" } },
          ],
        },
      ],
    });

    expect(html).toContain("Daily operations are active");
    expect(html).toContain("Handoff complete");
    expect(html).toContain("Migration service");
    expect(html).toContain("Preferred go-live");
    expect(html).toContain("Scheduled go-live");
    expect(html).toContain("Completion recorded");
    expect(html).toContain(
      "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
    );
    expect(html).toContain("Import summary");
    expect(html).toContain("Records added");
    expect(html).toContain(">1<");
    expect(html).toContain("Records updated");
    expect(html).toContain("Records not imported");
    expect(html).toContain(
      "All records in the completed imports were added or updated.",
    );
    expect(html).toContain("Migration summary locked");
    expect(html).toContain("The reviewed snapshot remains locked");
    expect(html).toContain("Email a problem with the locked summary");
    expect(html).toContain(
      "Send to corrections@example.test. The locked summary cannot be edited from this page.",
    );
    expect(html).toContain("mailto:corrections%40example.test");
    expect(html).not.toContain("Included");
    expect(html).not.toContain("Import jobs");
    expect(html).not.toContain("Staging and reconciliation");
    expect(html).not.toContain("COMPLETED");
    expect(html).not.toContain("MEMBER");
    expect(html).not.toContain("recordKind");
    expect(html).not.toContain("full_name");
    expect(html).not.toContain("Latest reconciliation");
    expect(html).not.toContain("malicious-file-name.csv");
    expect(html).not.toContain("full_name is required.");
    expect(html).not.toContain("{");
    expect(html).not.toContain("Scheduled date passed");
    expect(html).not.toContain("Operator approval");
    expect(html).not.toContain("ready for review");
    expect(html).not.toContain("operations stay inactive");
    expect(html).not.toContain("No exports uploaded yet");
    expect(html).not.toContain("notify the owner");
    expect(html).not.toContain("migration amendments");
    expect(html).not.toContain("Unlimited free amendments");
    expect(html).not.toContain("launch support");
    expect(html).not.toContain("Owner review and daily operations");
  });

  it("requires explicit consent before an eligible owner can lock the snapshot", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "eligible",
    });

    expect(html).toContain("Review and lock migration summary");
    expect(html).toContain("the reviewed snapshot is locked");
    expect(html).toContain("cannot change these migration results");
    expect(html).toContain("does not start daily operations");
    expect(html).toContain("remaining launch checks");
    expect(html).toContain("Email a correction before acknowledging");
    expect(html).toContain(
      "Send to corrections@example.test. This opens your email app. Describe only which part of the summary looks wrong.",
    );
    expect(html).toContain("mailto:corrections%40example.test");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("required");
    expect(html).toContain(
      "I understand that acknowledging locks this reviewed snapshot and does not start daily operations.",
    );
    expect(html).toContain("Acknowledge and lock summary");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Acknowledge and lock summary<\/button>/,
    );
  });

  it("fails an eligible review closed when the correction channel is invalid", async () => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "one@example.test,two@example.test",
    );

    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "eligible",
    });

    expect(html).toContain(
      "The migration correction channel is unavailable. Do not acknowledge this summary. Flowstate must make the contact channel available before owner review can continue.",
    );
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("withholds acknowledgment while Flowstate completes remaining checks", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "blocked",
    });

    expect(html).toContain(
      "Flowstate is completing the remaining migration checks before you can acknowledge the summary. No owner action is needed.",
    );
    expect(html).toContain("Email a correction before acknowledging");
    expect(html).not.toContain("Acknowledge and lock summary");
    expect(html).not.toContain("blocking import issue");
  });

  it("fails a missing scheduled date closed with Flowstate review guidance", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "unavailable",
      ownerReviewReason: "schedule-missing",
      migrationOverrides: { goLiveScheduledFor: null },
    });

    expect(getMigrationDashboardMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      now: new Date("2026-07-27T12:00:00.000Z"),
    });
    expect(html).toContain("Scheduled go-live");
    expect(html).toContain("Not scheduled");
    expect(html).toContain("Schedule needs Flowstate review");
    expect(html).toContain(
      "Flowstate still needs to confirm the go-live schedule.",
    );
    expect(html).toContain("Email a correction before acknowledging");
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("preserves a stale schedule-passed reason for the focused recovery alert", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "unavailable",
      ownerReviewReason: "schedule-passed",
      migrationOverrides: {
        goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
      },
      searchParams: {
        review: "blocked",
        reason: "schedule-passed",
      },
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Migration recovery alert: schedule-passed");
    expect(html).toContain("Email a correction before acknowledging");
    expect(html).toContain("mailto:corrections%40example.test");
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("warns when an incomplete migration has a passed preferred date but no schedule", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "INTAKE_RECEIVED",
      ownerReviewStatus: "unavailable",
      migrationOverrides: {
        targetGoLiveDate: new Date("2026-07-25T00:00:00.000Z"),
        goLiveScheduledFor: null,
      },
    });

    expect(html).toContain(
      "Your preferred go-live date has passed. Flowstate still needs to confirm a scheduled go-live. Use the migration correction action below if your preferred timing has changed.",
    );
    expect(html).toContain("Email a correction before acknowledging");
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("keeps a delayed locked snapshot acknowledged without reoffering the action", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "acknowledged",
      migrationOverrides: {
        goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
        ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
      },
    });

    expect(html).toContain("Migration summary locked");
    expect(html).toContain("Scheduled date passed — Flowstate review required");
    expect(html).toContain(
      "Use the migration correction action below if your timing has changed.",
    );
    expect(html).toContain("Daily operations remain pre-launch");
    expect(html).toContain("Email a problem with the locked summary");
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("preserves a locked summary when the post-lock correction channel is unavailable", async () => {
    vi.stubEnv("FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL", "");

    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "acknowledged",
    });

    expect(html).toContain("Migration summary locked");
    expect(html).toContain(
      "The migration correction channel is unavailable. The locked summary has not changed.",
    );
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("Acknowledge and lock summary");
  });

  it("fails an active non-complete migration closed without operational or successful-stage certainty", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "ACTIVE",
      stage: "GO_LIVE_SCHEDULED",
      ownerReviewStatus: "acknowledged",
      migrationResults: {
        status: "ready",
        recordsAdded: 1,
        recordsUpdated: 0,
        recordsNotImported: 0,
        earlierIncompleteAttemptCount: 0,
      },
    });

    expect(html).toContain("Migration completion needs Flowstate review");
    expect(html).toContain("Needs Flowstate review");
    expect(html).toContain("Flowstate review required");
    expect(html).not.toContain(">Operational<");
    expect(html).not.toContain("Daily operations are active");
    expect(html).not.toContain("Daily operations active");
    expect(html).not.toContain("Handoff complete");
    expect(html).not.toContain("migration-stage-card-success");
  });

  it("fails a completed review-needed result state closed to Flowstate review", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "ACTIVE",
      stage: "COMPLETE",
      ownerReviewStatus: "acknowledged",
      migrationResults: { status: "needs-flowstate-review" },
    });

    expect(html).toContain("Migration completion needs Flowstate review");
    expect(html).toContain("Migration results need Flowstate review");
    expect(html).not.toContain("Handoff complete");
    expect(html).not.toContain("Daily operations are active");
    expect(html).not.toContain(">Operational<");
    expect(html).not.toContain("migration-stage-card-success");
  });

  it.each(["acknowledged", "blocked", "eligible", "unavailable"] as const)(
    "fails no-results closed for the %s owner-review state",
    async (ownerReviewStatus) => {
      const html = await renderMigrationPage({
        workspaceStatus: "ACTIVE",
        stage: "COMPLETE",
        ownerReviewStatus,
        migrationResults: { status: "no-results-recorded" },
      });

      expect(html).toContain("Migration completion needs Flowstate review");
      expect(html).toContain("Migration results need Flowstate review");
      expect(html).toContain(
        "Flowstate is reviewing the recorded migration results before showing a summary.",
      );
      expect(html).not.toContain("No import results recorded");
      expect(html).not.toContain("Handoff complete");
      expect(html).not.toContain("Daily operations are active");
      expect(html).not.toContain(">Operational<");
      expect(html).not.toContain("migration-stage-card-success");
      expect(html).not.toContain("validation and reconciliation passed");
      expect(html).not.toContain("JSON");
    },
  );

  it("keeps the intake state pre-launch and invites the export handoff", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "SETUP_INCOMPLETE",
      stage: "INTAKE_RECEIVED",
      ownerReviewStatus: "unavailable",
    });

    expect(html).toContain("Pre-launch");
    expect(html).toContain("Launch in progress");
    expect(html).toContain("Migration results in progress");
    expect(html).toContain("No owner action is needed here.");
    expect(html).toContain("Daily operations remain pre-launch");
    expect(html).not.toContain("server-side");
    expect(html).not.toContain("operator approval");
    expect(html).not.toContain(
      "No import was required or recorded for this handoff",
    );
  });

  it("fails closed when a completed row is missing a coherent review record", async () => {
    const html = await renderMigrationPage({
      workspaceStatus: "ACTIVE",
      stage: "COMPLETE",
      ownerReviewStatus: "unavailable",
    });

    expect(html).toContain("Migration completion needs Flowstate review");
    expect(html).toContain("Readiness record needs attention");
    expect(html).toContain("No owner action is available yet");
    expect(html).not.toContain("Handoff complete");
    expect(html).not.toContain("Daily operations are active");
    expect(html).not.toContain(">Operational<");
  });
});
