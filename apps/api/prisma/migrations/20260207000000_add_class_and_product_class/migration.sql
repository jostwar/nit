-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "classCode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductClass_tenantId_code_key" ON "ProductClass"("tenantId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductClass_tenantId_idx" ON "ProductClass"("tenantId");

-- AddForeignKey
ALTER TABLE "ProductClass" ADD CONSTRAINT "ProductClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
