import { FinancialError, startDurableCheckout, type PurchaseArgs, type CheckoutResult } from "@flowstate/db";
import { createStripeCheckoutGateway } from "@flowstate/payments";

type CommonPurchase = Omit<PurchaseArgs, "gateway" | "bookingId" | "punchCardProductId"> & { gateway?: PurchaseArgs["gateway"] };
async function start(args: CommonPurchase & { bookingId?: string; punchCardProductId?: string }): Promise<CheckoutResult> {
  try {
    return await startDurableCheckout({ ...args, gateway: args.gateway ?? createStripeCheckoutGateway() });
  } catch (error) {
    if (error instanceof FinancialError) return { status: "error", message: error.message };
    throw error;
  }
}
export function startDropInCheckout(args: CommonPurchase & { bookingId: string }) { return start(args); }
export function startPunchCardCheckout(args: CommonPurchase & { punchCardProductId: string }) { return start(args); }
