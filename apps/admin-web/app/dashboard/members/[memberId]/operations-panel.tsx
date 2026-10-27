"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  CurrentMemberOperation,
  MemberOperationsView,
} from "@flowstate/db";
import { changeMemberOperationsAction } from "./operations-actions";
import {
  initialMemberOperationsFormState,
  memberOperationsScopeKey,
  type MemberOperationsFormState,
} from "./operations-state";

type Scope = { memberId: string; classTemplateId?: string; date?: string };
type FormProps = {
  scope: Scope;
  operationId: string;
  recordKey: string;
  canChooseVisibility: boolean;
  record?: CurrentMemberOperation;
  kind: "NOTE" | "TAG";
  legacyLabel?: string;
  onOutcome: (state: MemberOperationsFormState) => void;
};
function Visibility({
  owner,
  value,
  change,
  pending,
}: {
  owner: boolean;
  value: string;
  change: (value: string) => void;
  pending: boolean;
}) {
  return owner ? (
    <label className="field">
      <span>Visibility</span>
      <select
        name="visibility"
        value={value}
        onChange={(event) => change(event.target.value)}
        required
        disabled={pending}
      >
        <option value="OWNER_ONLY">Owner only</option>
        <option value="ASSIGNED_OPERATIONS">Assigned class staff</option>
      </select>
    </label>
  ) : (
    <>
      <input type="hidden" name="visibility" value="ASSIGNED_OPERATIONS" />
      <p>
        Visible to assigned class staff. Members and family accounts cannot read
        this record.
      </p>
    </>
  );
}
export function OperationsForm({
  scope,
  operationId,
  recordKey,
  canChooseVisibility,
  record,
  kind,
  legacyLabel,
  onOutcome,
}: FormProps) {
  const [state, action, pending] = useActionState(
    async (previous: MemberOperationsFormState, data: FormData) => {
      const next = await changeMemberOperationsAction(previous, data);
      // Announce from the stable parent before a retraction/classification can
      // remove this form. An unrelated RSC refresh never clears local fields.
      onOutcome(next);
      if (next.success && next.completedAction === "ADD") {
        setBody("");
        setLabel("");
        setReason("");
      }
      return next;
    },
    initialMemberOperationsFormState({
      baseVersion: record?.version ?? 0,
      recordKey,
      operationId,
    }),
  );
  const [body, setBody] = useState(record?.noteBody ?? "");
  const [label, setLabel] = useState(record?.tagLabel ?? legacyLabel ?? "");
  const [visibility, setVisibility] = useState<string>(
    record?.visibility ??
      (canChooseVisibility ? "OWNER_ONLY" : "ASSIGNED_OPERATIONS"),
  );
  const [purpose, setPurpose] = useState<string>(
    record?.tagPurpose ?? (legacyLabel ? "COHORT_ELIGIBILITY" : "OPERATIONAL"),
  );
  const [reason, setReason] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  const operation = legacyLabel ? "CLASSIFY" : record ? "AMEND" : "ADD";
  const name =
    kind === "NOTE"
      ? record
        ? "Edit operational note"
        : "Add operational note"
      : legacyLabel
        ? `Review eligibility tag ${legacyLabel}`
        : record
          ? `Edit label ${record.tagLabel}`
          : "Add internal label";
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="form-stack member-form-stack"
      aria-label={name}
    >
      <input type="hidden" name="memberId" value={scope.memberId} />
      <input
        type="hidden"
        name="classTemplateId"
        value={scope.classTemplateId ?? ""}
      />
      <input type="hidden" name="date" value={scope.date ?? ""} />
      <input type="hidden" name="recordKey" value={state.recordKey} />
      <input type="hidden" name="recordKind" value={kind} />
      <input type="hidden" name="expectedVersion" value={state.baseVersion} />
      <input type="hidden" name="operationId" value={state.operationId} />
      {record && record.version > state.baseVersion ? (
        <p aria-live="polite" className="info-callout">
          A newer version of this record is available. This draft still uses
          version {state.baseVersion}; reload before changing it.
        </p>
      ) : null}
      {kind === "NOTE" ? (
        <label className="field">
          <span>Operational note</span>
          <textarea
            name="noteBody"
            disabled={pending}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            required
          />
        </label>
      ) : (
        <>
          <label className="field">
            <span>Label</span>
            <input
              name="tagLabel"
              disabled={pending}
              value={label}
              readOnly={!!record || !!legacyLabel}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={40}
              required
            />
          </label>
          {canChooseVisibility && !record && !legacyLabel ? (
            <label className="field">
              <span>Label type</span>
              <select
                name="tagPurpose"
                disabled={pending}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              >
                <option value="OPERATIONAL">Operational label</option>
                <option value="COHORT_ELIGIBILITY">Eligibility tag</option>
              </select>
            </label>
          ) : (
            <>
              <input type="hidden" name="tagPurpose" value={purpose} />
              <p>
                {purpose === "COHORT_ELIGIBILITY"
                  ? "Eligibility tag"
                  : "Operational label"}
              </p>
            </>
          )}
          <p className="member-copy">
            Operational labels do not grant class access. Eligibility tags are
            managed by the owner and can affect class prerequisites. Program
            group names may also appear in class eligibility messages.
          </p>
        </>
      )}
      <Visibility
        owner={canChooseVisibility}
        value={visibility}
        change={setVisibility}
        pending={pending}
      />
      {record || legacyLabel ? (
        <label className="field">
          <span>Reason for operational change</span>
          <textarea
            name="reason"
            disabled={pending}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={500}
            required
          />
        </label>
      ) : null}
      {state.error ? (
        <p ref={errorRef} role="alert" tabIndex={-1} className="form-error">
          {state.error}
        </p>
      ) : null}
      <div className="dashboard-actions member-actions">
        <button
          className="button"
          name="operation"
          value={operation}
          disabled={pending}
        >
          {pending
            ? "Saving…"
            : legacyLabel
              ? "Review tag visibility"
              : kind === "NOTE"
                ? record
                  ? "Save note"
                  : "Add note"
                : record
                  ? "Save label"
                  : "Add label"}
        </button>
        {record ? (
          <button
            className="button button-secondary"
            name="operation"
            value="RETRACT"
            formNoValidate
            disabled={pending}
          >
            Retract {kind === "NOTE" ? "note" : "label"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
function scopeHref(scope: Scope, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    ...(scope.classTemplateId
      ? { classTemplateId: scope.classTemplateId, date: scope.date! }
      : {}),
    ...extra,
  });
  return `/dashboard/members/${scope.memberId}/operations${query.size ? `?${query}` : ""}`;
}
export function MemberOperationsPanel({
  view,
  scope,
  operationIds,
  noteKey,
  locale,
  timezone,
}: {
  view: MemberOperationsView;
  scope: Scope;
  operationIds: Record<string, string>;
  noteKey: string;
  locale: string;
  timezone: string;
}) {
  const scopeKey = memberOperationsScopeKey(scope);
  const [notice, setNotice] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const onOutcome = (state: MemberOperationsFormState) => {
    if (state.success) setNotice({ scopeKey, message: state.success });
    else if (state.error) setNotice(null);
  };
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <section
      className="management-card"
      aria-labelledby="member-operations-title"
    >
      <h2 id="member-operations-title">Internal operations</h2>
      {notice?.scopeKey === scopeKey ? (
        <p role="status">{notice.message}</p>
      ) : null}
      <p>
        Use these records for class operations. Keep private coaching notes,
        intake and goals in their restricted coaching records. Members,
        guardians, payers and emergency contacts cannot access these internal
        records.
      </p>
      {!view.canWrite ? (
        <p>
          Reactivate this member before adding or changing internal records.
          History remains preserved.
        </p>
      ) : null}
      <h3>Operational notes</h3>
      {view.notes.length ? (
        <div className="stack-list">
          {view.notes.map((note) => (
            <article
              key={`${scopeKey}:${note.recordKey}`}
              className="stack-item"
              aria-label="Operational note"
            >
              <div className="form-stack stack-item-copy">
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {note.noteBody}
                </p>
                <p>
                  {note.visibility === "OWNER_ONLY"
                    ? "Owner only"
                    : "Assigned class staff"}{" "}
                  · {note.actorName} ·{" "}
                  <time dateTime={note.createdAt}>
                    {timestamp(note.createdAt)}
                  </time>
                </p>
                {view.canWrite && note.canAmend ? (
                  <OperationsForm
                    onOutcome={onOutcome}
                    scope={scope}
                    recordKey={note.recordKey}
                    record={note}
                    kind="NOTE"
                    operationId={operationIds[note.recordKey]!}
                    canChooseVisibility={view.canChooseVisibility}
                  />
                ) : null}
                {view.canChooseVisibility ? (
                  <Link
                    className="button button-secondary"
                    href={scopeHref(scope, { history: note.recordKey })}
                  >
                    View note history
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>No current operational notes.</p>
      )}
      {view.nextNotesCursor ? (
        <Link
          className="button button-secondary"
          href={scopeHref(scope, {
            beforeAt: view.nextNotesCursor.createdAt,
            beforeId: view.nextNotesCursor.id,
          })}
        >
          Older operational notes
        </Link>
      ) : null}
      {view.canWrite ? (
        <OperationsForm
          onOutcome={onOutcome}
          key={`${scopeKey}:new-note`}
          scope={scope}
          recordKey={noteKey}
          kind="NOTE"
          operationId={operationIds.newNote!}
          canChooseVisibility={view.canChooseVisibility}
        />
      ) : null}
      <h3>Operational labels and eligibility tags</h3>
      {view.tags.length ? (
        <div className="stack-list">
          {view.tags.map((tag) => (
            <article
              key={`${scopeKey}:${tag.recordKey}`}
              className="stack-item"
            >
              <div className="form-stack stack-item-copy">
                <strong style={{ overflowWrap: "anywhere" }}>
                  {tag.tagLabel}
                </strong>
                <p>
                  {tag.tagPurpose === "COHORT_ELIGIBILITY"
                    ? "Eligibility tag"
                    : "Operational label"}{" "}
                  ·{" "}
                  {tag.visibility === "OWNER_ONLY"
                    ? "Owner only"
                    : "Assigned class staff"}{" "}
                  · {tag.actorName} ·{" "}
                  <time dateTime={tag.createdAt}>
                    {timestamp(tag.createdAt)}
                  </time>
                </p>
                {view.canWrite && tag.canAmend ? (
                  <OperationsForm
                    onOutcome={onOutcome}
                    scope={scope}
                    recordKey={tag.recordKey}
                    record={tag}
                    kind="TAG"
                    operationId={operationIds[tag.recordKey]!}
                    canChooseVisibility={view.canChooseVisibility}
                  />
                ) : null}
                {view.canChooseVisibility ? (
                  <Link
                    className="button button-secondary"
                    href={scopeHref(scope, { history: tag.recordKey })}
                  >
                    View label history
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>No classified labels are visible here.</p>
      )}
      {view.canWrite ? (
        <OperationsForm
          onOutcome={onOutcome}
          key={`${scopeKey}:new-label`}
          scope={scope}
          recordKey="new-internal-label"
          kind="TAG"
          operationId={operationIds.newTag!}
          canChooseVisibility={view.canChooseVisibility}
        />
      ) : null}
      {view.legacy ? (
        <details>
          <summary>Legacy internal records for owner review</summary>
          <p>
            These records have no verified original author, date or staff
            visibility. They are not shown on general class rosters.
          </p>
          {view.legacy.note ? (
            <>
              <h3>Legacy internal note</h3>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {view.legacy.note}
              </p>
            </>
          ) : null}
          {view.legacy.unclassifiedTags.map((label) => (
            <div key={`${scopeKey}:legacy:${label}`} className="info-callout">
              <strong>{label}</strong>
              <p>
                Legacy eligibility tag · original author and date unavailable ·
                visibility unreviewed
              </p>
              {view.canWrite ? (
                <OperationsForm
                  onOutcome={onOutcome}
                  scope={scope}
                  kind="TAG"
                  recordKey="review-legacy-label"
                  legacyLabel={label}
                  operationId={operationIds[`legacy:${label}`]!}
                  canChooseVisibility
                />
              ) : null}
            </div>
          ))}
        </details>
      ) : null}
      {view.canChooseVisibility ? (
        <Link
          className="button button-secondary"
          href={scopeHref(scope, { history: "all" })}
        >
          Review complete internal history
        </Link>
      ) : null}
    </section>
  );
}
