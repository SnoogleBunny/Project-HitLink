import Link from "next/link";
import { Money } from "@flowstate/ui";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import { getOwnCheckoutStatus } from "../../../../lib/checkout-status";
import { CheckPaymentForm } from "./check-payment-form";

export default async function CheckoutCompletePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const params = await searchParams;
  const checkout = await getOwnCheckoutStatus({ workspaceId: context.workspace.id, userId: context.session.userId, operationId: typeof params.operation === "string" ? params.operation : "" });
  const paid = Boolean(checkout?.paymentId);
  const complete = checkout?.status === "SUCCEEDED";
  const review = checkout?.status === "REVIEW_REQUIRED";
  const ended = checkout?.status === "FAILED";
  const title = !checkout ? "Payment request not found" : complete ? "Payment confirmed" : review ? "Payment needs review" : ended ? "Checkout ended" : "Payment pending";
  const description = !checkout ? "Open Payments to find your current requests." : complete ? "Your payment and access are confirmed." : review && paid ? "Your payment was received. The gym will arrange your access or refund; please do not pay again." : review ? "The gym needs to check the processor's response before you pay again." : ended ? "This checkout did not confirm a payment. Check availability before booking again." : "Check the current status or continue the same checkout.";
  return <MemberShell context={context} title={title} description={description}>
    <section className="member-card" role="status" aria-live="polite">
      {checkout?.beneficiaryMember ? <p>For {checkout.beneficiaryMember.fullName}</p> : null}
      {checkout?.amountCents != null && checkout.currency ? <p><Money amountMinor={checkout.amountCents} currency={checkout.currency} /></p> : null}
      {checkout && !complete && !review && !ended ? <CheckPaymentForm operationId={checkout.id} /> : null}
      <div className="member-inline-actions"><Link className="member-text-link" href="/app/schedule">Classes</Link><Link className="member-text-link" href="/app/membership">Membership</Link><Link className="member-text-link" href="/app/billing">Payments</Link></div>
    </section>
  </MemberShell>;
}
