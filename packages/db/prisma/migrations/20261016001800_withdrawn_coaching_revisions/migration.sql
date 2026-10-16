-- AlterTable
ALTER TABLE "coaching_daily_note_revisions" ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

UPDATE "coaching_daily_note_revisions" AS r SET "withdrawnAt" = n."withdrawnAt"
FROM "coaching_daily_notes" AS n WHERE n."id" = r."noteId" AND n."withdrawnAt" IS NOT NULL;
