# Verificación: ventas por FECHA, catálogo REFER y filtros

## 1. Conteo de ventas por rango (usando FECHA = issuedAt)

En la base de datos (psql o cliente):

```sql
-- Count ventas entre 2026-01-01 y 2026-02-09 por fecha de factura (issuedAt)
SELECT COUNT(*) AS total_facturas
FROM "Invoice" i
WHERE i."issuedAt" >= '2026-01-01'::date
  AND i."issuedAt" <= '2026-02-09'::date;
```

## 2. Cinco ventas de ejemplo (fecha, cedula, refer, marca, clase, valtot)

```sql
SELECT
  i."issuedAt"::date AS fecha,
  c.nit AS cedula,
  it."productName" AS refer,
  it.brand AS marca,
  COALESCE(it."className", it."classCode") AS clase,
  it.total AS valtot
FROM "Invoice" i
JOIN "Customer" c ON c.id = i."customerId"
JOIN "InvoiceItem" it ON it."invoiceId" = i.id
WHERE i."issuedAt" >= '2026-01-01'::date
  AND i."issuedAt" <= '2026-02-09'::date
ORDER BY i."issuedAt" DESC
LIMIT 5;
```

## 3. % ventas con (SIN MAPEO) y top 20 referencias sin mapeo

```sql
-- % ítems con (SIN MAPEO)
SELECT
  COUNT(*) FILTER (WHERE it.brand = '(SIN MAPEO)' OR it."className" = '(SIN MAPEO)') * 100.0 / NULLIF(COUNT(*), 0) AS pct_sin_mapeo
FROM "InvoiceItem" it
JOIN "Invoice" i ON i.id = it."invoiceId"
WHERE i."issuedAt" >= '2026-01-01'::date
  AND i."issuedAt" <= '2026-02-09'::date;

-- Top 20 referencias (productName) sin mapeo
SELECT it."productName" AS refer, COUNT(*) AS veces
FROM "InvoiceItem" it
JOIN "Invoice" i ON i.id = it."invoiceId"
WHERE i."issuedAt" >= '2026-01-01'::date
  AND i."issuedAt" <= '2026-02-09'::date
  AND (it.brand = '(SIN MAPEO)' OR it."className" = '(SIN MAPEO)')
GROUP BY it."productName"
ORDER BY veces DESC
LIMIT 20;
```

## 4. Dashboard

- GET `/api/dashboard/summary?from=2026-01-01&to=2026-02-09` debe devolver totales no vacíos si hay datos en ese rango.
- Si `to < from` el backend responde 400: "Rango inválido (end < start)".

## 5. Deploy Lightsail (resumen)

```bash
cd ~/nit
git pull
sudo docker compose build --no-cache api web
sudo docker compose up -d
sudo docker compose exec -T api pnpm prisma migrate deploy
```
