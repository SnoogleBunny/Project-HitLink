"use client";

import { useActionState } from "react";
import type { MigrationStage } from "@flowstate/db";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { updateMigrationStageAction } from "./actions";

interface MigrationStageFormProps {
  currentStage: MigrationStage;
  stages: Array<{
    value: MigrationStage;
    label: string;
  }>;
  nextOwnerAction: string;
  flowstateResponsibility: string;
  expectedNextMilestone: string | null;
  goLiveScheduledFor: string | null;
}

export function MigrationStageForm({
  currentStage,
  stages,
  nextOwnerAction,
  flowstateResponsibility,
  expectedNextMilestone,
  goLiveScheduledFor,
}: MigrationStageFormProps) {
  const [state, formAction] = useActionState(
    updateMigrationStageAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Migration stage</span>
        <select defaultValue={currentStage} name="stage">
          {stages.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Next owner action</span>
        <textarea
          defaultValue={nextOwnerAction}
          name="nextOwnerAction"
          rows={3}
        />
      </label>

      <label className="field">
        <span>Flowstate responsibility</span>
        <textarea
          defaultValue={flowstateResponsibility}
          name="flowstateResponsibility"
          rows={3}
        />
      </label>

      <label className="field">
        <span>Expected next milestone</span>
        <input
          defaultValue={expectedNextMilestone ?? ""}
          name="expectedNextMilestone"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Milestone time</span>
          <input name="expectedNextMilestoneAt" type="datetime-local" />
        </label>

        <label className="field">
          <span>Go-live date</span>
          <input
            defaultValue={goLiveScheduledFor ?? ""}
            name="goLiveScheduledFor"
            type="date"
          />
        </label>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Updating migration...">
        Update service status
      </SubmitButton>
    </form>
  );
}
