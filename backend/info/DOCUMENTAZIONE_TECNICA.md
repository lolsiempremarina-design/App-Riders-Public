# RoR - Documentazione tecnica

**Versione documento:** 3.0  
**Aggiornamento:** 28 settembre 2026 (fasi 1–7: app React, produzione, app Android)  
**Destinazione:** repository unico (`backend/` + `FrontendReact/`)  
**Stato verificato:** test automatici, migrazioni su PostgreSQL vuoto, e2e dell'app React, prova dell'app Android
nell'emulatore (sezione 9)

## 1. Scopo del sistema

RoR (Rider of Riders) è una piattaforma per chi lavora in bici: percorsi GPS con file GPX, rilevamento cadute e SOS,
consegne e guadagni, gruppi con chat e posizione condivisa, bici della community con QR code, notifiche nell'app e
notifiche push sul telefono.

L'architettura è ibrida:

- l'interfaccia è l'app React (`../FrontendReact`: browser, PWA e app Android Capacitor), che usa solo l'API JSON;
- Flask gestisce account, sessioni, API JSON (`/api`), chat WebSocket (`/ws`), pannello admin (`/web/admin/`) e l'invio
  delle notifiche push (Firebase Cloud Messaging);
- FastAPI riceve la telemetria (`/stream`, `/session/end`) e la pubblica su RabbitMQ;
- il GPS worker consuma la coda, aggiorna Redis, genera i GPX e salva i metadati in PostgreSQL;
- Nginx serve l'app React, termina HTTPS e inoltra le richieste ai servizi interni.

## 2. Stack validato

| Componente | Versione o immagine | Responsabilità |
|---|---:|---|
| Python | 3.12 (`python:3.12-slim`) | Runtime dei tre servizi applicativi |
| Flask | 3.1.3 | API JSON, pannello admin, comandi `flask ror` |
| Flask-Security-Too | 5.8.2 | Sessioni, hash delle password e ruoli (senza pagine HTML proprie) |
| flask-sock | 0.7.0 | WebSocket della chat (Gunicorn `gthread`, servizio `ws`) |
| Gunicorn | 26.2.0 | Server WSGI del servizio web |
| FastAPI | 0.141.1 | API di ingestione telemetria |
| Uvicorn | 0.34.0 | Server ASGI |
| Pydantic | 2.10.4 | Validazione dei payload |
| Pika | 1.3.2 | Client RabbitMQ |
| PostgreSQL | `postgres:15-alpine` | Persistenza relazionale |
| SQLAlchemy / psycopg | 2.0.52 / 3.3.4 | ORM e driver |
| RabbitMQ | `rabbitmq:3.13-management` (prod: `-alpine`) | Coda durevole della telemetria |
| Redis | `redis:7-alpine` / client 5.2.1 | Posizione live, blocco del login, pub/sub della chat |
| google-auth | 2.58.1 | Credenziali per l'API HTTP v1 di Firebase Cloud Messaging |
| segno | 1.6.6 | QR delle bici nel pannello admin |
| Nginx | immagine costruita da `../FrontendReact/Dockerfile` | App React, TLS e reverse proxy |
| Ngrok | `ngrok/ngrok:alpine` (profilo `ngrok`) | Tunnel HTTPS gratuito per le prove dal telefono; entra da Nginx sulla porta interna 8444, l'unica che crede a `X-Forwarded-For` |

I file `requirements.txt`, `fastapi_app/requirements.txt` e `gps_worker/requirements.txt` sono la fonte definitiva per le
versioni Python, tutte fissate.

## 3. Servizi Docker

| Servizio | Rete | Dati persistenti | Dipendenze di avvio |
|---|---|---|---|
| `db` | backend | `postgres_data` | healthcheck PostgreSQL |
| `rabbitmq` | backend | `rabbitmq_data` | healthcheck sulle porte RabbitMQ |
| `redis` | backend | `redis_data` | healthcheck `PING` |
| `web` | frontend, backend | `gpx_storage`, `./secrets` (sola lettura) | database e Redis sani |
| `ws` | frontend, backend | nessuno | web sano (migrazioni applicate) |
| `fastapi` | frontend, backend | nessuno | RabbitMQ sano e web avviato |
| `gps_worker` | backend | `gpx_storage` | RabbitMQ, database e Redis sani |
| `nginx` | frontend | configurazione e certificati montati in sola lettura | web, ws e FastAPI avviati |
| `backup` | backend | `BACKUP_DIR` (default `./backups`), `gpx_storage` in sola lettura | database sano |
| `maintenance` | backend | `gpx_storage` | web sano (migrazioni applicate) |
| `ngrok` | frontend | nessuno | Nginx avviato (solo con `--profile ngrok`) |

PostgreSQL è pubblicato soltanto su `127.0.0.1:5433` in sviluppo (in produzione nessuna porta). L'accesso esterno passa
da Nginx sulle porte 80 e 443. `backup` (copia di database e GPX all'avvio e ogni 24 ore) e `maintenance` (tempi di
conservazione e GPX orfani ogni giorno) girano anche sul PC usato come server per le prove; in produzione
(`docker-compose.prod.yml`) si aggiunge `certbot`: vedi `../DEPLOY.md`. Prova di ripristino senza toccare i dati:
`scripts/verify-backup.sh`.

## 4. Flusso della telemetria

1. L'app invia una lista di punti a `POST /stream` oppure chiude la sessione con `POST /session/end` (nell'app Android
   tramite l'HTTP nativo, così l'invio continua a schermo spento).
2. FastAPI estrae il cookie di sessione e chiama internamente `GET /auth/check_session` sul servizio Flask.
3. Se la sessione è assente o non valida, FastAPI restituisce `401`; con i sensori disattivati `403`.
4. L'identificativo utente viene preso esclusivamente dalla sessione autenticata: il client non può attribuire dati a un
   altro utente.
5. Il messaggio `point` o `session_end` viene pubblicato nella coda durevole `telemetry_stream`.
6. Il worker aggiorna `position:{user_id}` in Redis con TTL configurabile, predefinito a 90 secondi.
7. Alla chiusura i punti vengono semplificati con Ramer-Douglas-Peucker (circa 4 m) e scritti in un file GPX; distanza e
   tempo in movimento (senza pause oltre `PAUSE_GAP_SEC`) si calcolano sulla traccia completa.
8. Il worker salva il percorso in `rider_shifts` (con la bici collegata, il primo e l'ultimo punto in `started_at` e
   `ended_at`: il tempo tra i due che non è in movimento sono le pause mostrate da Tempo Totale), registra le cadute
   confermate in `fall_events` e rimuove la posizione live.

### Payload punto

Il modello `TelemetryPoint` accetta `session_id` (UUID), `lat`/`lon` opzionali entro i limiti geografici, `speed_kmh`
non negativo, `timestamp` positivo, `is_confirmed_fall` e `is_cancelled_fall`. I campi non dichiarati vengono rifiutati;
i punti senza coordinate valide non entrano nel GPX né nella cache live.

## 5. API, utenti, gruppi e notifiche

L'applicazione Flask usa Application Factory e Blueprint. Il contratto completo è in `../FrontendReact/API_CONTRACT.md`:

- `app/api/`: autenticazione (con blocco dopo 10 errori), profilo e contatti SOS, impostazioni, statistiche, percorsi e
  GPX, gruppi (ruoli `owner`, `admin`, `member`, codici e link d'invito), chat, SOS, ordini e guadagni, notifiche,
  punteggio, bici, dati personali e privacy, comuni ISTAT, token push (`/api/devices`);
- `app/realtime.py`: WebSocket della chat `/ws/chat/<id>` (servizio `ws`, al massimo 5 chat per account) con controllo dell'Origin e Redis pub/sub tra i worker;
- `app/admin/`: pannello per creare, modificare, assegnare a un rider e annullare gli ordini, statistiche di un giorno o
  di un periodo, esportazione CSV delle consegne e dei totali per rider (`reports.py`) e bici (QR);
- `app/map/`: punti d'interesse della mappa (`/api/v1`);
- `app/push.py`: ogni notifica creata con `notify()` viene inviata anche come push dopo il commit, in un thread;
- `/auth/check_session`: endpoint interno per FastAPI; `/.well-known/assetlinks.json` per gli App Links Android.

La posizione di un membro è visibile solo a chi è nello stesso gruppo e solo se lui attiva la condivisione.

## 6. Sicurezza applicativa

- Password con hash bcrypt (Flask-Security-Too); blocco del login dopo 10 tentativi falliti (Redis).
- Sessione con cookie `HttpOnly`, `SameSite=Lax` e `Secure`; niente JWT. Le richieste che modificano dati inviano il
  token CSRF in `X-CSRFToken` (Flask-WTF controlla anche il `Referer` su HTTPS). Nginx inoltra `Host $http_host`, così
  anche un indirizzo con porta (emulatore Android su `https://localhost:8443`) supera CSRF e controllo dell'Origin.
- FastAPI ignora qualsiasi identità proposta dal client e usa l'utente della sessione Flask.
- Nginx: redirect HTTP → HTTPS, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, CSP per l'app React e CSP senza script per il pannello admin, 20 richieste al minuto per IP su
  login, registrazione, cambio password ed eliminazione account (IP reale anche dietro il tunnel).
- `.env`, `secrets/` (chiave di Firebase), chiavi private, certificati e chiave di firma dell'APK sono esclusi da Git e
  dall'immagine Docker; in produzione `check_production_config()` rifiuta segreti di esempio, cookie non sicuri e debug.
- I messaggi non validi vengono rifiutati senza retry; gli errori transitori vengono rimessi in coda.
- I test falliscono se SQLAlchemy emette un avviso (`pytest.ini`: `SAWarning` = errore).

## 7. Configurazione

Creare `.env` partendo da `.env.example`. Obbligatorie: `SECRET_KEY`, `SECURITY_PASSWORD_SALT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`, `RABBITMQ_QUEUE`.

| Variabile | Predefinito | Uso |
|---|---:|---|
| `POSITION_TTL` | 90 | Durata della posizione live in Redis, in secondi |
| `RDP_EPSILON` | 0.00004 | Tolleranza della semplificazione GPX (ogni punto va su disco prima della conferma a RabbitMQ) |
| `APP_TIMEZONE` | Europe/Rome | Fuso orario di statistiche e orari |
| `SESSION_COOKIE_SECURE`, `REMEMBER_COOKIE_SECURE` | true | Cookie solo via HTTPS |
| `MAIL_*` | vuoto | SMTP per le email degli SOS (vuoto = nessuna email, detto chiaramente nell'app) |
| `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL` | vuoto | Titolare mostrato nella pagina Privacy |
| `*_RETENTION_DAYS`, `BACKUP_KEEP_DAYS` | vedi `.env.example` | Tempi di conservazione (`flask ror purge-expired`) |
| `FCM_SERVICE_ACCOUNT_FILE` | impostato da `docker-compose.yml` | Chiave di Firebase in `secrets/`; senza file niente push |
| `PUSH_TOKEN_STALE_DAYS` | 60 | Token push non confermati cancellati da `purge-expired` |
| `ANDROID_APP_ID`, `ANDROID_CERT_SHA256` | `com.ror.rider`, vuoto | App Links (impronte della chiave che firma l'APK) |
| `FLASK_DEBUG` | false | Mai attivo in ambienti condivisi |

Non inserire segreti reali in `.env.example`.

## 8. Avvio e operazioni

```bash
docker compose up -d --build --wait
docker compose ps
```

App: `https://localhost` (login e registrazione nell'app React) · pannello admin: `https://localhost/web/admin/`.

```bash
docker compose logs -f web fastapi gps_worker nginx      # log
docker compose exec -T web flask db current              # migrazione attuale
docker compose exec web flask ror --help                 # comandi: admin, password, purge, email/push di prova...
docker compose down                                      # spegnimento senza perdere i dati
```

`docker compose down -v` elimina i volumi PostgreSQL, RabbitMQ, Redis e GPX; usarlo solo per un reset intenzionale.

## 9. Qualità e stato dell'ultima verifica

Verifica eseguita il 29 settembre 2026, aggiornata il 2 ottobre dopo la quarta caccia ai bug:

| Controllo | Esito |
|---|---|
| Test automatici backend (pytest) | 240 superati, nessun avviso |
| Migrazioni su PostgreSQL vuoto (upgrade, `flask db check`, downgrade, upgrade) | superate, `e2c5a8f4b1d3 (head)` |
| Test frontend (Vitest) e build | 311 superati, build e controllo del service worker superati |
| e2e Playwright (navigazione, consegne admin → rider, chat tra due browser, PWA offline) | 6/6 |
| Percorso reale con una pausa (`/stream` → worker → `/api/stats`) e registrazione con comune soppresso | pause esatte (600 s), registrazione 201 |
| API attaccata con dati di tipo sbagliato, id enormi, caratteri NUL e richieste simultanee (1° ottobre) | nessun errore 500, un solo ordine attivo e un solo SOS per volta, chat chiusa a chi lascia il gruppo |
| Riavvio del `gps_worker` durante un giro e punti con orari impossibili (1° ottobre) | nessun punto perso, nessun messaggio bloccato in coda |
| Riavvio di PostgreSQL da solo, Flask fermo durante un giro (1° ottobre) | nessun errore 500, /stream risponde 503 e l'app riprova |
| 40 chat aperte da 8 account, accessi incrociati tra utenti, tutte le pagine in 3 lingue (1° ottobre) | API in 0,01 s e SOS 201, 23 controlli di accesso superati, 0 errori nelle pagine |
| Limiti e chat (2 ottobre): login da `/web/api/`, messaggio WebSocket da 200 MB, 5 chat morte, riavvio di `ws`, "ritirato" e "riconsegna" insieme | `/web/api/` → 404, picco RAM di `ws` 128 MB (prima 552), chat di nuovo apribili, nessun ordine senza rider su 40 prove |
| Registrazione a 17 anni, notifiche a un utente in spagnolo, sessione ripresa dopo una chiusura riuscita (2 ottobre) | 422 su `date_of_birth`, "Nuevo miembro" e "SOS de", un solo percorso con le due parti sommate (2,224 km, 600 s) |
| Accessi con un X-Forwarded-For inventato a ogni tentativo (porta 443 e tunnel), errori del server con l'app in spagnolo (2 ottobre) | limite rispettato (9 risposte 429 su 30), telefoni diversi non si bloccano; "No hay ningún grupo con este código." |
| Conferma dell'email con un SMTP di prova (2 ottobre): registrazione, codice sbagliato e giusto, cambio di email dal Profilo, e2e con la posta attiva | Home solo dopo il codice, nuova email solo dopo il suo codice, e2e 6/6 |
| Pannello admin attraverso nginx e PostgreSQL (2 ottobre): assegnazione, modifica, annullo, 15 gare "il rider accetta" contro "l'admin assegna" e 15 con due ordini allo stesso rider, statistiche e CSV | 26 controlli superati, nessun 500, mai due ordini in corso per rider, l'ordine resta a chi l'ha accettato, CSV senza indirizzi |
| Quinta revisione (2 ottobre): date estreme e numeri enormi nel pannello, 12 codici email sbagliati insieme, codice giusto inviato due volte, /stream con il solo cookie "ricordami", gruppi letti mentre altri escono, richieste con la pagina nascosta | nessun 500, 5 tentativi contati (prima 3), 200 e 409 (prima 200 e 200), /stream 200 (prima 401), nessun 500, in background solo il controllo SOS |
| Verifica completa (2 ottobre): CI del backend in container puliti, tutte le funzioni dal vivo con tre account, log di tutti i servizi, punti GPS dopo 2 minuti senza attività | CI verde, 49/49, nessun errore nei log dopo le correzioni (attesa del database con il suo nome, connessione a RabbitMQ tenuta viva), nessun punto perso |
| Giro nell'app con GPS simulato (2 ottobre): 60 s fermi con la posizione che balla ±5 m, poi 30 s a 21,6 km/h | 0 km e velocità 0 da fermi (prima si sommava ogni salto), poi 0,180 km uguali nell'app e nel percorso salvato |
| `npm audit`, `pip-audit` | 0 vulnerabilità |
| App Android nell'emulatore (Android 17) | login, push reale con app chiusa, 6 min a schermo spento, caduta simulata → SOS, App Links verificati |

La CI (`../../.github/workflows/ci.yml`, nella radice del repository) ripete test, migrazioni, `pip-audit`, test e build del frontend e genera l'APK di prova.

## 10. Limiti e decisioni prima di un uso reale

- Prove su telefoni Android reali (8.1 e 8.2 in `../../PLAN.md`) e calibrazione del rilevamento cadute con dati veri.
- Valutazione privacy/DPIA adeguata al trattamento reale (`GUIDA_PRIVACY_GDPR.md`).
- Per pubblicare (facoltativo, con costi): server, dominio, SMTP, copia esterna dei backup e monitoraggio (`../DEPLOY.md`).

## 11. File di riferimento

- `../README.md`: panoramica e guida di sviluppo del backend; `../DEPLOY.md`: produzione;
- `../../FrontendReact/API_CONTRACT.md`: contratto dell'API; `../../FrontendReact/android/README.md`: app Android;
- `GITHUB_SETUP.md`: avvio sicuro per i colleghi; `.env.example`: modello delle variabili;
- `docker-compose.yml`: orchestrazione; `fastapi_app/main.py`: ingestione; `gps_worker/worker_consumer.py`: coda e GPX;
- `nginx/`: reverse proxy, TLS, CSP; `migrations/`: schema e cronologia del database.
