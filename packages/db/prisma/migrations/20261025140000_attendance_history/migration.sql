CREATE TABLE "attendance_operations" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorWorkspaceUserId" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_operations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_operations_action_check" CHECK ("action" IN ('RECORD', 'CLOSE')),
  CONSTRAINT "attendance_operations_payload_hash_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "attendance_operations_request_key_check" CHECK (length("requestKey") BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX "attendance_operations_workspaceId_requestKey_key" ON "attendance_operations"("workspaceId", "requestKey");
CREATE UNIQUE INDEX "attendance_operations_workspaceId_id_key" ON "attendance_operations"("workspaceId", "id");
CREATE INDEX "attendance_operations_workspaceId_createdAt_idx" ON "attendance_operations"("workspaceId", "createdAt");

CREATE TABLE "attendance_events" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "attendanceRecordId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "classTemplateId" TEXT NOT NULL,
  "scheduledForDate" DATE NOT NULL,
  "actorWorkspaceUserId" TEXT NOT NULL,
  "actorNameSnapshot" TEXT NOT NULL,
  "actorRole" "UserRole" NOT NULL,
  "previousState" "AttendanceState",
  "state" "AttendanceState" NOT NULL,
  "previousNote" TEXT,
  "note" TEXT,
  "reason" TEXT,
  "occurrenceTimezone" TEXT NOT NULL,
  "noShowCutoffAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_events_workspaceId_operationId_fkey" FOREIGN KEY ("workspaceId", "operationId") REFERENCES "attendance_operations"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_events_correction_reason_check" CHECK ("previousState" IS NULL OR ("reason" IS NOT NULL AND length(trim("reason")) > 0))
);
CREATE INDEX "attendance_events_workspaceId_memberId_scheduledForDate_idx" ON "attendance_events"("workspaceId", "memberId", "scheduledForDate");
CREATE INDEX "attendance_events_workspaceId_classTemplateId_scheduledForDate_idx" ON "attendance_events"("workspaceId", "classTemplateId", "scheduledForDate");
CREATE INDEX "attendance_events_record_history_idx" ON "attendance_events"("workspaceId", "attendanceRecordId", "createdAt");

CREATE FUNCTION "protect_attendance_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Attendance history is immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "attendance_operations_immutable"
  BEFORE UPDATE OR DELETE ON "attendance_operations"
  FOR EACH ROW EXECUTE FUNCTION "protect_attendance_history"();
CREATE TRIGGER "attendance_events_immutable"
  BEFORE UPDATE OR DELETE ON "attendance_events"
  FOR EACH ROW EXECUTE FUNCTION "protect_attendance_history"();
