-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdentityKind" AS ENUM ('WORKFORCE', 'PATIENT', 'REPRESENTATIVE');

-- CreateTable
CREATE TABLE "Organization" (
    "tenantId" UUID NOT NULL,
    "externalRef" TEXT NOT NULL,
    "activationRef" TEXT,
    "profileRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "Site" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "locationRef" TEXT NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "Identity" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "kind" "IdentityKind" NOT NULL,
    "subjectRef" TEXT NOT NULL,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "identityId" UUID,
    "policyId" UUID,
    "lifecycleId" UUID,
    "recordRef" TEXT NOT NULL,
    "classificationRef" TEXT,
    "profileRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByRef" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "invitationRef" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "RepresentativeAuthority" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "representativeId" UUID NOT NULL,
    "authorityRef" TEXT NOT NULL,

    CONSTRAINT "RepresentativeAuthority_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "policyRef" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "LifecycleReference" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "lifecycleRef" TEXT NOT NULL,

    CONSTRAINT "LifecycleReference_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "intentRef" TEXT NOT NULL,
    "outcomeRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "OutboxItem" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "intentRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxItem_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "operationId" UUID,
    "eventRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "DisclosureRecord" (
    "tenantId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "disclosureRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisclosureRecord_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_tenantId_kind_subjectRef_key" ON "Identity"("tenantId", "kind", "subjectRef");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_recordRef_key" ON "Patient"("tenantId", "recordRef");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_tenantId_identityId_role_key" ON "RoleAssignment"("tenantId", "identityId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_tenantId_policyRef_version_key" ON "PolicyVersion"("tenantId", "policyRef", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_tenantId_idempotencyKey_key" ON "Operation"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_identityId_fkey" FOREIGN KEY ("tenantId", "identityId") REFERENCES "Identity"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_policyId_fkey" FOREIGN KEY ("tenantId", "policyId") REFERENCES "PolicyVersion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_lifecycleId_fkey" FOREIGN KEY ("tenantId", "lifecycleId") REFERENCES "LifecycleReference"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_tenantId_identityId_fkey" FOREIGN KEY ("tenantId", "identityId") REFERENCES "Identity"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RepresentativeAuthority" ADD CONSTRAINT "RepresentativeAuthority_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RepresentativeAuthority" ADD CONSTRAINT "RepresentativeAuthority_tenantId_patientId_fkey" FOREIGN KEY ("tenantId", "patientId") REFERENCES "Patient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RepresentativeAuthority" ADD CONSTRAINT "RepresentativeAuthority_tenantId_representativeId_fkey" FOREIGN KEY ("tenantId", "representativeId") REFERENCES "Identity"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LifecycleReference" ADD CONSTRAINT "LifecycleReference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "Operation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "Operation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DisclosureRecord" ADD CONSTRAINT "DisclosureRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organization"("tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DisclosureRecord" ADD CONSTRAINT "DisclosureRecord_tenantId_patientId_fkey" FOREIGN KEY ("tenantId", "patientId") REFERENCES "Patient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
