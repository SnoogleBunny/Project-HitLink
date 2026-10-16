"use client";

import { useState } from "react";

interface MigrationAcknowledgmentFormProps {
  snapshotId?: string;
  action: (formData: FormData) => void | Promise<void>;
}

export function MigrationAcknowledgmentForm({
  action, snapshotId,
}: MigrationAcknowledgmentFormProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);

  return (
    <form action={action}>
      <input name="snapshotId" type="hidden" value={snapshotId ?? ""} />
      <label className="field migration-acknowledgment-consent">
        <input
          checked={isConfirmed}
          name="acknowledgeSnapshotLock"
          onChange={(event) => setIsConfirmed(event.currentTarget.checked)}
          required
          type="checkbox"
          value="yes"
        />
        <span>
          I understand that acknowledging locks this reviewed snapshot and does
          not start daily operations.
        </span>
      </label>
      <button
        className="button migration-acknowledgment-submit"
        disabled={!isConfirmed}
        type="submit"
      >
        Acknowledge and lock summary
      </button>
    </form>
  );
}
