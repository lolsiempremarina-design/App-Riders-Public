# RoR - Rider of Riders (backend)

> 📄 **Documentazione tecnica:** [`info/DOCUMENTAZIONE_TECNICA.md`](info/DOCUMENTAZIONE_TECNICA.md) - include stack, architettura, flusso dati, sicurezza, configurazione e comandi operativi.
>
> 🧑‍💻 **Vuoi modificare o provare il progetto?** Parti da [`../CONTRIBUTING.md`](../CONTRIBUTING.md): installazione, avvio, Git, test.

**Stato al 6 ottobre 2026 (fasi 1–7 e tre revisioni):** Python 3.12, Flask 3.1.3, Gunicorn 26.2.0, FastAPI 0.141.1.
Ultimo collaudo: 345 test automatici senza avvisi (più 2 sul PostgreSQL migrato, nella CI), migrazioni verificate su PostgreSQL vuoto, e2e dell'app React e
prova dell'app Android nell'emulatore (GPS a schermo spento, cadute, notifiche push). Stato e piano:
`../ARCHITECTURE.md`, `../PLAN.md`.

Questo è un progetto completo che dimostra l'implementazione di un'applicazione web sicura (Flask) con pipeline GPS asincrona (FastAPI + RabbitMQ + Worker) e autenticazione condivisa tramite cookie di sessione (`/auth/check_session`).
Il cuore dell'applicazione web utilizza **Flask** e `Flask-Security-Too` per gestire in modo robusto la registrazione, il login e la gestione degli utenti (incluso un sistema RBAC per gruppi), appoggiandosi a un database PostgreSQL tramite `Flask-SQLAlchemy`. L'applicazione adotta una **Modular Blueprint Architecture** per garantire manutenibilità.
In parallelo, il progetto integra **FastAPI**, **RabbitMQ** e un **GPS Worker** per l'ingestione asincrona e l'elaborazione di dati telemetrici (es. tracciati GPS), dimostrando un'architettura ibrida e scalabile.

---

## ⚛️ Frontend React integrato (dal 25/09/2026)

L'interfaccia principale è ora la PWA React in `../FrontendReact`, servita da **Nginx sullo stesso dominio** del backend:

| Percorso | Servizio |
|---|---|
| `/` | App React (build di Vite dentro l'immagine `nginx`) |
| `/api/*` | API JSON di Flask per React (`app/api/`), contratto in `../FrontendReact/API_CONTRACT.md` |
| `/stream`, `/session/*` | FastAPI (ingestione GPS) |
| `/web/*` | Pannello admin di Flask (`/web/admin/`, accesso con il login dell'app); le vecchie pagine HTML sono state rimosse |
| `/.well-known/assetlinks.json` | App Links dell'app Android (generato da Flask con `ANDROID_CERT_SHA256`) |

L'**app Android** (`../FrontendReact/android/`, Capacitor) apre lo stesso sito in una WebView e usa le stesse API e lo
stesso cookie; in più registra il token delle notifiche push (`/api/devices`) e riceve da `app/push.py` (Firebase Cloud
Messaging) ogni notifica creata dal server. La chiave di Firebase sta in `secrets/` (vedi `secrets/README.md`).

- L'autenticazione usa il **cookie di sessione di Flask-Security** (niente JWT). Le richieste React che modificano dati inviano il token CSRF nell'header `X-CSRFToken`.
- `docker compose up --build` costruisce anche il frontend: servono le cartelle `backend/` e `FrontendReact/` affiancate.
- Sviluppo del frontend con hot-reload: avvia Docker, poi in `FrontendReact/` esegui `npm run dev` (il proxy di Vite inoltra `/api` a `https://localhost`).
- Test backend: `docker compose run --rm --entrypoint "" web sh -c "pip install --user -q -r requirements-dev.txt && python -m pytest -q"`

## 🏛️ Architettura del Progetto (Ibrida: Monolite Modulare + Microservizi)

Il progetto affianca a un'applicazione Flask basata sul pattern **Application Factory** e **Blueprint**, una pipeline a microservizi per i dati ad alta frequenza. Questo approccio ibrido permette di gestire l'interfaccia utente e l'autenticazione in modo coeso e scalare le operazioni intensive (come l'ingestione di dati GPS) su processi separati.

### Struttura delle Directory

```text
RoR/
├── .env.example          # Modello delle variabili d'ambiente, senza segreti reali
├── .env                  # Configurazione locale richiesta (non versionata in git)
├── docker-compose.yml    # File di orchestrazione dei container (Web, FastAPI, Worker, RabbitMQ, Redis, Nginx, DB)
├── Dockerfile            # Configurazione per la build del container Flask
├── entrypoint.sh         # Script di avvio per eseguire migrazioni e Gunicorn
├── nginx/                # Configurazione del reverse proxy Nginx
├── secrets/              # Chiavi montate nel container (es. Firebase); mai nel repository né nell'immagine
├── scripts/              # Backup/ripristino, Let's Encrypt, import POI della mappa, elenco comuni ISTAT, ngrok
├── fastapi_app/          # Microservizio FastAPI per l'ingestione della telemetria
├── gps_worker/           # Worker background per il processing asincrono dei dati GPS
├── wsgi.py               # Entry point per l'esecuzione del server Flask
├── config.py             # File di configurazione dell'app (Classi Config)
├── extensions.py         # Istanziazione globale delle estensioni (DB, Security, Migrate)
├── app/                  # Package principale dell'applicazione Flask
│   ├── __init__.py       # Factory Function: assembla l'app, le config e i blueprint
│   ├── api/              # API JSON per l'app React (/api/*): auth, profilo, SOS, gruppi, chat, ordini, statistiche...
│   ├── auth/             # Modelli utente/ruoli/bici, codice fiscale, eliminazione account, /auth/check_session (FastAPI)
│   ├── admin/            # Pannello admin (ordini e bici) servito sotto /web/admin/
│   ├── core/             # /web/ → pannello admin; rimanda al login dell'app se manca la sessione
│   ├── delivery/         # Modello Order
│   ├── messaging/        # Notifiche, messaggi della chat (Redis pub/sub) e token push dei telefoni (DeviceToken)
│   ├── map/              # Punti d'interesse della mappa (/api/v1/*)
│   ├── data/             # Elenco ufficiale dei comuni ISTAT (per il codice fiscale)
│   ├── notifications.py  # Email SMTP degli SOS (disattivate se MAIL_SERVER è vuoto)
│   ├── push.py           # Notifiche push all'app Android (Firebase), inviate dopo il commit
│   ├── realtime.py       # WebSocket della chat di gruppo (/ws/chat/<id>)
│   ├── cli.py            # Comandi `flask ror ...`
│   └── templates/        # Solo base.html e admin/ (le vecchie pagine HTML sono state rimosse il 28/09/2026)
├── migrations/           # Autogenerato da Flask-Migrate (storico schema DB)
├── requirements.txt      # Dipendenze di produzione (Gunicorn, Flask, ecc.)
├── requirements-dev.txt  # Dipendenze di sviluppo (pytest, ruff, pip-audit e quelle di fastapi_app/ e gps_worker/ per i loro test)
└── README.md             # Questa documentazione
```

---

## 🛠️ Guida per lo Sviluppatore: Come aggiornare e scalare il progetto

Quando devi aggiungere nuove funzionalità, la regola d'oro è **separazione delle responsabilità**. Non mettere tutto in `routes.py` o `models.py`. Pensa per "moduli" (Blueprint).

Ecco una guida esaustiva su dove inserire ogni tipo di file:

### 1. Aggiungere una nuova funzionalità indipendente (Nuovo Blueprint)

Se devi aggiungere un'intera nuova sezione (es. un blog, un e-commerce, un pannello admin), crea una nuova cartella sotto `app/`:

1. Crea la cartella: `app/blog/`
2. Aggiungi `app/blog/routes.py`:

    ```python
    from flask import Blueprint, render_template
    blog_bp = Blueprint('blog', __name__)

    @blog_bp.route('/blog')
    def index():
        return "Il mio blog!"
    ```

3. Registra il Blueprint in `app/__init__.py`:
    ```python
    from app.blog.routes import blog_bp
    app.register_blueprint(blog_bp)
    ```

### 2. Aggiungere nuove Tabelle al Database (Modelli)

I modelli devono stare nel modulo a cui appartengono logicamente.

- Se aggiungi tabelle legate agli utenti (es. "Log Accessi"), mettile in `app/auth/models.py`.
- Se hai creato il modulo "Blog", crea `app/blog/models.py` e definisci lì i modelli (es. `Post`, `Comment`).
  **Ricorda:** Qualsiasi file che contiene modelli deve importare l'istanza `db` da `extensions.py` (e non da `__init__.py`). Dopo aver modificato o aggiunto modelli, ricorda sempre di eseguire le migrazioni: `flask db migrate -m "messaggio"` e poi `flask db upgrade`.

### 3. Interfaccia utente

Le schermate per i rider sono nell'app React (`../FrontendReact`), che parla solo con l'API JSON di `app/api/`
(contratto in `../FrontendReact/API_CONTRACT.md`). In Flask restano solo le pagine del pannello admin
(`app/templates/admin/`, che estendono `base.html`).

### 4. File statici

Il frontend (JS, CSS, immagini, icone della PWA) è costruito da Vite e servito da Nginx: Flask non serve file statici.

### 5. Aggiungere nuove Estensioni (es. Flask-Mail, Celery)

Non inizializzare **mai** le estensioni dentro `app/__init__.py` o nei file delle rotte, altrimenti genererai dipendenze cicliche.

1. Istanzia l'estensione in `extensions.py` (es. `mail = Mail()`).
2. Importala e associala all'app in `app/__init__.py` dentro la funzione `create_app()` (es. `mail.init_app(app)`).
3. Importala nei vari moduli (`routes.py`) dove ti serve utilizzarla (es. `from extensions import mail`).

### 6. Modificare i Form o l'Autenticazione

Tutto ciò che riguarda l'autenticazione si trova in `app/auth/`.

- Per aggiungere o modificare i campi utente (es. `tax_id_code`, `date_of_birth`, `gender`, `birth_city_country`), modifica `app/auth/models.py` e la validazione di `app/api/auth.py` (`_parse_registration`). Ricorda di generare la migrazione (`flask db migrate`) e applicarla (`flask db upgrade`).
- Flask-Security-Too gestisce sessioni, hash delle password e ruoli, ma **non** registra le sue pagine HTML (`register_blueprint=False`): accesso e registrazione passano da `/api/auth/*` (con il blocco dopo 10 tentativi falliti).
- Per cambiare regole globali (es. la durata delle password o il token), modifica `config.py`.

---

## 🗺️ Navigazione

Tutte le schermate dei rider (Home con sessione GPS e SOS, Mappa, Statistiche, Percorsi, Consegne, Gruppi e chat,
Profilo, contatti SOS, impostazioni) sono nell'app React: vedi `../FrontendReact`. Sotto `/web/` resta solo il
pannello admin (`/web/admin/`: ordini, bici con QR), a cui si accede con l'account dell'app.

---

## 🔒 Funzionalità Principali (Security)

- **Autenticazione Sicura:** Gestita da `Flask-Security-Too`.
- **Supporto Username/Email:** Login consentito tramite email o username (case-insensitive).
- **Hashing:** Le password usano lo standard di settore `bcrypt`.
- **Protezione CSRF:** Le richieste React che modificano dati inviano il token nell'header `X-CSRFToken`; i form del pannello admin usano `{{ form.hidden_tag() }}`.
- **Hardening Cookie:** `HttpOnly` e `SameSite=Lax` per prevenire attacchi XSS e CSRF.
- **Autenticazione Condivisa (Flask ↔ FastAPI):** Il cookie `session` viene verificato da FastAPI (`verify_flask_session`) tramite `/auth/check_session`. L'identità non viene accettata dal payload: FastAPI inserisce sempre lo `user_id` della sessione verificata.
- **DB e Migrazioni:** Utilizzo di `psycopg3` e `Flask-Migrate`.
- **Redis:** Memoria per la posizione GPS in tempo reale (`position:{user_id}`, TTL 90s) tramite `redis_client` condiviso.

---

## 👥 Gestione Gruppi (RBAC)

Il progetto include un sistema di gestione dei gruppi con controllo degli accessi basato sui ruoli (RBAC):

- **Creazione e Accesso:** Gli utenti possono creare nuovi gruppi o unirsi a gruppi esistenti tramite un codice univoco (es. `abc-defg-hij`) o un link d'invito crittografico.
- **Ruoli e Permessi:** Ogni membro ha un ruolo assegnato (`owner`, `admin`, `member`).
    - L'`owner` ha il controllo totale, inclusa la promozione e rimozione degli `admin`.
    - Gli `admin` (e l'`owner`) possono rigenerare i codici di accesso e revocare i link d'invito per prevenire accessi indesiderati.
    - I `member` hanno privilegi di sola lettura per i link di invito attivi.
- **Sicurezza Inviti:** I link d'invito utilizzano token sicuri a 256 bit generati tramite `secrets` e possono essere invalidati istantaneamente.

---

## 📍 Posizione GPS in Tempo Reale (Gruppo)

- **Ingestione:** Il client invia solo dati GPS e `session_id`; FastAPI associa ogni messaggio all'utente della sessione autenticata.
- **Storage:** Il `gps_worker` scrive in Redis (`position:{user_id}`) con TTL 90s (`redis==5.2.1`).
- **Autorizzazione:** `GET /api/groups/<group_id>/positions` restituisce solo i membri dello stesso gruppo che condividono la posizione.
- **Polling:** La Mappa dell'app React (`?gruppo=<id>`) interroga periodicamente le posizioni e aggiorna i marker.
- **Memoria:** La chiave è un singolo record (ultimo punto GPS), non una lista; non cresce nel tempo.

---

## 📱 App Android e notifiche push

- `POST /api/devices` / `DELETE /api/devices`: il telefono registra il suo token Firebase dopo il login; il logout lo
  cancella da solo e l'eliminazione dell'account cancella tutti i token.
- `notify()` (ordini, SOS dei gruppi, nuovi membri, bici) accoda la push, che parte dopo il commit in un thread
  (`app/push.py`, API HTTP v1 di Firebase con `google-auth`); i token che Firebase rifiuta vengono cancellati.
- Senza `secrets/firebase-service-account.json` le notifiche restano solo nell'app. Prova:
  `docker compose exec web flask ror send-test-push <email>`.
- App Links: `ANDROID_CERT_SHA256` in `.env` (impronte delle chiavi che firmano l'APK). Build e distribuzione dell'app:
  `../FrontendReact/android/README.md`.

---

## 🚀 Prerequisiti, Installazione e Avvio (Docker)

L'applicazione è interamente containerizzata e richiede solo Docker per essere avviata. L'infrastruttura comprende:

- **Gunicorn** (Web Server WSGI per Flask)
- **FastAPI** (Web Server ASGI per l'ingestione telemetria)
- **RabbitMQ** (Message Broker per disaccoppiare l'elaborazione)
- **GPS Worker** (Processo background per consumare messaggi e generare GPX)
- **Nginx** (Reverse Proxy che instrada su Flask e FastAPI)
- **PostgreSQL** (Database)

### Prerequisiti

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installato e avviato sul sistema.

### Setup e Avvio Rapido

1. **Clona il repository**
2. **Configura l'ambiente (`.env`):**
   Copia `.env.example` in `.env` e sostituisci tutti i valori `change-me`. Il file è richiesto e non deve essere versionato:
    ```bash
    cp .env.example .env
    ```
   Su PowerShell:
    ```powershell
    Copy-Item .env.example .env
    ```
   Le variabili principali sono:
    ```env
    SECRET_KEY=la_tua_secret_key_super_sicura
    SECURITY_PASSWORD_SALT=il_tuo_salt_super_sicuro
    DB_USER=postgres
    DB_PASSWORD=latuapassword
    DB_NAME=testlogin
    ```
3. **Avvia l'ambiente con Docker Compose:**
   Nel terminale, nella cartella principale del progetto esegui:
    ```bash
    docker compose up -d --build --wait
    ```
4. **Verifica l'avvio:**
   L'applicazione avvierà automaticamente il database, eseguirà le migrazioni in sospeso e avvierà Nginx.
    ### 🌐 Indirizzi di Accesso
    | Servizio             | URL                                                             | Descrizione                                 |
    | -------------------- | --------------------------------------------------------------- | ------------------------------------------- |
    | **App React (PWA)**  | `https://localhost`                                             | Login, registrazione e tutte le schermate   |
    | **Pannello admin**   | `https://localhost/web/admin/`                                  | Ordini e bici (ruolo `admin`)               |
    | **API JSON**         | `https://localhost/api/...`                                     | Vedi `../FrontendReact/API_CONTRACT.md`     |
    | **Salute**           | `https://localhost/api/health`                                  | `{"status": "ok"}`                          |
    | **API Telemetria**   | `https://localhost/stream`                                      | Endpoint FastAPI per GPS                    |
    > ⚠️ **Nota:** L'accesso HTTP su `http://localhost` reindirizza automaticamente a HTTPS.

    ### 📱 Accesso da Smartphone e Test su Strada (ngrok)

    Per testare la registrazione dei percorsi GPS direttamente da uno smartphone reale all'esterno (senza dover configurare port forwarding sul router), il progetto include il servizio **ngrok** containerizzato:

    1. **Configurazione Token:**
       - Registrati gratuitamente su [dashboard.ngrok.com](https://dashboard.ngrok.com)
       - Copia il tuo authtoken da [ngrok Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
       - Inseriscilo in `.env`:
         ```env
         NGROK_AUTHTOKEN=il_tuo_token_personale
         # Opzionale: dominio statico gratuito fornito da ngrok
         NGROK_DOMAIN=nome-personalizzato.ngrok-free.app
         ```
    2. **Avvio del Tunnel:**
       - ngrok è opzionale (profilo `ngrok`): `docker compose up -d` **non** lo avvia. Per avviarlo con il resto:
         ```bash
         docker compose --profile ngrok up -d
         ```
       - Oppure puoi avviarlo singolarmente:
         ```bash
         docker compose up -d ngrok
         # oppure tramite script PowerShell:
         .\scripts\start_ngrok.ps1
         ```
    3. **Monitoraggio e URL Pubblico:**
       - L'URL pubblico generato (es. `https://xxxx.ngrok-free.app`) compare direttamente a video con lo script, oppure nei log con `docker compose logs -f ngrok`.
       - L'interfaccia web di ispezione del traffico ngrok è disponibile su `http://localhost:4040`.
    4. **Arresto del Tunnel:**
       - PowerShell: `.\scripts\start_ngrok.ps1 -Stop`
       - Oppure: `docker compose stop ngrok`

    ### 💾 Backup automatici (anche sul PC delle prove)

    Con lo stack partono anche `backup` (copia del database e dei GPX in `backups/` all'avvio e ogni 24 ore,
    conservata 14 giorni) e `maintenance` (tempi di conservazione della pagina Privacy e GPX orfani, ogni giorno).
    Se il PC fa da server per i tester, copia ogni tanto la cartella `backups/` su una chiavetta o sul cloud personale.
    Prova di ripristino senza toccare i dati: `./scripts/verify-backup.sh backups/ror-db-....dump backups/ror-gpx-....tar.gz`
    (da Git Bash su Windows). Dettagli e ripristino: `DEPLOY.md`, sezioni 8 e 12.

### Visualizzazione dei log


Per visualizzare i log in tempo reale dell'applicazione:

```bash
docker compose logs -f web
```

### Come fermare l'applicazione

Per spegnere i container (senza perdere i dati del database), esegui nel terminale:

```bash
docker compose down
```

Se desideri eliminare anche i volumi (incluso il database, **attenzione: perderai tutti i dati**), usa:

```bash
docker compose down -v
```

---

## 💾 Comandi Utili per il Database (Flask-Migrate)

- `flask db migrate -m "Descrizione"`: Genera una nuova migrazione (da lanciare dopo aver modificato i modelli Python).
- `flask db upgrade`: Applica le migrazioni generate al database.
- `flask db downgrade`: Annulla l'ultima migrazione.
- `flask db current`: Visualizza la migrazione attuale.

### Come popolare il database con i dati della mappa

Per caricare i dati della mappa (fontanelle, bagni, parcheggi bici, ciclofficine) nel database PostgreSQL a partire dai file CSV in `scripts/data/`, esegui questo comando nel terminale dopo `flask db upgrade`, mentre i container sono attivi. L'importazione può essere ripetuta: gli ID già presenti vengono saltati.

```bash
docker compose exec -e PYTHONPATH=/app web python scripts/import_map_data.py
```
