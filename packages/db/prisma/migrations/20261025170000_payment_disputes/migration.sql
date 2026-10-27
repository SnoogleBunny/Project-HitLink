-- DropIndex
DROP INDEX "financial_entitlement_holds_workspaceId_targetKind_targetId_key";

-- AlterTable
ALTER TABLE "financial_entitlement_holds" ADD COLUMN     "disputeId" TEXT,
ALTER COLUMN "operationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "financial_review_cases" ADD COLUMN     "disputeId" TEXT;

-- AlterTable
ALTER TABLE "stripe_webhook_events" ADD COLUMN     "objectId" TEXT;

-- AlterTable
ALTER TABLE "workspace_stripe_settings" ADD COLUMN     "disputeSyncCursor" TEXT,
ADD COLUMN     "disputeSyncMode" BOOLEAN;

-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "providerDisputeId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "paymentId" TEXT,
    "providerStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "chargeAmountCents" INTEGER NOT NULL,
    "chargeRefundedCents" INTEGER NOT NULL DEFAULT 0,
    "isChargeRefundable" BOOLEAN NOT NULL,
    "evidenceDueAt" TIMESTAMP(3),
    "evidence" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewerWorkspaceUserId" TEXT,
    "pendingTreatment" TEXT NOT NULL DEFAULT 'KEEP_RESERVATIONS',
    "accessState" TEXT NOT NULL,
    "moneyState" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_dispute_allocations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerAllocationId" TEXT,
    "fundedAmountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_dispute_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_dispute_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_disputes_workspaceId_resolvedAt_createdAt_idx" ON "payment_disputes"("workspaceId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "payment_disputes_workspaceId_paymentIntentId_idx" ON "payment_disputes"("workspaceId", "paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_workspaceId_id_key" ON "payment_disputes"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_providerAccountId_livemode_providerDispute_key" ON "payment_disputes"("providerAccountId", "livemode", "providerDisputeId");

-- CreateIndex
CREATE INDEX "payment_dispute_allocations_workspaceId_paymentId_idx" ON "payment_dispute_allocations"("workspaceId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_dispute_allocations_disputeId_paymentId_key" ON "payment_dispute_allocations"("disputeId", "paymentId");

-- CreateIndex
CREATE INDEX "payment_dispute_events_workspaceId_createdAt_idx" ON "payment_dispute_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_dispute_events_disputeId_requestKey_key" ON "payment_dispute_events"("disputeId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "financial_holds_operation_target_active_key" ON "financial_entitlement_holds"("workspaceId", "targetKind", "targetId", "operationId", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "financial_holds_dispute_target_active_key" ON "financial_entitlement_holds"("workspaceId", "targetKind", "targetId", "disputeId", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "payments_workspaceId_id_key" ON "payments"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_workspaceId_id_key" ON "workspace_users"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_workspaceId_disputeId_fkey" FOREIGN KEY ("workspaceId", "disputeId") REFERENCES "payment_disputes"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entitlement_holds" ADD CONSTRAINT "financial_entitlement_holds_workspaceId_disputeId_fkey" FOREIGN KEY ("workspaceId", "disputeId") REFERENCES "payment_disputes"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_workspaceId_paymentId_fkey" FOREIGN KEY ("workspaceId", "paymentId") REFERENCES "payments"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_workspaceId_reviewerWorkspaceUserId_fkey" FOREIGN KEY ("workspaceId", "reviewerWorkspaceUserId") REFERENCES "workspace_users"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_allocations" ADD CONSTRAINT "payment_dispute_allocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_allocations" ADD CONSTRAINT "payment_dispute_allocations_workspaceId_disputeId_fkey" FOREIGN KEY ("workspaceId", "disputeId") REFERENCES "payment_disputes"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_allocations" ADD CONSTRAINT "payment_dispute_allocations_workspaceId_paymentId_fkey" FOREIGN KEY ("workspaceId", "paymentId") REFERENCES "payments"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_events_workspaceId_disputeId_fkey" FOREIGN KEY ("workspaceId", "disputeId") REFERENCES "payment_disputes"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hold ownership is composable. Null SQL comparisons must never hide another owner's hold.
ALTER TABLE "financial_entitlement_holds" ADD CONSTRAINT "financial_hold_exact_owner_check"
  CHECK (("operationId" IS NOT NULL)::int + ("disputeId" IS NOT NULL)::int = 1);
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_dispute_money_check"
  CHECK ("amountCents" > 0 AND "chargeAmountCents" > 0 AND "chargeRefundedCents" BETWEEN 0 AND "chargeAmountCents" AND "currency" ~ '^[a-z]{3}$');
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_dispute_hash_check" CHECK ("evidenceHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "payment_dispute_allocations" ADD CONSTRAINT "payment_dispute_allocation_money_check" CHECK ("fundedAmountCents" > 0);
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_event_hash_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$');
CREATE FUNCTION "protect_payment_dispute_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Payment dispute history is immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "payment_dispute_events_immutable" BEFORE UPDATE OR DELETE ON "payment_dispute_events"
  FOR EACH ROW EXECUTE FUNCTION "protect_payment_dispute_history"();
CREATE TRIGGER "payment_dispute_allocations_immutable" BEFORE UPDATE OR DELETE ON "payment_dispute_allocations"
  FOR EACH ROW EXECUTE FUNCTION "protect_payment_dispute_history"();
