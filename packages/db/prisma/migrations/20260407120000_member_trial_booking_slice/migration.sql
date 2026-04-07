-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM (
    'ACTIVE',
    'TRIAL',
    'OVERDUE',
    'FROZEN',
    'CANCELLED',
    'WAITLISTED'
);

-- CreateEnum
CREATE TYPE "MemberFormStatus" AS ENUM (
    'NOT_REQUESTED',
    'PENDING',
    'COMPLETE'
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "status" "MemberStatus" NOT NULL DEFAULT 'TRIAL',
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "formStatus" "MemberFormStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "childMemberId" TEXT NOT NULL,
    "relationshipLabel" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_bookings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT,
    "classTemplateId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_workspaceId_status_idx" ON "members"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "members_workspaceId_fullName_idx" ON "members"("workspaceId", "fullName");

-- CreateIndex
CREATE INDEX "members_workspaceId_email_idx" ON "members"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "guardians_workspaceId_fullName_idx" ON "guardians"("workspaceId", "fullName");

-- CreateIndex
CREATE INDEX "guardians_workspaceId_email_idx" ON "guardians"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "family_links_guardianId_childMemberId_key" ON "family_links"("guardianId", "childMemberId");

-- CreateIndex
CREATE INDEX "family_links_workspaceId_childMemberId_idx" ON "family_links"("workspaceId", "childMemberId");

-- CreateIndex
CREATE INDEX "family_links_workspaceId_guardianId_idx" ON "family_links"("workspaceId", "guardianId");

-- CreateIndex
CREATE INDEX "trial_bookings_workspaceId_scheduledForDate_idx" ON "trial_bookings"("workspaceId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "trial_bookings_workspaceId_memberId_idx" ON "trial_bookings"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "trial_bookings_workspaceId_classTemplateId_idx" ON "trial_bookings"("workspaceId", "classTemplateId");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_childMemberId_fkey" FOREIGN KEY ("childMemberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_bookings" ADD CONSTRAINT "trial_bookings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_bookings" ADD CONSTRAINT "trial_bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_bookings" ADD CONSTRAINT "trial_bookings_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_bookings" ADD CONSTRAINT "trial_bookings_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
