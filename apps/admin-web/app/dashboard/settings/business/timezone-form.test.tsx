import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTimezoneReview } from "../../../../lib/workspace-timezone-settings";

const mocks = vi.hoisted(() => ({ state: vi.fn(), pending: false }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [mocks.state(), vi.fn(), mocks.pending],
}));
vi.mock("./actions", () => ({ workspaceTimezoneAction: vi.fn() }));
import { TimezoneForm } from "./timezone-form";

const review: WorkspaceTimezoneReview = {
  ok: true,
  errors: [],
  previewHash: "reviewed-hash",
  version: 2,
  previousTimezone: "UTC",
  timezone: "America/Los_Angeles",
  effectiveFromDate: "2030-01-08",
  effectiveAt: "2030-01-08T08:00:00Z",
  earliestSafeDate: "2030-01-08",
  previewThrough: "2031-02-11",
  blockers: [],
  affected: [
    {
      date: "2030-01-14",
      title: "Evening class",
      previousTimezone: "UTC",
      timezone: "America/Los_Angeles",
      previousStartsAt: "2030-01-14T18:00:00Z",
      startsAt: "2030-01-15T02:00:00Z",
    },
  ],
};
const render = () =>
  renderToStaticMarkup(
    <TimezoneForm
      currentTimezone="UTC"
      version={2}
      earliestDate="2030-01-02"
      history={[]}
      timezoneOptions={["UTC", "America/Los_Angeles"]}
    />,
  );
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.pending = false;
  mocks.state.mockReturnValue({ error: null, success: null, review: null });
});
describe("business timezone review", () => {
  it("starts with an explicit dated preview and no confirmation control", () => {
    const html = render();
    expect(html).toContain('min="2030-01-02"');
    expect(html).toContain("Preview timezone change");
    expect(html).toContain(
      "Accepted membership and coaching timezones stay with their contracts",
    );
    expect(html).not.toContain('name="confirmTimezone"');
  });
  it("shows dated commitments and an actionable next date while withholding confirmation", () => {
    mocks.state.mockReturnValue({
      review: {
        ...review,
        ok: false,
        earliestSafeDate: "2030-01-22",
        errors: ["Choose a date after committed classes."],
        blockers: [
          {
            date: "2030-01-21",
            title: "Evening class",
            bookings: 1,
            attendance: 0,
            waitlist: 2,
          },
        ],
      },
    });
    const html = render();
    expect(html).toContain("2030-01-22");
    expect(html).toContain("2030-01-21 · Evening class");
    expect(html).toContain("Choose a date after committed classes.");
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).not.toContain('name="confirmTimezone"');
  });
  it.each([
    [
      { error: "The saved timezone changed." },
      "alert",
      "The saved timezone changed.",
    ],
    [{ success: "Timezone saved." }, "status", "Timezone saved."],
  ])("announces a returned timezone action outcome", (state, role, message) => {
    mocks.state.mockReturnValue({ review: null, ...state });
    const html = render();
    expect(html).toContain(`role="${role}"`);
    expect(html).toContain(message);
  });
  it("shows before and after offsets with an unchecked required confirmation tied to the reviewed version", () => {
    mocks.state.mockReturnValue({ review });
    const html = render();
    expect(html).toContain('name="previewHash" value="reviewed-hash"');
    expect(html).toContain('name="timezoneVersion" value="2"');
    const confirmation = html.match(
      /<input[^>]*name="confirmTimezone"[^>]*>/,
    )?.[0];
    expect(confirmation).toContain('type="checkbox"');
    expect(confirmation).toContain('required=""');
    expect(html).not.toContain('checked=""');
    expect(html).toContain("GMT-8");
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("Confirm timezone change");
  });
});
