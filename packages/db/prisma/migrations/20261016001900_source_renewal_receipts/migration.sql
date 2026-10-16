-- AlterTable
ALTER TABLE "source_billing_evidence" ADD COLUMN     "sourceReceiptData" BYTEA,
ADD COLUMN     "sourceReceiptHash" TEXT;
