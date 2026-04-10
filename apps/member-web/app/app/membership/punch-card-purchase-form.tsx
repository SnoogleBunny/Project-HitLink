"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import type { PurchasablePunchCardProduct } from "../../../lib/member-commerce";
import {
  emptyMembershipActionState,
  startPunchCardCheckoutAction,
} from "./actions";

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export function PunchCardPurchaseForm({
  products,
}: {
  products: PurchasablePunchCardProduct[];
}) {
  const [state, formAction] = useActionState(
    startPunchCardCheckoutAction,
    emptyMembershipActionState,
  );

  return (
    <div className="member-stack-list">
      {state.error ? <p className="member-form-error">{state.error}</p> : null}

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

          <form action={formAction} className="member-inline-form">
            <input name="punchCardProductId" type="hidden" value={product.id} />
            <SubmitButton pendingLabel="Starting checkout...">
              Buy punch card
            </SubmitButton>
          </form>
        </article>
      ))}
    </div>
  );
}
