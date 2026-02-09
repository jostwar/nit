-- CreateTable
CREATE TABLE "InventoryDirectory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,

    CONSTRAINT "InventoryDirectory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDirectory_tenantId_reference_key" ON "InventoryDirectory"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "InventoryDirectory_tenantId_idx" ON "InventoryDirectory"("tenantId");

-- AddForeignKey
ALTER TABLE "InventoryDirectory" ADD CONSTRAINT "InventoryDirectory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
