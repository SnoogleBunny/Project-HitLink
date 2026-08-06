"use client";

import { useEffect, useRef } from "react";

function getRecoveryCopy(reason: string | undefined) {
  if (reason === "schedule-missing") {
    return {
      heading: "Schedule needs Flowstate review",
      body: "Flowstate still needs to confirm the go-live schedule. Use the configured migration correction action below if your timing has changed.",
    };
  }

  if (reason === "schedule-passed") {
    return {
      heading: "Scheduled date passed — Flowstate review required",
      body: "The scheduled go-live date has passed, but this migration is not complete. Flowstate needs to confirm the schedule. Use the configured migration correction action below if your timing has changed.",
    };
  }

  if (reason === "launch-timezone-invalid") {
    return {
      heading: "Schedule needs Flowstate review",
      body: "Flowstate needs to confirm the launch timezone before the go-live schedule can be reviewed. Use the configured migration correction action below if your timing has changed.",
    };
  }

  if (reason === "remaining-checks") {
    return {
      heading: "Migration checks changed",
      body: "Flowstate is completing the remaining migration checks before you can acknowledge the summary. No owner action is needed.",
    };
  }

  if (reason === "confirmation-required") {
    return {
      heading: "Confirmation required",
      body: "Your acknowledgment was not saved. You must confirm that acknowledging locks the reviewed snapshot before trying again.",
    };
  }

  if (reason === "correction-channel-unavailable") {
    return {
      heading: "Migration correction channel unavailable",
      body: "The migration correction channel is unavailable. Do not acknowledge this summary. Flowstate must make the contact channel available before owner review can continue.",
    };
  }

  return {
    heading: "Migration status changed",
    body: "Your acknowledgment was not saved. Review the updated snapshot before trying again.",
  };
}

export function MigrationRecoveryAlert({ reason }: { reason?: string }) {
  const alertRef = useRef<HTMLDivElement>(null);
  const copy = getRecoveryCopy(reason);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  return (
    <div className="form-error" ref={alertRef} role="alert" tabIndex={-1}>
      <strong>{copy.heading}</strong>
      <p>{copy.body}</p>
    </div>
  );
}
