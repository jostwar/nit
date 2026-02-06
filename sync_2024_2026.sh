START_DATE="2024-01-01"
END_DATE="$(date +%F)"

current="$START_DATE"
while [ "$(date -d "$current" +%s)" -le "$(date -d "$END_DATE" +%s)" ]; do
  echo "=== Día $current ==="

  for H in 00 12; do
    FROM="${current}T${H}:00:00"
    if [ "$H" = "12" ]; then
      TO="${current}T23:59:59"
    else
      TO="${current}T11:59:59"
    fi

    echo "Sync $FROM -> $TO"
    curl -X POST "http://localhost:4000/api/source/sync" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"$FROM\",\"to\":\"$TO\",\"page\":1,\"pageSize\":1000}"

    while true; do
      if sudo docker-compose logs --tail=50 api | grep -q "Sync completed"; then
        echo "Bloque terminado: $FROM -> $TO"
        break
      fi
      sleep 15
    done
  done

  current=$(date -d "$current + 1 day" +%F)
done
