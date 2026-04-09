"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { createProgramAction } from "./actions";

export function ProgramCreateForm() {
  const [state, formAction] = useActionState(
    createProgramAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Program name</span>
        <input name="name" placeholder="Fundamentals" type="text" />
      </label>

      <label className="field">
        <span>Description</span>
        <input
          name="description"
          placeholder="Optional notes for owners and future scheduling."
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Age or cohort label</span>
          <input name="ageGroupLabel" placeholder="Adults" type="text" />
        </label>

        <label className="field">
          <span>Level label</span>
          <input name="levelLabel" placeholder="Beginner" type="text" />
        </label>
      </div>

      <label className="field-checkbox">
        <input name="progressTrackingEnabled" type="checkbox" />
        <div>
          <strong>Enable progress tracking</strong>
          <p>Belt and stripe tracking stays optional per program.</p>
        </div>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving program...">
        Create program
      </SubmitButton>
    </form>
  );
}
