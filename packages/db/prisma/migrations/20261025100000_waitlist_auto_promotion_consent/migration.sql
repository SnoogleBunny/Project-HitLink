-- Existing queued people have not accepted automatic promotion. Keep their
-- consent nullable; a fresh member/guardian opt-in is required before booking.
ALTER TABLE "waitlist_entries"
  ADD COLUMN "autoPromotionOptedInAt" TIMESTAMP(3),
  ADD COLUMN "autoPromotionConsentUserId" TEXT,
  ADD COLUMN "autoPromotionPolicyVersion" TEXT,
  ADD COLUMN "allowPunchCardFunding" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSkippedAt" TIMESTAMP(3),
  ADD COLUMN "lastSkipReason" TEXT,
  ADD COLUMN "promotionHistory" JSONB NOT NULL DEFAULT '[]';
