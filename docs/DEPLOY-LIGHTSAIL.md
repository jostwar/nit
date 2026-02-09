# Deploy NITIQ en AWS Lightsail (Ubuntu)

## Requisitos

- Ubuntu en Lightsail (Node 20+ recomendado, o usar contenedores).
- PostgreSQL (en instancia o RDS/Lightsail DB).
- Repositorio clonado (ej. `~/nit`).

## Variables de entorno

En el servidor, crear o editar `.env` (o configurar en systemd/PM2/Docker):

```bash
# Base de datos
DATABASE_URL=postgresql://usuario:password@host:5432/nitiq?schema=public

# JWT
JWT_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=1h
JWT_REFRESH_TTL=7d

# API
PORT=4000
CORS_ORIGIN=https://tu-dominio.com

# ERP (Fomplus)
SOURCE_API_PROVIDER=fomplus
SOURCE_API_DB=nombre_base_erp
SOURCE_API_TOKEN=...
SOURCE_API_CXC_BASE_URL=https://cartera.fomplus.com
SOURCE_API_VENTAS_BASE_URL=https://gspapiest.fomplus.com
SOURCE_API_INVENTARIO_BASE_URL=https://gspapi.fomplus.com
SOURCE_API_INVENTARIO_TOKEN=...
SOURCE_SYNC_ENABLED=true

# Opcional: sync por cliente (false = una llamada por rango; true = una por cliente)
# SOURCE_SYNC_BY_CUSTOMER=false
```

## Migraciones

Siempre después de `git pull`:

```bash
cd ~/nit/apps/api
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
```

## Con Docker (recomendado)

Desde la raíz del repo (`~/nit`):

```bash
git pull
export BUILD_ID=$(git rev-parse --short HEAD)
sudo docker compose build --no-cache web api
sudo docker compose up -d
sudo docker compose exec -T api pnpm prisma migrate deploy
sudo docker compose exec -T api pnpm run load-mappings || true
```

## Con PM2 (sin Docker)

```bash
cd ~/nit
git pull
pnpm install
cd apps/api && pnpm prisma migrate deploy && pnpm run build
cd ../web && pnpm run build
cd ../..
pm2 start ecosystem.config.js  # o: pm2 restart all
```

## Scheduler automático

El scheduler está integrado en la API (NestJS `@Cron`):

- **Ventas**: cada 15 min (solo día actual).
- **Cartera**: cada 1 h (solo día actual).
- **Clientes**: 1 vez al día (02:00).

No hace falta cron del sistema; el proceso de la API debe estar levantado (Docker o PM2).

## Endpoints útiles

- **GET /api/source/sync/status** – Estado del sync (último sync, duración, unmapped %, errores).
- **POST /api/source/sync** – Sync manual (fallback).
- **PUT /api/source/inventory-directory** – Cargar directorio REFER→MARCA,CLASE (JSON).
- **POST /api/source/inventory-directory/upload** – Cargar directorio desde CSV (multipart, campo `file`).

## Verificación

1. `curl -s http://localhost:4000/api/health` (o la URL pública).
2. Login en la app y revisar dashboard.
3. Revisar logs: `docker compose logs -f api` o `pm2 logs`.
