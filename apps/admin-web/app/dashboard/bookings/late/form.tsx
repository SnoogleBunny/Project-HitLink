"use client";
import { useActionState, useState } from "react";
import { ownerLateBookingAction } from "./actions";
export function OwnerLateBookingForm({
  members,
  templates,
  operationId,
  initialDate,
  initialTemplateId,
}: {
  members: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; title: string }>;
  operationId: string;
  initialDate: string;
  initialTemplateId: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(ownerLateBookingAction, {
    error: null,
    success: null,
    review: null,
  });
  const [memberId, setMember] = useState(""),
    [classTemplateId, setTemplate] = useState(initialTemplateId),
    [date, setDate] = useState(initialDate),
    [type, setType] = useState("ACCESS"),
    [reason, setReason] = useState("");
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="management-card form-stack"
    >
      <h2>Review one late booking</h2>
      <p>
        Only the booking cutoff and minimum notice can be waived, before the
        class starts. Opening hours, booking horizon, required forms,
        eligibility, financial holds, capacity, conflicts and waitlist priority
        remain in force.
      </p>
      <input type="hidden" name="operationId" value={operationId} />
      <label className="field">
        Person
        <select
          name="memberId"
          disabled={pending}
          value={memberId}
          required
          onChange={(event) => {
            setConfirmed(false);
            setMember(event.target.value);
          }}
        >
          <option value="">Choose a member</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Class template
        <select
          name="classTemplateId"
          disabled={pending}
          value={classTemplateId}
          required
          onChange={(event) => {
            setConfirmed(false);
            setTemplate(event.target.value);
          }}
        >
          <option value="">Choose a class</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Class date
        <input
          type="date"
          name="scheduledForDate"
          disabled={pending}
          value={date}
          required
          onChange={(event) => {
            setConfirmed(false);
            setDate(event.target.value);
          }}
        />
      </label>
      <label className="field">
        Booking type
        <select
          name="bookingType"
          disabled={pending}
          value={type}
          onChange={(event) => {
            setConfirmed(false);
            setType(event.target.value);
          }}
        >
          <option value="ACCESS">Use existing member access</option>
          <option value="TRIAL">Trial</option>
        </select>
      </label>
      <label className="field">
        Private reason for the exception
        <textarea
          name="reason"
          disabled={pending}
          minLength={5}
          maxLength={500}
          value={reason}
          required
          onChange={(event) => {
            setConfirmed(false);
            setReason(event.target.value);
          }}
        />
      </label>
      <p>
        The member sees a normal class booking. The staff reason stays in the
        owner’s protected receipt.
      </p>
      {state.error && (
        <div role="alert" className="notice notice-error">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" className="notice notice-success">
          {state.success}
        </div>
      )}
      <button
        className="button button-secondary"
        name="step"
        value="preview"
        disabled={pending}
        onClick={() => setConfirmed(false)}
      >
        Preview late booking
      </button>
      {state.review && (
        <section aria-label="Late booking review" className="form-stack">
          <h3>
            {state.review.memberName} · {state.review.title}
          </h3>
          <p>
            {state.review.scheduledForDate} · {state.review.timezone}
          </p>
          <p>
            Class starts {state.review.startsAt}. Normal booking closed{" "}
            {state.review.normalClosesAt}.
          </p>
          <p>
            Policy version {state.review.policyVersion} ·{" "}
            {state.review.occupied} places held
            {state.review.capacity === null
              ? "; no class capacity limit"
              : ` of ${state.review.capacity}`}
            .
          </p>
          <p>
            {state.review.fundingLabel}: {state.review.fundingDetail}
          </p>
          <p>
            {state.review.notificationRecipientCount > 0
              ? "A normal booking notice will be queued for currently authorized account mailboxes."
              : "No verified account mailbox is available for a booking email. Contact this member directly."}
          </p>
          <input
            type="hidden"
            name="previewHash"
            value={state.review.previewHash}
          />
          <label className="member-checkbox-field">
            <input
              type="checkbox"
              name="confirmCutoffException"
              disabled={pending}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I confirm the booking cutoff and minimum-notice exception for this
              person and class.
            </span>
          </label>
          <p>
            If anything changes, preview the current request again. This action
            never creates a purchase or card charge.
          </p>
          <button
            className="button button-primary"
            name="step"
            value="confirm"
            disabled={pending}
          >
            Confirm late booking
          </button>
        </section>
      )}
    </form>
  );
}
