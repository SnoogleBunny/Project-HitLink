"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import type {
  MembershipPlanFormOptions,
  MembershipPlanSummary,
} from "../../../lib/membership-plans";
import { emptyFormState } from "../../../lib/route-decisions";
import {
  createMembershipPlanAction,
  updateMembershipPlanAction,
} from "./actions";

function getSelectedProgramIds(plan?: MembershipPlanSummary): Set<string> {
  return new Set(plan?.programRestrictions.map((program) => program.id) ?? []);
}

export function MembershipPlanForm({
  mode,
  options,
  plan,
}: {
  mode: "create" | "edit";
  options: MembershipPlanFormOptions;
  plan?: MembershipPlanSummary;
}) {
  const formActionForMode =
    mode === "create" ? createMembershipPlanAction : updateMembershipPlanAction;
  const [state, formAction] = useActionState(formActionForMode, emptyFormState);
  const selectedProgramIds = getSelectedProgramIds(plan);
  const isStripeSynced = Boolean(plan?.stripePriceId);

  return (
    <form action={formAction} className="form-stack">
      {plan ? (
        <input name="membershipPlanId" type="hidden" value={plan.id} />
      ) : null}

      <label className="field">
        <span>Plan name</span>
        <input
          defaultValue={plan?.name ?? ""}
          name="name"
          placeholder="Unlimited monthly"
          type="text"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <input
          defaultValue={plan?.description ?? ""}
          name="description"
          placeholder="Optional owner-facing note"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Monthly price in cents</span>
          <input
            defaultValue={plan?.monthlyPriceCents ?? ""}
            disabled={isStripeSynced}
            min="1"
            name="monthlyPriceCents"
            placeholder="12900"
            type="number"
          />
        </label>

        <label className="field">
          <span>Currency</span>
          <input
            defaultValue={plan?.currency ?? "usd"}
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
            name="monthlyPriceCents"
            type="hidden"
            value={plan?.monthlyPriceCents ?? ""}
          />
          <input name="currency" type="hidden" value={plan?.currency ?? "usd"} />
          <p className="management-copy">
            This plan is synced to Stripe. Archive it and create a new plan to
            change price or currency.
          </p>
        </>
      ) : null}

      <label className="field">
        <span>Cancellation policy reference</span>
        <input
          defaultValue={plan?.cancellationPolicyReference ?? ""}
          name="cancellationPolicyReference"
          placeholder="30-day notice, owner approval"
          type="text"
        />
      </label>

      <label className="field">
        <span>Freeze policy reference</span>
        <input
          defaultValue={plan?.freezePolicyReference ?? ""}
          name="freezePolicyReference"
          placeholder="Owner-approved freezes"
          type="text"
        />
      </label>

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
                <p>Allow this plan for this program.</p>
              </div>
            </label>
          ))
        )}
      </fieldset>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving membership plan...">
        {mode === "create" ? "Create membership plan" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
