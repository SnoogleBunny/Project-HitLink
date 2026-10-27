/** Known immutable receipt only. Do not export provider IDs, arbitrary metadata, private finance reasons or communication recipients. */
export const membershipGraceReleaseMessage = "This reservation was released because its membership payment needs attention. No late-cancellation or no-show penalty was added. Payment does not restore this seat; book again subject to current eligibility and capacity.";
export function projectMembershipGraceReceipt(value: unknown, memberScope = false) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (key: string) => typeof raw[key] === "string" ? raw[key] : null;
  const count = (key: string, minimum = 0) => Number.isSafeInteger(raw[key]) && Number(raw[key]) >= minimum && Number(raw[key]) <= 2147483647 ? Number(raw[key]) : null;
  return {
    schemaVersion: raw.schemaVersion === 1 ? 1 : null,
    bookingId: text("bookingId"), fundingRevision: count("fundingRevision", 1), membershipId: text("membershipId"), memberId: text("memberId"), classTemplateId: text("classTemplateId"),
    scheduledForDate: text("scheduledForDate"), startsAt: text("startsAt"), timezone: text("timezone"), restrictedAt: text("restrictedAt"),
    basis: ["FIXED_GRACE_EXPIRED", "UNRESOLVED_FAILURE_TIMING"].includes(String(raw.basis)) ? raw.basis : null,
    gracePeriodEndsAt: text("gracePeriodEndsAt"), action: raw.action === "DEFAULT_CANCEL_RELEASE" ? raw.action : null,
    from: raw.from === "BOOKED" ? "BOOKED" : null, to: raw.to === "CANCELLED" ? "CANCELLED" : null, noShowPenalty: raw.noShowPenalty === false ? false : null,
    allowanceAllocationIds: Array.isArray(raw.allowanceAllocationIds) ? raw.allowanceAllocationIds.filter((item): item is string => typeof item === "string") : [],
    ...(memberScope ? {} : { invoiceId: text("invoiceId"), notificationRecipientCount: count("notificationRecipientCount") }),
  };
}
