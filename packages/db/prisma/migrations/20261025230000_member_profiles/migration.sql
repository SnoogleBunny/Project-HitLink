-- AlterTable
ALTER TABLE "members" ADD COLUMN     "profileVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "member_portal_grants" ADD COLUMN     "canManageEmergencyContacts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "member_emergency_contacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationshipLabel" TEXT,
    "phone" TEXT NOT NULL,
    "email" CITEXT,
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_profile_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "emergencyContactId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorWorkspaceUserId" TEXT NOT NULL,
    "actorNameSnapshot" TEXT NOT NULL,
    "actorRoleSnapshot" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_profile_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_emergency_contacts_workspaceId_memberId_retiredAt_cr_idx" ON "member_emergency_contacts"("workspaceId", "memberId", "retiredAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "member_emergency_contacts_workspaceId_memberId_id_key" ON "member_emergency_contacts"("workspaceId", "memberId", "id");

-- CreateIndex
CREATE INDEX "member_profile_events_workspaceId_memberId_createdAt_id_idx" ON "member_profile_events"("workspaceId", "memberId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "member_profile_events_workspaceId_operationId_key" ON "member_profile_events"("workspaceId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "members_workspaceId_id_key" ON "members"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "member_emergency_contacts" ADD CONSTRAINT "member_emergency_contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_emergency_contacts" ADD CONSTRAINT "member_emergency_contacts_workspaceId_memberId_fkey" FOREIGN KEY ("workspaceId", "memberId") REFERENCES "members"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_events_workspaceId_memberId_fkey" FOREIGN KEY ("workspaceId", "memberId") REFERENCES "members"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_events_workspaceId_memberId_emergencyContac_fkey" FOREIGN KEY ("workspaceId", "memberId", "emergencyContactId") REFERENCES "member_emergency_contacts"("workspaceId", "memberId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contact projections and their attributable history share exact member/tenant ownership.
ALTER TABLE "members" ADD CONSTRAINT "member_profile_version_nonnegative" CHECK ("profileVersion" >= 0);
ALTER TABLE "member_emergency_contacts" ADD CONSTRAINT "emergency_contact_version_positive" CHECK ("version" >= 1);
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_event_version_positive" CHECK ("profileVersion" >= 1);
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_event_actor_role" CHECK ("actorRoleSnapshot" IN ('OWNER','COACH','CUSTOMER'));
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_event_input_hash" CHECK ("inputHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "member_profile_events" ADD CONSTRAINT "member_profile_event_target_kind" CHECK (
  ("kind" IN ('MEMBER_CREATED','MEMBER_PROFILE_UPDATED') AND "emergencyContactId" IS NULL)
  OR ("kind" IN ('EMERGENCY_CONTACT_ADDED','EMERGENCY_CONTACT_UPDATED','EMERGENCY_CONTACT_RETIRED') AND "emergencyContactId" IS NOT NULL)
);
CREATE FUNCTION "protect_member_profile_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('hitlink.reviewed_retention_workspace', true) = OLD."workspaceId"
    OR NOT EXISTS (SELECT 1 FROM "workspaces" WHERE id = OLD."workspaceId")
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Member profile history is immutable outside reviewed retention';
END;
$$;
CREATE TRIGGER "member_profile_history_immutable" BEFORE UPDATE OR DELETE ON "member_profile_events"
  FOR EACH ROW EXECUTE FUNCTION "protect_member_profile_history"();
