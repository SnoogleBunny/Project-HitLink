"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import type { MemberBillingProfile } from "../../../../../lib/member-memberships";
import { emptyFormState } from "../../../../../lib/route-decisions";
import {
  assignMembershipAction,
  freezeMembershipAction,
} from "./actions";

export function MembershipAssignmentForm({
  memberId,
  plans,
}: {
  memberId: string;
  plans: MemberBillingProfile["availablePlans"];
}) {
  const [state, formAction] = useActionState(
    assignMembershipAction,
    emptyFormState,
  );
  const hasPlans = plans.length > 0;

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={memberId} />

      <label className="field">
        <span>Membership plan</span>
        <select disabled={!hasPlans} name="membershipPlanId">
          <option value="">Choose a plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} / {plan.currency.toUpperCase()}{" "}
              {(plan.monthlyPriceCents / 100).toFixed(2)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Next billing date</span>
        <input name="nextBillingDate" type="date" />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton disabled={!hasPlans} pendingLabel="Assigning membership...">
        Assign membership
      </SubmitButton>
    </form>
  );
}

export function MembershipFreezeForm({
  memberId,
  memberMembershipId,
}: {
  memberId: string;
  memberMembershipId: string;
}) {
  const [state, formAction] = useActionState(
    freezeMembershipAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={memberId} />
      <input
        name="memberMembershipId"
        type="hidden"
        value={memberMembershipId}
      />

      <div className="field-row">
        <label className="field">
          <span>Freeze from</span>
          <input name="frozenFrom" type="date" />
        </label>

        <label className="field">
          <span>Freeze until</span>
          <input name="frozenUntil" type="date" />
        </label>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving freeze...">
        Save freeze
      </SubmitButton>
    </form>
  );
}
