#!/bin/sh
# Backup di RoR: database (pg_dump, formato custom) + file GPX.
# Lo esegue all'avvio e poi ogni giorno il servizio "backup" di docker-compose.yml (immagine postgres:15-alpine),
# con PGHOST/PGUSER/PGPASSWORD/PGDATABASE nell'ambiente. Si può lanciare anche a mano:
#   docker compose exec backup sh /scripts/backup.sh
# Ripristino: scripts/restore.sh. Copiare regolarmente BACKUP_DIR anche fuori dal server.
set -eu

DEST=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

# si scrive in un file .partial e lo si rinomina solo a copia completata; se la copia fallisce lo si cancella
trap 'rm -f "$DEST/ror-db-$STAMP.dump.partial" "$DEST/ror-gpx-$STAMP.tar.gz.partial"' EXIT

# Quando Docker riparte (riavvio del PC, apertura di Docker Desktop) i servizi ripartono tutti insieme senza
# aspettare il database: lo si attende qui (al massimo 5 minuti), altrimenti la copia di avvio fallirebbe.
tries=0
until pg_isready -q; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
        echo "[backup] il database non risponde da 5 minuti"
        exit 1
    fi
    sleep 5
done

pg_dump --format=custom --no-owner --no-privileges --file "$DEST/ror-db-$STAMP.dump.partial"
mv "$DEST/ror-db-$STAMP.dump.partial" "$DEST/ror-db-$STAMP.dump"

if [ -d /data/volume_gpx_storage ]; then
    # Senza i *.gpx.tmp dei giri in corso: il worker li cancella alla fine del giro e un file sparito a metà
    # faceva fallire tar (copia GPX persa, nuovo tentativo dopo un'ora). Il GPX finale entra nella copia dopo.
    tar -czf "$DEST/ror-gpx-$STAMP.tar.gz.partial" --exclude='*.gpx.tmp' -C /data volume_gpx_storage
    mv "$DEST/ror-gpx-$STAMP.tar.gz.partial" "$DEST/ror-gpx-$STAMP.tar.gz"
fi

# conservazione: i backup più vecchi di KEEP_DAYS giorni vengono eliminati
find "$DEST" -maxdepth 1 -name 'ror-*' -type f -mtime +"$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name '*.partial' -type f -mmin +720 -delete

echo "[backup] $STAMP completato: $(ls -1 "$DEST" | grep -c '^ror-') file in $DEST (conservati $KEEP_DAYS giorni)"
