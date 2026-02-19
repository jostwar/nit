# Consumir la API NITIQ desde otro servicio

Guía para lanzar o integrar **otro servicio** (otra web, app móvil, script, ETL) usando las mismas APIs de NITIQ.

## 1. Base URL y autenticación

- **Prefijo:** Todas las rutas están bajo `/api`.
- **Base URL de ejemplo:** `http://localhost:4000/api` (local) o `https://tu-dominio.com/api` (producción).

### Login (obtener token)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@nitiq.local",
  "password": "admin123"
}
```

**Respuesta:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Uso del token

En todas las peticiones siguientes (excepto login, refresh y health) envía el token en la cabecera:

```http
Authorization: Bearer <accessToken>
```

El **tenant** (organización) se deduce del usuario; no hace falta enviar `X-Tenant-Id`.

### Renovar sesión

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

Devuelve un nuevo `accessToken` y `refreshToken`.

---

## 2. Endpoints principales

### Health (sin auth)

```http
GET /api/health
```

---

### Dashboard (métricas y filtros)

Filtros opcionales en query: `city`, `vendor`, `brand`, `class` (varios valores separados por coma, ej. `vendor=A,B`).

| Método | Ruta | Query | Descripción |
|--------|------|--------|-------------|
| GET | `/api/dashboard/filter-options` | — | Opciones para filtros (ciudades, vendedores, marcas, clases) |
| GET | `/api/dashboard/summary` | `from`, `to`, `compareFrom`, `compareTo`, `city`, `vendor`, `brand`, `class` | Resumen: cards, serie por día, totales periodo actual vs comparado |
| GET | `/api/dashboard/total` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Total ventas del periodo |
| GET | `/api/dashboard/tipomov` | `from`, `to` | Resumen por tipo de movimiento (TIPOMOV) |
| GET | `/api/dashboard/tipomov-detail` | `from`, `to`, `documentType` | Detalle de facturas por tipo |
| GET | `/api/dashboard/sales-by-class` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Ventas por clase |
| GET | `/api/dashboard/sales-by-vendor` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Ventas por vendedor |
| GET | `/api/dashboard/sales-by-brand` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Ventas por marca |
| GET | `/api/dashboard/sales-by-hour` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Ventas por hora del día |
| GET | `/api/dashboard/sales-by-day-of-week` | `from`, `to`, `city`, `vendor`, `brand`, `class` | Ventas por día de la semana |

Fechas en ISO 8601 (ej. `2026-01-01`, `2026-02-12`).

---

### Clientes

| Método | Ruta | Query / Body | Descripción |
|--------|------|----------------|-------------|
| GET | `/api/customers` | `from`, `to`, `city`, `vendor`, `brand`, `class`, `sort`, `order` | Lista de clientes con métricas |
| GET | `/api/customers/:id/overview` | `from`, `to`, `compareFrom`, `compareTo` | Resumen de un cliente |
| GET | `/api/customers/:id/brands` | `from`, `to`, `compareFrom`, `compareTo` | Ventas por marca del cliente |
| GET | `/api/customers/:id/products` | `from`, `to`, `compareFrom`, `compareTo` | Ventas por producto |
| GET | `/api/customers/:id/collections` | — | Cupo, saldo, vencido, DSO, documentos de cartera |

---

### Alertas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/alerts/rules` | Lista de reglas de alerta |
| POST | `/api/alerts/rules` | Crear regla (body según DTO) |
| PATCH | `/api/alerts/rules/:id` | Actualizar regla |
| DELETE | `/api/alerts/rules/:id` | Eliminar regla |
| GET | `/api/alerts/events` | Eventos (query: `status`, `ruleType`, `vendor`) |
| PATCH | `/api/alerts/events/:id/status` | Cambiar estado de un evento |
| POST | `/api/alerts/run` | Ejecutar evaluación de reglas |

---

### Copilot (BI / preguntas en lenguaje natural)

```http
POST /api/copilot/ask
Content-Type: application/json

{
  "question": "Top 10 clientes por ventas en el último mes",
  "start": "2026-01-01",
  "end": "2026-02-12",
  "city": "",
  "vendor": "",
  "brand": "",
  "class": ""
}
```

Respuesta: `answer`, `tables`, `download_available`, `download_query_id`, `applied_filters`, `warnings`.

Export de una tabla guardada:

```http
GET /api/copilot/export/:queryId
```

---

### Sincronización y origen (Source)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/source/sync` | Lanzar sincronización (body opcional: `from`, `to`, `tenantExternalId`) |
| POST | `/api/source/sync/cancel` | Cancelar sync en curso |
| GET | `/api/source/sync/status` | Estado y progreso de la última sync |
| GET | `/api/source/inventory-brands` | Marcas desde inventario |
| GET | `/api/source/cartera-documents` | Documentos de cartera (query: `cedula`) |
| GET | `/api/source/class-mapping` | Mapeo código → nombre de clase |
| PUT | `/api/source/class-mapping` | Actualizar mapeo (body: `{ "code": "nombre", ... }`) |
| GET | `/api/source/brand-mapping` | Mapeo código → nombre de marca |
| PUT | `/api/source/brand-mapping` | Actualizar mapeo de marcas |
| GET | `/api/source/inventory-directory` | Directorio ref → marca/clase |
| POST | `/api/source/inventory-directory` | Subir/actualizar directorio (body: array de `{ ref, brand?, class? }`) |

---

### Usuario y tenant

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/me` | Usuario actual (también en `/api/auth/me`) |
| GET | `/api/tenants/current` | Tenant actual |

---

## 3. CORS

Si tu **otro servicio** se ejecuta en un origen distinto (otro dominio o puerto), el servidor NITIQ debe permitirlo.

En el `.env` del backend (NITIQ):

```env
# Orígenes permitidos separados por coma. Ejemplo para una app en otro puerto/dominio:
CORS_ORIGIN=http://localhost:3000,https://mi-otra-app.com
```

Si `CORS_ORIGIN` está vacío, en muchos entornos se permiten todos los orígenes; en producción conviene listar solo los que uses.

---

## 4. Variables para tu servicio cliente

En el **otro servicio** solo necesitas:

| Variable | Descripción |
|----------|-------------|
| `NITIQ_API_URL` (o similar) | Base URL de la API, ej. `http://localhost:4000/api` o `https://tu-dominio.com/api` |
| Usuario y contraseña | Para hacer `POST /api/auth/login` y guardar `accessToken` (y opcionalmente `refreshToken`) |

Ejemplo en Node con `fetch`:

```js
const API_URL = process.env.NITIQ_API_URL || "http://localhost:4000/api";

async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { accessToken, refreshToken }
}

async function getSummary(accessToken, from, to) {
  const res = await fetch(
    `${API_URL}/dashboard/summary?from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## 5. Lanzar solo la API (sin la web NITIQ)

Si quieres **reutilizar la misma API** para tu propio frontend o scripts:

1. Clona el repo y configura el `.env` (copia de `.env.example`): al menos `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `CORS_ORIGIN` con el origen de tu servicio.
2. Instala, migra y opcionalmente seed:

   ```bash
   cd nit
   cp .env.example .env
   pnpm install --no-frozen-lockfile
   pnpm --filter api db:migrate
   pnpm --filter api db:seed
   ```

3. Levanta solo la API:

   ```bash
   pnpm --filter api start
   ```

   O en modo desarrollo:

   ```bash
   pnpm --filter api dev
   ```

La API quedará en `http://localhost:4000` (rutas bajo `/api`). Tu otro servicio apunta `NITIQ_API_URL` a esa base y usa login + Bearer como arriba.

Si en producción quieres **solo la API** (sin Next.js), despliega únicamente el contenedor `api` y expón el puerto 4000; el `docker-compose.yml` del proyecto define el servicio `api` y su conexión a PostgreSQL.
