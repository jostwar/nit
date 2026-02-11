-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "fromListadoClientes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InventoryDirectory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SyncLock" ALTER COLUMN "id" SET DEFAULT 'global';
