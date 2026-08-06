ALTER TABLE "workspace_migrations"
  ADD COLUMN "ownerReviewAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "ownerReviewAcknowledgedByUserId" TEXT;

ALTER TABLE "import_jobs"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByOperatorId" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "workspace_migrations" AS migration
    INNER JOIN "workspaces" AS workspace
      ON workspace."id" = migration."workspaceId"
    WHERE migration."stage" = 'COMPLETE'
      AND (
        migration."ownerReviewAcknowledgedAt" IS NULL
        OR NULLIF(BTRIM(migration."ownerReviewAcknowledgedByUserId"), '') IS NULL
        OR migration."operationallyReadyAt" IS NULL
        OR NULLIF(BTRIM(migration."operationallyReadyByUserId"), '') IS NULL
        OR workspace."status" <> 'ACTIVE'
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce migration completion integrity: incoherent COMPLETE migration rows require reviewed repair';
  END IF;
END
$$;

ALTER TABLE "workspace_migrations"
  ADD CONSTRAINT "workspace_migrations_owner_review_pair_check"
  CHECK (
    ("ownerReviewAcknowledgedAt" IS NULL)
    =
    ("ownerReviewAcknowledgedByUserId" IS NULL)
  );

ALTER TABLE "workspace_migrations"
  ADD CONSTRAINT "workspace_migrations_owner_review_stage_check"
  CHECK (
    "ownerReviewAcknowledgedAt" IS NULL
    OR "stage" IN ('GO_LIVE_SCHEDULED', 'COMPLETE')
  );

ALTER TABLE "workspace_migrations"
  ADD CONSTRAINT "workspace_migrations_complete_audit_check"
  CHECK (
    "stage" <> 'COMPLETE'
    OR (
      "ownerReviewAcknowledgedAt" IS NOT NULL
      AND NULLIF(BTRIM("ownerReviewAcknowledgedByUserId"), '') IS NOT NULL
      AND "operationallyReadyAt" IS NOT NULL
      AND NULLIF(BTRIM("operationallyReadyByUserId"), '') IS NOT NULL
    )
  );

ALTER TABLE "workspace_migrations"
  ADD CONSTRAINT "workspace_migrations_owner_review_user_fkey"
  FOREIGN KEY ("ownerReviewAcknowledgedByUserId")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_cancellation_audit_check"
  CHECK (
    (
      "status" <> 'CANCELLED'
      AND "cancelledAt" IS NULL
      AND "cancelledByOperatorId" IS NULL
      AND "cancellationReason" IS NULL
    )
    OR
    (
      "status" = 'CANCELLED'
      AND "cancelledAt" IS NOT NULL
      AND NULLIF(BTRIM("cancelledByOperatorId"), '') IS NOT NULL
      AND NULLIF(BTRIM("cancellationReason"), '') IS NOT NULL
    )
  ) NOT VALID;