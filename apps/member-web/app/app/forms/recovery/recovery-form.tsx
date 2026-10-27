"use client";
import {
  createContext,
  useActionState,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { recoverFormBookingAction, type RecoveryActionState } from "./actions";

const RecoveryFeedbackContext = createContext<
  ((message: string) => void) | null
>(null);

/** The notice outlives an open row removed by the committed server refresh. */
export function FormRecoveryFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return (
    <RecoveryFeedbackContext.Provider value={setMessage}>
      <div
        role="status"
        aria-atomic="true"
        className={message ? "member-card" : undefined}
      >
        {message ? <p className="member-copy">{message}</p> : null}
      </div>
      {children}
    </RecoveryFeedbackContext.Provider>
  );
}
export function FormRecoveryChoices(props: {
  memberId: string;
  recoveryId: string;
  version: number;
  operationId: string;
  replacements: Array<{ value: string; label: string }>;
}) {
  const report = useContext(RecoveryFeedbackContext);
  const [state, action, pending] = useActionState(
    async (previous: RecoveryActionState, data: FormData) => {
      report?.("");
      const result = await recoverFormBookingAction(previous, data);
      if (result.success) report?.(result.success);
      return result;
    },
    {} as RecoveryActionState,
  );
  if (state.success)
    return report ? null : <p role="status">{state.success}</p>;
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="memberId" value={props.memberId} />
      <input type="hidden" name="recoveryId" value={props.recoveryId} />
      <input type="hidden" name="version" value={props.version} />
      <input type="hidden" name="operationId" value={props.operationId} />
      <label className="field">
        <span>Replacement class</span>
        <select name="replacement" defaultValue="">
          <option value="">Choose a replacement</option>
          {props.replacements.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
        <span className="field-help">
          Availability, required forms and the original funding are checked
          together. If the move cannot finish, your original seat and units
          remain reserved.
        </span>
      </label>
      <button
        name="choice"
        value="KEEP_BOOKING"
        className="button button-secondary"
        disabled={pending}
      >
        Keep this booking after completing its forms
      </button>
      <button
        name="choice"
        value="REBOOK"
        className="button button-secondary"
        disabled={pending || !props.replacements.length}
      >
        Rebook without a form-change penalty
      </button>
      <button
        name="choice"
        value="CANCEL"
        className="button button-secondary"
        disabled={pending}
      >
        Cancel and release original units
      </button>
      <button
        name="choice"
        value="REFUND_REVIEW"
        className="button button-primary"
        disabled={pending}
      >
        Cancel and request refund review
      </button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
