-- CreateEnum
CREATE TYPE "MemberMembershipStatus" AS ENUM (
    'ACTIVE',
    'PENDING_PAYMENT_METHOD',
    'PAST_DUE',
    'FROZEN',
    'CANCELLED',
    'ENDED'
);

-- CreateEnum
CREATE TYPE "StripeConnectionStatus" AS ENUM (
    'NOT_CONNECTED',
    'PENDING',
    'ACTIVE',
    'RESTRICTED',
    'DISCONNECTED'
);

-- CreateEnum
CREATE TYPE "BillingStateStatus" AS ENUM (
    'NOT_READY',
    'ACTIVE',
    'PENDING_PAYMENT_METHOD',
    'PAST_DUE',
    'PAYMENT_FAILED',
    'ACTION_REQUIRED',
    'FROZEN',
    'CANCELLED',
    'ENDED'
);

-- CreateEnum
CREATE TYPE "BillingRecordType" AS ENUM (
    'MEMBERSHIP_ASSIGNED',
    'MEMBERSHIP_CANCELLED',
    'MEMBERSHIP_FROZEN',
    'MEMBERSHIP_UNFROZEN',
    'SUBSCRIPTION_CREATED',
    'SUBSCRIPTION_UPDATED',
    'PAYMENT_SUCCEEDED',
    'PAYMENT_FAILED',
    'PAYMENT_ACTION_REQUIRED',
    'PAYMENT_UPDATE_REQUESTED',
    'RETRY_REQUESTED',
    'STRIPE_ACCOUNT_UPDATED',
    'STRIPE_ACCOUNT_DISCONNECTED'
);

-- CreateEnum
CREATE TYPE "BillingRecordStatus" AS ENUM (
    'INFO',
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'ACTION_REQUIRED'
);

-- CreateEnum
CREATE TYPE "StripeWebhookProcessingStatus" AS ENUM (
    'PROCESSING',
    'PROCESSED',
    'ERROR'
);

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "cancellationPolicyReference" TEXT,
    "freezePolicyReference" TEXT,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plan_program_restrictions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plan_program_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_memberships" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "status" "MemberMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelRequestedAt" TIMESTAMP(3),
    "frozenFrom" DATE,
    "frozenUntil" DATE,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentMembershipSlot" TEXT DEFAULT 'CURRENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_stripe_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeAccountId" TEXT,
    "connectionStatus" "StripeConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "failedPaymentGracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_stripe_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_billing_states" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberMembershipId" TEXT NOT NULL,
    "status" "BillingStateStatus" NOT NULL DEFAULT 'NOT_READY',
    "nextBillingDate" TIMESTAMP(3),
    "latestInvoiceId" TEXT,
    "latestPaymentIntentId" TEXT,
    "latestSubscriptionId" TEXT,
    "lastPaymentStatus" "BillingRecordStatus",
    "lastPaymentAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "failedAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "paymentUpdateRequestedAt" TIMESTAMP(3),
    "retryRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_billing_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberMembershipId" TEXT,
    "type" "BillingRecordType" NOT NULL,
    "status" "BillingRecordStatus" NOT NULL DEFAULT 'INFO',
    "amountCents" INTEGER,
    "currency" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeEventId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeSubscriptionId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "stripeAccountId" TEXT,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "status" "StripeWebhookProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_workspaceId_name_key" ON "membership_plans"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "membership_plans_workspaceId_archivedAt_idx" ON "membership_plans"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plan_program_restrictions_plan_program_key" ON "membership_plan_program_restrictions"("membershipPlanId", "programId");

-- CreateIndex
CREATE INDEX "membership_plan_program_restrictions_workspaceId_membershipPlanId_idx" ON "membership_plan_program_restrictions"("workspaceId", "membershipPlanId");

-- CreateIndex
CREATE INDEX "membership_plan_program_restrictions_workspaceId_programId_idx" ON "membership_plan_program_restrictions"("workspaceId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "member_memberships_one_current_key" ON "member_memberships"("workspaceId", "memberId", "currentMembershipSlot");

-- CreateIndex
CREATE INDEX "member_memberships_workspaceId_status_idx" ON "member_memberships"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "member_memberships_workspaceId_memberId_idx" ON "member_memberships"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "member_memberships_workspaceId_stripeCustomerId_idx" ON "member_memberships"("workspaceId", "stripeCustomerId");

-- CreateIndex
CREATE INDEX "member_memberships_workspaceId_stripeSubscriptionId_idx" ON "member_memberships"("workspaceId", "stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_stripe_settings_workspaceId_key" ON "workspace_stripe_settings"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_stripe_settings_stripeAccountId_idx" ON "workspace_stripe_settings"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_billing_states_memberMembershipId_key" ON "membership_billing_states"("memberMembershipId");

-- CreateIndex
CREATE INDEX "membership_billing_states_workspaceId_status_idx" ON "membership_billing_states"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "membership_billing_states_workspaceId_memberId_idx" ON "membership_billing_states"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "membership_billing_states_workspaceId_latestInvoiceId_idx" ON "membership_billing_states"("workspaceId", "latestInvoiceId");

-- CreateIndex
CREATE INDEX "membership_billing_states_workspaceId_latestSubscriptionId_idx" ON "membership_billing_states"("workspaceId", "latestSubscriptionId");

-- CreateIndex
CREATE INDEX "billing_records_workspaceId_occurredAt_idx" ON "billing_records"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "billing_records_workspaceId_memberId_idx" ON "billing_records"("workspaceId", "memberId");

-- CreateIndex
CREATE INDEX "billing_records_workspaceId_memberMembershipId_idx" ON "billing_records"("workspaceId", "memberMembershipId");

-- CreateIndex
CREATE INDEX "billing_records_workspaceId_stripeInvoiceId_idx" ON "billing_records"("workspaceId", "stripeInvoiceId");

-- CreateIndex
CREATE INDEX "billing_records_workspaceId_stripeSubscriptionId_idx" ON "billing_records"("workspaceId", "stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_status_receivedAt_idx" ON "stripe_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_stripeAccountId_idx" ON "stripe_webhook_events"("stripeAccountId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_workspaceId_idx" ON "stripe_webhook_events"("workspaceId");

-- AddForeignKey
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_plan_program_restrictions" ADD CONSTRAINT "membership_plan_program_restrictions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_plan_program_restrictions" ADD CONSTRAINT "membership_plan_program_restrictions_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "membership_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_plan_program_restrictions" ADD CONSTRAINT "membership_plan_program_restrictions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_stripe_settings" ADD CONSTRAINT "workspace_stripe_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_billing_states" ADD CONSTRAINT "membership_billing_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_billing_states" ADD CONSTRAINT "membership_billing_states_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_billing_states" ADD CONSTRAINT "membership_billing_states_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_memberMembershipId_fkey" FOREIGN KEY ("memberMembershipId") REFERENCES "member_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
