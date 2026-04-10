import Link from "next/link";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";

export default async function CheckoutCompletePage() {
  const context = await requireMemberPortalContext();

  return (
    <MemberShell
      context={context}
      title="Checkout complete"
      description="Stripe finished the payment flow. Your booking or punch-card balance will appear after the webhook finalizes it."
      actions={
        <Link className="member-button member-button-secondary" href="/app/bookings">
          Open bookings
        </Link>
      }
    >
      <section className="member-card">
        <p className="member-eyebrow">Payment received</p>
        <h3>Finalizing your access</h3>
        <p className="member-copy">
          If your new booking or punch card does not appear immediately, refresh
          in a few moments. This page does not write records directly.
        </p>
      </section>
    </MemberShell>
  );
}
