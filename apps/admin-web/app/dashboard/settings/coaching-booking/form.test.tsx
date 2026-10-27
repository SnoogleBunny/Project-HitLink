import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachingBookingPolicy } from "@flowstate/db";
import type { CoachingBookingRulesState } from "./actions";

const mocks = vi.hoisted(() => ({ editor: undefined as unknown, state: undefined as unknown, action: vi.fn(), pending: false }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    if (mocks.editor === undefined) mocks.editor = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [mocks.editor, (change: unknown) => { mocks.editor = typeof change === "function" ? (change as (current: unknown) => unknown)(mocks.editor) : change; }];
  },
  useActionState: () => [mocks.state, mocks.action, mocks.pending],
}));
vi.mock("./actions", () => ({ updateCoachingBookingPolicyAction: vi.fn() }));
import { CoachingBookingRulesForm } from "./form";

const operationId = "00000000-0000-4000-8000-000000000001";
const nextOperationId = "00000000-0000-4000-8000-000000000002";
const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const policy = (): CoachingBookingPolicy => ({ schemaVersion: 1, appointments: {
  weeklyHours: days.map((weekday) => ({ weekday, intervals: weekday === "MONDAY" ? [{ startMinute: 540, endMinute: 1020 }] : [] })),
  maxAdvanceMinutes: 14400, minimumLeadMinutes: 30, minimumBufferMinutes: 15, resolutionResponseHours: 24,
} });
const state = (more: Partial<CoachingBookingRulesState> = {}): CoachingBookingRulesState => ({
  status: "idle", baseVersion: 3, operationId, confirmedVersion: null, message: null, review: null, request: null, confirmedPolicy: null, ...more,
});
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}
function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement<Record<string, unknown>>(node) ? text(node.props.children as React.ReactNode) : "";
}
function render(initial: CoachingBookingPolicy | null = policy(), version = 3, id = operationId) {
  return CoachingBookingRulesForm({ initial, version, initialOperationId: id });
}
function named(tree: React.ReactNode, name: string, value?: string) {
  const found = nodes(tree).find((node) => node.props.name === name && (value === undefined || node.props.value === value));
  if (!found) throw new Error(`Missing field ${name}`);
  return found;
}
function labelled(tree: React.ReactNode, label: string) {
  const container = nodes(tree).find((node) => node.type === "label" && text(node).startsWith(label));
  const field = container && nodes(container).find((node) => ["input", "select", "textarea"].includes(node.type as string));
  if (!field) throw new Error(`Missing labelled field ${label}`);
  return field;
}
function click(tree: React.ReactNode, label: string) {
  const button = nodes(tree).find((node) => node.type === "button" && text(node) === label);
  if (!button) throw new Error(`Missing button ${label}`);
  (button.props.onClick as () => void)();
}
function change(tree: React.ReactNode, label: string, value: string) {
  (labelled(tree, label).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
const draft = (tree: React.ReactNode) => JSON.parse(String(named(tree, "policy").props.value));

beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.editor = undefined; mocks.state = state(); mocks.pending = false;
});

describe("controlled owner program appointment rules", () => {
  it("starts unconfigured with seven closed days and blank numeric choices rather than confirmed defaults", () => {
    mocks.state = state({ baseVersion: 0 });
    const tree = render(null, 0), value = draft(tree);
    expect(value.appointments.weeklyHours).toEqual(days.map((weekday) => ({ weekday, intervals: [] })));
    expect([value.appointments.maxAdvanceMinutes, value.appointments.minimumLeadMinutes, value.appointments.minimumBufferMinutes, value.appointments.resolutionResponseHours]).toEqual([null, null, null, null]);
    expect(nodes(tree).filter((node) => node.type === "input" && node.props.type === "number").every((node) => node.props.value === "")).toBe(true);
    expect(text(tree)).toContain("Not configured");
    expect(nodes(tree).filter((node) => node.type === "textarea").map((node) => node.props.name)).toEqual(["reason"]);
    expect(text(tree)).toContain("Programs with no appointments are unaffected");
  });

  it("edits split intervals and midnight explicitly, and removing an earlier row preserves the remaining draft", () => {
    let tree = render(null, 0);
    click(tree, "Add Monday interval"); tree = render(null, 0);
    expect(labelled(tree, "Monday start time 1").props).toMatchObject({ value: "", required: true });
    change(tree, "Monday start time 1", "09:00"); tree = render(null, 0);
    change(tree, "Monday end time 1", "12:00"); tree = render(null, 0);
    click(tree, "Add Monday interval"); tree = render(null, 0);
    change(tree, "Monday start time 2", "13:00"); tree = render(null, 0);
    change(tree, "Monday end type 2", "midnight"); tree = render(null, 0);
    expect(draft(tree).appointments.weeklyHours[0].intervals).toEqual([{ startMinute: 540, endMinute: 720 }, { startMinute: 780, endMinute: 1440 }]);
    click(tree, "Remove Monday interval 1"); tree = render(null, 0);
    expect(labelled(tree, "Monday start time 1").props.value).toBe("13:00");
    expect(draft(tree).appointments.weeklyHours[0].intervals).toEqual([{ startMinute: 780, endMinute: 1440 }]);
    change(tree, "Monday end type 1", "time"); tree = render(null, 0);
    expect(labelled(tree, "Monday end time 1").props.value).toBe("");
  });

  it("does not impose the older four-interval, one-year or 240-minute product caps", () => {
    let tree = render(null, 0);
    for (let index = 0; index < 5; index++) { click(tree, "Add Tuesday interval"); tree = render(null, 0); }
    expect(draft(tree).appointments.weeklyHours[1].intervals).toHaveLength(5);
    change(tree, "Maximum advance booking", "1054080"); tree = render(null, 0);
    change(tree, "Minimum preparation", "1000"); tree = render(null, 0);
    expect(draft(tree).appointments).toMatchObject({ maxAdvanceMinutes: 1054080, minimumBufferMinutes: 1000 });
  });

  it("binds confirmation to the exact reviewed controlled draft and invalidates it after an edit", () => {
    let tree = render();
    change(tree, "Reason for these appointment rules", "Reviewed new appointment hours"); tree = render();
    mocks.state = state({ status: "preview", request: { policy: policy(), reason: "Reviewed new appointment hours", expectedVersion: 3, operationId }, review: { version: 3, policy: policy(), reason: "Reviewed new appointment hours", previewHash: "a".repeat(64), affectedAvailabilityCount: 2, retainedAppointmentCount: 5 } });
    tree = render();
    expect(text(tree)).toContain("2 published availability times");
    expect(text(tree)).toContain("5 existing accepted appointments");
    expect(named(tree, "intent", "CONFIRM").props.disabled).toBe(true);
    (named(tree, "confirmed").props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render();
    expect(named(tree, "intent", "CONFIRM").props.disabled).toBe(false);
    change(tree, "Minimum preparation", "30"); tree = render();
    expect(named(tree, "intent", "CONFIRM").props.disabled).toBe(true);
    expect(named(tree, "previewHash").props.value).toBe("");
    expect(named(tree, "confirmed").props.checked).toBe(false);
    expect(text(tree)).toContain("This draft changed after review");
  });

  it("preserves controlled entries and the acknowledged version/request when revalidation supplies newer props", () => {
    let tree = render();
    change(tree, "Minimum booking notice", "120"); tree = render();
    change(tree, "Reason for these appointment rules", "Keep this unsaved owner draft");
    mocks.state = state({ status: "error", message: "The reviewed schedule changed. Preview again." });
    const changed = policy(); changed.appointments.minimumLeadMinutes = 10;
    tree = render(changed, 4, nextOperationId);
    expect(labelled(tree, "Minimum booking notice").props.value).toBe("120");
    expect(labelled(tree, "Reason for these appointment rules").props.value).toBe("Keep this unsaved owner draft");
    expect(named(tree, "expectedVersion").props.value).toBe(3);
    expect(named(tree, "operationId").props.value).toBe(operationId);
    expect(named(tree, "intent", "PREVIEW").props.disabled).toBe(true);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("New appointment rules were confirmed while this draft was open");
    expect(html).toContain("The reviewed schedule changed. Preview again.");
  });

  it("keeps committed feedback visible with the advanced version and rotated operation after revalidation", () => {
    let tree = render();
    change(tree, "Reason for these appointment rules", "Reviewed current commitments");
    mocks.state = state({ status: "success", baseVersion: 4, operationId: nextOperationId, confirmedVersion: 4, confirmedPolicy: policy(), message: "Appointment rules version 4 confirmed." });
    tree = render(policy(), 4, "fresh-server-prop-identity");
    expect(named(tree, "expectedVersion").props.value).toBe(4);
    expect(named(tree, "operationId").props.value).toBe(nextOperationId);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('role="status"');
    expect(html).toContain("Appointment rules version 4 confirmed.");
    expect(html).not.toContain("New appointment rules were confirmed while this draft was open");
    expect(labelled(tree, "Reason for these appointment rules").props.value).toBe("Reviewed current commitments");
  });

  it("disables edits and submissions while a request is pending", () => {
    mocks.pending = true;
    const tree = render();
    expect(nodes(tree).some((node) => node.type === "fieldset" && node.props.disabled === true)).toBe(true);
    expect(named(tree, "intent", "PREVIEW").props.disabled).toBe(true);
    expect(text(tree)).toContain("Reviewing appointment rules…");
  });
});
