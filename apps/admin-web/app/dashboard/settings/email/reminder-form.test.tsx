import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: undefined as unknown,
  pending: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: () => [mocks.state, vi.fn(), mocks.pending],
}));
vi.mock("./actions", () => ({ updateClassReminderSettingsAction: vi.fn() }));
import { ClassReminderSettingsForm } from "./reminder-form";
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.pending = false;
  mocks.state = {
    status: "idle",
    version: 0,
    leadMinutes: null,
    message: null,
  };
});
describe("class and trial reminder editor", () => {
  it("starts off without inventing a numeric default", () => {
    const html = renderToStaticMarkup(
      <ClassReminderSettingsForm version={0} leadMinutes={null} />,
    );
    expect(html).toContain('value="OFF" selected=""');
    expect(html).not.toContain('name="leadMinutes"');
    expect(html).toContain('name="reason"');
    expect(html).toContain("Save reminder settings");
  });
  it("uses an explicitly configured interval and labelled bounded input", () => {
    mocks.state = {
      status: "idle",
      version: 3,
      leadMinutes: 120,
      message: null,
    };
    const html = renderToStaticMarkup(
      <ClassReminderSettingsForm version={3} leadMinutes={120} />,
    );
    expect(html).toContain('name="leadMinutes"');
    expect(html).toContain('value="120"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="527040"');
    expect(html).toContain('aria-describedby="class-reminder-help"');
    expect(html).toContain('name="expectedVersion" value="3"');
  });
  it("announces saved feedback without claiming inbox delivery", () => {
    mocks.state = {
      status: "success",
      version: 1,
      leadMinutes: 120,
      message:
        "Settings saved. Messages remain queued until delivery is connected.",
    };
    const html = renderToStaticMarkup(
      <ClassReminderSettingsForm version={0} leadMinutes={120} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("queued");
    expect(html).toContain('name="expectedVersion" value="1"');
  });
  it("retains an actionable error and prevents duplicate submits while pending", () => {
    mocks.state = {
      status: "error",
      version: 3,
      leadMinutes: 120,
      message: "Settings changed. Reload before saving.",
    };
    mocks.pending = true;
    const html = renderToStaticMarkup(
      <ClassReminderSettingsForm version={3} leadMinutes={120} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Saving…");
  });
});
