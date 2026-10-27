ALTER TABLE "workspace_settings"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "locale" TEXT,
  ADD COLUMN "identityVersion" INTEGER NOT NULL DEFAULT 0;
