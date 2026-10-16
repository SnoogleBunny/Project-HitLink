/** Accepted amounts use minor currency units and one nonbreaking text run. */
export function formatMoney(amountMinor: number, currency = "CAD"): string {
  return `${currency.toUpperCase()}\u202f${new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountMinor / 100)}`;
}
