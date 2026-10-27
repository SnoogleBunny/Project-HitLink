import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDirectBookingFundingReview } from "../../../packages/db/src/direct-booking-funding.js";
const mock = vi.hoisted(() => ({
  context: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  checkout: vi.fn(),
  select: vi.fn(),
}));
vi.mock("./member-auth", () => ({ requireMemberCommandContext: mock.context }));
vi.mock("./self-service-bookings", () => ({
  createSelfBooking: mock.create,
  joinSelfWaitlist: mock.join,
}));
vi.mock("./member-commerce", () => ({ startDropInCheckout: mock.checkout }));
vi.mock("../app/_components/member-selector-actions", () => ({
  selectFamilyMember: mock.select,
}));
vi.mock(
  "@flowstate/db",
  async () =>
    await import("../../../packages/db/src/direct-booking-funding.js"),
);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "localhost:3101", "x-forwarded-proto": "http" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import {
  createSelfBookingAction,
  resumeBookingPaymentAction,
} from "../app/app/schedule/actions";

const review = () =>
  buildDirectBookingFundingReview({
    workspaceId: "trusted-gym",
    memberId: "selected-child",
    classTemplateId: "class",
    scheduledForDate: "2030-01-07",
    occurrence: {
      programId: "program",
      startsAt: "2030-01-07T18:00:00.000Z",
      endsAt: "2030-01-07T19:00:00.000Z",
      timezone: "UTC",
      cancellationCutoffMinutes: 120,
    },
    funding: {
      kind: "PUNCH_CARD",
      id: "owned-pack",
      version: "a".repeat(64),
      units: 1,
    },
  });
function form(withReview = true) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    memberId: "selected-child",
    workspaceId: "posted-foreign-gym",
    sessionId: "posted-foreign-session",
    actorUserId: "posted-foreign-user",
    classTemplateId: "class",
    scheduledForDate: "2030-01-07",
    actionKind: "book",
  }))
    data.set(key, value);
  if (withReview) data.set("reviewedFunding", JSON.stringify(review()));
  return data;
}
describe("direct booking action review boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.context.mockResolvedValue({ context: {
      workspace: { id: "trusted-gym" },
      member: { id: "selected-child" },
      location: { timezone: "UTC" },
      session: { userId: "guardian" },
      permissions: { guardianId: "verified-guardian", canPay: false },
    }, actor: { userId: "guardian", sessionId: "server-session" } });
    mock.create.mockResolvedValue({
      status: "created",
      bookingId: "accepted-booking",
    });
    mock.checkout.mockResolvedValue({
      status: "ready",
      url: "http://localhost:3101/fixture-checkout",
    });
  });
  it("denies a missing review before booking or checkout", async () => {
    expect(
      await createSelfBookingAction({ error: null }, form(false)),
    ).toMatchObject({
      reviewRequired: true,
      error: expect.stringContaining("Refresh booking choices"),
    });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it("denies malformed or oversized review without falling back to automatic funding", async () => {
    for (const value of ["not-json", "x".repeat(4097)]) {
      const data = form();
      data.set("reviewedFunding", value);
      expect(
        await createSelfBookingAction({ error: null }, data),
      ).toMatchObject({ reviewRequired: true });
    }
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it("uses current participant context and exact reviewed pack while keeping booking and payer grants separate", async () => {
    await expect(
      createSelfBookingAction({ error: null }, form()),
    ).rejects.toThrow("redirect:/app/schedule?");
    expect(mock.context).toHaveBeenCalledWith({
      permission: "book",
      memberId: "selected-child",
    });
    expect(mock.create).toHaveBeenCalledWith({
      workspaceId: "trusted-gym",
      memberId: "selected-child",
      actor: { userId: "guardian", sessionId: "server-session" },
      timezone: "UTC",
      allowDropIn: false,
      classTemplateId: "class",
      scheduledForDate: "2030-01-07",
      reviewedFunding: review(),
    });
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it("keeps a stale review visible and does not begin payment", async () => {
    mock.create.mockResolvedValue({
      status: "error",
      code: "REVIEW_REQUIRED",
      message: "Refresh booking choices",
    });
    expect(await createSelfBookingAction({ error: null }, form())).toEqual({
      error: "Refresh booking choices",
      reviewRequired: true,
    });
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it("does not create a purchase for a booking-only guardian even if a forged action omits pay_and_book", async () => {
    mock.create.mockResolvedValue({
      status: "payment_required",
      bookingId: "pending",
    });
    expect(
      await createSelfBookingAction({ error: null }, form()),
    ).toMatchObject({
      error: expect.stringContaining("do not allow purchases"),
    });
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it("retains separate waitlist standing consent without requiring a direct funding review", async () => {
    const data = form(false);
    data.set("actionKind", "join_waitlist");
    data.set("autoPromotionOptIn", "on");
    data.set("allowPunchCardFunding", "on");
    mock.join.mockResolvedValue({
      status: "waitlist_joined",
      waitlistEntryId: "queue",
    });
    await expect(
      createSelfBookingAction({ error: null }, data),
    ).rejects.toThrow("redirect:/app/schedule?");
    expect(mock.join).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "selected-child",
        actor: { userId: "guardian", sessionId: "server-session" },
        allowPunchCardFunding: true,
      }),
    );
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("recovers payment for the original accepted booking without creating a new reviewed claim", async () => {
    mock.context.mockResolvedValueOnce({ context: {
      workspace: { id: "trusted-gym" },
      member: { id: "selected-child" },
      location: { timezone: "UTC" },
      session: { userId: "guardian" },
      permissions: { guardianId: "verified-guardian", canPay: true },
    }, actor: { userId: "guardian", sessionId: "server-session" } });
    const data = form(false);
    data.set("bookingId", "original-pending-booking");
    data.set("returnDate", "2030-01-07");
    await expect(
      resumeBookingPaymentAction({ error: null }, data),
    ).rejects.toThrow("redirect:http://localhost:3101/fixture-checkout");
    expect(mock.context).toHaveBeenCalledWith({
      memberId: "selected-child",
      permission: "pay",
    });
    expect(mock.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "trusted-gym",
        memberId: "selected-child",
        bookingId: "original-pending-booking",
        actorUserId: "guardian",
      }),
    );
    expect(mock.create).not.toHaveBeenCalled();
  });
});
