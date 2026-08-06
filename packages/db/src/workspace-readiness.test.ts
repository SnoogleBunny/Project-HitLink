import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isWorkspaceMigrationReady } from "./workspace-readiness.js";

const readyWorkspace = {
  workspaceStatus: "ACTIVE",
  migrationStage: "COMPLETE",
  ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
  ownerReviewAcknowledgedByUserId: "owner_1",
  operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
  operationallyReadyByUserId: "flowstate_operator_1",
} as const;

describe("isWorkspaceMigrationReady", () => {
  it.each([
    ["missing migration", { migrationStage: null }],
    ["inactive workspace", { workspaceStatus: "SETUP_INCOMPLETE" }],
    ["disabled workspace", { workspaceStatus: "DISABLED" }],
    ["incomplete migration", { migrationStage: "GO_LIVE_SCHEDULED" }],
    ["missing owner acknowledgment time", { ownerReviewAcknowledgedAt: null }],
    ["missing owner acknowledgment actor", { ownerReviewAcknowledgedByUserId: null }],
    ["blank owner acknowledgment actor", { ownerReviewAcknowledgedByUserId: "   " }],
    ["missing operational readiness time", { operationallyReadyAt: null }],
    ["missing operational readiness actor", { operationallyReadyByUserId: null }],
    ["blank operational readiness actor", { operationallyReadyByUserId: "   " }],
  ])("fails closed for %s", (_label, override) => {
    expect(
      isWorkspaceMigrationReady({
        ...readyWorkspace,
        ...override,
      }),
    ).toBe(false);
  });

  it("allows operations only for the complete acknowledged readiness tuple", () => {
    expect(isWorkspaceMigrationReady(readyWorkspace)).toBe(true);
  });

  it("accepts nonblank actor IDs with surrounding whitespace", () => {
    expect(
      isWorkspaceMigrationReady({
        ...readyWorkspace,
        ownerReviewAcknowledgedByUserId: "  owner_1  ",
        operationallyReadyByUserId: "  flowstate_operator_1  ",
      }),
    ).toBe(true);
  });
});

describe("workspace readiness package export", () => {
  it("includes the JavaScript companion required by Next runtime resolution", () => {
    const companionPath = fileURLToPath(
      new URL("./workspace-readiness.js", import.meta.url),
    );

    expect(existsSync(companionPath)).toBe(true);
  });
});
