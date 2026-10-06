#!/usr/bin/env bash
# Primo certificato HTTPS Let's Encrypt per DOMAIN (una sola volta, sul server, nella cartella backend/).
# Requisiti: il DNS di DOMAIN punta a questo server e le porte 80/443 sono aperte.
# Legge DOMAIN e LETSENCRYPT_EMAIL da .env. Con STAGING=1 usa l'ambiente di prova di Let's Encrypt.
# Eseguendolo si accettano i termini di servizio di Let's Encrypt (--agree-tos).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
: "${DOMAIN:?Imposta DOMAIN in .env}"
: "${LETSENCRYPT_EMAIL:?Imposta LETSENCRYPT_EMAIL in .env}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
LIVE="/etc/letsencrypt/live/$DOMAIN"

echo "1/4 Certificato provvisorio perché nginx possa partire"
"${COMPOSE[@]}" run --rm --no-deps --entrypoint sh certbot -c \
    "mkdir -p $LIVE && openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
     -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj /CN=localhost"

echo "2/4 Avvio dello stack"
"${COMPOSE[@]}" up -d --build

echo "3/4 Richiesta del certificato per $DOMAIN"
"${COMPOSE[@]}" run --rm --no-deps --entrypoint sh certbot -c \
    "rm -rf $LIVE /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"
"${COMPOSE[@]}" run --rm --no-deps --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email ${STAGING:+--staging}

echo "4/4 Ricarico nginx con il certificato vero"
"${COMPOSE[@]}" exec nginx nginx -s reload
echo "Fatto: https://$DOMAIN"
