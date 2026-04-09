-- AlterEnum
ALTER TYPE "ClassBookingSource" ADD VALUE 'MEMBER_PORTAL';

-- AlterTable
ALTER TABLE "members" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");

-- CreateIndex
CREATE INDEX "members_workspaceId_userId_idx" ON "members"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
