CREATE TABLE "password_reset_challenges" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "portal" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "password_reset_challenges_portal_check" CHECK ("portal" IN ('admin', 'member'))
);
CREATE UNIQUE INDEX "password_reset_challenges_tokenHash_key" ON "password_reset_challenges"("tokenHash");
CREATE INDEX "password_reset_challenges_userId_createdAt_idx" ON "password_reset_challenges"("userId", "createdAt");

CREATE TABLE "auth_recovery_deliveries" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_recovery_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_recovery_deliveries_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "password_reset_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_recovery_deliveries_status_check" CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),
  CONSTRAINT "auth_recovery_deliveries_attempts_check" CHECK ("attempts" >= 0 AND "leaseVersion" >= 0)
);
CREATE UNIQUE INDEX "auth_recovery_deliveries_challengeId_key" ON "auth_recovery_deliveries"("challengeId");
CREATE INDEX "auth_recovery_deliveries_status_nextAttemptAt_idx" ON "auth_recovery_deliveries"("status", "nextAttemptAt");

CREATE TABLE "account_security_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "emailHash" TEXT,
  "kind" TEXT NOT NULL,
  "portal" TEXT,
  "challengeId" TEXT,
  "revokedSessionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_security_events_count_check" CHECK ("revokedSessionCount" >= 0)
);
CREATE INDEX "account_security_events_emailHash_kind_createdAt_idx" ON "account_security_events"("emailHash", "kind", "createdAt");
CREATE INDEX "account_security_events_userId_createdAt_idx" ON "account_security_events"("userId", "createdAt");

CREATE FUNCTION "account_security_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Account security evidence is append-only';
END;
$$;
CREATE TRIGGER "account_security_events_immutable" BEFORE UPDATE OR DELETE ON "account_security_events"
FOR EACH ROW EXECUTE FUNCTION "account_security_events_append_only"();
