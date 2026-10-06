#!/usr/bin/env bash
# Ripristino di un backup creato da scripts/backup.sh (dalla cartella backend/, sul server o sul PC delle prove).
#   ./scripts/restore.sh backups/ror-db-AAAAMMGG-HHMMSS.dump [backups/ror-gpx-AAAAMMGG-HHMMSS.tar.gz]
# Sul PC con lo stack di sviluppo (anche Windows, da Git Bash): RESTORE_DEV=1 ./scripts/restore.sh ...
# Prima di ripristinare si può controllare la copia senza toccare nulla: scripts/verify-backup.sh
# ATTENZIONE: sostituisce i dati attuali del database (e dei GPX, se indicato l'archivio).
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash su Windows: nessuna conversione automatica dei percorsi negli argomenti di docker
export MSYS_NO_PATHCONV=1

DUMP="${1:?Indica il file .dump da ripristinare}"
GPX="${2:-}"
[ -f "$DUMP" ] || { echo "File non trovato: $DUMP" >&2; exit 1; }
[ -z "$GPX" ] || [ -f "$GPX" ] || { echo "File non trovato: $GPX" >&2; exit 1; }

COMPOSE=(docker compose -f docker-compose.yml)
[ -f docker-compose.prod.yml ] && [ "${RESTORE_DEV:-}" != "1" ] && COMPOSE+=(-f docker-compose.prod.yml)

# nome del database e utente li conosce già il container db: .env non va letto dalla shell
# (può iniziare con il BOM o contenere valori con spazi, che Docker Compose accetta e bash no)
DB_NAME=$("${COMPOSE[@]}" exec -T db sh -c 'printf %s "$POSTGRES_DB"' < /dev/null)

echo "Ripristino di $DUMP ${GPX:+e $GPX} nel database ${DB_NAME}: i dati attuali verranno sostituiti."
read -r -p "Scrivi RIPRISTINA per continuare: " answer
[ "$answer" = "RIPRISTINA" ] || { echo "Annullato."; exit 1; }

# fermare chi scrive nel database durante il ripristino (backup compreso: ne farà uno nuovo al riavvio)
"${COMPOSE[@]}" stop web ws fastapi gps_worker maintenance backup 2>/dev/null || true

"${COMPOSE[@]}" exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP"

if [ -n "$GPX" ]; then
    # percorso della cartella per Docker: C:/... su Windows (pwd -W), /... altrove
    GPX_DIR=$(cd "$(dirname "$GPX")" && (pwd -W 2>/dev/null || pwd))
    "${COMPOSE[@]}" run --rm --no-deps -T -u root -v "$GPX_DIR:/restore:ro" \
        --entrypoint "" gps_worker sh -c "rm -rf /data/volume_gpx_storage/* && \
        tar -xzf /restore/$(basename "$GPX") -C /data && chown -R 1000:1000 /data/volume_gpx_storage"
fi

"${COMPOSE[@]}" up -d
echo "Ripristino completato. Controlla l'app e i log: ${COMPOSE[*]} logs --tail=50 web"
