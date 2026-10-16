-- CreateTable
CREATE TABLE "workspace_data_exports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'BUILDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "artifact" BYTEA,
    "sha256" TEXT,
    "byteCount" INTEGER,
    "manifest" JSONB,
    "failureMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "receiptConfirmedAt" TIMESTAMP(3),
    "receiptConfirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_offboarding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REVIEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "accessEndsAt" TIMESTAMP(3) NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "retentionReason" TEXT NOT NULL,
    "recordsContact" TEXT NOT NULL,
    "retentionHoldReason" TEXT,
    "deletionState" TEXT NOT NULL DEFAULT 'RETAINED',
    "exportJobId" TEXT,
    "customerBillingDisposition" TEXT NOT NULL DEFAULT 'STOP',
    "customerBillingEvidence" JSONB,
    "platformBillingConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedByUserId" TEXT,
    "accessRevokedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_offboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_platform_billing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "stopsAt" TIMESTAMP(3),
    "operationId" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_platform_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "supportUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_events" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_data_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "kind" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_data_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_data_exports_workspaceId_state_createdAt_idx" ON "workspace_data_exports"("workspaceId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_offboarding_workspaceId_key" ON "workspace_offboarding"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_platform_billing_workspaceId_key" ON "workspace_platform_billing"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_platform_billing_stripeSubscriptionId_key" ON "workspace_platform_billing"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "support_access_grants_workspaceId_supportUserId_expiresAt_idx" ON "support_access_grants"("workspaceId", "supportUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "support_access_events_grantId_createdAt_idx" ON "support_access_events"("grantId", "createdAt");

-- CreateIndex
CREATE INDEX "workspace_data_events_workspaceId_createdAt_idx" ON "workspace_data_events"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "workspace_data_exports" ADD CONSTRAINT "workspace_data_exports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_offboarding" ADD CONSTRAINT "workspace_offboarding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_offboarding" ADD CONSTRAINT "workspace_offboarding_exportJobId_fkey" FOREIGN KEY ("exportJobId") REFERENCES "workspace_data_exports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_platform_billing" ADD CONSTRAINT "workspace_platform_billing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_events" ADD CONSTRAINT "support_access_events_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "support_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_data_events" ADD CONSTRAINT "workspace_data_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
