# NITIQ ETL – Diagnóstico y plan de refactor

## (a) Por qué hoy NO está cruzando REFER con el directorio (o falla en casos)

- **Sí hay cruce implementado**: En `fomplus-source-api.client.ts`, `fetchInventoryMaps(tenantId)` carga el mapa desde `InventoryDirectory` (BD), CSV y API de inventario. En `mapInvoices()` cada ítem usa `productRef = normalizeRef(record.refer)` y `brandMap.get(productRef)` / `classMap.get(productRef)`.
- **Por qué puede no verse**:
  1. **Directorio vacío**: Si no se ha cargado el catálogo (PUT `/source/inventory-directory` o CSV), los mapas están vacíos y las ventas quedan con "Sin marca" / clase vacía.
  2. **Normalización distinta**: En BD se guarda `reference` ya normalizada (trim + mayúsculas). Si el CSV se cargó con espacios o minúsculas y la normalización no fue la misma que en ventas, el cruce falla para esas filas.
  3. **tenantId no pasado**: Si el sync no pasa `tenantId` en `options`, el cliente FOM no consulta la BD y solo usa CSV/API inventario.
- **Faltante solicitado**: Marcar explícitamente "(SIN MAPEO)" cuando REFER no está en el catálogo, y registrar un contador de referencias sin mapeo para monitoreo.

---

## (b) Dónde se está quedando lento

| Origen | Causa |
|--------|--------|
| **Red/ERP** | Con `SOURCE_SYNC_BY_CUSTOMER !== 'false'` se hace **una llamada a GenerarInfoVentas por cada cliente** (N round-trips). Para muchos clientes y rangos grandes, domina el tiempo. |
| **Sync** | No hay sincronización incremental por “última fecha”: cada sync manual puede pedir todo el rango again. |
| **Dashboard** | No llama al ERP en tiempo real; usa Prisma sobre BD. Las consultas pesadas son agregaciones por tenant (totales, filtros). |
| **DB** | Índices ya existen en `(tenantId, nit)`, `(tenantId, issuedAt)`, etc. Posible N+1 en `processInvoice` (findFirst customer por factura, luego create/update ítems uno a uno). |
| **Caché** | `getFilterOptions` tiene TTL 60s en memoria; primera carga hace varios `groupBy` y `findMany`. |

Conclusión: el cuello de botella principal es **N llamadas al ERP por cliente** en modo “sync por cliente” y la **falta de ventana incremental** (solo “hoy” en el cron horario).

---

## (c) Plan de refactor mínimo (sin romper dashboards)

1. **Llave canónica de cliente**
   - Una función única `normalizeCustomerId(nit/cedula)` (trim, quitar puntos/guiones, solo dígitos + K final si aplica, ceros a la izquierda según criterio).
   - Usarla en: mapeo de ListadoClientes (CLI_CEDULA), GenerarInfoVentas (CEDULA), EstadoDeCuentaCartera (CEDULA), y en todos los upserts/joins de `sync.service` (customers, invoices, payments). Persistir en `Customer.nit` ya normalizado.

2. **Directorio REFER → MARCA/CLASE**
   - Mantener tabla actual `InventoryDirectory` como catálogo interno (refer_normalized, marca, clase).
   - Endpoint de **carga CSV** (multipart o base64): parse con columnas REFER, MARCA, CLASE; normalizar REFER; upsert con “última fila gana”; log de duplicados.
   - En enriquecimiento de ventas: si REFER no está en catálogo → MARCA='(SIN MAPEO)', CLASE='(SIN MAPEO)'; devolver en el resultado del sync `unmappedRefsCount` y exponer en `/sync/status` como % unmapped.

3. **Modelo de datos**
   - No renombrar tablas del dashboard: seguir con `Customer`, `Invoice`, `InvoiceItem`, `Payment`, `Credit`, `InventoryDirectory`. Equivalencias: customers ↔ customers, sales_transactions ↔ Invoice+InvoiceItem, ar_account_status ↔ Credit (+ Payment), reference_catalog ↔ InventoryDirectory.
   - Índices ya definidos; añadir si hace falta índice por `reference` en `InventoryDirectory` (ya existe unique (tenantId, reference)).

4. **Rendimiento**
   - **Incremental**: Usar `Tenant.lastSyncAt`; para el job automático traer solo ventas/cartera desde esa fecha (o ventana fija ej. últimas 24h).
   - **Evitar N llamadas por cliente** en sync manual cuando el rango es grande: preferir una sola llamada por rango (full range) y filtrar por cliente en memoria si hace falta, o hacer sync por cliente solo para rangos cortos (ej. “hoy”).
   - **Batch**: Donde sea posible usar `createMany` / transacciones para ítems de una factura (sin cambiar contrato del dashboard).
   - **Caché**: Mantener TTL de filter-options; opcional Redis más adelante.

5. **Scheduler y lock**
   - Cron diferenciado: ventas cada 15 min, cartera cada 1 h, clientes 1 vez al día.
   - Lock: advisory lock en Postgres (o fila en tabla `sync_lock`) para evitar ejecuciones paralelas.
   - **GET /sync/status**: último sync por tenant, duración, registros nuevos (opcional), errores recientes, % REFER sin mapeo.
   - **POST /sync** (manual): mantener como fallback.

6. **Observabilidad**
   - Logs estructurados (inicio/fin, duración, contadores).
   - Métricas básicas: ventas_ingestadas, refer_sin_mapeo, clientes_upsert, sync_duration_ms (en status o logs).
   - Tests unitarios: `normalizeCustomerId()`, `normalizeRefer()`, merge CSV (duplicados, blancos).

7. **Deploy Lightsail**
   - Instrucciones exactas: variables de entorno, migraciones Prisma, reinicio (PM2/Docker).

---

## Archivos clave actuales

| Responsabilidad | Archivo(s) |
|-----------------|------------|
| ListadoClientes | `fomplus-source-api.client.ts` → `mapCustomers()` (cli_cedula, cli_nombre) |
| GenerarInfoVentas | `fomplus-source-api.client.ts` → `fetchInvoices()` → `mapInvoices()` (cedula, nomced, refer) |
| EstadoDeCuentaCartera | `fomplus-source-api.client.ts` → `fetchPayments()` → `mapPayments()` (cedula, nomced) |
| Join/upsert clientes/ventas/cartera | `sync.service.ts` (normalizeNit, processInvoice, processPayment, syncCustomers) |
| Catálogo REFER | `inventory-directory.service.ts`, `InventoryDirectory` (Prisma) |
| Cruce REFER en ventas | `fomplus-source-api.client.ts` → `fetchInventoryMaps()` + `mapInvoices()` (brandMap, classMap) |
| Scheduler | `source.scheduler.ts` (EVERY_HOUR, today only) |
| Status sync | `source.controller.ts` → GET `sync/status` |

Este documento se mantendrá como referencia; los cambios se aplican en el código según el plan anterior.
