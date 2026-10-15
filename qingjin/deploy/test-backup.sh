#!/bin/bash
# Local test of backup.sh with a stub pg_dump: manual request, scheduled run, pruning, failure handling.
#   bash deploy/test-backup.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
mkdir -p "$T/bin" "$T/uploads/media" "$T/backups"
echo img > "$T/uploads/media/a.webp"
cat > "$T/bin/pg_dump" <<'EOF'
#!/bin/bash
[ -f "$FAIL_FLAG" ] && { echo "boom" >&2; exit 1; }
echo "-- fake dump"
EOF
chmod +x "$T/bin/pg_dump"
export PATH="$T/bin:$PATH" BACKUP_DIR="$T/backups" UPLOADS_DIR="$T/uploads" BACKUP_KEEP=2 BACKUP_POLL=1 FAIL_FLAG="$T/fail"
fails=0
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }
count() { ls "$T/backups"/$1-*.gz 2>/dev/null | wc -l; }

# Schedule far in the future: only manual requests run.
BACKUP_AT=23:59 bash "$HERE/backup.sh" & PID=$!
sleep 2
check "no backup at start" '[ "$(count db)" = 0 ]'
for i in 1 2 3; do
  touch "$T/backups/.request"
  for _ in $(seq 20); do [ ! -f "$T/backups/.request" ] && [ ! -f "$T/backups/.running" ] && break; sleep 0.5; done
  sleep 1.1   # file names have second resolution
done
check "pruned to BACKUP_KEEP" '[ "$(count db)" = 2 ] && [ "$(count uploads)" = 2 ]'
check "dump content" 'gunzip -c "$(ls -1t "$T/backups"/db-*.gz | head -1)" | grep -q "fake dump"'
check "uploads archive" 'tar -tzf "$(ls -1t "$T/backups"/uploads-*.gz | head -1)" | grep -q "media/a.webp"'
check "flags cleared" '[ ! -f "$T/backups/.request" ] && [ ! -f "$T/backups/.running" ]'
check "no partial files" '! ls -a "$T/backups" | grep -q "\.part$"'
touch "$T/fail"; touch "$T/backups/.request"; sleep 3; rm -f "$T/fail"
check "failed dump logged, no partial" 'grep -q "数据库备份失败" "$T/backups/backup.log" && ! ls -a "$T/backups" | grep -q "\.part$"'
kill $PID; wait $PID 2>/dev/null

# Schedule already passed today: runs once on start, not again.
rm -f "$T/backups"/*.gz
BACKUP_AT=00:00 bash "$HERE/backup.sh" & PID=$!
sleep 3
check "scheduled run once" '[ "$(count db)" = 1 ] && [ "$(grep -c "定时" "$T/backups/backup.log")" = 1 ]'
kill $PID; wait $PID 2>/dev/null
BACKUP_AT=00:00 bash "$HERE/backup.sh" & PID=$!
sleep 3
check "restart does not repeat today's run" '[ "$(count db)" = 1 ]'
kill $PID; wait $PID 2>/dev/null

echo "--- log"; tail -n 5 "$T/backups/backup.log"
rm -rf "$T"
[ $fails = 0 ] && echo "all checks passed" || { echo "$fails FAILED"; exit 1; }
