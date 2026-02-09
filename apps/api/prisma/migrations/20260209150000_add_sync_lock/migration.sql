-- CreateTable
CREATE TABLE "SyncLock" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLock_pkey" PRIMARY KEY ("id")
);

-- Insert global row so we can upsert
INSERT INTO "SyncLock" ("id", "createdAt") VALUES ('global', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
