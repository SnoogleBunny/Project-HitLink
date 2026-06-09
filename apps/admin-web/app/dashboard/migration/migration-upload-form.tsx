"use client";

import { useActionState } from "react";
import type { ImportRecordKind } from "@flowstate/db";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { uploadMigrationCsvAction } from "./actions";

interface MigrationUploadFormProps {
  recordKinds: Array<{
    value: ImportRecordKind;
    label: string;
    description: string;
  }>;
}

export function MigrationUploadForm({ recordKinds }: MigrationUploadFormProps) {
  const [state, formAction] = useActionState(
    uploadMigrationCsvAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Export type</span>
        <select name="recordKind">
          {recordKinds.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>CSV export</span>
        <input accept=".csv,text/csv,text/plain" name="csv" type="file" />
        <p className="field-help">
          Internal operators stage canonical CSV headers here after the owner
          shares access or export instructions.
        </p>
      </label>

      <div className="stack-list">
        {recordKinds.map((option) => (
          <div key={option.value} className="migration-template-note">
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </div>
        ))}
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Uploading CSV...">
        Stage and validate
      </SubmitButton>
    </form>
  );
}
