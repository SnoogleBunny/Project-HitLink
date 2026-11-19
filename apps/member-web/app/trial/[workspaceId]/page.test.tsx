import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTrialBookingOptionsMock } = vi.hoisted(() => ({
  listTrialBookingOptionsMock: vi.fn(),
}));

vi.mock("../../../lib/trial-booking", () => ({
  listTrialBookingOptions: listTrialBookingOptionsMock,
}));

vi.mock("./trial-booking-form", () => ({
  TrialBookingForm: () => <div data-testid="trial-booking-form" />,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

import TrialBookingPage from "./page";

describe("public trial page availability projection", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    vi.clearAllMocks();
  });

  it("renders a non-actionable local recovery when active templates have zero eligible dates", async () => {
    listTrialBookingOptionsMock.mockResolvedValue({
      status: "no-eligible-dates",
      workspaceId: "workspace_1",
      workspaceName: "Flowstate Gym",
      timezone: "America/Vancouver",
      activeTemplateCount: 1,
    });

    const html = renderToStaticMarkup(
      await TrialBookingPage({
        params: Promise.resolve({ workspaceId: "workspace_1" }),
      }),
    );

    expect(html).toContain("Classes are not available right now");
    expect(html).toContain("Check back later for an available trial date.");
    expect(html).not.toContain("trial-booking-form");
  });

  it("keeps the populated-date projection actionable", async () => {
    listTrialBookingOptionsMock.mockResolvedValue({
      status: "available",
      workspaceId: "workspace_1",
      workspaceName: "Flowstate Gym",
      timezone: "America/Vancouver",
      templates: [
        {
          id: "template_1",
          displayTitle: "Muay Thai Fundamentals",
          programName: "Muay Thai",
          roomName: "Main Mat",
          coachDisplayName: "Casey Coach",
          dateOptions: [
            {
              classTemplateId: "template_1",
              scheduledForDate: "2026-04-14",
              label: "Tue, Apr 14 at 6:00 PM",
            },
          ],
        },
      ],
    });

    const html = renderToStaticMarkup(
      await TrialBookingPage({
        params: Promise.resolve({ workspaceId: "workspace_1" }),
      }),
    );

    expect(html).toContain("trial-booking-form");
    expect(html).not.toContain("Classes are not available right now");
  });
});
