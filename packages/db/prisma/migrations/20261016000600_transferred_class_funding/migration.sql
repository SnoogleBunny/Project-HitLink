ALTER TABLE "class_bookings" ADD COLUMN "fundedByBookingId" TEXT;
CREATE INDEX "class_bookings_workspaceId_fundedByBookingId_idx" ON "class_bookings"("workspaceId", "fundedByBookingId");
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_fundedByBookingId_fkey" FOREIGN KEY ("fundedByBookingId") REFERENCES "class_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A legacy duplicate must be reconciled before deployment, never silently removed.
CREATE UNIQUE INDEX "member_punch_cards_stripeCheckoutSessionId_key" ON "member_punch_cards"("stripeCheckoutSessionId");
