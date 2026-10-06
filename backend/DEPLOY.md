# RoR — Messa in produzione

Guida per pubblicare RoR su un server Linux con Docker, con HTTPS vero, backup giornalieri e
configurazione sicura. Lo stack è lo stesso dello sviluppo (`docker-compose.yml`) più
`docker-compose.prod.yml`, che aggiunge certificati Let's Encrypt, backup, manutenzione e controlli.

> Tutti i comandi si eseguono nella cartella `backend/` del server. Per brevità:
>
> ```bash
> alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
> ```

## 1. Cosa serve

| Requisito | Note |
|---|---|
| Server Linux (es. Ubuntu 24.04 LTS) | almeno 2 vCPU, 4 GB di RAM, 40 GB di disco |
| Docker Engine + plugin Compose | `docker compose version` ≥ 2.24 (usa `!reset`) |
| Un dominio (es. `app.esempio.it`) | record DNS **A** (e **AAAA** se c'è IPv6) verso l'IP del server |
| Porte aperte | 22 (SSH), 80 e 443; nessun'altra porta va esposta |
| Email per Let's Encrypt | avvisi di scadenza dei certificati |
| Casella SMTP (facoltativa) | per le email SOS ai contatti di emergenza |

Firewall consigliato (Ubuntu): `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`.
Accesso SSH solo con chiave, aggiornamenti automatici di sicurezza attivi (`unattended-upgrades`).

## 2. Codice sul server

`backend/` e `FrontendReact/` devono stare **affiancati** nella stessa cartella: l'immagine di nginx
si costruisce da `../FrontendReact`.

```text
ror/
├── backend/         (questo repository)
└── FrontendReact/   (repository del frontend)
```

## 3. File `.env` di produzione

```bash
cp .env.example .env
chmod 600 .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # una volta per ogni segreto
```

Valori obbligatori (Compose si ferma con un messaggio se mancano):

- `SECRET_KEY`, `SECURITY_PASSWORD_SALT` — casuali, ≥ 32 caratteri, **diversi** tra loro e da quelli di sviluppo
  (con `APP_ENV=production` Flask rifiuta di avviarsi con valori di esempio, cookie non sicuri o debug attivo);
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`;
- `DOMAIN` e `LETSENCRYPT_EMAIL`.

Da compilare prima di aprire il servizio agli utenti:

- `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL` — titolare del trattamento mostrato nella pagina Privacy;
- `ROUTE_RETENTION_DAYS`, `NOTIFICATION_RETENTION_DAYS`, `SOS_RETENTION_DAYS`, `CHAT_RETENTION_DAYS` — tempi di conservazione
  (0 = finché l'utente non li elimina), mostrati nell'app e applicati ogni giorno;
- `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`/`MAIL_USE_SSL`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` — email SOS
  (senza, l'app lo dice e propone chiamata/SMS ai contatti e il 112);
- `BACKUP_DIR` (default `./backups`) e `BACKUP_KEEP_DAYS` (default 14).

`APP_ENV=production`, cookie `Secure` e `FLASK_DEBUG=false` li imposta già `docker-compose.prod.yml`.

## 4. Primo avvio con HTTPS

```bash
STAGING=1 ./scripts/init-letsencrypt.sh   # prova con l'ambiente di test di Let's Encrypt (facoltativo)
./scripts/init-letsencrypt.sh             # certificato vero: avvia anche tutto lo stack
dc ps                                      # tutti i servizi "Up"
```

Lo script crea un certificato provvisorio, avvia nginx, ottiene quello vero con la verifica HTTP
(`/.well-known/acme-challenge/`) e ricarica nginx. Eseguendolo si accettano i termini di Let's Encrypt.
Poi il servizio `certbot` rinnova i certificati da solo e nginx li ricarica ogni 12 ore.

Le migrazioni del database si applicano da sole all'avvio di `web` (`flask db upgrade`).

## 5. Dati iniziali

```bash
dc exec web python -m scripts.import_map_data          # punti d'interesse della mappa
dc exec web flask ror grant-admin admin@esempio.it     # dopo aver registrato l'account dall'app
dc exec web flask ror send-test-email tu@esempio.it    # verifica della posta SOS
```

Il pannello amministratore (ordini, bici e QR) è su `https://DOMINIO/web/admin/`: si accede con l'account
dell'app (senza sessione il pannello rimanda al login dell'app e poi torna indietro).

## 6. Verifiche dopo il rilascio

- `https://DOMINIO` apre l'app; `https://DOMINIO/api/health` risponde `{"status": "ok"}`.
- Registrazione, login, una sessione GPS breve, un ordine dal pannello admin, chat tra due telefoni.
- Pagina **Privacy**: titolare e tempi di conservazione corretti; "Scarica i miei dati" produce il file JSON.
- Controllo esterno di certificato e header (es. SSL Labs, securityheaders.com): HSTS, CSP, `X-Frame-Options`,
  `Permissions-Policy` sono impostati da `nginx/snippets/`.

## 7. Aggiornamenti

```bash
dc exec backup sh /scripts/backup.sh     # backup manuale prima di aggiornare
git -C ../FrontendReact pull && git pull
dc up -d --build                          # ricostruisce, applica le migrazioni, riavvia
dc logs --tail=100 web
```

## 8. Backup e ripristino

- Il servizio `backup` salva all'avvio e poi ogni 24 ore in `BACKUP_DIR` il database (`ror-db-*.dump`, `pg_dump -Fc`)
  e i file GPX (`ror-gpx-*.tar.gz`), cancellando quelli più vecchi di `BACKUP_KEEP_DAYS`. È definito in
  `docker-compose.yml`, quindi gira anche sul PC usato come server per le prove (sezione 12).
- **Copiare i backup anche fuori dal server** (altro server, storage cifrato): un backup che sta solo sul disco
  del server non protegge da guasti o compromissioni. I backup contengono dati personali: accesso limitato.
- Prova di ripristino **senza toccare i dati** (database temporaneo, confronto delle righe tabella per tabella con
  quelle attuali, lettura dell'archivio GPX):

  ```bash
  COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml \
    ./scripts/verify-backup.sh backups/ror-db-AAAAMMGG-HHMMSS.dump backups/ror-gpx-AAAAMMGG-HHMMSS.tar.gz
  ```

- Ripristino vero (chiede conferma, sostituisce i dati attuali):

  ```bash
  ./scripts/restore.sh backups/ror-db-AAAAMMGG-HHMMSS.dump backups/ror-gpx-AAAAMMGG-HHMMSS.tar.gz
  ```

- Provare il ripristino periodicamente (`verify-backup.sh` ogni trimestre, anche su una macchina di prova).

## 9. Manutenzione automatica e log

- Il servizio `maintenance` (anche questo in `docker-compose.yml`) esegue all'avvio e poi ogni giorno
  `flask ror purge-expired` (tempi di conservazione) e `flask ror cleanup-gpx` (file GPX non più collegati a un
  percorso). Usa la stessa immagine di `web`: dopo un aggiornamento del backend `dc up -d --build` ricostruisce entrambi.
- Log: `dc logs -f --tail=100 web nginx gps_worker`; ogni servizio tiene al massimo 5 file da 10 MB.
- Monitoraggio: un controllo esterno periodico su `https://DOMINIO/api/health` avvisa se il servizio si ferma.

## 10. Sicurezza: cosa è già configurato

- HTTPS (TLS 1.2/1.3) con reindirizzamento da HTTP, HSTS, CSP restrittiva per l'app React, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (posizione e sensori solo per il sito).
- Limite di richieste per IP su login, registrazione, cambio password ed eliminazione account (nginx, 429 in JSON)
  più il blocco dopo 10 login falliti (Flask + Redis).
- Cookie di sessione `Secure`, `HttpOnly`, `SameSite=Lax`; token CSRF su ogni richiesta che modifica dati.
- Database, Redis e RabbitMQ solo sulla rete interna di Docker (nessuna porta pubblicata); `web` e `gps_worker`
  girano come utente non privilegiato (uid 1000).
- Nessun segreto nel codice o nelle immagini: tutto in `.env` (escluso da git e da `.dockerignore`).
- CI (GitHub Actions) in entrambi i repository: test, build, migrazioni su PostgreSQL vuoto e audit delle dipendenze.

Se un segreto viene esposto: cambiarlo in `.env` e `dc up -d` (cambiare `SECRET_KEY` disconnette tutti gli utenti).

## 11. Privacy

L'app offre esportazione completa dei dati (`GET /api/account/export`), rettifica dal profilo, eliminazione
dell'account e tempi di conservazione configurabili. Restano a carico del titolare: informativa legale completa,
registro dei trattamenti, basi giuridiche, contratti con i fornitori (hosting, SMTP) e valutazione d'impatto:
vedi `info/GUIDA_PRIVACY_GDPR.md`.

Servizi esterni chiamati dal telefono (elencati anche nella pagina Privacy e ammessi dalla CSP):
tessere e ricerca di OpenStreetMap, meteo Open-Meteo (posizione arrotondata a ~1 km), bandiere da flagcdn.com;
nell'app Android anche Firebase Cloud Messaging (notifiche push). Elenco dei comuni (ISTAT) e QR delle bici vengono
dal server stesso. Con molti utenti le tessere di `tile.openstreetmap.org` vanno sostituite con un fornitore dedicato
(policy d'uso di OpenStreetMap).

## 11b. App Android

- Notifiche push: chiave dell'account di servizio Firebase in `backend/secrets/firebase-service-account.json`
  (montata in sola lettura nel container `web`, mai nel repository né nell'immagine; su Linux leggibile dall'uid 1000).
  Verifica: `docker compose exec web flask ror send-test-push <email>` (serve un account che ha fatto l'accesso dall'app).
- App Links: `ANDROID_CERT_SHA256` in `.env` con l'impronta della chiave che firma l'APK (vedi
  `FrontendReact/android/README.md`); l'APK va compilato con `CAP_SERVER_URL=https://<dominio>` del server.

## 12. Il PC come server per le prove (gratis, senza pubblicare)

Finché non c'è un server, l'app per i tester gira sul PC con lo stack di sviluppo (`docker compose up -d`) e il tunnel
ngrok gratuito: `NGROK_AUTHTOKEN` e `NGROK_DOMAIN` in `.env`, poi `docker compose --profile ngrok up -d`. Non serve in
produzione.

- **Backup anche sul PC**: i servizi `backup` e `maintenance` partono con lo stack. Le copie finiscono in
  `backend/backups/` (fuori da git e dall'immagine): copiarle ogni tanto su una chiavetta USB o sul cloud personale,
  perché contengono i dati dei tester e un PC si può guastare. Prova senza rischi (da Git Bash, in `backend/`):
  `./scripts/verify-backup.sh backups/ror-db-....dump backups/ror-gpx-....tar.gz`. Ripristino vero sul PC:
  `RESTORE_DEV=1 ./scripts/restore.sh backups/ror-db-....dump backups/ror-gpx-....tar.gz`.
- **Il PC deve restare acceso** durante le prove: se va in sospensione o Docker è chiuso, l'app non raggiunge il
  server e anche l'SOS non arriva (l'app propone comunque di chiamare i contatti o il 112). In Windows: Impostazioni →
  Sistema → Alimentazione → sospensione "Mai" con l'alimentatore collegato (e nessuna azione alla chiusura del
  coperchio); in Docker Desktop: Settings → General → "Start Docker Desktop when you sign in". I servizi hanno
  `restart: always`/`unless-stopped`, quindi ripartono da soli quando Docker si avvia.
- **Budget del tunnel**: 20.000 richieste al mese; l'app Android ne usa circa 240 all'ora pedalando (vedi `PLAN.md`).
- **Email SOS gratis con Gmail**: un account Gmail dedicato al progetto (non quello personale), con la verifica in due
  passaggi attiva e una "password per le app" (Account Google → Sicurezza). In `.env`: `MAIL_SERVER=smtp.gmail.com`,
  `MAIL_PORT=587`, `MAIL_USE_TLS=true`, `MAIL_USERNAME=` l'indirizzo, `MAIL_PASSWORD=` la password per le app senza
  spazi, `MAIL_FROM=RoR avvisi SOS <indirizzo>`. Poi `docker compose up -d web ws maintenance` (le variabili si leggono
  solo alla creazione del container) e prova con `docker compose exec web flask ror send-test-email <email>`. Gmail
  gratuito invia fino a circa 500 email al giorno: per le prove basta.
