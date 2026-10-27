/** Accepted amounts use minor currency units and one nonbreaking text run. */
export function formatMoney(
  amountMinor: number,
  currency = "CAD",
  locale = "en-CA",
): string {
  const code = currency.toUpperCase();
  const digits =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return `${code}\u202f${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amountMinor / 10 ** digits)}`;
}
