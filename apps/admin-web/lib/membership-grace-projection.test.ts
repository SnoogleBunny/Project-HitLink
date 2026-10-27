import { describe, expect, it } from "vitest";
import { projectMembershipGraceReceipt } from "../../../packages/db/src/membership-grace-projection";
import { projectWorkspaceAudit } from "./workspace-audit";
const receipt = { schemaVersion: 1, bookingId: "own-booking", fundingRevision: 3, membershipId: "own-membership", memberId: "own-member", classTemplateId: "own-class", scheduledForDate: "2030-01-08", startsAt: "2030-01-08T18:00:00.000Z", timezone: "UTC", restrictedAt: "2030-01-08T12:00:00.000Z", basis: "FIXED_GRACE_EXPIRED", invoiceId: "payer-invoice", gracePeriodEndsAt: "2030-01-08T12:00:00.000Z", action: "DEFAULT_CANCEL_RELEASE", from: "BOOKED", to: "CANCELLED", noShowPenalty: false, allowanceAllocationIds: ["original-window"], notificationRecipientCount: 1, privateNote: "PRIVATE_SENTINEL", bearer: "BEARER_SENTINEL", recipientEmail: "private@example.test" };
describe("narrow immutable grace receipt presentation", () => {
  it("owner audit includes the reasoned system effect but excludes arbitrary private payload", () => {
    const result = projectWorkspaceAudit("MEMBERSHIP_GRACE_BOOKING_RELEASED", receipt);
    expect(result.before).toEqual({ status: "BOOKED" }); expect(result.after).toEqual({ status: "CANCELLED" }); expect(result.reason).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SENTINEL|BEARER_SENTINEL|private@example/);
    expect(result.context).toMatchObject({ invoiceId: "payer-invoice", notificationRecipientCount: 1, noShowPenalty: false });
  });
  it("member projection excludes payer identity and communication-recipient details", () => {
    const result = projectMembershipGraceReceipt(receipt, true);
    expect(result.bookingId).toBe("own-booking"); expect(result).not.toHaveProperty("invoiceId"); expect(result).not.toHaveProperty("notificationRecipientCount");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SENTINEL|BEARER_SENTINEL|private@example/);
  });
});
