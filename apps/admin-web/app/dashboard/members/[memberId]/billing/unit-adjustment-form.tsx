"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import { adjustUnitsAction } from "./unit-adjustment-actions";
export function UnitAdjustmentForm({ memberId, membershipId, kinds, cards, date }: { memberId: string; membershipId?: string; kinds: Array<"WEEK" | "BILLING_MONTH">; cards: Array<{id:string;name:string;remainingPunches:number}>; date:string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adjustUnitsAction, {});
  const [mutationId] = useState(() => crypto.randomUUID());
  const [target, setTarget] = useState(kinds[0] ?? (cards[0] ? `pack:${cards[0].id}` : ""));
  if (!kinds.length && !cards.length) return null;
  return <details open={open || !!state.saved || !!state.error} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Adjust class units</summary><form action={action} className="form-stack">
    <input type="hidden" name="memberId" value={memberId} /><input type="hidden" name="membershipId" value={membershipId ?? ""} /><input type="hidden" name="mutationId" value={mutationId} />
    <label className="field"><span>Allowance or pack</span><select name="target" value={target} onChange={(event) => setTarget(event.target.value)}>{kinds.map((kind) => <option key={kind} value={kind}>{kind === "WEEK" ? "Billing week allowance" : "Billing month allowance"}</option>)}{cards.map((card) => <option key={card.id} value={`pack:${card.id}`}>{card.name} — {card.remainingPunches} unused</option>)}</select></label>
    {!target.startsWith("pack:") ? <label className="field"><span>Class date in the period to adjust</span><input name="date" type="date" defaultValue={date} required /></label> : null}
    <label className="field"><span>Units to add or remove</span><input name="delta" type="number" step="1" min="-10000" max="10000" placeholder="1 or -1" required /></label>
    <label className="field"><span>Reason</span><input name="reason" maxLength={1000} required /></label>
    <label className="field-checkbox"><input type="checkbox" name="reviewed" required /><span>I reviewed this unit adjustment. It does not change a payment or refund.</span></label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}{state.saved ? <p role="status">Adjustment saved. Refresh before making another adjustment.</p> : null}
    <SubmitButton disabled={state.saved} pendingLabel="Saving adjustment…">Save adjustment</SubmitButton>
  </form></details>;
}
