-- Reasignar pagos de facturas duplicadas a la factura que se conserva (mismo tenantId, customerId, invoiceNumber)
UPDATE "Payment" p
SET "invoiceId" = sub.keep_id
FROM (
  SELECT i.id AS duplicate_id, dup.keep_id
  FROM "Invoice" i
  INNER JOIN (
    SELECT "tenantId", "customerId", "invoiceNumber", MIN(id) AS keep_id
    FROM "Invoice"
    GROUP BY "tenantId", "customerId", "invoiceNumber"
    HAVING COUNT(*) > 1
  ) dup ON i."tenantId" = dup."tenantId" AND i."customerId" = dup."customerId" AND i."invoiceNumber" = dup."invoiceNumber"
  WHERE i.id != dup.keep_id
) sub
WHERE p."invoiceId" IS NOT NULL AND p."invoiceId" = sub.duplicate_id;

-- Eliminar ítems de facturas duplicadas (antes de borrar las facturas)
DELETE FROM "InvoiceItem"
WHERE "invoiceId" IN (
  SELECT i.id FROM "Invoice" i
  INNER JOIN (
    SELECT "tenantId", "customerId", "invoiceNumber", MIN(id) AS keep_id
    FROM "Invoice"
    GROUP BY "tenantId", "customerId", "invoiceNumber"
    HAVING COUNT(*) > 1
  ) dup ON i."tenantId" = dup."tenantId" AND i."customerId" = dup."customerId" AND i."invoiceNumber" = dup."invoiceNumber"
  WHERE i.id != dup.keep_id
);

-- Eliminar facturas duplicadas (se conserva la de menor id por cada tenantId, customerId, invoiceNumber)
DELETE FROM "Invoice" i
USING (
  SELECT "tenantId", "customerId", "invoiceNumber", MIN(id) AS keep_id
  FROM "Invoice"
  GROUP BY "tenantId", "customerId", "invoiceNumber"
  HAVING COUNT(*) > 1
) dup
WHERE i."tenantId" = dup."tenantId" AND i."customerId" = dup."customerId" AND i."invoiceNumber" = dup."invoiceNumber"
  AND i.id != dup.keep_id;

-- Índice único para evitar duplicados en el futuro
CREATE UNIQUE INDEX "Invoice_tenantId_customerId_invoiceNumber_key" ON "Invoice"("tenantId", "customerId", "invoiceNumber");
