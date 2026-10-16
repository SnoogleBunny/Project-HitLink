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
  const policy = plan?.lifecyclePolicy ?? options.lifecyclePolicy;

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

      <fieldset className="form-stack">
        <legend>Class allowance</legend>
        <p className="management-copy">Limits follow the member&apos;s billing cycle and apply across all eligible programs. Leave both blank for unlimited classes. Existing memberships keep their accepted terms.</p>
        <div className="field-row">
          <label className="field"><span>Classes per billing week</span><input name="weeklyClassLimit" type="number" min="1" step="1" defaultValue={plan?.weeklyClassLimit ?? ""} placeholder="Unlimited" /></label>
          <label className="field"><span>Classes per billing month</span><input name="monthlyClassLimit" type="number" min="1" step="1" defaultValue={plan?.monthlyClassLimit ?? ""} placeholder="Unlimited" /></label>
        </div>
        <p className="management-copy">Weeks start at renewal, every seven days. A shorter final week has the full weekly allowance. Both limits apply when set.</p>
        <label className="field"><span>Count classes by</span><select name="allowanceCountingMode" defaultValue={plan?.allowanceCountingMode ?? "ATTENDANCE"}><option value="ATTENDANCE">Attendance — show used and reserved separately</option><option value="RESERVATION">Reservations — include upcoming bookings in the count</option></select></label>
        <p className="management-copy">Every booking reserves a class in either mode. Attendance settles that reservation once.</p>
        <label className="field-checkbox"><input type="checkbox" name="lateCancellationConsumesClass" defaultChecked={plan?.lateCancellationConsumesClass ?? true} /><span>Late cancellations use one class</span></label>
        <label className="field-checkbox"><input type="checkbox" name="noShowConsumesClass" defaultChecked={plan?.noShowConsumesClass ?? true} /><span>No-shows use one class</span></label>
      </fieldset>

      <fieldset className="form-stack">
        <legend>Cancellation and freezes</legend>
        <p className="management-copy">New memberships accept this policy. Changing it keeps existing contracts unchanged.</p>
        {plan && !plan.lifecyclePolicy ? <p className="info-callout">This plan has no structured policy yet. Review these defaults before saving. Existing members still need their original agreement checked.</p> : null}
        <div className="field-row">
          <label className="field"><span>Notice length</span><input name="noticeLength" type="number" required min="0" step="1" defaultValue={policy?.noticeLength ?? 2} /></label>
          <label className="field"><span>Notice measured in</span><select name="noticeUnit" defaultValue={policy?.noticeUnit ?? "CALENDAR_MONTHS"}><option value="CALENDAR_MONTHS">Calendar months</option><option value="BILLING_CYCLES">Billing cycles</option><option value="DAYS">Days</option></select></label>
        </div>
        <label className="field"><span>Membership ends</span><select name="noticeAlignment" defaultValue={policy?.alignment ?? "NEXT_BILLING_BOUNDARY"}><option value="NEXT_BILLING_BOUNDARY">At the next billing boundary after notice</option><option value="EXACT_DATE">On the exact notice end date</option></select></label>
        <label className="field"><span>Billing during notice</span><select name="noticeBilling" defaultValue={policy?.noticeBilling ?? "CONTINUE"}><option value="CONTINUE">Continue scheduled renewals</option><option value="OWNER_REVIEW">Owner decides for each cancellation</option></select></label>
        <label className="field-checkbox"><input name="approvalRequired" type="checkbox" defaultChecked={policy?.approvalRequired ?? true} /><span>Owner approves cancellation requests</span></label>
        <label className="field-checkbox"><input name="collectExistingDebt" type="checkbox" defaultChecked={policy?.collectExistingDebt ?? false} /><span>Continue automatic collection of unpaid invoices after membership ends</span></label>
        <p className="management-copy">By default, automatic collection stops on the accepted end date. Unpaid amounts remain due for owner review. Billing during the notice period continues under the accepted policy.</p>
        <label className="field-checkbox"><input name="allowMemberCancellation" type="checkbox" defaultChecked={policy?.allowMemberCancellation ?? true} /><span>Members can request cancellation in the portal</span></label>
        <label className="field-checkbox"><input name="freezeEnabled" type="checkbox" defaultChecked={policy?.freezeEnabled ?? true} /><span>Allow finite membership freezes</span></label>
        <label className="field"><span>Maximum billing cycles per freeze</span><input name="freezeMaxCycles" type="number" required min="1" step="1" defaultValue={policy?.freezeMaxCycles ?? 12} /></label>
        <label className="field-checkbox"><input name="allowMemberFreeze" type="checkbox" defaultChecked={policy?.allowMemberFreeze ?? true} /><span>Members can request a freeze in the portal</span></label>
        <p className="management-copy">Freezes start and finish at billing boundaries. Outstanding invoices remain due. Any waiver or credit is recorded separately.</p>
      </fieldset>

      <label className="field">
        <span>Cancellation policy reference</span>
        <input
          defaultValue={plan?.cancellationPolicyReference ?? ""}
          name="cancellationPolicyReference"
          placeholder="Optional link or reference to the signed agreement"
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
