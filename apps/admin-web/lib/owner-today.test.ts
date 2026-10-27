import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedClassOccurrence } from "@flowstate/db";

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), bookings: vi.fn(), memberCount: vi.fn(), payments: vi.fn(),
  reviews: vi.fn(), attendance: vi.fn(), membershipRequests: vi.fn(), invoices: vi.fn(),
}));
vi.mock("@flowstate/db", async () => {
  const actual = await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db");
  return {
    ...actual,
    listClassOccurrences: mocks.occurrences,
    prisma: {
      classBooking: { findMany: mocks.bookings },
      member: { count: mocks.memberCount },
      financialReviewCase: { findMany: mocks.reviews },
      attendanceRecord: { findMany: mocks.attendance },
      membershipLifecycleRequest: { findMany: mocks.membershipRequests },
      invoice: { findMany: mocks.invoices },
    },
  };
});
vi.mock("./failed-payments", async () => {
  const actual = await vi.importActual<typeof import("./failed-payments")>("./failed-payments");
  return { ...actual, listFailedPaymentQueue: mocks.payments };
});
import { chooseTodayClass, getOwnerToday } from "./owner-today";

const now = new Date("2026-10-16T02:00:00Z"); // Oct 15, 7 pm at the gym.
function lesson(id: string, startTimeMinutes: number, endTimeMinutes: number) {
  return {
    id, classTemplateId: id, workspaceId: "gym", scheduledForDate: "2026-10-15",
    status: "ACTIVE", displayTitle: id, startTimeMinutes, endTimeMinutes,
    room: { id: "mat", name: "Main mat", capacity: 20 }, effectiveCapacity: 20,
  } as ResolvedClassOccurrence;
}
function booking(id: string, classTemplateId: string, status = "BOOKED", bookingType = "MEMBERSHIP") {
  return { id, classTemplateId, status, bookingType, member: { id, fullName: id } };
}

describe("owner Today persisted evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.occurrences.mockResolvedValue([]);
    mocks.bookings.mockResolvedValue([]);
    mocks.memberCount.mockResolvedValue(0);
    mocks.payments.mockResolvedValue([]);
    mocks.reviews.mockResolvedValue([]);
    mocks.attendance.mockResolvedValue([]);
    mocks.membershipRequests.mockResolvedValue([]);
    mocks.invoices.mockResolvedValue([]);
  });

  it("scopes every query to the owner gym and its local day, with only unresolved reviews", async () => {
    const result = await getOwnerToday("gym", "America/Vancouver", now);
    expect(result.date).toBe("2026-10-15");
    expect(mocks.occurrences).toHaveBeenCalledWith({ workspaceId: "gym", fromDate: "2026-10-15", toDate: "2026-10-15" });
    expect(mocks.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: {
      workspaceId: "gym", scheduledForDate: new Date("2026-10-15T00:00:00Z"),
      status: { in: ["BOOKED", "PENDING_PAYMENT", "ATTENDED", "ABSENT", "NO_SHOW"] },
    } }));
    expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: {
      workspaceId: "gym", scheduledForDate: new Date("2026-10-15T00:00:00Z"),
    } }));
    expect(mocks.memberCount).toHaveBeenCalledWith({ where: { workspaceId: "gym", status: "ACTIVE", archivedAt: null } });
    expect(mocks.payments).toHaveBeenCalledWith({ workspaceId: "gym" });
    expect(mocks.reviews).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "gym", resolvedAt: null } }));
    expect(mocks.membershipRequests).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "gym", state: "RECEIVED", activeSlot: "ACTIVE" } }));
    expect(result).toMatchObject({ activeMembers: 0, paymentCount: 0, selectedClass: null, attention: [], trials: [] });
  });

  it("keeps occupancy and trial destinations tied to the same dated occurrence", async () => {
    const morning = lesson("morning", 420, 480), evening = lesson("evening", 1200, 1260);
    mocks.occurrences.mockResolvedValue([evening, { ...lesson("cancelled", 360, 400), status: "CANCELLED" }, morning]);
    mocks.bookings.mockResolvedValue([
      booking("reserved", "morning"), booking("pending", "morning", "PENDING_PAYMENT"),
      booking("attended", "morning", "ATTENDED"), booking("trial", "evening", "BOOKED", "TRIAL"),
      booking("cancelled-trial", "cancelled", "BOOKED", "TRIAL"),
    ]);
    const result = await getOwnerToday("gym", "America/Vancouver", now);
    expect(result.classes.map((item) => [item.id, item.booked])).toEqual([["morning", 3], ["evening", 1]]);
    expect(result.selectedClass).toMatchObject({ id: "evening", booked: 1, canEdit: true });
    expect(result.trials.map((item) => [item.id, item.occurrence.id])).toEqual([["trial", "evening"]]);
  });

  it("only flags an ended class's booked member when its attendance is missing", async () => {
    mocks.occurrences.mockResolvedValue([lesson("ended", 420, 480), lesson("future", 1200, 1260)]);
    mocks.bookings.mockResolvedValue([
      booking("missing", "ended"), booking("recorded", "ended"),
      booking("pending", "ended", "PENDING_PAYMENT"), booking("settled", "ended", "ATTENDED"),
      booking("later", "future"),
    ]);
    mocks.attendance.mockResolvedValue([{ classTemplateId: "ended", memberId: "recorded" }]);
    const result = await getOwnerToday("gym", "America/Vancouver", now);
    expect(result.attention).toEqual([expect.objectContaining({
      category: "Attendance", title: "ended · attendance not recorded",
      description: "1 booked member needs an attendance decision.",
      href: "/dashboard/schedule/ended/roster?date=2026-10-15",
    })]);
    mocks.attendance.mockResolvedValue([{ classTemplateId: "ended", memberId: "recorded" }, { classTemplateId: "ended", memberId: "missing" }]);
    expect((await getOwnerToday("gym", "America/Vancouver", now)).attention).toEqual([]);
  });

  it("matches Billing's unresolved count and links named financial and membership records", async () => {
    mocks.payments.mockResolvedValue([{
      id: "failed", status: "PAYMENT_FAILED", latestInvoiceId: "in-failed", gracePeriodEndsAt: new Date("2026-10-20T07:00:00Z"),
      member: { id: "payer", fullName: "Dana Owner" },
      memberMembership: { membershipPlan: { name: "Monthly", monthlyPriceCents: 14900, currency: "CAD" } },
    }]);
    mocks.reviews.mockResolvedValue([
      { id: "refund", reason: "Refund confirmation pending", amountCents: 4000, currency: "CAD", member: { fullName: "Casey Member" }, payerAccount: null },
      { id: "dispute", reason: "Reviewer assigned; outcome not confirmed", amountCents: 9000, currency: "CAD", member: null, payerAccount: { member: { fullName: "Avery Payer" } } },
    ]);
    mocks.membershipRequests.mockResolvedValue([{ id: "freeze", kind: "FREEZE", membership: { member: { id: "member", fullName: "Riley Member" } } }]);
    mocks.invoices.mockResolvedValue([{ stripeInvoiceId: "in-failed", amountDueCents: 7450, currency: "CAD" }]);
    const result = await getOwnerToday("gym", "America/Vancouver", now);
    expect(result.paymentCount).toBe(3);
    expect(result.attention.map((item) => item.href)).toEqual([
      "/dashboard/members/payer/billing", "/dashboard/billing/reviews/refund",
      "/dashboard/billing/reviews/dispute", "/dashboard/members/member/billing",
    ]);
    expect(mocks.invoices).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "gym", stripeInvoiceId: { in: ["in-failed"] } } }));
    expect(result.attention[0]).toMatchObject({ title: "Dana Owner · payment failed", amountCents: 7450, currency: "CAD" });
    expect(result.attention[2]?.title).toContain("Avery Payer");
    expect(result.attention[3]?.title).toContain("membership freeze requested");
    mocks.invoices.mockResolvedValue([]);
    expect((await getOwnerToday("gym", "America/Vancouver", now)).attention[0]?.amountCents).toBeUndefined();
  });
});

describe("owner Today class selection", () => {
  it("uses the gym clock and falls back to the last class after the day's final class", () => {
    const classes = [lesson("morning", 420, 480), lesson("evening", 1200, 1260)];
    expect(chooseTodayClass(classes, now, "America/Vancouver")?.id).toBe("evening");
    expect(chooseTodayClass(classes, new Date("2026-10-16T06:00:00Z"), "America/Vancouver")?.id).toBe("evening");
    expect(chooseTodayClass([], now, "America/Vancouver")).toBeNull();
  });
});
