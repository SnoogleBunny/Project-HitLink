-- CreateEnum
CREATE TYPE "FormType" AS ENUM (
    'WAIVER',
    'MEMBERSHIP_AGREEMENT',
    'CHILD_GUARDIAN_WAIVER',
    'CUSTOM'
);

-- CreateEnum
CREATE TYPE "RequirementTarget" AS ENUM (
    'TRIAL',
    'MEMBER',
    'GUARDIAN',
    'MEMBERSHIP_ACTIVATION'
);

-- CreateEnum
CREATE TYPE "FormSignerKind" AS ENUM (
    'MEMBER',
    'GUARDIAN'
);

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM (
    'OPEN',
    'COMPLETED',
    'EXPIRED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "SignatureAccessMethod" AS ENUM (
    'PORTAL',
    'MAGIC_LINK'
);

-- AlterTable
ALTER TABLE "members" DROP COLUMN "formStatus";

-- DropEnum
DROP TYPE "MemberFormStatus";

-- CreateTable
CREATE TABLE "form_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "description" TEXT,
    "currentVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "formDocumentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedByWorkspaceUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "required_form_assignments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "formDocumentId" TEXT NOT NULL,
    "requirementTarget" "RequirementTarget" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "required_form_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT,
    "signerKind" "FormSignerKind" NOT NULL,
    "accessMethod" "SignatureAccessMethod" NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'OPEN',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByWorkspaceUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "guardianId" TEXT,
    "signerKind" "FormSignerKind" NOT NULL,
    "signedFromRequestId" TEXT,
    "signerNameSnapshot" TEXT NOT NULL,
    "signerEmailSnapshot" TEXT,
    "signatureMethod" TEXT NOT NULL,
    "providerReference" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_documents_currentVersionId_key" ON "form_documents"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "form_documents_workspaceId_name_key" ON "form_documents"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "form_documents_workspaceId_archivedAt_idx" ON "form_documents"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_formDocumentId_versionNumber_key" ON "form_versions"("formDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "form_versions_workspaceId_formDocumentId_createdAt_idx" ON "form_versions"("workspaceId", "formDocumentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "required_form_assignments_workspace_document_target_key" ON "required_form_assignments"("workspaceId", "formDocumentId", "requirementTarget");

-- CreateIndex
CREATE INDEX "required_form_assignments_workspaceId_requirementTarget_isActive_idx" ON "required_form_assignments"("workspaceId", "requirementTarget", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_tokenHash_key" ON "signature_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "signature_requests_workspaceId_memberId_signerKind_status_idx" ON "signature_requests"("workspaceId", "memberId", "signerKind", "status");

-- CreateIndex
CREATE INDEX "signature_requests_workspaceId_guardianId_signerKind_status_idx" ON "signature_requests"("workspaceId", "guardianId", "signerKind", "status");

-- CreateIndex
CREATE INDEX "signature_requests_workspaceId_formVersionId_status_idx" ON "signature_requests"("workspaceId", "formVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signed_documents_signedFromRequestId_key" ON "signed_documents"("signedFromRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "signed_documents_workspace_version_member_signer_key" ON "signed_documents"("workspaceId", "formVersionId", "memberId", "signerKind");

-- CreateIndex
CREATE INDEX "signed_documents_workspaceId_memberId_signedAt_idx" ON "signed_documents"("workspaceId", "memberId", "signedAt");

-- CreateIndex
CREATE INDEX "signed_documents_workspaceId_guardianId_signedAt_idx" ON "signed_documents"("workspaceId", "guardianId", "signedAt");

-- AddForeignKey
ALTER TABLE "form_documents" ADD CONSTRAINT "form_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_formDocumentId_fkey" FOREIGN KEY ("formDocumentId") REFERENCES "form_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_uploadedByWorkspaceUserId_fkey" FOREIGN KEY ("uploadedByWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_documents" ADD CONSTRAINT "form_documents_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_form_assignments" ADD CONSTRAINT "required_form_assignments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_form_assignments" ADD CONSTRAINT "required_form_assignments_formDocumentId_fkey" FOREIGN KEY ("formDocumentId") REFERENCES "form_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_createdByWorkspaceUserId_fkey" FOREIGN KEY ("createdByWorkspaceUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_signedFromRequestId_fkey" FOREIGN KEY ("signedFromRequestId") REFERENCES "signature_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
