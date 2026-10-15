#!/bin/bash
# Runs inside the `backup` container (postgres image, so pg_dump matches the server version).
# Daily at BACKUP_AT, or within ~15s when the admin drops a .request file into /backups.
# File names must match FILE_RE in server/src/backups/backups.service.ts.
set -u -o pipefail

DIR=${BACKUP_DIR:-/backups}
UPLOADS=${UPLOADS_DIR:-/uploads}
KEEP=${BACKUP_KEEP:-14}
AT=${BACKUP_AT:-03:30}
LOG=$DIR/backup.log
API_UID=${API_UID:-1000}
POLL=${BACKUP_POLL:-15}

mkdir -p "$DIR"
# The api container (user node) must be able to create the .request flag.
chown "$API_UID" "$DIR" 2>/dev/null || true

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

prune() {
  local prefix=$1
  ls -1t "$DIR"/"$prefix"-*.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do
    rm -f "$f" && log "清理旧备份 $(basename "$f")"
  done
}

run_backup() {
  local ts ok=1
  ts=$(date +%Y%m%d-%H%M%S)
  log "开始备份 ($1)"
  if pg_dump -h db -U qingjin -d qingjin --no-owner --clean --if-exists | gzip > "$DIR/.db.part"; then
    mv "$DIR/.db.part" "$DIR/db-$ts.sql.gz"
    log "数据库完成 db-$ts.sql.gz ($(du -h "$DIR/db-$ts.sql.gz" | cut -f1))"
  else
    rm -f "$DIR/.db.part"; ok=0; log "数据库备份失败"
  fi
  if tar -czf "$DIR/.uploads.part" -C "$UPLOADS" .; then
    mv "$DIR/.uploads.part" "$DIR/uploads-$ts.tar.gz"
    log "图片完成 uploads-$ts.tar.gz ($(du -h "$DIR/uploads-$ts.tar.gz" | cut -f1))"
  else
    rm -f "$DIR/.uploads.part"; ok=0; log "图片备份失败"
  fi
  prune db
  prune uploads
  [ $ok = 1 ] && log "备份结束" || log "备份结束（有失败项）"
  # Keep the log bounded.
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  chmod 644 "$DIR"/*.gz "$LOG" 2>/dev/null
}

rm -f "$DIR/.running" "$DIR"/.*.part
log "备份服务启动：每天 $AT，保留 $KEEP 份"

# Don't re-run today's scheduled backup just because the container restarted.
last=""
ls "$DIR"/db-"$(date +%Y%m%d)"-*.sql.gz >/dev/null 2>&1 && last=$(date +%F)

while true; do
  if [ -f "$DIR/.request" ]; then
    mv "$DIR/.request" "$DIR/.running"
    run_backup "手动"
    rm -f "$DIR/.running"
  elif [ "$(date +%F)" != "$last" ] && [[ ! "$(date +%H:%M)" < "$AT" ]]; then
    last=$(date +%F)
    run_backup "定时"
  fi
  sleep "$POLL"
done
