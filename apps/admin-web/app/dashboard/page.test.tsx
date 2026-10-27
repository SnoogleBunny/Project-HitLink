import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { todayMock, ownerMock, readyMock } = vi.hoisted(() => ({
  todayMock: vi.fn(),
  ownerMock: vi.fn(),
  readyMock: vi.fn(),
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
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));
vi.mock("../_components/admin-shell", () => ({
  AdminShell: ({
    children,
    actions,
  }: PropsWithChildren<{ actions?: ReactNode }>) => (
    <main>
      {actions}
      {children}
    </main>
  ),
}));
vi.mock("../../lib/owner-today", () => ({ getOwnerToday: todayMock }));
vi.mock("../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: ownerMock,
}));
vi.mock("@flowstate/db", async () => ({
  ...(await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db")),
  isWorkspaceOperationallyReady: readyMock,
}));
vi.mock("../../lib/class-templates", () => ({
  getClassTemplateFormOptions: vi
    .fn()
    .mockResolvedValue({ programs: [], rooms: [], coaches: [] }),
}));
vi.mock("./schedule/coach-assignment", () => ({
  CoachAssignment: () => <button>Change coach</button>,
}));
import DashboardPage from "./page";
const lesson = {
  id: "class-1",
  classTemplateId: "class-1",
  scheduledForDate: "2026-10-15",
  displayTitle: "Beginner Muay Thai",
  title: null,
  startTimeMinutes: 1110,
  endTimeMinutes: 1170,
  effectiveCapacity: 20,
  booked: 12,
  room: { name: "Main mat" },
  coachWorkspaceUserId: null,
  coachDisplayName: "Coach to be confirmed",
  canEdit: true,
};

describe("owner Today destinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    readyMock.mockReturnValue(true);
    ownerMock.mockResolvedValue({
      session: { role: "OWNER" },
      workspace: {
        id: "gym",
        name: "Gym",
        status: "ACTIVE",
        location: { id: "location", timezone: "America/Vancouver" },
      },
    });
    todayMock.mockResolvedValue({
      date: "2026-10-15",
      activeMembers: 121,
      paymentCount: 2,
      selectedClass: lesson,
      classes: [lesson],
      trials: [
        {
          id: "trial",
          member: { id: "member", fullName: "Trial Member" },
          occurrence: lesson,
        },
      ],
      attention: [
        {
          id: "payment",
          category: "Payment",
          tone: "danger",
          title: "Riley Member · payment failed",
          description: "Monthly membership",
          href: "/dashboard/members/riley/billing",
          actionLabel: "Review Riley Member payment",
          amountCents: 14900,
          currency: "CAD",
        },
      ],
    });
  });

  it("opens the complete directory, exact dated roster and filtered billing queue with trials first", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('href="/dashboard/members"');
    expect(html).not.toContain('href="/dashboard/members?status=ACTIVE"');
    expect(html).toContain("View all members");
    expect(html).toContain(
      'href="/dashboard/schedule/class-1/roster?date=2026-10-15"',
    );
    expect(html).toContain('href="/dashboard/billing?filter=attention"');
    expect(html).toContain("Class bookings");
    expect(html).toContain("12 of 20");
    expect(html).toContain("Beginner Muay Thai");
    expect(html.indexOf("Trials today")).toBeLessThan(
      html.indexOf("Needs attention"),
    );
    expect(html.indexOf("Trials today")).toBeLessThan(
      html.indexOf("Today’s classes"),
    );
    expect(html).toContain("Open member portal");
    expect(html).toContain("/app/schedule");
    expect(html).not.toContain("Add class");
    expect(html).not.toContain("Setup snapshot");
  });

  it("renders persisted attention with named actions and keeps the room directly below its class name", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Riley Member · payment failed");
    expect(html).toContain('href="/dashboard/members/riley/billing"');
    expect(html).toContain('aria-label="Review Riley Member payment"');
    expect(html).toContain("CAD");
    expect(html).toContain("149.00");
    expect(html).toContain(
      '<h3>Beginner Muay Thai</h3><p class="class-room">Main mat</p>',
    );
    expect(html).toContain("Needs coach");
  });

  it("keeps a zero payment card free of actions, chevrons and keyboard stops", async () => {
    todayMock.mockResolvedValue({
      date: "2026-10-15",
      activeMembers: 0,
      paymentCount: 0,
      selectedClass: null,
      classes: [],
      trials: [],
      attention: [],
    });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain('href="/dashboard/billing?filter=attention"');
    const card = html.match(
      /<section class="management-card today-metric">[\s\S]*?<\/section>/,
    )?.[0];
    expect(card).toContain("No payments need attention");
    expect(card).not.toMatch(
      /<a\b|<button\b|tabindex|role="button"|today-metric-action|›/i,
    );
    expect(html).toContain("View another day");
    expect(html).toContain('href="/dashboard/members"');
    expect(html).toContain("Up to date");
    expect(html).not.toContain("Trials today");
  });

  it("keeps every attention category visible on a busy day and exposes all remaining dated work", async () => {
    const current = await todayMock();
    const payments = Array.from({ length: 6 }, (_, index) => ({
      ...current.attention[0],
      id: `payment-${index}`,
      title: `Payment ${index}`,
    }));
    const classes = Array.from({ length: 6 }, (_, index) => ({
      ...lesson,
      id: `class-${index}`,
      displayTitle: `Class ${index}`,
    }));
    todayMock.mockResolvedValue({
      ...current,
      classes,
      selectedClass: classes[2],
      attention: [
        ...payments,
        {
          ...current.attention[0],
          id: "membership",
          category: "Membership",
          title: "Membership decision",
        },
        {
          ...current.attention[0],
          id: "attendance",
          category: "Attendance",
          title: "Attendance decision",
        },
      ],
    });
    const html = renderToStaticMarkup(await DashboardPage());
    const preview = html.match(
      /<ul class="today-attention-list">([\s\S]*?)<\/ul>/,
    )?.[1];
    expect(preview).toContain("Payment 0");
    expect(preview).toContain("Membership decision");
    expect(preview).toContain("Attendance decision");
    expect(preview).not.toContain("Payment 1");
    expect(html).toContain("Show 5 more items");
    expect(html).toContain("Show 3 more classes today");
    for (let index = 0; index < 6; index++) {
      expect(html).toContain(`Payment ${index}`);
      expect(html).toContain(
        `/dashboard/schedule/class-${index}/roster?date=2026-10-15`,
      );
    }
    expect(html).not.toContain('<details class="today-more" open');
    expect(html).toContain("Change coach");
  });

  it("keeps launch-readiness protection ahead of operational data reads", async () => {
    readyMock.mockReturnValue(false);
    await expect(DashboardPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration",
    );
    expect(todayMock).not.toHaveBeenCalled();
  });
  it("routes an unactivated clean business to setup before querying operational data", async () => {
    readyMock.mockReturnValue(false);
    ownerMock.mockResolvedValue({
      session: { role: "OWNER" },
      workspace: {
        id: "gym",
        setup: { id: "new-setup" },
        status: "SETUP_INCOMPLETE",
      },
    });
    await expect(DashboardPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/setup",
    );
    expect(todayMock).not.toHaveBeenCalled();
  });
  it("opens coaching-only owner operations without requiring a gym class or membership", async () => {
    ownerMock.mockResolvedValue({
      session: { role: "OWNER" },
      workspace: {
        id: "gym",
        status: "ACTIVE",
        setupActivation: { serviceMode: "COACHING" },
      },
    });
    await expect(DashboardPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/coaching",
    );
    expect(todayMock).not.toHaveBeenCalled();
  });
});
