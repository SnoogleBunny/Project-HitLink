"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import type {
  AccessProductFormOptions,
  DropInProductSummary,
} from "../../../lib/access-products";
import {
  createDropInProductAction,
  updateDropInProductAction,
} from "./actions";

function getSelectedProgramIds(product?: DropInProductSummary): Set<string> {
  return new Set(product?.programRestrictions.map((program) => program.id) ?? []);
}

export function DropInProductForm({
  mode,
  options,
  product,
}: {
  mode: "create" | "edit";
  options: AccessProductFormOptions;
  product?: DropInProductSummary;
}) {
  const formActionForMode =
    mode === "create" ? createDropInProductAction : updateDropInProductAction;
  const [state, formAction] = useActionState(formActionForMode, emptyFormState);
  const selectedProgramIds = getSelectedProgramIds(product);
  const isStripeSynced = Boolean(product?.stripePriceId);

  return (
    <form action={formAction} className="form-stack">
      {product ? (
        <input name="dropInProductId" type="hidden" value={product.id} />
      ) : null}

      <label className="field">
        <span>Product name</span>
        <input
          defaultValue={product?.name ?? ""}
          name="name"
          placeholder="Single class drop-in"
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
          <span>Price in cents</span>
          <input
            defaultValue={product?.priceCents ?? ""}
            disabled={isStripeSynced}
            min="1"
            name="priceCents"
            placeholder="3500"
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
          <input name="priceCents" type="hidden" value={product?.priceCents ?? ""} />
          <input name="currency" type="hidden" value={product?.currency ?? "usd"} />
          <p className="management-copy">
            This product is synced to Stripe. Archive it and create a new one to
            change price or currency.
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
                <p>Allow this drop-in for this program.</p>
              </div>
            </label>
          ))
        )}
      </fieldset>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving drop-in...">
        {mode === "create" ? "Create drop-in" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
