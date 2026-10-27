CREATE TABLE "workspace_setup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "serviceMode" TEXT NOT NULL CHECK ("serviceMode" IN ('MARTIAL_ARTS', 'COACHING', 'HYBRID')),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "verificationHash" TEXT,
  "verificationEmailHash" TEXT,
  "verificationRequestedAt" TIMESTAMP(3),
  "verificationExpiresAt" TIMESTAMP(3),
  "ownerVerifiedAt" TIMESTAMP(3),
  "verifiedEmailHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_setup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_setup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workspace_setup_workspaceId_key" ON "workspace_setup"("workspaceId");
CREATE UNIQUE INDEX "workspace_setup_verificationHash_key" ON "workspace_setup"("verificationHash");
CREATE INDEX "workspace_setup_ownerUserId_idx" ON "workspace_setup"("ownerUserId");

CREATE TABLE "workspace_setup_activations" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "setupId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "setupVersion" INTEGER NOT NULL,
  "serviceMode" TEXT NOT NULL CHECK ("serviceMode" IN ('MARTIAL_ARTS', 'COACHING', 'HYBRID')),
  "verifiedEmailHash" TEXT NOT NULL,
  "ownerVerifiedAt" TIMESTAMP(3) NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_setup_activations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_setup_activations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_setup_activation_clock" CHECK ("ownerVerifiedAt" <= "acceptedAt" AND "acceptedAt" <= "activatedAt"),
  CONSTRAINT "workspace_setup_activation_hash" CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "workspace_setup_activations_workspaceId_key" ON "workspace_setup_activations"("workspaceId");

CREATE FUNCTION protect_workspace_setup_activation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM workspaces WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'New-business activation receipts are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER workspace_setup_activation_immutable
  BEFORE UPDATE OR DELETE ON workspace_setup_activations
  FOR EACH ROW EXECUTE FUNCTION protect_workspace_setup_activation();
