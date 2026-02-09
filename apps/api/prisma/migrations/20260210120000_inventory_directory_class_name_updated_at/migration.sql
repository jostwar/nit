-- AlterTable InventoryDirectory: Nombre CLASE, updatedAt, classCode opcional
ALTER TABLE "InventoryDirectory" ADD COLUMN IF NOT EXISTS "className" TEXT;
ALTER TABLE "InventoryDirectory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "InventoryDirectory" ALTER COLUMN "classCode" DROP NOT NULL;

-- Index for reference (refer_norm) lookups
CREATE INDEX IF NOT EXISTS "InventoryDirectory_reference_idx" ON "InventoryDirectory"("reference");
