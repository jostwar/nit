-- Índices para filtros por marca y clase (nombre)
CREATE INDEX IF NOT EXISTS "InvoiceItem_tenantId_brand_idx" ON "InvoiceItem"("tenantId", "brand");
CREATE INDEX IF NOT EXISTS "InvoiceItem_tenantId_className_idx" ON "InvoiceItem"("tenantId", "className");
