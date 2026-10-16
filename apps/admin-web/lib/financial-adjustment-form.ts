import { FinancialError } from "@flowstate/db";
export interface AdjustmentFormState {
  values: Record<string, string>;
  error?: string;
  reviewHash?: string;
  payer?: string;
  beneficiary?: string;
  amountCents?: number;
  currency?: string;
  affectedBookings?: string[];
  remainingVisits?: number;
  hasCoaching?: boolean;
}
export function parseAdjustmentAmount(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new FinancialError(
      "Enter a positive amount with no more than two decimal places.",
    );
  const [whole, decimals = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2_147_483_647)
    throw new FinancialError(
      "Enter a positive amount within the supported range.",
    );
  return cents;
}
