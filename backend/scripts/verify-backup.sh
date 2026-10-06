#!/usr/bin/env bash
# Prova di ripristino di un backup SENZA toccare i dati in uso: il dump viene caricato in un database
# temporaneo (ror_restore_check, poi eliminato) e le righe di ogni tabella vengono confrontate con quelle
# attuali; l'archivio GPX viene letto per intero. Dalla cartella backend/ (Windows: da Git Bash):
#   ./scripts/verify-backup.sh backups/ror-db-AAAAMMGG-HHMMSS.dump [backups/ror-gpx-AAAAMMGG-HHMMSS.tar.gz]
# Sul server di produzione: COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml ./scripts/verify-backup.sh ...
# Differenze nei numeri sono normali se l'app è stata usata dopo il backup; conta che il ripristino riesca.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

DUMP="${1:?Indica il file .dump da verificare}"
GPX="${2:-}"
[ -f "$DUMP" ] || { echo "File non trovato: $DUMP" >&2; exit 1; }
[ -z "$GPX" ] || [ -f "$GPX" ] || { echo "File non trovato: $GPX" >&2; exit 1; }

CHECK_DB=ror_restore_check
# righe di ogni tabella, "nome numero" (count esatto con query_to_xml, senza funzioni da creare)
COUNT_SQL="SELECT table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;"

# SQL da stdin sul database $1 (vuoto = quello dell'app)
db_sql() {
    docker compose exec -T db sh -c 'PGOPTIONS=--client-min-messages=warning psql -q -v ON_ERROR_STOP=1 -tA \
        -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}"' sh "$1"
}
drop_check_db() { echo "DROP DATABASE IF EXISTS $CHECK_DB;" | db_sql postgres >/dev/null; }
trap drop_check_db EXIT

echo "1/3 Ripristino di $DUMP in un database temporaneo..."
drop_check_db
echo "CREATE DATABASE $CHECK_DB;" | db_sql postgres
docker compose exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' sh "$CHECK_DB" < "$DUMP"

echo "2/3 Confronto con il database in uso"
copy=$(echo "$COUNT_SQL" | db_sql "$CHECK_DB" | tr -d '\r')
live=$(echo "$COUNT_SQL" | db_sql "" | tr -d '\r')
[ -n "$copy" ] || { echo "ERRORE: il backup non contiene tabelle" >&2; exit 1; }
printf '   %-30s %10s %10s\n' "tabella" "backup" "adesso"
awk 'NR == FNR { live[$1] = $2; next }
     { printf "   %-30s %10s %10s\n", $1, $2, ($1 in live ? live[$1] : "-") }' <(echo "$live") <(echo "$copy")
version_copy=$(echo "SELECT version_num FROM alembic_version;" | db_sql "$CHECK_DB" | tr -d '\r')
version_live=$(echo "SELECT version_num FROM alembic_version;" | db_sql "" | tr -d '\r')
echo "   migrazione del backup: $version_copy (in uso: $version_live)"

if [ -n "$GPX" ]; then
    echo "3/3 Archivio GPX $GPX"
    files=$(tar -tzf "$GPX" | grep -c '\.gpx$' || true)
    now=$(docker compose exec -T web sh -c "find /data/volume_gpx_storage -name '*.gpx' | wc -l" 2>/dev/null | tr -d '\r ' || true)
    echo "   file GPX leggibili nell'archivio: $files (adesso nel volume: ${now:-?})"
else
    echo "3/3 Archivio GPX non indicato: controllato solo il database"
fi
echo "Backup ripristinabile. Il database temporaneo $CHECK_DB viene eliminato."
