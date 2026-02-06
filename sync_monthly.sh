START_DATE="2024-01-01"
END_DATE="$(date +%F)"

current="$START_DATE"
while [ "$(date -d "$current" +%s)" -le "$(date -d "$END_DATE" +%s)" ]; do
  month_start=$(date -d "$current" +%Y-%m-01)
  month_end=$(date -d "$month_start +1 month -1 day" +%F)

  if [ "$(date -d "$month_end" +%s)" -gt "$(date -d "$END_DATE" +%s)" ]; then
    month_end="$END_DATE"
  fi

  echo "=== Mes $month_start a $month_end ==="

  day="$month_start"
  while [ "$(date -d "$day" +%s)" -le "$(date -d "$month_end" +%s)" ]; do
    for H in 00 12; do
      FROM="${day}T${H}:00:00"
      if [ "$H" = "12" ]; then
        TO="${day}T23:59:59"
      else
        TO="${day}T11:59:59"
      fi

      echo "Sync $FROM -> $TO"
      curl -s -X POST "http://localhost:4000/api/source/sync" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"from\":\"$FROM\",\"to\":\"$TO\",\"page\":1,\"pageSize\":1000}"

      while true; do
        resp=$(curl -s -X POST "http://localhost:4000/api/source/sync" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"from\":\"$FROM\",\"to\":\"$TO\",\"page\":1,\"pageSize\":1000}")
        echo "$resp"
        if echo "$resp" | grep -q "started"; then
          break
        fi
        sleep 30
      done
    done
    day=$(date -d "$day + 1 day" +%F)
  done

  current=$(date -d "$month_start +1 month" +%F)
done
