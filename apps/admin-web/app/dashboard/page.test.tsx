import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { todayMock, ownerMock } = vi.hoisted(() => ({ todayMock: vi.fn(), ownerMock: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../_components/admin-shell", () => ({ AdminShell: ({ children }: PropsWithChildren) => <main>{children}</main> }));
vi.mock("../../lib/owner-today", () => ({ getOwnerToday: todayMock }));
vi.mock("../../lib/owner-workspace", () => ({ requireOwnerWorkspaceContext: ownerMock }));
vi.mock("../../lib/workspace-migration", () => ({ isWorkspaceMigrationReady: vi.fn(() => true) }));
vi.mock("../../lib/class-templates", () => ({ getClassTemplateFormOptions: vi.fn().mockResolvedValue({ programs: [], rooms: [], coaches: [] }) }));
vi.mock("./schedule/coach-assignment", () => ({ CoachAssignment: () => <button>Change coach</button> }));
import DashboardPage from "./page";
const lesson = { id: "class-1", classTemplateId: "class-1", scheduledForDate: "2026-10-15", displayTitle: "Beginner Muay Thai", title: null, startTimeMinutes: 1110, endTimeMinutes: 1170, effectiveCapacity: 20, booked: 12, room: { name: "Main mat" }, coachWorkspaceUserId: null, coachDisplayName: "Coach to be confirmed", canEdit: true };
describe("owner Today destinations", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    ownerMock.mockResolvedValue({ session: { role: "OWNER" }, workspace: { id: "gym", name: "Gym", status: "ACTIVE", location: { id: "location", timezone: "America/Vancouver" } } });
    todayMock.mockResolvedValue({ date: "2026-10-15", activeMembers: 121, paymentCount: 2, selectedClass: lesson, classes: [lesson], trials: [{ id: "trial", member: { id: "member", fullName: "Trial Member" }, occurrence: lesson }] });
  });
  it("links each populated summary to its exact filtered destination and puts trials before the timetable", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('href="/dashboard/members?status=ACTIVE"');
    expect(html).toContain('href="/dashboard/schedule/class-1/roster?date=2026-10-15"');
    expect(html).toContain('href="/dashboard/billing?filter=attention"');
    expect(html).toContain("Beginner Muay Thai");
    expect(html).toContain("12 / 20");
    expect(html.indexOf("Trials today")).toBeLessThan(html.indexOf("Today&#x27;s classes"));
    expect(html).not.toContain("Setup snapshot");
  });
  it("keeps a zero payment-attention card noninteractive and offers another date when there are no classes", async () => {
    todayMock.mockResolvedValue({ date: "2026-10-15", activeMembers: 0, paymentCount: 0, selectedClass: null, classes: [], trials: [] });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain('href="/dashboard/billing?filter=attention"');
    expect(html).toContain("No payment issues");
    expect(html).toContain("View another day");
    expect(html).toContain('href="/dashboard/members?status=ACTIVE"');
  });
});
