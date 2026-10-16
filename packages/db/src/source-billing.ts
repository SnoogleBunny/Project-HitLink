import { toDateOnlyString } from "./occurrences.js";

/** Source billing grants only the reviewed date interval. It cannot authorize a destination charge. */
export function sourceBillingCoversDate(
  membership: {
    sourceBillingManaged?: boolean;
    sourceAccessHeld?: boolean;
    frozenFrom?: Date | null;
    sourceBillingEvidence?: Array<{ paidFrom: Date; paidThrough: Date }>;
  },
  date: string | undefined,
): boolean {
  if (!membership.sourceBillingManaged) return true;
  if (
    membership.sourceAccessHeld &&
    (!date ||
      !membership.frozenFrom ||
      date >= toDateOnlyString(membership.frozenFrom))
  )
    return false;
  return (
    !!date &&
    !!membership.sourceBillingEvidence?.some(
      (receipt) =>
        date >= toDateOnlyString(receipt.paidFrom) &&
        date < toDateOnlyString(receipt.paidThrough),
    )
  );
}
