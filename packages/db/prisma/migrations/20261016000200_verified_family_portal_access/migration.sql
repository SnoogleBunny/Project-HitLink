-- CreateTable
CREATE TABLE "member_portal_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "verifiedByWorkspaceUserId" TEXT NOT NULL,
    "verificationNote" TEXT NOT NULL,
    "canBook" BOOLEAN NOT NULL DEFAULT false,
    "canSign" BOOLEAN NOT NULL DEFAULT false,
    "canPay" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_portal_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access_changes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_portal_grants_workspaceId_userId_revokedAt_idx" ON "member_portal_grants"("workspaceId", "userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "member_portal_grants_workspaceId_userId_memberId_key" ON "member_portal_grants"("workspaceId", "userId", "memberId");

-- CreateIndex
CREATE INDEX "portal_access_changes_workspaceId_grantId_createdAt_idx" ON "portal_access_changes"("workspaceId", "grantId", "createdAt");

-- AddForeignKey
ALTER TABLE "member_portal_grants" ADD CONSTRAINT "member_portal_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_portal_grants" ADD CONSTRAINT "member_portal_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_portal_grants" ADD CONSTRAINT "member_portal_grants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_portal_grants" ADD CONSTRAINT "member_portal_grants_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_portal_grants" ADD CONSTRAINT "member_portal_grants_verifiedByWorkspaceUserId_fkey" FOREIGN KEY ("verifiedByWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_changes" ADD CONSTRAINT "portal_access_changes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_changes" ADD CONSTRAINT "portal_access_changes_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "member_portal_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_changes" ADD CONSTRAINT "portal_access_changes_actorWorkspaceUserId_fkey" FOREIGN KEY ("actorWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
