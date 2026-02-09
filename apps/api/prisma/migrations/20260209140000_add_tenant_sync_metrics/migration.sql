-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "lastSyncDurationMs" INTEGER,
ADD COLUMN "lastUnmappedRefsCount" INTEGER,
ADD COLUMN "lastSyncError" TEXT;
