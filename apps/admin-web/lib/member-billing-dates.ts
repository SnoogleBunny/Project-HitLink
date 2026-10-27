/** Date-only database values use UTC; instants pass the accepted billing timezone. */
export function formatMemberBillingDate(
  value: Date | null,
  timeZone = "UTC",
  locale = "en-CA",
): string {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone,
      }).format(value)
    : "Not set";
}
