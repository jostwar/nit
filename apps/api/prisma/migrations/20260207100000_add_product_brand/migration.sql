-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductBrand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductBrand_tenantId_code_key" ON "ProductBrand"("tenantId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductBrand_tenantId_idx" ON "ProductBrand"("tenantId");

-- AddForeignKey
ALTER TABLE "ProductBrand" ADD CONSTRAINT "ProductBrand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
