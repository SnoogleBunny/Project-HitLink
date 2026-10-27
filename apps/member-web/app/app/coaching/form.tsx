"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { coachingAction } from "./actions";
import { coachingViewForAction, type CoachingView } from "./navigation";
function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}
export function CoachingForm({
  kind,
  operationId,
  enrollmentId,
  version,
  returnView,
  children,
  submit = "Save",
}: {
  kind: string;
  operationId: string;
  enrollmentId: string;
  version: number;
  returnView?: CoachingView;
  children?: ReactNode;
  submit?: string;
}) {
  return (
    <form action={coachingAction} className="form-stack">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input
        type="hidden"
        name="returnView"
        value={returnView ?? coachingViewForAction(kind)}
      />
      {children}
      <div className="member-actions">
        <Submit>{submit}</Submit>
      </div>
    </form>
  );
}
