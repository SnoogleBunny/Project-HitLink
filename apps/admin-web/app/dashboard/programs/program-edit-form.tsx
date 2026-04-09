"use client";

import type { Program } from "@hitlink/db";
import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { updateProgramAction } from "./actions";

interface ProgramEditFormProps {
  program: Pick<
    Program,
    | "id"
    | "name"
    | "description"
    | "ageGroupLabel"
    | "levelLabel"
    | "progressTrackingEnabled"
  >;
}

export function ProgramEditForm({ program }: ProgramEditFormProps) {
  const [state, formAction] = useActionState(
    updateProgramAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input name="programId" type="hidden" value={program.id} />

      <label className="field">
        <span>Program name</span>
        <input defaultValue={program.name} name="name" type="text" />
      </label>

      <label className="field">
        <span>Description</span>
        <input
          defaultValue={program.description ?? ""}
          name="description"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Age or cohort label</span>
          <input
            defaultValue={program.ageGroupLabel ?? ""}
            name="ageGroupLabel"
            type="text"
          />
        </label>

        <label className="field">
          <span>Level label</span>
          <input
            defaultValue={program.levelLabel ?? ""}
            name="levelLabel"
            type="text"
          />
        </label>
      </div>

      <label className="field-checkbox">
        <input
          defaultChecked={program.progressTrackingEnabled}
          name="progressTrackingEnabled"
          type="checkbox"
        />
        <div>
          <strong>Enable progress tracking</strong>
          <p>Leave this on only for programs that should surface progress UI.</p>
        </div>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving changes...">Save changes</SubmitButton>
    </form>
  );
}
