-- CreateEnum
CREATE TYPE "FinancialOperationKind" AS ENUM ('CHECKOUT', 'RETRY_INVOICE', 'REFUND', 'ISSUE_CREDIT', 'APPLY_CREDIT', 'STOP_RENEWALS', 'RESTORE_RENEWALS', 'FREEZE', 'RESUME');

-- CreateEnum
CREATE TYPE "FinancialOperationStatus" AS ENUM ('RESERVED', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "PublicEnrollmentStatus" AS ENUM ('VERIFYING', 'VERIFIED', 'FORMS_REQUIRED', 'PAYMENT_PENDING', 'COMPLETE', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "account_credits" ADD COLUMN     "payerAccountId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "payerAccountId" TEXT;

-- AlterTable
ALTER TABLE "member_memberships" ADD COLUMN     "payerAccountId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payerAccountId" TEXT;

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "stripeAccountId" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_operations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" "FinancialOperationKind" NOT NULL,
    "status" "FinancialOperationStatus" NOT NULL DEFAULT 'RESERVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actorUserId" TEXT,
    "payerAccountId" TEXT,
    "beneficiaryMemberId" TEXT,
    "targetId" TEXT,
    "paymentId" TEXT,
    "invoiceId" TEXT,
    "refundId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "units" INTEGER,
    "providerAccountId" TEXT,
    "providerReference" TEXT,
    "providerIdempotencyKey" TEXT NOT NULL,
    "providerUrl" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_operation_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "FinancialOperationStatus" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_review_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "memberId" TEXT,
    "payerAccountId" TEXT,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolution" TEXT,
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_review_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_websites" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "published" JSONB,
    "publishedVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_publications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_enrollments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "PublicEnrollmentStatus" NOT NULL DEFAULT 'VERIFYING',
    "accessTokenHash" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "verificationCodeHash" TEXT NOT NULL,
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "participant" JSONB NOT NULL,
    "acceptedTerms" JSONB,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "memberId" TEXT,
    "operationId" TEXT,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_accounts_workspaceId_stripeCustomerId_idx" ON "financial_accounts"("workspaceId", "stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_workspaceId_userId_key" ON "financial_accounts"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_workspaceId_memberId_key" ON "financial_accounts"("workspaceId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_providerIdempotencyKey_key" ON "financial_operations"("providerIdempotencyKey");

-- CreateIndex
CREATE INDEX "financial_operations_workspaceId_status_createdAt_idx" ON "financial_operations"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "financial_operations_workspaceId_payerAccountId_createdAt_idx" ON "financial_operations"("workspaceId", "payerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_operations_workspaceId_providerReference_idx" ON "financial_operations"("workspaceId", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_workspaceId_operationKey_key" ON "financial_operations"("workspaceId", "operationKey");

-- CreateIndex
CREATE INDEX "financial_operation_events_workspaceId_createdAt_idx" ON "financial_operation_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operation_events_operationId_version_key" ON "financial_operation_events"("operationId", "version");

-- CreateIndex
CREATE INDEX "financial_review_cases_workspaceId_resolvedAt_createdAt_idx" ON "financial_review_cases"("workspaceId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_review_cases_workspaceId_sourceKey_key" ON "financial_review_cases"("workspaceId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_websites_workspaceId_key" ON "workspace_websites"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_websites_slug_key" ON "workspace_websites"("slug");

-- CreateIndex
CREATE INDEX "website_publications_workspaceId_createdAt_idx" ON "website_publications"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "website_publications_websiteId_version_key" ON "website_publications"("websiteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "public_enrollments_accessTokenHash_key" ON "public_enrollments"("accessTokenHash");

-- CreateIndex
CREATE INDEX "public_enrollments_workspaceId_email_createdAt_idx" ON "public_enrollments"("workspaceId", "email", "createdAt");

-- CreateIndex
CREATE INDEX "public_enrollments_workspaceId_status_createdAt_idx" ON "public_enrollments"("workspaceId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_beneficiaryMemberId_fkey" FOREIGN KEY ("beneficiaryMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operation_events" ADD CONSTRAINT "financial_operation_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operation_events" ADD CONSTRAINT "financial_operation_events_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "financial_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "class_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_review_cases" ADD CONSTRAINT "financial_review_cases_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_websites" ADD CONSTRAINT "workspace_websites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_publications" ADD CONSTRAINT "website_publications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_publications" ADD CONSTRAINT "website_publications_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "workspace_websites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_enrollments" ADD CONSTRAINT "public_enrollments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_enrollments" ADD CONSTRAINT "public_enrollments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
