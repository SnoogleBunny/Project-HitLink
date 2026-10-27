export const DEFAULT_DISPLAY_LOCALE = "en-CA";
/** Presentation only. Date keys, accepted currencies and ledger units stay canonical. */
export function resolveDisplayLocale(value?: string | null): string {
  try {
    const locale = Intl.getCanonicalLocales(
      value?.trim() || DEFAULT_DISPLAY_LOCALE,
    )[0];
    return locale && Intl.DateTimeFormat.supportedLocalesOf([locale]).length
      ? locale
      : DEFAULT_DISPLAY_LOCALE;
  } catch {
    return DEFAULT_DISPLAY_LOCALE;
  }
}
export function formatDisplayDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
  locale?: string | null,
): string {
  return new Intl.DateTimeFormat(resolveDisplayLocale(locale), {
    timeZone: "UTC",
    ...options,
  }).format(typeof value === "string" ? new Date(value) : value);
}
