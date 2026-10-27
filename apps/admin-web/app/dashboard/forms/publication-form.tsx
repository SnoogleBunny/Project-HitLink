"use client";
import { useActionState, useId, useState } from "react";
import {
  formPublicationAction,
  type PublicationState,
} from "./publication-actions";

export function FormPublicationForm(props: {
  publicationId: string;
  formDocumentId: string;
  expectedHeadHash: string | null;
  versions: Array<{ id: string; versionNumber: number; fileName: string }>;
  initialVersionId: string;
  initialTargets: string[];
  defaultEffectiveAt: string;
}) {
  const [state, action, pending] = useActionState(
    formPublicationAction,
    {} as PublicationState,
  );
  const [versionId, setVersionId] = useState(props.initialVersionId);
  const [targets, setTargets] = useState(props.initialTargets);
  const [effectiveAt, setEffectiveAt] = useState(props.defaultEffectiveAt);
  const [validUntil, setValidUntil] = useState("");
  const [notice, setNotice] = useState("1440");
  const [warning, setWarning] = useState("10080");
  const [reason, setReason] = useState("");
  const fieldId = useId();
  const review = state.review;
  if (state.publishedRevisionId)
    return (
      <div className="info-callout" role="status">
        <strong>Requirement publication recorded</strong>
        <p>
          Safe recipient notices are queued. Delivery is confirmed only after
          the email provider returns a receipt. Existing affected bookings
          retain their seats and funding until their recovery is resolved.
        </p>
        <a href={`/dashboard/forms/${props.formDocumentId}/publication`}>
          Review the updated timeline
        </a>
      </div>
    );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="publicationId" value={props.publicationId} />
      <input type="hidden" name="formDocumentId" value={props.formDocumentId} />
      <input
        type="hidden"
        name="expectedHeadHash"
        value={props.expectedHeadHash ?? ""}
      />
      <input
        type="hidden"
        name="previewHash"
        value={review?.previewHash ?? ""}
      />
      <label className="field">
        <span id={`${fieldId}-pdf-label`}>Exact PDF for this requirement</span>
        <select
          name="formVersionId"
          aria-labelledby={`${fieldId}-pdf-label`}
          aria-describedby={`${fieldId}-pdf-help`}
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
        >
          {props.versions.map((version) => (
            <option key={version.id} value={version.id}>
              Version {version.versionNumber} — {version.fileName}
            </option>
          ))}
        </select>
        <span className="field-help" id={`${fieldId}-pdf-help`}>
          A renewal can use this same PDF. It creates a separate acceptance
          cycle and preserves prior signatures.
        </span>
      </label>
      <fieldset
        className="field-group"
        aria-describedby={`${fieldId}-audience-help`}
      >
        <legend>Who must accept this requirement?</legend>
        <div className="checkbox-grid">
          {[
            { value: "TRIAL", label: "Trial participants" },
            { value: "MEMBER", label: "Members" },
            { value: "GUARDIAN", label: "Guardians" },
            { value: "MEMBERSHIP_ACTIVATION", label: "Membership activation" },
          ].map(({ value, label }) => (
            <label key={value} className="field-checkbox">
              <input
                type="checkbox"
                name="targets"
                value={value}
                checked={targets.includes(value)}
                onChange={(event) =>
                  setTargets((current) =>
                    event.target.checked
                      ? [...current, value]
                      : current.filter((item) => item !== value),
                  )
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="field-help" id={`${fieldId}-audience-help`}>
          Select no audiences to schedule withdrawal of this requirement.
          Earlier publications and signatures remain in history.
        </p>
      </fieldset>
      <label className="field">
        <span>Effective at (UTC)</span>
        <input
          type="datetime-local"
          name="effectiveAt"
          required
          value={effectiveAt}
          onChange={(event) => setEffectiveAt(event.target.value)}
        />
      </label>
      <label className="field">
        <span id={`${fieldId}-notice-label`}>
          Required advance notice (minutes)
        </span>
        <input
          name="noticeLeadMinutes"
          aria-labelledby={`${fieldId}-notice-label`}
          aria-describedby={`${fieldId}-notice-help`}
          type="number"
          min="1"
          max="527040"
          required
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
        />
        <span className="field-help" id={`${fieldId}-notice-help`}>
          24 hours is the recommended default. A shorter interval requires an
          explicit affected-booking and penalty-free recovery confirmation.
        </span>
      </label>
      <label className="field">
        <span id={`${fieldId}-validity-label`}>
          Acceptance valid until (UTC, optional)
        </span>
        <input
          name="consentValidUntil"
          aria-labelledby={`${fieldId}-validity-label`}
          aria-describedby={`${fieldId}-validity-help`}
          type="datetime-local"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
        />
        <span className="field-help" id={`${fieldId}-validity-help`}>
          This is the accepted consent&apos;s actual expiry. It is separate from
          a signing link&apos;s expiry. Leaving it empty records no expiry for
          this cycle.
        </span>
      </label>
      <label className="field">
        <span>Expiry warning lead (minutes)</span>
        <input
          name="expiryWarningLeadMinutes"
          type="number"
          min="1"
          max="527040"
          required
          value={warning}
          onChange={(event) => setWarning(event.target.value)}
        />
      </label>
      <label className="field">
        <span id={`${fieldId}-reason-label`}>
          Reason for publication or renewal
        </span>
        <textarea
          name="reason"
          aria-labelledby={`${fieldId}-reason-label`}
          aria-describedby={`${fieldId}-reason-help`}
          minLength={5}
          maxLength={500}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <span className="field-help" id={`${fieldId}-reason-help`}>
          Keep form answers and private client information out of this
          operational record.
        </span>
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        className="button button-secondary"
        name="intent"
        value="preview"
        disabled={pending}
      >
        {pending ? "Reviewing…" : "Preview affected people and bookings"}
      </button>
      {review ? (
        <section
          aria-labelledby="form-publication-preview"
          className="info-callout"
        >
          <h3 id="form-publication-preview">Publication review</h3>
          <p>
            {review.people.length} participant signing contexts;{" "}
            {review.commitments.length} accepted future bookings need recovery.{" "}
            {review.missingSafeContactCount} contexts have no safe current
            signing contact and need the publishing owner&apos;s review.
          </p>
          <p>
            Effective {review.terms.effectiveAt}.{" "}
            {review.terms.consentValidUntil
              ? `Acceptance expires ${review.terms.consentValidUntil}.`
              : "No expiry is recorded for this cycle."}{" "}
            Notices have not been queued by this preview.
          </p>
          <details>
            <summary>Review all affected people</summary>
            <ul>
              {review.people.map((person) => (
                <li
                  key={`${person.memberId}:${person.signerKind}`}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {person.fullName} · {person.signerKind.toLowerCase()} ·{" "}
                  {person.safeRecipientCount} safe signing account(s)
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Review all affected commitments</summary>
            <ul>
              {review.commitments.map((booking) => (
                <li
                  key={`${booking.bookingId}:${booking.fundingRevision}`}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {review.people.find(
                    (person) => person.memberId === booking.memberId,
                  )?.fullName ?? booking.memberId}{" "}
                  · {booking.serviceAt} · {booking.bookingType.toLowerCase()} ·{" "}
                  {booking.bookingStatus.toLowerCase()} ·{" "}
                  {booking.needsRefundReview
                    ? "verified payment may need refund review"
                    : "original funding stays recorded"}
                </li>
              ))}
            </ul>
          </details>
          {review.shortNotice ? (
            <label className="field-checkbox">
              <input type="checkbox" name="confirmShortNotice" />
              <span>
                I reviewed this short-notice change and take responsibility for
                penalty-free recovery of affected accepted bookings. Queuing a
                notice does not prove delivery.
              </span>
            </label>
          ) : null}
          <label className="field-checkbox">
            <input type="checkbox" name="confirmedAffectedCommitments" />
            <span>
              I reviewed the exact PDF, affected people, timing and accepted
              bookings. I will resolve missing safe contacts and oversee
              penalty-free recovery.
            </span>
          </label>
          <button
            className="button button-primary"
            name="intent"
            value="publish"
            disabled={pending}
          >
            Confirm reviewed publication
          </button>
        </section>
      ) : null}
    </form>
  );
}
