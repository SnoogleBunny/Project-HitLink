CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ageGroupLabel" TEXT,
    "levelLabel" TEXT,
    "progressTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rooms"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "programs_workspaceId_name_key" ON "programs"("workspaceId", "name");

ALTER TABLE "programs"
ADD CONSTRAINT "programs_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
