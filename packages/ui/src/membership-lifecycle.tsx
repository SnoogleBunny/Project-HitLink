"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "./money";

export interface LifecycleReviewView {
  requestId: string;
  kind: string;
  receivedAt: string;
  effectiveOn: string;
  resumeOn: string | null;
  noticeEndsOn: string | null;
  finalPlannedRenewal: string | null;
  ownerApprovalRequired: boolean;
  reviewToken: string;
  renewals: Array<{ date: string; subtotalCents: number; currency: string }>;
  affectedBookings: Array<{ id: string; date: string; title: string }>;
  outstandingDebtCents: number;
  notices: string[];
}
export interface LifecycleFormState {
  error?: string;
  message?: string;
  review?: LifecycleReviewView;
}
export interface LifecycleRequestView {
  id: string;
  kind: string;
  state: string;
  receivedAt: string;
  effectiveOn: string | null;
  resumeOn: string | null;
  providerOperationId: string | null;
  active: boolean;
}
export interface LifecyclePanelProps {
  memberId: string;
  membershipId: string;
  memberName: string;
  owner: boolean;
  currency: string;
  requests: LifecycleRequestView[];
  policyKnown: boolean;
  allowCancellation: boolean;
  allowFreeze: boolean;
  billingAnchor: string;
  action: (
    state: LifecycleFormState,
    form: FormData,
  ) => Promise<LifecycleFormState>;
}
const kindName: Record<string, string> = {
  CANCEL: "Cancellation",
  FREEZE: "Freeze",
  WITHDRAW: "Keep membership",
  RESUME: "Resume membership",
};
const stateName: Record<string, string> = {
  RECEIVED: "Awaiting review",
  APPROVED: "Approved; payment provider confirmation pending",
  PROVIDER_PENDING: "Checking with payment provider",
  SCHEDULED: "Scheduled; provider confirmation pending",
  EFFECTIVE: "Effective",
  COMPLETED: "Complete",
  APPLIED: "Confirmed",
  REVIEW_REQUIRED: "Needs owner review",
  WITHDRAWN: "Withdrawn",
};
function Review({
  review,
  currency,
}: {
  review: LifecycleReviewView;
  currency: string;
}) {
  return (
    <div
      className="form-stack"
      role="region"
      aria-label="Membership change review"
    >
      <h4>Review membership change</h4>
      <p>
        Received {new Date(review.receivedAt).toLocaleString()}. This receipt
        time stays unchanged.
      </p>
      <p>
        <strong>
          {review.kind === "FREEZE"
            ? "Freeze starts"
            : review.kind === "CANCEL"
              ? "Access ends"
              : "Effective date"}
          : {review.effectiveOn}
        </strong>
        {review.resumeOn ? ` · Resumes ${review.resumeOn}` : ""}
      </p>
      {review.noticeEndsOn ? <p>Notice ends {review.noticeEndsOn}.</p> : null}
      <p>
        Final planned renewal:{" "}
        {review.finalPlannedRenewal ?? "None in this review"}.
      </p>
      {review.renewals.length ? (
        <ul>
          {review.renewals.map((item) => (
            <li key={item.date}>
              {item.date}: {formatMoney(item.subtotalCents, item.currency)}{" "}
              before applicable tax or credit
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        Outstanding invoices:{" "}
        {formatMoney(review.outstandingDebtCents, currency)}. Any waiver or
        credit is a separate decision.
      </p>
      <p>
        {review.affectedBookings.length} booking
        {review.affectedBookings.length === 1 ? "" : "s"} will be cancelled
        after the change is confirmed. Released classes are not rebooked
        automatically.
      </p>
      {review.affectedBookings.length ? (
        <details>
          <summary>See affected classes</summary>
          <ul>
            {review.affectedBookings.map((item) => (
              <li key={item.id}>
                {item.date} · {item.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {review.notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}
    </div>
  );
}
function NewRequest({
  panel,
  kind,
  parentRequestId,
}: {
  panel: LifecyclePanelProps;
  kind: string;
  parentRequestId?: string;
}) {
  const [state, action, pending] = useActionState(panel.action, {});
  const [operationKey] = useState(() => crypto.randomUUID());
  return (
    <details open={state.message || state.error ? true : undefined}>
      <summary>
        {kind === "CANCEL"
          ? "Request cancellation"
          : kind === "FREEZE"
            ? "Request a freeze"
            : kind === "WITHDRAW"
              ? "Ask to keep this membership"
              : "Request early resume"}
      </summary>
      <form action={action} className="form-stack">
        <input type="hidden" name="mode" value="request" />
        <input type="hidden" name="memberId" value={panel.memberId} />
        <input type="hidden" name="membershipId" value={panel.membershipId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="operationKey" value={operationKey} />
        <input
          type="hidden"
          name="parentRequestId"
          value={parentRequestId ?? ""}
        />
        <p>
          This request is for {panel.memberName}. Billing and access change only
          after the reviewed request is confirmed.
        </p>
        {kind === "FREEZE" || kind === "RESUME" ? (
          <>
            <p>
              Choose billing boundaries based on {panel.billingAnchor}. A freeze
              has a fixed resume date.
            </p>
            <label className="field">
              <span>{kind === "FREEZE" ? "Freeze starts" : "Resume on"}</span>
              <input name="fromDate" type="date" required />
            </label>
          </>
        ) : null}
        {kind === "FREEZE" ? (
          <label className="field">
            <span>Resume on</span>
            <input name="toDate" type="date" required />
          </label>
        ) : null}
        <label className="field">
          <span>Reason (optional)</span>
          <textarea name="reason" maxLength={2000} rows={2} />
        </label>
        {state.error ? (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        ) : null}
        {state.message ? <p role="status">{state.message}</p> : null}
        <button
          className="button"
          type="submit"
          disabled={pending || !!state.message}
        >
          {pending ? "Sending request…" : "Send request"}
        </button>
      </form>
    </details>
  );
}
function Request({
  panel,
  request,
}: {
  panel: LifecyclePanelProps;
  request: LifecycleRequestView;
}) {
  const [state, action, pending] = useActionState(panel.action, {});
  return (
    <article className="stack-item">
      <div className="form-stack">
        <h4>{kindName[request.kind] ?? request.kind}</h4>
        <p>
          {stateName[request.state] ??
            request.state.toLowerCase().replaceAll("_", " ")}{" "}
          · Received {new Date(request.receivedAt).toLocaleString()}
        </p>
        {request.effectiveOn ? (
          <p>
            Effective {request.effectiveOn}
            {request.resumeOn ? ` · Resumes ${request.resumeOn}` : ""}
          </p>
        ) : null}
        <details>
          <summary>Receipt reference</summary>
          <p>{request.id}</p>
        </details>
        {request.active ? (
          <form action={action} className="form-stack">
            <input type="hidden" name="memberId" value={panel.memberId} />
            <input
              type="hidden"
              name="membershipId"
              value={panel.membershipId}
            />
            <input type="hidden" name="requestId" value={request.id} />
            <input
              type="hidden"
              name="reviewToken"
              value={state.review?.reviewToken ?? ""}
            />
            {request.state === "RECEIVED" ? (
              <>
                {panel.owner && request.kind === "CANCEL" ? (
                  <details>
                    <summary>Owner decision or exception</summary>
                    <label className="field">
                      <span>Agreed earlier access end (optional)</span>
                      <input name="effectiveOn" type="date" />
                    </label>
                    <label className="field">
                      <span>Future notice-period billing</span>
                      <select name="noticeBillingDecision" defaultValue="">
                        <option value="">Use accepted policy</option>
                        <option value="CONTINUE">Continue renewals</option>
                        <option value="WAIVE_FUTURE">
                          Waive future renewals
                        </option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Reason for this decision</span>
                      <textarea
                        name="overrideReason"
                        maxLength={2000}
                        rows={2}
                      />
                    </label>
                  </details>
                ) : null}
                <button
                  className="button button-secondary"
                  name="mode"
                  value="review"
                  disabled={pending}
                >
                  {pending ? "Checking…" : "Review dates and bookings"}
                </button>
                {state.review ? (
                  <>
                    <Review review={state.review} currency={panel.currency} />
                    {panel.owner || !state.review.ownerApprovalRequired ? (
                      <>
                        <label className="field-checkbox">
                          <input type="checkbox" name="confirmed" />
                          <span>
                            I reviewed the dates, renewals and affected classes
                            for {panel.memberName}.
                          </span>
                        </label>
                        <button
                          className="button"
                          name="mode"
                          value="approve"
                          disabled={pending}
                        >
                          {pending ? "Confirming…" : "Confirm reviewed change"}
                        </button>
                      </>
                    ) : (
                      <p>
                        The gym owner must approve this request. Your receipt
                        has been saved.
                      </p>
                    )}
                  </>
                ) : null}
              </>
            ) : request.providerOperationId ? (
              <button
                className="button button-secondary"
                name="mode"
                value="check"
                disabled={pending}
              >
                {pending ? "Checking…" : "Check payment provider status"}
              </button>
            ) : null}
            {state.error ? (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            ) : null}
            {state.message ? <p role="status">{state.message}</p> : null}
          </form>
        ) : null}
      </div>
    </article>
  );
}
export function MembershipLifecyclePanel(props: LifecyclePanelProps) {
  const cancellation = props.requests.find(
    (request) => request.active && request.kind === "CANCEL",
  );
  const freeze = props.requests.find(
    (request) => request.active && request.kind === "FREEZE",
  );
  return (
    <section className="form-stack" aria-label="Membership changes">
      <h3>Membership changes</h3>
      {!props.policyKnown ? (
        <p>
          Your original cancellation and freeze agreement needs owner review.
          Sending a cancellation request still records when it was received.
        </p>
      ) : null}
      {props.allowCancellation && !cancellation ? (
        <NewRequest panel={props} kind="CANCEL" />
      ) : null}
      {props.allowFreeze && !freeze ? (
        <NewRequest panel={props} kind="FREEZE" />
      ) : null}
      {cancellation &&
      !props.requests.some(
        (request) => request.active && request.kind === "WITHDRAW",
      ) ? (
        <NewRequest
          panel={props}
          kind="WITHDRAW"
          parentRequestId={cancellation.id}
        />
      ) : null}
      {freeze &&
      !props.requests.some(
        (request) => request.active && request.kind === "RESUME",
      ) ? (
        <NewRequest panel={props} kind="RESUME" parentRequestId={freeze.id} />
      ) : null}
      {props.requests.length ? (
        <div className="stack-list">
          {props.requests.map((request) => (
            <Request key={request.id} panel={props} request={request} />
          ))}
        </div>
      ) : (
        <p>No cancellation or freeze requests.</p>
      )}
    </section>
  );
}
