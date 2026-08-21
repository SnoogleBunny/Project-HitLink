import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTrialBookingMock } = vi.hoisted(() => ({
  createTrialBookingMock: vi.fn(),
}));

vi.mock("../../../lib/trial-booking", () => ({
  createTrialBooking: createTrialBookingMock,
}));

vi.mock("@flowstate/db", () => ({
  buildMagicLinkPath: (token: string) => `/sign/forms/${token}`,
}));

import { emptyTrialBookingFormState } from "../../form-states";
import { createTrialBookingAction } from "./actions";

function buildFormData() {
  const formData = new FormData();

  formData.set("workspaceId", "workspace_1");
  formData.set("bookingOption", "template_1|2026-04-07");
  formData.set("fullName", "Jordan Lee");
  formData.set("email", "jordan@example.com");
  formData.set("phone", "");
  formData.set("dateOfBirth", "");
  formData.set("guardianFullName", "");
  formData.set("guardianEmail", "");
  formData.set("guardianPhone", "");
  formData.set("relationshipLabel", "");

  return formData;
}

describe("trial booking action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a friendly helper error", async () => {
    createTrialBookingMock.mockResolvedValue({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });

    await expect(
      createTrialBookingAction(emptyTrialBookingFormState, buildFormData()),
    ).resolves.toEqual({
      error: "Choose an available upcoming trial date.",
      confirmation: null,
    });
  });

  it("returns a confirmation state for successful bookings", async () => {
    createTrialBookingMock.mockResolvedValue({
      status: "booked",
      memberId: "member_1",
      classBookingId: "booking_1",
      classTitle: "Muay Thai Fundamentals",
      scheduledForDate: "2026-04-07",
      startsAt: new Date("2026-04-08T01:00:00.000Z"),
      forms: [
        {
          requestId: "request_1",
          token: "request_1.token",
          formName: "Adult Waiver",
          guardianName: null,
        },
      ],
    });

    await expect(
      createTrialBookingAction(emptyTrialBookingFormState, buildFormData()),
    ).resolves.toEqual({
      error: null,
      confirmation: {
        classTitle: "Muay Thai Fundamentals",
        scheduledForDate: "2026-04-07",
        forms: [
          {
            requestId: "request_1",
            label: "Adult Waiver",
            href: "/sign/forms/request_1.token",
          },
        ],
      },
    });
    expect(createTrialBookingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      input: {
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-07",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        phone: "",
        dateOfBirth: "",
        guardianFullName: "",
        guardianEmail: "",
        guardianPhone: "",
        relationshipLabel: "",
      },
    });
  });
});
