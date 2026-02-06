#!/bin/bash
# Deploy manual en el servidor - ejecutar: cd ~/nit && bash deploy.sh
# Fuerza rebuild sin caché para que los cambios de código se reflejen.
set -e
cd "$(dirname "$0")"
echo ">>> git pull"
git pull
echo ">>> docker-compose down"
sudo docker-compose down --remove-orphans
echo ">>> docker-compose build --no-cache (puede tardar varios minutos)"
sudo docker-compose build --no-cache web api
echo ">>> docker-compose up -d"
sudo docker-compose up -d
echo ">>> prisma migrate"
sudo docker-compose exec -T api pnpm prisma migrate deploy
echo ">>> Deploy completado. Refresca el navegador con Ctrl+Shift+R"
