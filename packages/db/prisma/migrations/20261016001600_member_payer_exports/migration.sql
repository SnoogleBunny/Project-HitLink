CREATE TABLE "member_data_exports" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "resolverUserId" TEXT NOT NULL,
  "resolverName" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'BUILDING',
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
  CONSTRAINT "member_data_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_data_exports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_data_exports_scope_check" CHECK ("scope" IN ('MEMBER','PAYER')),
  CONSTRAINT "member_data_exports_state_check" CHECK ("state" IN ('BUILDING','READY','FAILED','EXPIRED'))
);
CREATE INDEX "member_data_exports_workspaceId_scope_targetId_createdAt_idx" ON "member_data_exports"("workspaceId","scope","targetId","createdAt");
CREATE INDEX "member_data_exports_workspaceId_requestedByUserId_createdAt_idx" ON "member_data_exports"("workspaceId","requestedByUserId","createdAt");
CREATE INDEX "member_data_exports_state_expiresAt_idx" ON "member_data_exports"("state","expiresAt");
