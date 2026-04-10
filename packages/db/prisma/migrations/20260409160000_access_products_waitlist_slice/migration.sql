-- AlterEnum
ALTER TYPE "ClassBookingType" RENAME VALUE 'STANDARD' TO 'MEMBERSHIP';

-- AlterEnum
ALTER TYPE "ClassBookingType" ADD VALUE 'PUNCH_CARD';

-- AlterEnum
ALTER TYPE "ClassBookingType" ADD VALUE 'DROP_IN';

-- AlterEnum
ALTER TYPE "ClassBookingStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterEnum
ALTER TYPE "BillingRecordType" ADD VALUE 'PUNCH_CARD_PURCHASED';

-- AlterEnum
ALTER TYPE "BillingRecordType" ADD VALUE 'PUNCH_CARD_GRANTED';

-- AlterEnum
ALTER TYPE "BillingRecordType" ADD VALUE 'DROP_IN_PURCHASED';

-- CreateEnum
CREATE TYPE "AccessRestrictionMode" AS ENUM (
    'GENERAL',
    'PROGRAM_RESTRICTED'
);

-- CreateEnum
CREATE TYPE "MemberPunchCardStatus" AS ENUM (
    'ACTIVE',
    'DEPLETED',
    'ARCHIVED'
);

-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM (
    'ACTIVE',
    'PROMOTED',
    'CANCELLED'
);

-- AlterTable
ALTER TABLE "class_bookings"
    ALTER COLUMN "bookingType" SET DEFAULT 'MEMBERSHIP',
    ADD COLUMN "memberPunchCardId" TEXT,
    ADD COLUMN "dropInProductId" TEXT,
    ADD COLUMN "consumedPunchCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "dropInPriceCents" INTEGER,
    ADD COLUMN "dropInCurrency" TEXT,
    ADD COLUMN "dropInCheckoutSessionId" TEXT,
    ADD COLUMN "dropInPaymentIntentId" TEXT,
    ADD COLUMN "dropInPaidAt" TIMESTAMP(3),
    ADD COLUMN "pendingPaymentExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "punch_card_products" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "punchesIncluded" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "restrictionMode" "AccessRestrictionMode" NOT NULL DEFAULT 'GENERAL',
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_card_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_card_product_program_restrictions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "punchCardProductId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_card_product_program_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_punch_cards" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "punchCardProductId" TEXT NOT NULL,
    "originalPunches" INTEGER NOT NULL,
    "remainingPunches" INTEGER NOT NULL,
    "status" "MemberPunchCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchasePriceCents" INTEGER NOT NULL,
    "purchaseCurrency" TEXT NOT NULL DEFAULT 'usd',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeCheckoutSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_punch_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_in_products" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "restrictionMode" "AccessRestrictionMode" NOT NULL DEFAULT 'GENERAL',
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drop_in_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_in_product_program_restrictions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dropInProductId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drop_in_product_program_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "promotedBookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "punch_card_products_workspaceId_name_key" ON "punch_card_products"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "punch_card_products_workspaceId_archivedAt_idx" ON "punch_card_products"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "punch_card_products_workspaceId_isEnabled_archivedAt_idx" ON "punch_card_products"("workspaceId", "isEnabled", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "punch_card_product_program_restrictions_product_program_key" ON "punch_card_product_program_restrictions"("punchCardProductId", "programId");

-- CreateIndex
CREATE INDEX "punch_card_product_program_restrictions_workspaceId_punchCardProductId_idx" ON "punch_card_product_program_restrictions"("workspaceId", "punchCardProductId");

-- CreateIndex
CREATE INDEX "punch_card_product_program_restrictions_workspaceId_programId_idx" ON "punch_card_product_program_restrictions"("workspaceId", "programId");

-- CreateIndex
CREATE INDEX "member_punch_cards_workspaceId_memberId_status_purchasedAt_idx" ON "member_punch_cards"("workspaceId", "memberId", "status", "purchasedAt");

-- CreateIndex
CREATE INDEX "member_punch_cards_workspaceId_punchCardProductId_idx" ON "member_punch_cards"("workspaceId", "punchCardProductId");

-- CreateIndex
CREATE INDEX "member_punch_cards_workspaceId_stripeCheckoutSessionId_idx" ON "member_punch_cards"("workspaceId", "stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "drop_in_products_workspaceId_name_key" ON "drop_in_products"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "drop_in_products_workspaceId_archivedAt_idx" ON "drop_in_products"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "drop_in_products_workspaceId_isEnabled_archivedAt_idx" ON "drop_in_products"("workspaceId", "isEnabled", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "drop_in_product_program_restrictions_product_program_key" ON "drop_in_product_program_restrictions"("dropInProductId", "programId");

-- CreateIndex
CREATE INDEX "drop_in_product_program_restrictions_workspaceId_dropInProductId_idx" ON "drop_in_product_program_restrictions"("workspaceId", "dropInProductId");

-- CreateIndex
CREATE INDEX "drop_in_product_program_restrictions_workspaceId_programId_idx" ON "drop_in_product_program_restrictions"("workspaceId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_member_template_date_key" ON "waitlist_entries"("workspaceId", "memberId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "waitlist_entries_workspaceId_classTemplateId_scheduledForDate_status_joinedAt_idx" ON "waitlist_entries"("workspaceId", "classTemplateId", "scheduledForDate", "status", "joinedAt");

-- CreateIndex
CREATE INDEX "waitlist_entries_workspaceId_memberId_status_idx" ON "waitlist_entries"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE INDEX "waitlist_entries_workspaceId_promotedBookingId_idx" ON "waitlist_entries"("workspaceId", "promotedBookingId");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_status_pendingPaymentExpiresAt_idx" ON "class_bookings"("workspaceId", "status", "pendingPaymentExpiresAt");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_memberPunchCardId_idx" ON "class_bookings"("workspaceId", "memberPunchCardId");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_dropInProductId_idx" ON "class_bookings"("workspaceId", "dropInProductId");

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_memberPunchCardId_fkey" FOREIGN KEY ("memberPunchCardId") REFERENCES "member_punch_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_dropInProductId_fkey" FOREIGN KEY ("dropInProductId") REFERENCES "drop_in_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_card_products" ADD CONSTRAINT "punch_card_products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_card_product_program_restrictions" ADD CONSTRAINT "punch_card_product_program_restrictions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_card_product_program_restrictions" ADD CONSTRAINT "punch_card_product_program_restrictions_punchCardProductId_fkey" FOREIGN KEY ("punchCardProductId") REFERENCES "punch_card_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_card_product_program_restrictions" ADD CONSTRAINT "punch_card_product_program_restrictions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_punch_cards" ADD CONSTRAINT "member_punch_cards_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_punch_cards" ADD CONSTRAINT "member_punch_cards_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_punch_cards" ADD CONSTRAINT "member_punch_cards_punchCardProductId_fkey" FOREIGN KEY ("punchCardProductId") REFERENCES "punch_card_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_in_products" ADD CONSTRAINT "drop_in_products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_in_product_program_restrictions" ADD CONSTRAINT "drop_in_product_program_restrictions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_in_product_program_restrictions" ADD CONSTRAINT "drop_in_product_program_restrictions_dropInProductId_fkey" FOREIGN KEY ("dropInProductId") REFERENCES "drop_in_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_in_product_program_restrictions" ADD CONSTRAINT "drop_in_product_program_restrictions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_promotedBookingId_fkey" FOREIGN KEY ("promotedBookingId") REFERENCES "class_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
