"use client";
import { formatMoney as formatKnownMoney } from "@flowstate/ui/money";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import type { PurchasablePunchCardProduct } from "../../../lib/member-commerce";
import { emptyMembershipActionState } from "../../form-states";
import { startPunchCardCheckoutAction } from "./actions";

function formatMoney(amountCents: number, currency: string): string {
  return formatKnownMoney(amountCents, currency);
}

export function PunchCardPurchaseForm({
  products,
  purchaseUnavailableReason,
  memberId,
  requestId,
}: {
  products: PurchasablePunchCardProduct[];
  purchaseUnavailableReason: string | null;
  memberId?: string;
  requestId?: string;
}) {
  const [state, formAction] = useActionState(
    startPunchCardCheckoutAction,
    emptyMembershipActionState,
  );

  return (
    <div className="member-stack-list">
      {state.error ? <p className="member-form-error">{state.error}</p> : null}
      {purchaseUnavailableReason ? (
        <p id="punch-card-purchase-unavailable" className="member-copy">
          {purchaseUnavailableReason}
        </p>
      ) : null}

      {products.map((product) => (
        <article key={product.id} className="member-stack-item">
          <div className="member-stack-copy">
            <div className="member-stack-heading">
              <h4>{product.name}</h4>
              <span className="member-status-pill">
                {product.punchesIncluded} punches
              </span>
            </div>
            <p>{product.description ?? "No description yet."}</p>
            <dl className="member-inline-meta">
              <div>
                <dt>Price</dt>
                <dd>{formatMoney(product.priceCents, product.currency)}</dd>
              </div>
              <div>
                <dt>Programs</dt>
                <dd>{product.restrictionSummary}</dd>
              </div>
            </dl>
          </div>

          <form action={formAction} className="member-inline-form" data-person-context>
            <input name="memberId" type="hidden" value={memberId} />
            <input name="punchCardProductId" type="hidden" value={product.id} />
            <input name="requestId" type="hidden" value={requestId ? `${requestId}:${product.id}` : undefined} />
            {purchaseUnavailableReason ? (
              <button
                aria-describedby="punch-card-purchase-unavailable"
                className="member-button"
                disabled
                type="submit"
              >
                Buy punch card
              </button>
            ) : (
              <SubmitButton pendingLabel="Starting checkout...">
                Buy punch card
              </SubmitButton>
            )}
          </form>
        </article>
      ))}
    </div>
  );
}
