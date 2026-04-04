CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE "users"
ALTER COLUMN "email" TYPE CITEXT;

ALTER TABLE "staff_invites"
ALTER COLUMN "email" TYPE CITEXT;

ALTER TABLE "staff_invites"
ADD CONSTRAINT "staff_invites_status_timestamps_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL
  )
  OR (
    "status" = 'ACCEPTED'
    AND "acceptedAt" IS NOT NULL
    AND "revokedAt" IS NULL
  )
  OR (
    "status" = 'EXPIRED'
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL
  )
  OR (
    "status" = 'REVOKED'
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NOT NULL
  )
);
