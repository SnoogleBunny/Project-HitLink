-- CreateEnum
CREATE TYPE "ClassInstanceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingSource" AS ENUM ('CURRENT', 'IMPORTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AccountCreditStatus" AS ENUM ('ACTIVE', 'APPLIED', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "CreditRuleScope" AS ENUM ('ANY', 'MEMBERSHIP', 'DROP_IN', 'PUNCH_CARD', 'EVENT', 'PRIVATE_LESSON');

-- CreateEnum
CREATE TYPE "FailedPaymentCaseStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('CSV', 'ZEN_PLANNER');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('DRAFT', 'MAPPED', 'VALIDATED', 'DRY_RUN_COMPLETE', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRecordKind" AS ENUM ('MEMBER', 'GUARDIAN', 'FAMILY_LINK', 'MEMBERSHIP_PLAN', 'MEMBER_MEMBERSHIP', 'BILLING_HISTORY', 'PUNCH_CARD_BALANCE', 'NOTE', 'STAFF', 'PROGRESS', 'ATTENDANCE', 'SCHEDULE_TEMPLATE');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ProgressModuleStatus" AS ENUM ('DISABLED', 'ENABLED');

-- CreateEnum
CREATE TYPE "ConversationThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationParticipantKind" AS ENUM ('STAFF', 'MEMBER', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "MessageSenderKind" AS ENUM ('STAFF', 'MEMBER', 'GUARDIAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELETED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailTemplateKind" AS ENUM ('TRIAL_CONFIRMATION', 'BOOKING_CONFIRMATION', 'CLASS_REMINDER', 'FAILED_PAYMENT', 'ANNOUNCEMENT', 'PAYMENT_METHOD_UPDATE_REQUEST');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EventBookingStatus" AS ENUM ('PENDING_PAYMENT', 'BOOKED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PrivateLessonSlotStatus" AS ENUM ('OPEN', 'BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrivateLessonBookingStatus" AS ENUM ('PENDING_PAYMENT', 'BOOKED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "class_bookings" ADD COLUMN     "classInstanceId" TEXT;

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "classInstanceId" TEXT;

-- AlterTable
ALTER TABLE "waitlist_entries" ADD COLUMN     "classInstanceId" TEXT;

-- CreateTable
CREATE TABLE "class_instances" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classTemplateId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "scheduledForDate" DATE NOT NULL,
    "title" TEXT,
    "startTimeMinutes" INTEGER NOT NULL,
    "endTimeMinutes" INTEGER NOT NULL,
    "capacityOverride" INTEGER,
    "bookingCutoffMinutes" INTEGER NOT NULL,
    "cancellationCutoffMinutes" INTEGER NOT NULL,
    "status" "ClassInstanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancellationReason" TEXT,
    "rescheduledFromDate" DATE,
    "source" "BillingSource" NOT NULL DEFAULT 'CURRENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberMembershipId" TEXT,
    "source" "BillingSource" NOT NULL DEFAULT 'CURRENT',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "invoiceNumber" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "amountDueCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "importedExternalId" TEXT,
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "importedExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberMembershipId" TEXT,
    "invoiceId" TEXT,
    "paymentMethodReferenceId" TEXT,
    "source" "BillingSource" NOT NULL DEFAULT 'CURRENT',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "importedExternalId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "paymentId" TEXT,
    "source" "BillingSource" NOT NULL DEFAULT 'CURRENT',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "reason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "importedExternalId" TEXT,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_credits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "AccountCreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "originalAmountCents" INTEGER NOT NULL,
    "remainingAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "importedExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "CreditRuleScope" NOT NULL DEFAULT 'ANY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method_references" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_method_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_payment_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberMembershipId" TEXT,
    "latestPaymentId" TEXT,
    "status" "FailedPaymentCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failed_payment_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL DEFAULT 'CSV',
    "status" "ImportJobStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_source_files" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "storageKey" TEXT,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_field_mappings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "recordKind" "ImportRecordKind" NOT NULL,
    "sourceField" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transformRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "importSourceFileId" TEXT,
    "recordKind" "ImportRecordKind" NOT NULL,
    "sourceRowNumber" INTEGER,
    "externalId" TEXT,
    "rawData" JSONB NOT NULL,
    "mappedData" JSONB,
    "isReadyForImport" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3),
    "importedModel" TEXT,
    "importedRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_issues" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "stagingRecordId" TEXT,
    "severity" "ValidationSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fieldName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_reports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_module_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "ProgressModuleStatus" NOT NULL DEFAULT 'DISABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "belt_definitions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rankOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "belt_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_progress_states" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "currentBeltDefinitionId" TEXT,
    "currentStripeCount" INTEGER NOT NULL DEFAULT 0,
    "lastPromotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_progress_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "beltDefinitionId" TEXT,
    "stripeCount" INTEGER NOT NULL DEFAULT 0,
    "promotedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "source" "BillingSource" NOT NULL DEFAULT 'CURRENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_threads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subject" TEXT,
    "status" "ConversationThreadStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "kind" "ConversationParticipantKind" NOT NULL,
    "workspaceUserId" TEXT,
    "memberId" TEXT,
    "guardianId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "senderKind" "MessageSenderKind" NOT NULL,
    "senderWorkspaceUserId" TEXT,
    "senderMemberId" TEXT,
    "senderGuardianId" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByWorkspaceUserId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "announcementId" TEXT,
    "templateKind" "EmailTemplateKind" NOT NULL,
    "recipientEmail" CITEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "EmailTemplateKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_bookings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "EventBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "priceCents" INTEGER,
    "currency" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_lesson_slots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "coachWorkspaceUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PrivateLessonSlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_lesson_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_lesson_bookings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "privateLessonSlotId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "PrivateLessonBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "priceCents" INTEGER,
    "currency" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_lesson_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_instances_workspaceId_scheduledForDate_status_idx" ON "class_instances"("workspaceId", "scheduledForDate", "status");

-- CreateIndex
CREATE INDEX "class_instances_workspaceId_coachWorkspaceUserId_scheduledF_idx" ON "class_instances"("workspaceId", "coachWorkspaceUserId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "class_instances_workspaceId_programId_idx" ON "class_instances"("workspaceId", "programId");

-- CreateIndex
CREATE INDEX "class_instances_workspaceId_roomId_idx" ON "class_instances"("workspaceId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "class_instances_template_date_key" ON "class_instances"("workspaceId", "classTemplateId", "scheduledForDate");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_memberId_issuedAt_idx" ON "invoices"("workspaceId", "memberId", "issuedAt");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_status_issuedAt_idx" ON "invoices"("workspaceId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_stripeInvoiceId_idx" ON "invoices"("workspaceId", "stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_workspace_imported_external_key" ON "invoices"("workspaceId", "importedExternalId");

-- CreateIndex
CREATE INDEX "invoice_line_items_workspaceId_invoiceId_idx" ON "invoice_line_items"("workspaceId", "invoiceId");

-- CreateIndex
CREATE INDEX "payments_workspaceId_memberId_paidAt_idx" ON "payments"("workspaceId", "memberId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_workspaceId_status_paidAt_idx" ON "payments"("workspaceId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "payments_workspaceId_stripePaymentIntentId_idx" ON "payments"("workspaceId", "stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_workspace_imported_external_key" ON "payments"("workspaceId", "importedExternalId");

-- CreateIndex
CREATE INDEX "refunds_workspaceId_memberId_refundedAt_idx" ON "refunds"("workspaceId", "memberId", "refundedAt");

-- CreateIndex
CREATE INDEX "refunds_workspaceId_status_refundedAt_idx" ON "refunds"("workspaceId", "status", "refundedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_workspace_imported_external_key" ON "refunds"("workspaceId", "importedExternalId");

-- CreateIndex
CREATE INDEX "account_credits_workspaceId_memberId_status_idx" ON "account_credits"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "account_credits_workspace_imported_external_key" ON "account_credits"("workspaceId", "importedExternalId");

-- CreateIndex
CREATE INDEX "credit_rules_workspaceId_isActive_idx" ON "credit_rules"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "credit_rules_workspaceId_name_key" ON "credit_rules"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "billing_policies_workspaceId_policyType_isActive_idx" ON "billing_policies"("workspaceId", "policyType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "billing_policies_workspaceId_policyType_name_key" ON "billing_policies"("workspaceId", "policyType", "name");

-- CreateIndex
CREATE INDEX "payment_method_references_workspaceId_memberId_isDefault_idx" ON "payment_method_references"("workspaceId", "memberId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_references_workspaceId_providerPaymentMethod_key" ON "payment_method_references"("workspaceId", "providerPaymentMethodId");

-- CreateIndex
CREATE INDEX "failed_payment_cases_workspaceId_status_openedAt_idx" ON "failed_payment_cases"("workspaceId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "failed_payment_cases_workspaceId_memberId_status_idx" ON "failed_payment_cases"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE INDEX "import_jobs_workspaceId_status_createdAt_idx" ON "import_jobs"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "import_source_files_workspaceId_importJobId_idx" ON "import_source_files"("workspaceId", "importJobId");

-- CreateIndex
CREATE INDEX "import_field_mappings_workspaceId_importJobId_idx" ON "import_field_mappings"("workspaceId", "importJobId");

-- CreateIndex
CREATE UNIQUE INDEX "import_field_mappings_job_kind_source_key" ON "import_field_mappings"("importJobId", "recordKind", "sourceField");

-- CreateIndex
CREATE INDEX "staging_records_workspaceId_importJobId_recordKind_idx" ON "staging_records"("workspaceId", "importJobId", "recordKind");

-- CreateIndex
CREATE INDEX "staging_records_workspaceId_importedModel_importedRecordId_idx" ON "staging_records"("workspaceId", "importedModel", "importedRecordId");

-- CreateIndex
CREATE INDEX "validation_issues_workspaceId_importJobId_severity_idx" ON "validation_issues"("workspaceId", "importJobId", "severity");

-- CreateIndex
CREATE INDEX "validation_issues_workspaceId_stagingRecordId_idx" ON "validation_issues"("workspaceId", "stagingRecordId");

-- CreateIndex
CREATE INDEX "reconciliation_reports_workspaceId_importJobId_generatedAt_idx" ON "reconciliation_reports"("workspaceId", "importJobId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "progress_module_settings_workspaceId_key" ON "progress_module_settings"("workspaceId");

-- CreateIndex
CREATE INDEX "belt_definitions_workspaceId_isActive_rankOrder_idx" ON "belt_definitions"("workspaceId", "isActive", "rankOrder");

-- CreateIndex
CREATE UNIQUE INDEX "belt_definitions_workspaceId_name_key" ON "belt_definitions"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "belt_definitions_workspaceId_rankOrder_key" ON "belt_definitions"("workspaceId", "rankOrder");

-- CreateIndex
CREATE UNIQUE INDEX "member_progress_states_memberId_key" ON "member_progress_states"("memberId");

-- CreateIndex
CREATE INDEX "member_progress_states_workspaceId_currentBeltDefinitionId_idx" ON "member_progress_states"("workspaceId", "currentBeltDefinitionId");

-- CreateIndex
CREATE INDEX "promotion_records_workspaceId_memberId_promotedAt_idx" ON "promotion_records"("workspaceId", "memberId", "promotedAt");

-- CreateIndex
CREATE INDEX "conversation_threads_workspaceId_status_updatedAt_idx" ON "conversation_threads"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "conversation_participants_workspaceId_conversationThreadId_idx" ON "conversation_participants"("workspaceId", "conversationThreadId");

-- CreateIndex
CREATE INDEX "conversation_participants_workspaceId_memberId_idx" ON "conversation_participants"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "conversation_participants_workspaceId_guardianId_idx" ON "conversation_participants"("workspaceId", "guardianId");

-- CreateIndex
CREATE INDEX "messages_workspaceId_conversationThreadId_sentAt_idx" ON "messages"("workspaceId", "conversationThreadId", "sentAt");

-- CreateIndex
CREATE INDEX "messages_workspaceId_senderMemberId_idx" ON "messages"("workspaceId", "senderMemberId");

-- CreateIndex
CREATE INDEX "announcements_workspaceId_status_createdAt_idx" ON "announcements"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_jobs_workspaceId_status_nextAttemptAt_idx" ON "notification_jobs"("workspaceId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_jobs_workspaceId_recipientEmail_createdAt_idx" ON "notification_jobs"("workspaceId", "recipientEmail", "createdAt");

-- CreateIndex
CREATE INDEX "email_templates_workspaceId_isActive_idx" ON "email_templates"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_workspaceId_kind_key" ON "email_templates"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "events_workspaceId_status_startsAt_idx" ON "events"("workspaceId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "events_workspaceId_coachWorkspaceUserId_startsAt_idx" ON "events"("workspaceId", "coachWorkspaceUserId", "startsAt");

-- CreateIndex
CREATE INDEX "event_bookings_workspaceId_memberId_status_idx" ON "event_bookings"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_bookings_event_member_key" ON "event_bookings"("workspaceId", "eventId", "memberId");

-- CreateIndex
CREATE INDEX "private_lesson_slots_workspaceId_status_startsAt_idx" ON "private_lesson_slots"("workspaceId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "private_lesson_slots_workspaceId_coachWorkspaceUserId_start_idx" ON "private_lesson_slots"("workspaceId", "coachWorkspaceUserId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "private_lesson_bookings_privateLessonSlotId_key" ON "private_lesson_bookings"("privateLessonSlotId");

-- CreateIndex
CREATE INDEX "private_lesson_bookings_workspaceId_memberId_status_idx" ON "private_lesson_bookings"("workspaceId", "memberId", "status");

-- CreateIndex
CREATE INDEX "class_bookings_workspaceId_classInstanceId_idx" ON "class_bookings"("workspaceId", "classInstanceId");

-- CreateIndex
CREATE INDEX "attendance_records_workspaceId_classInstanceId_idx" ON "attendance_records"("workspaceId", "classInstanceId");

-- CreateIndex
CREATE INDEX "waitlist_entries_workspaceId_classInstanceId_status_joinedA_idx" ON "waitlist_entries"("workspaceId", "classInstanceId", "status", "joinedAt");

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_classInstanceId_fkey" FOREIGN KEY ("classInstanceId") REFERENCES "class_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classInstanceId_fkey" FOREIGN KEY ("classInstanceId") REFERENCES "class_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_classTemplateId_fkey" FOREIGN KEY ("classTemplateId") REFERENCES "class_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_classInstanceId_fkey" FOREIGN KEY ("classInstanceId") REFERENCES "class_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentMethodReferenceId_fkey" FOREIGN KEY ("paymentMethodReferenceId") REFERENCES "payment_method_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_rules" ADD CONSTRAINT "credit_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_references" ADD CONSTRAINT "payment_method_references_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_payment_cases" ADD CONSTRAINT "failed_payment_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_payment_cases" ADD CONSTRAINT "failed_payment_cases_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_payment_cases" ADD CONSTRAINT "failed_payment_cases_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_source_files" ADD CONSTRAINT "import_source_files_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_source_files" ADD CONSTRAINT "import_source_files_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_field_mappings" ADD CONSTRAINT "import_field_mappings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_field_mappings" ADD CONSTRAINT "import_field_mappings_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_records" ADD CONSTRAINT "staging_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_records" ADD CONSTRAINT "staging_records_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_records" ADD CONSTRAINT "staging_records_importSourceFileId_fkey" FOREIGN KEY ("importSourceFileId") REFERENCES "import_source_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_stagingRecordId_fkey" FOREIGN KEY ("stagingRecordId") REFERENCES "staging_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_reports" ADD CONSTRAINT "reconciliation_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_reports" ADD CONSTRAINT "reconciliation_reports_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_module_settings" ADD CONSTRAINT "progress_module_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "belt_definitions" ADD CONSTRAINT "belt_definitions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress_states" ADD CONSTRAINT "member_progress_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress_states" ADD CONSTRAINT "member_progress_states_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress_states" ADD CONSTRAINT "member_progress_states_currentBeltDefinitionId_fkey" FOREIGN KEY ("currentBeltDefinitionId") REFERENCES "belt_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_records" ADD CONSTRAINT "promotion_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_records" ADD CONSTRAINT "promotion_records_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_records" ADD CONSTRAINT "promotion_records_beltDefinitionId_fkey" FOREIGN KEY ("beltDefinitionId") REFERENCES "belt_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationThreadId_fkey" FOREIGN KEY ("conversationThreadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationThreadId_fkey" FOREIGN KEY ("conversationThreadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderMemberId_fkey" FOREIGN KEY ("senderMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderGuardianId_fkey" FOREIGN KEY ("senderGuardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_lesson_slots" ADD CONSTRAINT "private_lesson_slots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_lesson_slots" ADD CONSTRAINT "private_lesson_slots_coachWorkspaceUserId_fkey" FOREIGN KEY ("coachWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_lesson_bookings" ADD CONSTRAINT "private_lesson_bookings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_lesson_bookings" ADD CONSTRAINT "private_lesson_bookings_privateLessonSlotId_fkey" FOREIGN KEY ("privateLessonSlotId") REFERENCES "private_lesson_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_lesson_bookings" ADD CONSTRAINT "private_lesson_bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

