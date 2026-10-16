-- DropIndex
DROP INDEX "membership_allowance_allocations_bookingId_kind_periodStart_key";

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "fundingRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "member_punch_cards" ADD COLUMN     "acceptedTerms" JSONB;

-- AlterTable
ALTER TABLE "membership_allowance_allocations" ADD COLUMN     "bookingRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "punch_card_products" ADD COLUMN     "lateCancellationConsumesPunch" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "noShowConsumesPunch" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "termsVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "punch_card_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberPunchCardId" TEXT NOT NULL,
    "bookingId" TEXT,
    "bookingRevision" INTEGER,
    "operationKey" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_card_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "punch_card_entries_operationKey_key" ON "punch_card_entries"("operationKey");

-- CreateIndex
CREATE INDEX "punch_card_entries_workspaceId_memberPunchCardId_createdAt_idx" ON "punch_card_entries"("workspaceId", "memberPunchCardId", "createdAt");

-- CreateIndex
CREATE INDEX "punch_card_entries_workspaceId_bookingId_bookingRevision_idx" ON "punch_card_entries"("workspaceId", "bookingId", "bookingRevision");

-- CreateIndex
CREATE UNIQUE INDEX "membership_allowance_allocations_bookingId_bookingRevision__key" ON "membership_allowance_allocations"("bookingId", "bookingRevision", "kind", "periodStart");

-- AddForeignKey
ALTER TABLE "punch_card_entries" ADD CONSTRAINT "punch_card_entries_memberPunchCardId_fkey" FOREIGN KEY ("memberPunchCardId") REFERENCES "member_punch_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Capture existing pack access before mutable catalog edits. Opening balance is
-- explicit; old purchases are not presented as newly reconstructed transactions.
UPDATE "member_punch_cards" c SET "acceptedTerms" = jsonb_build_object(
 'version',p."termsVersion", 'priceCents',c."purchasePriceCents", 'currency',c."purchaseCurrency",
 'originalPunches',c."originalPunches", 'restrictionMode',p."restrictionMode", 'programIds',
 COALESCE((SELECT jsonb_agg(r."programId") FROM "punch_card_product_program_restrictions" r WHERE r."punchCardProductId"=p.id),'[]'::jsonb),
 'lateCancellationConsumesPunch',true, 'noShowConsumesPunch',true, 'capturedAt',CURRENT_TIMESTAMP, 'source','legacy-migration')
FROM "punch_card_products" p WHERE p.id=c."punchCardProductId";
INSERT INTO "punch_card_entries" (id,"workspaceId","memberId","memberPunchCardId","operationKey",delta,reason)
SELECT 'opening_'||id,"workspaceId","memberId",id,'opening:'||id,"remainingPunches",'Opening balance at ledger migration' FROM "member_punch_cards";
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_booking_positive_funding_revision" CHECK ("fundingRevision">0);
