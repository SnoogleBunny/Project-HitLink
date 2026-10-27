import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@flowstate/db", async () => ({
  ...(await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db")),
  createReviewedDirectClassBooking: mocks.create,
}));
import { buildDirectBookingFundingReview } from "@flowstate/db";
import { createSelfBooking } from "./self-service-bookings";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({
    status: "created",
    bookingId: "booking",
    bookingType: "MEMBERSHIP",
  });
});
describe("guardian booking attribution", () => {
  const request = {
    workspaceId: "gym",
    actor: { userId: "authenticated-user", sessionId: "server-session" },
    memberId: "child",
    classTemplateId: "class",
    scheduledForDate: "2030-01-01",
    timezone: "UTC",
    reviewedFunding: buildDirectBookingFundingReview({
      workspaceId: "gym", memberId: "child", classTemplateId: "class", scheduledForDate: "2030-01-01",
      occurrence: { programId: "program", startsAt: "2030-01-01T18:00:00.000Z", endsAt: "2030-01-01T19:00:00.000Z", timezone: "UTC", cancellationCutoffMinutes: 120 },
      funding: { kind: "MEMBERSHIP", id: "membership", version: "a".repeat(64), classReservations: 1 },
    }),
  };
  it("passes authentic command identity so the transaction derives current guardian attribution", async () => {
    await createSelfBooking(request);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "child",
        actor: request.actor,
        reviewedFunding: request.reviewedFunding,
      }),
    );
  });
  it("does not invent a guardian for an adult's own reservation", async () => {
    await createSelfBooking(request);
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("guardianId");
  });
});
