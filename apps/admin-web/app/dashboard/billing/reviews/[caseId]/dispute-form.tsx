"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import {
  reviewDisputeAction,
  type DisputeActionState,
} from "./dispute-actions";
export function DisputeForm(props: {
  disputeId: string;
  requestId: string;
  reviewHash: string;
  reviewer: string;
  owners: Array<{ id: string; name: string }>;
  final: boolean;
  canRevoke: boolean;
  closed: boolean;
}) {
  const [state, action] = useActionState<DisputeActionState, FormData>(
    reviewDisputeAction,
    {},
  );
  const [reviewer, setReviewer] = useState(props.reviewer),
    [treatment, setTreatment] = useState("KEEP_RESERVATIONS"),
    [reason, setReason] = useState("");
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="disputeId" value={props.disputeId} />
      <input type="hidden" name="requestId" value={props.requestId} />
      <input type="hidden" name="reviewHash" value={props.reviewHash} />
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <SubmitButton
        name="intent"
        value="refresh"
        pendingLabel="Checking processor…"
        formNoValidate
      >
        Check processor outcome
      </SubmitButton>
      {!props.closed ? (
        <>
          <label className="field">
            <span>Case owner</span>
            <select
              name="reviewer"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              required
            >
              {props.owners.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reservation and access treatment</span>
            <select
              name="treatment"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
            >
              <option value="KEEP_RESERVATIONS">
                Keep existing reservations pending review
              </option>
              <option value="RELEASE_FUTURE_RESERVATIONS">
                Release affected future reservations without penalty
              </option>
              {props.final ? (
                <option value="RETAIN_ACCESS">
                  Confirm final outcome and retain remaining access
                </option>
              ) : null}
              {props.canRevoke ? (
                <option value="REVOKE_UNUSED_ACCESS">
                  Confirm final loss and retire affected unused access
                </option>
              ) : null}
            </select>
          </label>
          <label className="field">
            <span>Review reason</span>
            <textarea
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              required
              rows={3}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="confirmTreatment"
              value="yes"
              required
            />
            <span>
              I reviewed the affected services and future reservations.
              Delivered history and unrelated services remain unchanged.
            </span>
          </label>
          <p className="management-copy">
            Assigning a case owner does not settle a payment. Released seats are
            not recreated after recovery. No refund or new charge is submitted
            by this review.
          </p>
          <SubmitButton
            name="intent"
            value="review"
            pendingLabel="Recording review…"
          >
            Record owner treatment
          </SubmitButton>
        </>
      ) : null}
    </form>
  );
}
