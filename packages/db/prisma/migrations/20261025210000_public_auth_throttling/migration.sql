CREATE TABLE "public_auth_throttle_buckets" (
  "keyHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_auth_throttle_buckets_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "public_auth_throttle_buckets_hash_check" CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "public_auth_throttle_buckets_attempts_check" CHECK ("attempts" BETWEEN 1 AND 10000),
  CONSTRAINT "public_auth_throttle_buckets_expiry_check" CHECK ("expiresAt" >= "windowEndsAt")
);
CREATE INDEX "public_auth_throttle_buckets_expiresAt_idx" ON "public_auth_throttle_buckets"("expiresAt");
