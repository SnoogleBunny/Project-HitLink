import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { focusMock } = vi.hoisted(() => ({
  focusMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useEffect: (effect: () => void) => effect(),
    useRef: () => ({ current: { focus: focusMock } }),
  };
});

import { MigrationRecoveryAlert } from "./migration-recovery-alert";

describe("MigrationRecoveryAlert", () => {
  beforeEach(() => {
    focusMock.mockClear();
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
  });

  it.each([
    [
      "schedule-missing",
      "Schedule needs Flowstate review",
      "Flowstate still needs to confirm the go-live schedule. Use the configured migration correction action below if your timing has changed.",
    ],
    [
      "schedule-passed",
      "Scheduled date passed — Flowstate review required",
      "The scheduled go-live date has passed, but this migration is not complete. Flowstate needs to confirm the schedule. Use the configured migration correction action below if your timing has changed.",
    ],
    [
      "launch-timezone-invalid",
      "Schedule needs Flowstate review",
      "Flowstate needs to confirm the launch timezone before the go-live schedule can be reviewed. Use the configured migration correction action below if your timing has changed.",
    ],
    [
      "remaining-checks",
      "Migration checks changed",
      "Flowstate is completing the remaining migration checks before you can acknowledge the summary.",
    ],
    [
      "confirmation-required",
      "Confirmation required",
      "Your acknowledgment was not saved. You must confirm that acknowledging locks the reviewed snapshot before trying again.",
    ],
    [
      "correction-channel-unavailable",
      "Migration correction channel unavailable",
      "The migration correction channel is unavailable. Do not acknowledge this summary. Flowstate must make the contact channel available before owner review can continue.",
    ],
  ] as const)(
    "maps %s to owner-safe copy and focuses the fresh alert once",
    (reason, heading, body) => {
      const html = renderToStaticMarkup(
        <MigrationRecoveryAlert reason={reason} />,
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain(heading);
      expect(html).toContain(body);
      expect(focusMock).toHaveBeenCalledTimes(1);
    },
  );

  it("uses stale-state recovery copy for an unknown reason", () => {
    const html = renderToStaticMarkup(
      <MigrationRecoveryAlert reason="unexpected" />,
    );

    expect(html).toContain("Migration status changed");
    expect(html).toContain(
      "Your acknowledgment was not saved. Review the updated snapshot before trying again.",
    );
  });
});
