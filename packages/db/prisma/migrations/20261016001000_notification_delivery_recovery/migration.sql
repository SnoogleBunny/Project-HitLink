ALTER TABLE "notification_jobs" ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "context" JSONB;
CREATE UNIQUE INDEX "notification_jobs_workspaceId_dedupeKey_key" ON "notification_jobs"("workspaceId", "dedupeKey");
-- Existing interrupted claims predate leases. Make their uncertainty visible and recoverable.
UPDATE "notification_jobs" SET "status" = 'FAILED', "nextAttemptAt" = CURRENT_TIMESTAMP,
  "lastError" = 'Delivery was interrupted. Reconcile or retry the same message.'
WHERE "status" = 'SENDING' AND "nextAttemptAt" IS NULL;
