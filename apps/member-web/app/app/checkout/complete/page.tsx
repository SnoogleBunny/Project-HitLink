import Link from "next/link";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import {
  verifyLocalCheckoutReturn,
  type CheckoutReturnOutcome,
} from "../../../../lib/member-commerce";

interface CheckoutCompletePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface CheckoutReturnView {
  title: string;
  description: string;
  detail: string;
  copy: string;
}

const unverifiedView: CheckoutReturnView = {
  title: "Checkout status not verified",
  description:
    "This page does not have verified payment evidence. Check your bookings or membership before relying on access.",
  detail: "Payment status unknown",
  copy: "Opening this route directly does not prove that checkout finished. This page does not write booking, punch-card, or payment records.",
};

const verifiedViews: Record<CheckoutReturnOutcome, CheckoutReturnView> = {
  pending: {
    title: "Checkout is still pending",
    description:
      "Verified local fixture evidence reports a pending checkout return. This does not confirm a live Stripe payment.",
    detail: "Pending return reported",
    copy: "Wait for the related booking or membership to show its current access state before relying on it.",
  },
  success: {
    title: "Checkout returned successfully",
    description:
      "Verified local fixture evidence reports a successful checkout return. This does not confirm a live Stripe payment.",
    detail: "Successful return reported",
    copy: "Check your bookings or membership for provisioned access. This route does not write payment or access records.",
  },
  failure: {
    title: "Checkout did not succeed",
    description:
      "Verified local fixture evidence reports a failed checkout return. This does not confirm a live Stripe payment.",
    detail: "Failed return reported",
    copy: "No payment or access is implied. Return to bookings or membership when you are ready to try again.",
  },
};

export default async function CheckoutCompletePage({
  searchParams,
}: CheckoutCompletePageProps) {
  const [context, params] = await Promise.all([
    requireMemberPortalContext(),
    searchParams,
  ]);
  const returnState = verifyLocalCheckoutReturn({
    checkoutReturn: params.checkout_return,
    workspaceId: context.workspace.id,
    memberId: context.member.id,
  });
  const view =
    returnState.status === "verified"
      ? verifiedViews[returnState.outcome]
      : unverifiedView;

  return (
    <MemberShell
      context={context}
      title={view.title}
      description={view.description}
      actions={
        <Link className="member-button member-button-secondary" href="/app/bookings">
          Open bookings
        </Link>
      }
    >
      <section aria-live="polite" className="member-card" role="status">
        <p className="member-eyebrow">
          {returnState.status === "verified"
            ? "Verified local fixture"
            : "No verified return"}
        </p>
        <h3>{view.detail}</h3>
        <p className="member-copy">{view.copy}</p>
      </section>
    </MemberShell>
  );
}
