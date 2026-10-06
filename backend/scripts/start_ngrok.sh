#!/usr/bin/env bash
# ==============================================================================
# Script di avvio per il tunnel ngrok (RoR - Rider On Road)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ "$1" = "--stop" ] || [ "$1" = "stop" ]; then
    echo "[INFO] Arresto del container ngrok..."
    docker compose stop ngrok
    echo "[OK] Container ngrok fermato."
    exit 0
fi

# 1. Verifica esistenza file .env
if [ ! -f ".env" ]; then
    echo "[ERRORE] File .env non trovato!"
    echo "Copia .env.example in .env ed imposta le variabili necessarie:"
    echo "  cp .env.example .env"
    exit 1
fi

# 2. Verifica NGROK_AUTHTOKEN
if ! grep -q -E '^[[:space:]]*NGROK_AUTHTOKEN=[^[:space:]]+' .env; then
    echo "[ERRORE] NGROK_AUTHTOKEN non impostato in .env!"
    echo "1. Registrati gratuitamente su: https://dashboard.ngrok.com"
    echo "2. Copia il tuo authtoken da: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Incollalo nel file .env alla riga NGROK_AUTHTOKEN=<tuo-token>"
    exit 1
fi

# 3. Avvio del servizio ngrok
echo "[INFO] Avvio del servizio ngrok tramite Docker Compose..."
docker compose up -d ngrok

# 4. Attesa inizializzazione tunnel e recupero URL pubblico
echo "[INFO] In attesa che il tunnel sia attivo..."
MAX_ATTEMPTS=15
ATTEMPT=0
PUBLIC_URL=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ] && [ -z "$PUBLIC_URL" ]; do
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
    if command -v curl >/dev/null 2>&1; then
        PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -n 1 || true)
    fi
done

if [ -n "$PUBLIC_URL" ]; then
    echo ""
    echo "=========================================================="
    echo "  🚀 TUNNEL NGROK ATTIVO CON SUCCESSO!"
    echo "=========================================================="
    echo "  Indirizzo pubblico: $PUBLIC_URL"
    echo "  Dashboard traffico: http://localhost:4040"
    echo "=========================================================="
    echo "Apri questo URL dallo smartphone per testare la traccia GPS!"
    echo "Per fermare il tunnel: ./scripts/start_ngrok.sh --stop"
else
    echo "[AVVISO] Container ngrok avviato. Controlla la dashboard: http://localhost:4040 o 'docker compose logs -f ngrok'"
fi
