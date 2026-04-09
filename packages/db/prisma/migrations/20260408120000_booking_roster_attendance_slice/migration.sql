-- CreateEnum
CREATE TYPE "ClassBookingType" AS ENUM (
    'TRIAL',
    'STANDARD'
);

-- CreateEnum
CREATE TYPE "ClassBookingStatus" AS ENUM (
    'BOOKED',
    'CANCELLED',
    'ATTENDED',
    'ABSENT',
    'NO_SHOW'
);

-- CreateEnum
CREATE TYPE "ClassBookingSource" AS ENUM (
    'ADMIN',
    'PUBLIC_TRIAL'
);

-- CreateEnum
CREATE TYPE "AttendanceState" AS ENUM (
    'PRESENT',
    'LATE',
    'ABSENT',
    'NO_SHOW'
);

-- CreateTable
CREATE TABLE "class_bookings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT,
    "classTemplateId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "bookingType" "ClassBookingType" NOT NULL DEFAULT 'STANDARD',
    "status" "ClassBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "source" "ClassBookingSource" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "state" "AttendanceState" NOT NULL,
    "coachWorkspaceUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- Backfill existing public trial bookings before removing the legacy table.
-- The booking id is preserved so any dev/test references remain traceable.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "trial_bookings"
        GROUP BY "workspaceId", "memberId", "classTemplateId", "scheduledForDate"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot migrate trial_bookings with duplicate workspace/member/template/date rows into class_bookings.';
    END IF;
END $$;

INSERT INTO "class_bookings" (
    "id",
    "workspaceId",
    "memberId",
    "guardianId",
    "classTemplateId",
    "scheduledForDate",
    "bookingType",
    "status",
    "source",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "memberId",
    "guardianId",
    "classTemplateId",
    "scheduledForDate",
    'TRIAL'::"ClassBookingType",
    'BOOKED'::"ClassBookingStatus",
    'PUBLIC_TRIAL'::"ClassBookingSource",
    "createdAt",
    "updatedAt"
FROM "trial_bookings"
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "class_bookings_member_template_date_key" ON "class_bookings"("workspaceId", "memberId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_scheduledForDate_idx" ON "class_bookings"("workspaceId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_classTemplateId_scheduledForDate_idx" ON "class_bookings"("workspaceId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_memberId_idx" ON "class_bookings"("workspaceId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_member_template_date_key" ON "attendance_records"("workspaceId", "memberId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "attendance_records_workspaceId_classTemplateId_scheduledForDate_idx" ON "attendance_records"("workspaceId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "attendance_records_workspaceId_memberId_idx" ON "attendance_records"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "attendance_records_coachWorkspaceUserId_idx" ON "attendance_records"("coachWorkspaceUserId");

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "trial_bookings" DROP CONSTRAINT "trial_bookings_classTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "trial_bookings" DROP CONSTRAINT "trial_bookings_guardianId_fkey";

-- DropForeignKey
ALTER TABLE "trial_bookings" DROP CONSTRAINT "trial_bookings_memberId_fkey";

-- DropForeignKey
ALTER TABLE "trial_bookings" DROP CONSTRAINT "trial_bookings_workspaceId_fkey";

-- DropTable
DROP TABLE "trial_bookings";
