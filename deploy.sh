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
echo ">>> $COMPOSE build --no-cache (puede tardar varios minutos)"
sudo BUILD_ID=$BUILD_ID $COMPOSE build --no-cache web api
echo ">>> $COMPOSE up -d"
sudo $COMPOSE up -d
echo ">>> prisma migrate"
sudo $COMPOSE exec -T api pnpm prisma migrate deploy
echo ">>> Deploy completado. Refresca el navegador con Ctrl+Shift+R"
