/** Date-only database values use UTC; instants pass the accepted billing timezone. */
export function formatMemberBillingDate(
  value: Date | null,
  timeZone = "UTC",
): string {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeZone,
      }).format(value)
    : "Not set";
}
