"use client";

import { useActionState, useEffect, useRef, useState } from "react";

export interface EmergencyContactFormState {
  error: string | null;
  success: string | null;
  profileVersion?: number;
}
export interface EmergencyContactView {
  id: string;
  fullName: string;
  relationshipLabel: string | null;
  phone: string;
  email: string | null;
  version: number;
}
type ContactAction = (
  previous: EmergencyContactFormState,
  data: FormData,
) => Promise<EmergencyContactFormState>;
function ContactForm({
  memberId,
  profileVersion,
  contact,
  operationId,
  action,
}: {
  memberId: string;
  profileVersion: number;
  contact?: EmergencyContactView;
  operationId: string;
  action: ContactAction;
}) {
  const [state, submit, pending] = useActionState(action, {
    error: null,
    success: null,
  });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  const [fields, setFields] = useState({
    fullName: contact?.fullName ?? "",
    relationshipLabel: contact?.relationshipLabel ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    reason: "",
  });
  const change = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  return (
    <form
      action={submit}
      className="form-stack member-form-stack"
      aria-label={
        contact
          ? `Edit emergency contact ${contact.fullName}`
          : "Add emergency contact"
      }
    >
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="expectedVersion" value={profileVersion} />
      <input type="hidden" name="operationId" value={operationId} />
      {contact ? (
        <>
          <input type="hidden" name="contactId" value={contact.id} />
          <input
            type="hidden"
            name="expectedContactVersion"
            value={contact.version}
          />
        </>
      ) : null}
      <label className="field">
        <span>Emergency contact name</span>
        <input
          name="fullName"
          value={fields.fullName}
          onChange={(event) => change("fullName", event.target.value)}
          autoComplete="off"
          maxLength={200}
          required
        />
      </label>
      <label className="field">
        <span>Relationship to this member</span>
        <input
          name="relationshipLabel"
          value={fields.relationshipLabel}
          onChange={(event) => change("relationshipLabel", event.target.value)}
          maxLength={100}
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span>Emergency phone</span>
        <input
          name="phone"
          type="tel"
          value={fields.phone}
          onChange={(event) => change("phone", event.target.value)}
          maxLength={60}
          autoComplete="off"
          required
        />
      </label>
      <label className="field">
        <span>Emergency email (optional)</span>
        <input
          name="email"
          type="email"
          value={fields.email}
          onChange={(event) => change("email", event.target.value)}
          maxLength={254}
          autoComplete="off"
        />
      </label>
      {contact ? (
        <label className="field">
          <span>Reason for contact change</span>
          <input
            name="reason"
            value={fields.reason}
            onChange={(event) => change("reason", event.target.value)}
            minLength={5}
            maxLength={500}
            required
          />
        </label>
      ) : null}
      {state.error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="form-error member-form-error"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <div className="dashboard-actions member-actions">
        <button
          className="button"
          name="operation"
          value={contact ? "UPDATE" : "ADD"}
          disabled={pending}
        >
          {pending
            ? "Saving contact…"
            : contact
              ? "Save emergency contact"
              : "Add emergency contact"}
        </button>
        {contact ? (
          <button
            className="button button-secondary"
            name="operation"
            value="RETIRE"
            disabled={pending}
          >
            Remove current contact
          </button>
        ) : null}
      </div>
    </form>
  );
}
export function EmergencyContacts({
  memberId,
  memberName,
  profileVersion,
  contacts,
  canEdit,
  operationIds,
  action,
}: {
  memberId: string;
  memberName: string;
  profileVersion: number;
  contacts: EmergencyContactView[];
  canEdit: boolean;
  operationIds: Record<string, string>;
  action?: ContactAction;
}) {
  return (
    <div className="form-stack member-form-stack">
      <p>
        Emergency information for {memberName}. A contact entry gives no
        booking, signing, payment or coaching access.
      </p>
      {contacts.length === 0 ? (
        <p>No emergency contact is recorded.</p>
      ) : (
        contacts.map((contact) => (
          <article
            key={`${contact.id}:${contact.version}`}
            className="stack-item member-stack-item"
          >
            <div className="stack-item-copy">
              <h3>{contact.fullName}</h3>
              <p>{contact.relationshipLabel ?? "Relationship not specified"}</p>
              <p>
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                {contact.email ? <> · {contact.email}</> : null}
              </p>
              {canEdit && action ? (
                <details>
                  <summary>Edit contact</summary>
                  <ContactForm
                    memberId={memberId}
                    profileVersion={profileVersion}
                    contact={contact}
                    operationId={operationIds[contact.id]!}
                    action={action}
                  />
                </details>
              ) : null}
            </div>
          </article>
        ))
      )}
      {canEdit && action ? (
        <section key={`new:${profileVersion}`}>
          <h3>Add emergency contact</h3>
          <ContactForm
            memberId={memberId}
            profileVersion={profileVersion}
            operationId={operationIds.new!}
            action={action}
          />
        </section>
      ) : null}
      {!canEdit ? (
        <p>Emergency contact access is read only for this class.</p>
      ) : null}
    </div>
  );
}
