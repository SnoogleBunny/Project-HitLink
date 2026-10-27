import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  select: vi.fn(),
  cancel: vi.fn(),
  leave: vi.fn(),
  move: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@flowstate/db", () => ({ moveMemberClassBooking: mocks.move }));
vi.mock("../../../lib/member-auth", () => ({
  requireMemberCommandContext: mocks.context,
}));
vi.mock("../../_components/member-selector-actions", () => ({
  selectFamilyMember: mocks.select,
}));
vi.mock("../../../lib/self-service-bookings", () => ({
  cancelSelfBooking: mocks.cancel,
  leaveSelfWaitlist: mocks.leave,
}));
import {
  cancelSelfBookingAction,
  leaveSelfWaitlistAction,
  moveSelfBookingAction,
} from "./actions";
const state = { error: null };
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ context: {
    workspace: { id: "workspace" },
    member: { id: "submitted-child" },
    location: { timezone: "America/Vancouver" },
  }, actor: { userId: "guardian", sessionId: "server-session" } });
  mocks.cancel.mockResolvedValue({ status: "cancelled", bookingId: "booking" });
  mocks.leave.mockResolvedValue({
    status: "waitlist_left",
    waitlistEntryId: "waitlist",
  });
  mocks.move.mockResolvedValue({ status: "moved", bookingId: "new-booking" });
});
describe("participant-bound booking actions", () => {
  it.each([
    cancelSelfBookingAction,
    leaveSelfWaitlistAction,
    moveSelfBookingAction,
  ])(
    "rejects missing participant before any authorization fallback",
    async (action) => {
      expect((await action(state, new FormData())).error).toMatch(
        /participant/,
      );
      expect(mocks.context).not.toHaveBeenCalled();
      expect(mocks.move).not.toHaveBeenCalled();
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(mocks.leave).not.toHaveBeenCalled();
    },
  );
  it("reauthorizes the submitted beneficiary and restores that identity after cancellation", async () => {
    await expect(
      cancelSelfBookingAction(
        state,
        form({
          memberId: "submitted-child",
          bookingId: "booking",
          returnDate: "2026-11-04",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/schedule?notice=cancelled&date=2026-11-04",
    );
    expect(mocks.context).toHaveBeenCalledWith({
      memberId: "submitted-child",
      permission: "book",
    });
    expect(mocks.cancel).toHaveBeenCalledWith({
      workspaceId: "workspace",
      actor: { userId: "guardian", sessionId: "server-session" },
      memberId: "submitted-child",
      bookingId: "booking",
      timezone: "America/Vancouver",
    });
    expect(mocks.select).toHaveBeenCalledWith("submitted-child");
  });
  it("returns target validation failure without switching context or reporting success", async () => {
    mocks.move.mockResolvedValue({
      status: "error",
      message:
        "The last place was just taken. Your original booking is unchanged.",
    });
    expect(
      await moveSelfBookingAction(
        state,
        form({
          memberId: "submitted-child",
          bookingId: "original",
          targetClassTemplateId: "target",
          targetDate: "2026-11-05",
          mutationId: "attempt-1",
        }),
      ),
    ).toEqual({
      error:
        "The last place was just taken. Your original booking is unchanged.",
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("returns a successful move to its exact new booking and date", async () => {
    await expect(
      moveSelfBookingAction(
        state,
        form({
          memberId: "submitted-child",
          bookingId: "original",
          targetClassTemplateId: "target",
          targetDate: "2026-11-05",
          returnDate: "2026-11-04",
          mutationId: "attempt-1",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/app/schedule?notice=moved&date=2026-11-05&booking=new-booking",
    );
    expect(mocks.move).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "submitted-child",
        bookingId: "original",
        targetClassTemplateId: "target",
        targetDate: "2026-11-05",
        mutationId: "attempt-1",
      }),
    );
  });
  it("does not invoke a mutation after family authorization is revoked", async () => {
    mocks.context.mockRejectedValue(new Error("REVOKED"));
    await expect(
      leaveSelfWaitlistAction(
        state,
        form({ memberId: "submitted-child", waitlistEntryId: "waitlist" }),
      ),
    ).rejects.toThrow("REVOKED");
    expect(mocks.leave).not.toHaveBeenCalled();
  });
});
