"use client";
import {
  formatMoney as formatKnownMoney,
  useWorkspaceLocale,
} from "@flowstate/ui";

import { useActionState, useState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import type { PunchCardProductSummary } from "../../../../../lib/access-products";
import { emptyFormState } from "../../../../../lib/route-decisions";
import { grantPunchCardAction } from "./actions";

export function OwnerPunchCardGrantForm({
  memberId,
  products,
}: {
  memberId: string;
  products: PunchCardProductSummary[];
}) {
  const locale = useWorkspaceLocale();
  const formatMoney = (amount: number, currency: string) =>
    formatKnownMoney(amount, currency, locale);
  const [state, formAction] = useActionState(
    grantPunchCardAction,
    emptyFormState,
  );
  const [mutationId] = useState(() => crypto.randomUUID());
  const [productId, setProductId] = useState("");
  const selected = products.find((product) => product.id === productId);
  const hasProducts = products.length > 0;

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={memberId} />
      <input name="mutationId" type="hidden" value={mutationId} />

      <label className="field">
        <span>Punch-card product</span>
        <select
          disabled={!hasProducts}
          name="punchCardProductId"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Choose a punch-card product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} / {product.punchesIncluded} punches /{" "}
              {formatMoney(product.priceCents, product.currency)}
              {product.isEnabled ? "" : " / Disabled for purchase"}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <div className="info-callout">
          <input
            name="expectedTermsVersion"
            type="hidden"
            value={selected.termsVersion ?? 1}
          />
          <p>
            {selected.punchesIncluded} class punches. Late cancellation:{" "}
            {selected.lateCancellationConsumesPunch === false
              ? "punch restored"
              : "uses one punch"}
            . No-show:{" "}
            {selected.noShowConsumesPunch === false
              ? "punch restored"
              : "uses one punch"}
            .
          </p>
          <p>Granting adds a pack without charging the member.</p>
          <label className="field-checkbox">
            <input
              required
              name="acceptedPackTerms"
              type="checkbox"
              key={selected.id}
            />
            <span>The member has accepted these pack terms.</span>
          </label>
        </div>
      ) : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton
        disabled={!hasProducts}
        pendingLabel="Granting punch card..."
      >
        Grant punch card
      </SubmitButton>
    </form>
  );
}
