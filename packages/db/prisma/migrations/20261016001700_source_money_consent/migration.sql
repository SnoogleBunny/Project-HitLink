-- AlterEnum
ALTER TYPE "ImportRecordKind" ADD VALUE 'SOURCE_SIGNATURE';

-- CreateTable
CREATE TABLE "imported_financial_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceAccountReference" TEXT NOT NULL,
    "sourceRecordKind" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "billingOwner" TEXT NOT NULL,
    "refundOwner" TEXT NOT NULL,
    "payerMemberId" TEXT NOT NULL,
    "beneficiaryMemberId" TEXT NOT NULL,
    "payerAuthorityEvidence" TEXT NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "sourceRowHash" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "importJobId" TEXT NOT NULL,
    "stagingRecordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "parentEvidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_financial_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_booking_funding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "sourceAllocationReference" TEXT NOT NULL,
    "sourceRowHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_booking_funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_signature_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT,
    "formVersionId" TEXT NOT NULL,
    "signedDocumentId" TEXT NOT NULL,
    "sourceDocumentHash" TEXT NOT NULL,
    "signatureReceiptHash" TEXT NOT NULL,
    "signatureReceiptData" BYTEA NOT NULL,
    "sourceSignerReference" TEXT NOT NULL,
    "sourceBeneficiaryReference" TEXT NOT NULL,
    "signerAuthorityEvidence" TEXT NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "sourceSignedAt" TIMESTAMP(3) NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "sourceRowHash" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "stagingRecordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_signature_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imported_financial_evidence_invoiceId_key" ON "imported_financial_evidence"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_financial_evidence_paymentId_key" ON "imported_financial_evidence"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_financial_evidence_refundId_key" ON "imported_financial_evidence"("refundId");

-- CreateIndex
CREATE INDEX "imported_financial_evidence_workspaceId_payerMemberId_idx" ON "imported_financial_evidence"("workspaceId", "payerMemberId");

-- CreateIndex
CREATE INDEX "imported_financial_evidence_workspaceId_beneficiaryMemberId_idx" ON "imported_financial_evidence"("workspaceId", "beneficiaryMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_financial_evidence_workspaceId_sourceSystem_source_key" ON "imported_financial_evidence"("workspaceId", "sourceSystem", "sourceRecordKind", "sourceExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_booking_funding_bookingId_key" ON "imported_booking_funding"("bookingId");

-- CreateIndex
CREATE INDEX "imported_booking_funding_workspaceId_evidenceId_idx" ON "imported_booking_funding"("workspaceId", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_booking_funding_workspaceId_sourceAllocationRefere_key" ON "imported_booking_funding"("workspaceId", "sourceAllocationReference");

-- CreateIndex
CREATE UNIQUE INDEX "imported_signature_evidence_signedDocumentId_key" ON "imported_signature_evidence"("signedDocumentId");

-- CreateIndex
CREATE INDEX "imported_signature_evidence_workspaceId_memberId_idx" ON "imported_signature_evidence"("workspaceId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "imported_signature_evidence_workspaceId_sourceSystem_source_key" ON "imported_signature_evidence"("workspaceId", "sourceSystem", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_parentEvidenceId_fkey" FOREIGN KEY ("parentEvidenceId") REFERENCES "imported_financial_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_payerMemberId_fkey" FOREIGN KEY ("payerMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_beneficiaryMemberId_fkey" FOREIGN KEY ("beneficiaryMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_financial_evidence_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_booking_funding" ADD CONSTRAINT "imported_booking_funding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_booking_funding" ADD CONSTRAINT "imported_booking_funding_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "class_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_booking_funding" ADD CONSTRAINT "imported_booking_funding_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "imported_financial_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_signature_evidence" ADD CONSTRAINT "imported_signature_evidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_signature_evidence" ADD CONSTRAINT "imported_signature_evidence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_signature_evidence" ADD CONSTRAINT "imported_signature_evidence_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_signature_evidence" ADD CONSTRAINT "imported_signature_evidence_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_signature_evidence" ADD CONSTRAINT "imported_signature_evidence_signedDocumentId_fkey" FOREIGN KEY ("signedDocumentId") REFERENCES "signed_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_money_values_check" CHECK ("amountCents" >= 0 AND "taxCents" >= 0 AND "paidCents" >= 0 AND "refundedCents" >= 0 AND "paidCents" <= "amountCents" AND "refundedCents" <= "paidCents" AND "currency" ~ '^[a-z]{3}$');
ALTER TABLE "imported_financial_evidence" ADD CONSTRAINT "imported_money_owner_check" CHECK ("billingOwner" IN ('SOURCE','DESTINATION','UNRESOLVED') AND "refundOwner" IN ('SOURCE','DESTINATION','UNRESOLVED'));
ALTER TABLE "imported_booking_funding" ADD CONSTRAINT "imported_booking_amount_check" CHECK ("amountCents" > 0 AND "currency" ~ '^[a-z]{3}$');
