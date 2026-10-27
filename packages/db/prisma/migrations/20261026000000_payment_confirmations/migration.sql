-- AlterTable
ALTER TABLE "notification_jobs" ADD COLUMN     "attemptLimit" INTEGER NOT NULL DEFAULT 6;

-- CreateTable
CREATE TABLE "payment_confirmations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "payerAccountId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_confirmations_paymentId_key" ON "payment_confirmations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_confirmations_workspaceId_payerAccountId_createdAt_idx" ON "payment_confirmations"("workspaceId", "payerAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A confirmation records verified canonical cash once; mail retry never mutates this record.
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmation_money" CHECK ("amountMinor" > 0 AND "currency" ~ '^[a-z]{3}$');
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmation_hash" CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_retry_budget" CHECK ("attemptLimit" BETWEEN 6 AND 1000 AND "attempts" >= 0);
CREATE FUNCTION "guard_payment_confirmation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "payments" p
      JOIN "financial_accounts" a ON a.id = NEW."payerAccountId"
      JOIN "members" m ON m.id = a."memberId" AND m."workspaceId" = NEW."workspaceId" AND m."userId" = a."userId"
      WHERE p.id = NEW."paymentId" AND p."workspaceId" = NEW."workspaceId"
        AND p."payerAccountId" = a.id AND a."workspaceId" = NEW."workspaceId"
        AND a."userId" = NEW."payerUserId" AND p.source = 'CURRENT'
        AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND p."amountCents" = NEW."amountMinor" AND p.currency = NEW.currency
        AND p."paidAt" = NEW."paidAt" AND p."stripePaymentIntentId" IS NOT NULL
        AND length(p."stripePaymentIntentId") > 0
        AND jsonb_typeof(NEW.snapshot) = 'object'
        AND NEW.snapshot->>'version' = '1'
        AND NEW.snapshot->>'providerReference' = p."stripePaymentIntentId"
    ) THEN RAISE EXCEPTION 'Payment confirmation requires exact settled payment and payer evidence'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Payment confirmations are immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "payment_confirmation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "payment_confirmations"
  FOR EACH ROW EXECUTE FUNCTION "guard_payment_confirmation"();
CREATE FUNCTION "protect_payment_delivery_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind IN ('PAYMENT_CONFIRMATION_CREATED','PAYMENT_CONFIRMATION_COPY_QUEUED','NOTIFICATION_RETRY_REQUESTED')
    OR (TG_OP = 'UPDATE' AND NEW.kind IN ('PAYMENT_CONFIRMATION_CREATED','PAYMENT_CONFIRMATION_COPY_QUEUED','NOTIFICATION_RETRY_REQUESTED')) THEN
    IF TG_OP = 'DELETE' AND (
      current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
      OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Payment delivery history is immutable outside reviewed retention';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "payment_delivery_history_immutable" BEFORE UPDATE OR DELETE ON "workspace_data_events"
  FOR EACH ROW EXECUTE FUNCTION "protect_payment_delivery_history"();
