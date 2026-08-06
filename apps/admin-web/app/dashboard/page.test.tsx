import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dashboardSummaryMock, ownerContextMock } = vi.hoisted(() => ({
  dashboardSummaryMock: vi.fn(),
  ownerContextMock: vi.fn(),
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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("../_components/admin-shell", () => ({
  AdminShell: ({
    children,
    description,
    title,
  }: PropsWithChildren<{ description: string; title: string }>) => (
    <div data-description={description} data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("../../lib/dashboard", () => ({
  getOwnerDashboardSummary: dashboardSummaryMock,
}));

vi.mock("../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: ownerContextMock,
}));

vi.mock("../../lib/workspace-migration", () => ({
  isWorkspaceMigrationReady: vi.fn(() => true),
}));

import DashboardPage from "./page";

const baseSummary = {
  scheduledForDate: "2026-08-01",
  metrics: [
    {
      id: "classes",
      label: "Classes today",
      value: 1,
      tone: "neutral",
      description: "Scheduled class blocks",
    },
    {
      id: "bookings",
      label: "Booked spots",
      value: 12,
      tone: "neutral",
      description: "Rostered members and trials",
    },
    {
      id: "trials",
      label: "Trials",
      value: 1,
      tone: "success",
      description: "Conversion moments today",
    },
    {
      id: "attendance",
      label: "Attendance left",
      value: 4,
      tone: "warning",
      description: "Roster spots not yet recorded",
    },
    {
      id: "billing",
      label: "Failed payments",
      value: 1,
      tone: "danger",
      description: "Billing items needing action",
    },
  ],
  attentionSummary: [
    { category: "billing", label: "Billing", count: 1, tone: "danger" },
    { category: "attendance", label: "Attendance", count: 1, tone: "warning" },
    { category: "trials", label: "Trials", count: 1, tone: "success" },
    { category: "capacity", label: "Capacity", count: 0, tone: "success" },
    { category: "invites", label: "Invites", count: 0, tone: "success" },
  ],
  attentionItems: [
    {
      id: "billing-1",
      category: "billing",
      severity: "danger",
      title: "Payment needs action: Maya Chen",
      context: "Payment failed",
      href: "/dashboard/billing",
      actionLabel: "Open billing",
      priority: 100,
    },
  ],
  todayClasses: [
    {
      id: "class-1",
      displayTitle: "Muay Thai Fundamentals",
      scheduledForDate: "2026-08-01",
      weekdayLabel: "Saturday",
      timeLabel: "09:00 - 10:00",
      roomName: "Main mat",
      coachDisplayName: "Casey Coach",
      effectiveCapacity: 20,
      rosterCount: 12,
      trialCount: 1,
      attendanceRecordedCount: 8,
    },
  ],
  failedPayments: [],
  pendingInvites: [],
  setup: {
    programCount: 2,
    roomCount: 1,
    templateCount: 4,
    membershipPlanCount: 3,
    pendingInviteCount: 0,
  },
};

const ownerContext = {
  session: {
    userId: "owner-1",
    displayName: "Jacky Owner",
    email: "owner@example.com",
    workspaceId: "workspace-1",
    role: "OWNER",
  },
  workspaceUserId: "workspace-user-1",
  workspace: {
    id: "workspace-1",
    name: "North Shore Muay Thai",
    status: "ACTIVE",
    migration: {
      stage: "COMPLETE",
      ownerReviewAcknowledgedAt: new Date("2026-08-01T00:00:00.000Z"),
      ownerReviewAcknowledgedByUserId: "owner-1",
      operationallyReadyAt: new Date("2026-08-01T00:00:00.000Z"),
      operationallyReadyByUserId: "owner-1",
    },
    location: {
      id: "location-1",
      name: "North Shore Muay Thai",
      timezone: "America/Vancouver",
      addressLine1: "100 Main Street",
      city: "Vancouver",
      region: "BC",
      postalCode: "V1V 1V1",
      countryCode: "CA",
    },
    settings: { allowMultipleRooms: true },
  },
};

describe("DashboardPage presentation hierarchy", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    ownerContextMock.mockResolvedValue(ownerContext);
    dashboardSummaryMock.mockResolvedValue(baseSummary);
  });

  it("preserves owner metrics, queue, actions, schedule, setup, and destinations", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    const readiness = html.indexOf("Readiness");
    const queue = html.indexOf("Owner queue");
    const quickActions = html.indexOf("Common moves");
    const schedule = html.indexOf("Today&#x27;s schedule");
    const setup = html.indexOf("Setup snapshot");

    expect(readiness).toBeGreaterThan(-1);
    expect(queue).toBeGreaterThan(readiness);
    expect(quickActions).toBeGreaterThan(queue);
    expect(schedule).toBeGreaterThan(quickActions);
    expect(setup).toBeGreaterThan(schedule);

    for (const label of [
      "Classes today",
      "Booked spots",
      "Trials",
      "Attendance left",
      "Failed payments",
      "Billing",
      "Attendance",
      "Capacity",
      "Invites",
      "Muay Thai Fundamentals",
      "Programs",
      "Rooms",
      "Membership plans",
    ]) {
      expect(html).toContain(label);
    }

    for (const href of [
      "/dashboard/bookings",
      "/dashboard/members",
      "/dashboard/coach/today",
      "/dashboard/schedule",
      "/dashboard/billing",
      "/dashboard/schedule/class-1/roster?date=2026-08-01",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("preserves the clear queue and no-classes recovery states", async () => {
    dashboardSummaryMock.mockResolvedValue({
      ...baseSummary,
      attentionItems: [],
      todayClasses: [],
    });

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("Today is clear");
    expect(html).toContain("No classes today");
    expect(html).toContain('href="/dashboard/schedule"');
    expect(html).toContain("Manage schedule");
  });
});
