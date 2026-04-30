"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import type {
  AccessProductFormOptions,
  PunchCardProductSummary,
} from "../../../lib/access-products";
import {
  createPunchCardProductAction,
  updatePunchCardProductAction,
} from "./actions";

function getSelectedProgramIds(
  product?: PunchCardProductSummary,
): Set<string> {
  return new Set(product?.programRestrictions.map((program) => program.id) ?? []);
}

export function PunchCardProductForm({
  mode,
  options,
  product,
}: {
  mode: "create" | "edit";
  options: AccessProductFormOptions;
  product?: PunchCardProductSummary;
}) {
  const formActionForMode =
    mode === "create"
      ? createPunchCardProductAction
      : updatePunchCardProductAction;
  const [state, formAction] = useActionState(formActionForMode, emptyFormState);
  const selectedProgramIds = getSelectedProgramIds(product);
  const isStripeSynced = Boolean(product?.stripePriceId);

  return (
    <form action={formAction} className="form-stack">
      {product ? (
        <input name="punchCardProductId" type="hidden" value={product.id} />
      ) : null}

      <label className="field">
        <span>Product name</span>
        <input
          defaultValue={product?.name ?? ""}
          name="name"
          placeholder="10-class pack"
          type="text"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <input
          defaultValue={product?.description ?? ""}
          name="description"
          placeholder="Optional owner-facing note"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Included punches</span>
          <input
            defaultValue={product?.punchesIncluded ?? ""}
            disabled={isStripeSynced}
            min="1"
            name="punchesIncluded"
            placeholder="10"
            type="number"
          />
        </label>

        <label className="field">
          <span>Price in cents</span>
          <input
            defaultValue={product?.priceCents ?? ""}
            disabled={isStripeSynced}
            min="1"
            name="priceCents"
            placeholder="25000"
            type="number"
          />
        </label>

        <label className="field">
          <span>Currency</span>
          <input
            defaultValue={product?.currency ?? "usd"}
            disabled={isStripeSynced}
            maxLength={3}
            name="currency"
            placeholder="usd"
            type="text"
          />
        </label>
      </div>

      {isStripeSynced ? (
        <>
          <input
            name="punchesIncluded"
            type="hidden"
            value={product?.punchesIncluded ?? ""}
          />
          <input name="priceCents" type="hidden" value={product?.priceCents ?? ""} />
          <input name="currency" type="hidden" value={product?.currency ?? "usd"} />
          <p className="management-copy">
            This product is synced to Stripe. Archive it and create a new one to
            change punch count, price, or currency.
          </p>
        </>
      ) : null}

      <fieldset className="form-stack">
        <legend>Program restrictions</legend>
        {options.programs.length === 0 ? (
          <p className="empty-state">
            No active programs yet. Leave restrictions empty for all programs.
          </p>
        ) : (
          options.programs.map((program) => (
            <label key={program.id} className="field-checkbox">
              <input
                defaultChecked={selectedProgramIds.has(program.id)}
                name="programIds"
                type="checkbox"
                value={program.id}
              />
              <div>
                <strong>{program.name}</strong>
                <p>Allow this punch card for this program.</p>
              </div>
            </label>
          ))
        )}
      </fieldset>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving punch card...">
        {mode === "create" ? "Create punch card" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
