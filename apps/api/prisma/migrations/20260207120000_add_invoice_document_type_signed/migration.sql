-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "documentType" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "saleSign" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Invoice" ADD COLUMN "signedTotal" DECIMAL(14,2);
ALTER TABLE "Invoice" ADD COLUMN "signedMargin" DECIMAL(14,2);
ALTER TABLE "Invoice" ADD COLUMN "signedUnits" INTEGER;

-- Backfill: documentos existentes = SUMA (saleSign 1)
UPDATE "Invoice" SET "signedTotal" = "total", "signedMargin" = "margin", "signedUnits" = "units";

ALTER TABLE "Invoice" ALTER COLUMN "signedTotal" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "signedMargin" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "signedUnits" SET NOT NULL;
