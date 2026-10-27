-- Migration60: class booking confirmations and explicit owner reminder settings.
-- No backfill, no implicit reminder schedule. Existing gyms remain OFF.
ALTER TABLE workspace_settings
  ADD COLUMN "classReminderLeadMinutes" INTEGER,
  ADD COLUMN "classReminderVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_settings ADD CONSTRAINT "class_reminder_settings_bounds"
  CHECK (("classReminderLeadMinutes" IS NULL OR "classReminderLeadMinutes" BETWEEN 1 AND 527040)
    AND "classReminderVersion" >= 0);

-- Persist once before the class-service notice provider boundary. NULL for all existing jobs.
ALTER TABLE notification_jobs ADD COLUMN "classNoticeDeliveryStartedAt" TIMESTAMP(3);
