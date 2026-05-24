"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { uploadFormVersionAction } from "./actions";

export function FormVersionUploadForm({
  formDocumentId,
  pdfSizeCapLabel,
}: {
  formDocumentId: string;
  pdfSizeCapLabel: string;
}) {
  const [state, formAction] = useActionState(
    uploadFormVersionAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input name="formDocumentId" type="hidden" value={formDocumentId} />

      <label className="field">
        <span>New PDF version</span>
        <input accept="application/pdf" name="pdf" type="file" />
        <p className="field-help">
          Uploading a new version makes it the current required version. {pdfSizeCapLabel}.
        </p>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Uploading version...">
        Upload new version
      </SubmitButton>
    </form>
  );
}
