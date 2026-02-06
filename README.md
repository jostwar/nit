# NITIQ – MVP SaaS BI + AI

MVP production-ready para una plataforma SaaS B2B multi-tenant que analiza ventas y cartera, con alertas y un copiloto AI basado en templates verificables.

## Requisitos
- Node.js 20+
- PNPM (se puede usar `npx pnpm@latest`)
- Docker y Docker Compose (opcional)

## Inicio rápido (local)
```bash
cp .env.example .env
npx pnpm@latest install --no-frozen-lockfile
npx pnpm@latest --filter api db:migrate
npx pnpm@latest --filter api db:seed
npx pnpm@latest dev
```

Servicios:
- Web: http://localhost:3000
- API: http://localhost:4000/api
- Health: http://localhost:4000/api/health

Credenciales demo:
- admin@nitiq.local / admin123
- analyst@nitiq.local / analyst123

## Docker Compose (local)
```bash
docker compose up --build
```

Si necesitas migraciones en docker:
```bash
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

## Deploy y verificación

Después de un deploy, haz clic en tu email (menú usuario) → verás **Build: abc123** (commit git). Si ves **Build: ?** o un valor viejo, el deploy no aplicó.

**Deploy manual en el servidor:**
```bash
cd ~/nit
git pull
bash deploy.sh
```

**Si la web no actualiza:** Verifica que BUILD_ID cambió. Si Nginx cachea, prueba `proxy_cache off` o borra caché.

## AWS Lightsail (deploy con Docker Compose + Nginx + SSL)
1. Crear instancia en Lightsail (Ubuntu 22.04).
2. Instalar Docker y Compose:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin
   sudo usermod -aG docker $USER
   ```
3. Subir el repo (git clone o SCP).
4. Crear `.env` con secretos reales.
5. Levantar servicios:
   ```bash
   docker compose up -d --build
   ```
6. Instalar Nginx y configurar reverse proxy:
   ```bash
   sudo apt install -y nginx
   ```
   Configuración `/etc/nginx/sites-available/nitiq`:
   ```
   server {
     listen 80;
     server_name TU_DOMINIO;

     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }

     location /api/ {
       proxy_pass http://localhost:4000/api/;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```
   Activar sitio:
   ```bash
   sudo ln -s /etc/nginx/sites-available/nitiq /etc/nginx/sites-enabled/nitiq
   sudo nginx -t && sudo systemctl restart nginx
   ```
7. SSL con Let’s Encrypt:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d TU_DOMINIO
   ```

## Estructura del monorepo
- `apps/web` – Next.js + Tailwind + shadcn/ui + TanStack Table + Recharts
- `apps/api` – NestJS + Prisma + PostgreSQL

## Scripts
- `pnpm dev` – corre web + api
- `pnpm db:migrate` – migraciones Prisma (API)
- `pnpm db:seed` – data demo (API)

## Notas de AI Copilot
El copiloto usa templates predefinidos, devuelve el periodo consultado, el template usado y filas verificables. No ejecuta SQL libre.

## Integración ERP Fomplus (opcional)
Configura estas variables para usar el conector del ERP:
- `SOURCE_API_PROVIDER=fomplus`
- `SOURCE_API_DB=GSPSAS`
- `SOURCE_API_TOKEN=<token>`
- `SOURCE_API_VENDOR=` (opcional)
- `SOURCE_API_CXC_BASE_URL=https://cartera.fomplus.com`
- `SOURCE_API_VENTAS_BASE_URL=https://gspapiest.fomplus.com`
