#!/bin/bash
# Deploy manual en el servidor - ejecutar: cd ~/nit && bash deploy.sh
# Fuerza rebuild sin caché para que los cambios de código se reflejen.
# Usa "docker compose" (V2) si está disponible; si no, "docker-compose".
set -e
cd "$(dirname "$0")"
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
echo ">>> git pull"
git pull
export BUILD_ID=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)
echo ">>> BUILD_ID=$BUILD_ID"
echo ">>> $COMPOSE down"
sudo $COMPOSE down --remove-orphans
echo ">>> Eliminando contenedores huérfanos (por si down no los quitó)"
sudo docker rm -f nit-db-1 nit-api-1 nit-web-1 2>/dev/null || true
echo ">>> $COMPOSE build --no-cache (puede tardar varios minutos)"
sudo BUILD_ID=$BUILD_ID $COMPOSE build --no-cache web api
echo ">>> Quitando contenedores previos antes de up"
sudo docker rm -f nit-db-1 nit-api-1 nit-web-1 2>/dev/null || true
echo ">>> $COMPOSE up -d"
sudo $COMPOSE up -d
echo ">>> prisma migrate"
if ! sudo $COMPOSE exec -T api pnpm prisma migrate deploy 2>/dev/null; then
  echo ">>> Aviso: no se pudo ejecutar migrate (¿contenedor api en marcha?). Si la API reinicia en bucle, revisa: sudo $COMPOSE logs api"
fi
echo ">>> load-mappings (clase/marca)"
sudo $COMPOSE exec -T api pnpm run load-mappings 2>/dev/null || true
echo ">>> Deploy completado. Refresca el navegador con Ctrl+Shift+R"
