import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClassBookingMock, redirectMock, requireOwnerWorkspaceContextMock } =
  vi.hoisted(() => ({
    createClassBookingMock: vi.fn(),
    redirectMock: vi.fn((location: string) => {
      throw new Error(`NEXT_REDIRECT:${location}`);
    }),
    requireOwnerWorkspaceContextMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../lib/bookings", () => ({
  createClassBooking: createClassBookingMock,
}));

import { createClassBookingAction } from "./actions";

const ownerReviewAcknowledgedAt = new Date("2026-07-25T12:00:00.000Z");
const operationallyReadyAt = new Date("2026-07-25T12:05:00.000Z");

function buildReadyContext() {
  return {
    workspace: {
      id: "workspace_1",
      status: "ACTIVE",
      migration: {
        stage: "COMPLETE",
        ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId: "owner_1",
        operationallyReadyAt,
        operationallyReadyByUserId: "flowstate_operator_1",
      },
    },
    location: {
      timezone: "America/Vancouver",
    },
  };
}

function buildFormData() {
  const formData = new FormData();
  formData.set("memberId", "member_1");
  formData.set("guardianId", "guardian_1");
  formData.set("bookingOption", "template_1|2026-07-27");
  formData.set("bookingType", "MEMBERSHIP");

  return formData;
}

describe("class booking action migration readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerWorkspaceContextMock.mockResolvedValue(buildReadyContext());
    createClassBookingMock.mockResolvedValue({
      status: "created",
      bookingId: "booking_1",
    });
  });

  it.each([
    [
      "a setup-incomplete workspace",
      {
        workspace: {
          ...buildReadyContext().workspace,
          status: "SETUP_INCOMPLETE",
        },
      },
    ],
    [
      "a missing migration",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: null,
        },
      },
    ],
    [
      "an incomplete migration",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            stage: "GO_LIVE_SCHEDULED",
          },
        },
      },
    ],
    [
      "a missing owner-review time",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            ownerReviewAcknowledgedAt: null,
          },
        },
      },
    ],
    [
      "a missing owner-review actor",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            ownerReviewAcknowledgedByUserId: null,
          },
        },
      },
    ],
    [
      "a blank owner-review actor",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            ownerReviewAcknowledgedByUserId: "   ",
          },
        },
      },
    ],
    [
      "a missing operator-readiness time",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            operationallyReadyAt: null,
          },
        },
      },
    ],
    [
      "a missing operator-readiness actor",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            operationallyReadyByUserId: null,
          },
        },
      },
    ],
    [
      "a blank operator-readiness actor",
      {
        workspace: {
          ...buildReadyContext().workspace,
          migration: {
            ...buildReadyContext().workspace.migration,
            operationallyReadyByUserId: "   ",
          },
        },
      },
    ],
  ])("fails closed before booking mutation for %s", async (_label, override) => {
    requireOwnerWorkspaceContextMock.mockResolvedValue({
      ...buildReadyContext(),
      ...override,
    });

    await expect(
      createClassBookingAction({ error: null }, buildFormData()),
    ).resolves.toEqual({
      error: "Class bookings are unavailable until migration readiness is complete.",
    });

    expect(createClassBookingMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails closed when workspace readiness cannot be read", async () => {
    requireOwnerWorkspaceContextMock.mockRejectedValue(
      new Error("migration readiness read failed"),
    );

    await expect(
      createClassBookingAction({ error: null }, buildFormData()),
    ).rejects.toThrow("migration readiness read failed");

    expect(createClassBookingMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("creates the booking only for a coherently ready workspace", async () => {
    await expect(
      createClassBookingAction({ error: null }, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/bookings");

    expect(createClassBookingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      timezone: "America/Vancouver",
      input: {
        memberId: "member_1",
        guardianId: "guardian_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-07-27",
        bookingType: "MEMBERSHIP",
      },
    });
  });
});
