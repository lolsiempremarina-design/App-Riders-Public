# Guida per chi collabora a RoR

Questa guida spiega, passo per passo, come scaricare RoR sul proprio PC, farlo partire, modificarlo e provarlo
prima di proporre le modifiche al resto del gruppo. Non serve spendere nulla: tutti i programmi e i servizi usati sono
gratuiti. Se qualcosa non torna, guarda prima la sezione [11. Problemi frequenti](#11-problemi-frequenti).

**Da dove si parte**: la guida dà per scontato un **PC Windows con installato solo Visual Studio Code** (il caso più
comune nel gruppo). Tutto il resto — Git, Docker, Node.js — si installa nella [sezione 2](#2-programmi-da-installare-si-parte-da-visual-studio-code),
una volta sola. Chi usa macOS o Linux trova le differenze segnalate nei punti in cui contano.

## Indice

1. [Come è fatto il progetto](#1-come-è-fatto-il-progetto)
2. [Programmi da installare (si parte da Visual Studio Code)](#2-programmi-da-installare-si-parte-da-visual-studio-code)
3. [Scaricare il progetto](#3-scaricare-il-progetto)
4. [Configurazione locale: i file che non sono su GitHub](#4-configurazione-locale-i-file-che-non-sono-su-github)
5. [Avviare l'app sul proprio PC](#5-avviare-lapp-sul-proprio-pc)
6. [Lavorare con Git: rami e Pull Request](#6-lavorare-con-git-rami-e-pull-request)
7. [Modificare il frontend (React)](#7-modificare-il-frontend-react)
8. [Modificare il backend (Flask)](#8-modificare-il-backend-flask)
9. [Come testare](#9-come-testare)
10. [Regole del progetto](#10-regole-del-progetto)
11. [Problemi frequenti](#11-problemi-frequenti)
12. [Dove approfondire](#12-dove-approfondire)

---

## 1. Come è fatto il progetto

```text
Browser / PWA / app Android
          │  HTTPS
          ▼
        Nginx ── serve l'app React (build di FrontendReact/)
          │
          ├── /api, /ws, /web/admin ──► Flask (API JSON, chat WebSocket, pannello admin)
          │                                 │
          └── /stream, /session ──► FastAPI ──► RabbitMQ ──► gps_worker (percorsi e file GPX)
                                            │
                              PostgreSQL (dati) · Redis (posizioni live, blocco login, chat)
```

Tutto gira in **Docker** con un solo comando: non serve installare Python, PostgreSQL o Redis sul PC. L'app Android
(Capacitor) apre lo stesso sito in una WebView, quindi quasi tutto si prova già nel browser.

| Dove | Cosa c'è |
|---|---|
| `backend/app/api/` | endpoint JSON sotto `/api` (un file per area: `orders.py`, `groups.py`, `sos.py`...) |
| `backend/app/<area>/models.py` | modelli del database (SQLAlchemy) |
| `backend/migrations/versions/` | migrazioni del database (Alembic) |
| `backend/tests/` | test del backend (pytest) |
| `backend/fastapi_app/`, `backend/gps_worker/` | ricezione dei punti GPS e loro elaborazione |
| `backend/nginx/` | configurazione di Nginx (HTTPS, proxy, sicurezza) |
| `FrontendReact/src/pages/` | schermate dell'app |
| `FrontendReact/src/services/` | chiamate all'API |
| `FrontendReact/src/context/` | stato globale (utente, sessione GPS, notifiche, traduzioni) |
| `FrontendReact/src/native/` | codice usato solo nell'app Android |
| `FrontendReact/e2e/` | test end-to-end con un browser vero (Playwright) |
| `FrontendReact/android/` | progetto Android |

**Principio del progetto**: ogni schermata mostra e salva **dati reali** del backend. Niente valori inventati,
`Math.random`, sessioni finte o testi che sembrano veri e non lo sono. Se una funzione non può avere dati reali, si
toglie o si dice chiaramente.

Le scelte di architettura (Docker, cookie di sessione invece di JWT, API JSON in `/api`, chat via WebSocket, app
Android che apre il sito) sono già decise: **non cambiarle senza parlarne prima con il titolare del progetto**.

## 2. Programmi da installare (si parte da Visual Studio Code)

Visual Studio Code serve per **scrivere** il codice, ma da solo non può né scaricare il progetto né farlo partire:
mancano Git (il codice), Docker (che fa girare l'app) e Node.js (il frontend). Si installano una volta sola e sono
tutti gratuiti.

> **Visual Studio o Visual Studio Code?** Sono due programmi diversi. Qui serve **Visual Studio Code**, quello
> leggero (code.visualstudio.com). Il "Visual Studio" grande, quello per C#/.NET, al progetto non serve: se hai
> installato solo quello, installa anche Visual Studio Code.

### 2.1 Cosa installare, in quest'ordine

| # | Programma | Serve per | Dove si prende |
|---|---|---|---|
| 1 | **Git for Windows** | scaricare e condividere il codice. Porta con sé **Git Bash** (il terminale usato da tutti i comandi di questa guida) e `openssl`, che serve per il certificato HTTPS locale | [git-scm.com/download/win](https://git-scm.com/download/win) — vanno bene tutte le opzioni predefinite |
| 2 | **Docker Desktop** | far girare tutta l'app: database, backend, sito. Senza questo non parte niente | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) — su Windows usa WSL 2 (l'installazione lo propone da sola) e chiede un riavvio |
| 3 | **Node.js 22.12 o più recente** | modificare il frontend e lanciare i suoi test. Non serve se ti limiti a usare l'app già costruita da Docker | [nodejs.org](https://nodejs.org) — versione **LTS** |
| 4 | Microsoft Edge o Google Chrome | provare l'app e i test end-to-end | Edge è già su Windows |
| 5 | Android Studio + JDK 21 o 22 | **solo** per chi lavora sull'app Android | vedi [9.4](#94-app-android) |

Su **macOS/Linux** servono le stesse cose: Git e Node.js dal gestore di pacchetti, Docker Engine + plugin Compose v2
(o Docker Desktop), e il terminale di sistema al posto di Git Bash.

Dopo aver installato Git e Docker, **chiudi e riapri Visual Studio Code**: altrimenti non vede i programmi nuovi.

### 2.2 Il terminale: usa Git Bash, non PowerShell

Tutti i comandi di questa guida sono scritti per **Git Bash**. Il terminale che Visual Studio Code apre di suo su
Windows è **PowerShell**, dove parecchie righe non funzionano: `openssl` non si trova e comandi come
`MSYS_NO_PATHCONV=1 docker compose ...` o `E2E_BROWSER_CHANNEL=msedge npx playwright test` danno errore di sintassi.
È la causa più frequente di "il comando della guida non funziona".

Si imposta una volta sola:

1. in Visual Studio Code premi **Ctrl+Shift+P**, scrivi `Terminal: Select Default Profile` e dai invio;
2. scegli **Git Bash** dall'elenco (compare solo se hai già installato Git for Windows);
3. apri un terminale nuovo dal menu *Terminal* → *New Terminal*: in alto a destra del pannello deve comparire `bash`.

Da qui in poi, quando la guida dice "terminale", si intende questo.

### 2.3 Controlla che sia tutto a posto

Nel terminale Git Bash di Visual Studio Code:

```bash
git --version
docker compose version
node -v          # deve essere 22.12 o superiore
openssl version  # arriva con Git for Windows
```

Se uno dei quattro risponde "command not found", quel programma non è installato (o Visual Studio Code è stato aperto
prima di installarlo: chiudilo e riaprilo).

Docker Desktop deve essere **avviato** (icona della balena attiva nella barra vicino all'orologio) prima di usare i
comandi `docker`: la prima volta ci mette un minuto buono a diventare pronto.

### 2.4 Estensioni comode di Visual Studio Code (facoltative)

Nessuna è obbligatoria, ma rendono il lavoro più semplice. Si installano dal pannello *Extensions* (Ctrl+Shift+X)
cercando il nome:

| Estensione | A cosa serve |
|---|---|
| **Docker** (Microsoft) | vedere container e log a riquadri, senza ricordare i comandi |
| **ESLint** | segnala gli errori del codice React mentre scrivi |
| **Python** (Microsoft) | colori e navigazione nel codice del backend |
| **GitLens** | capire chi ha scritto una riga e quando |

## 3. Scaricare il progetto

L'indirizzo da usare è quello del pulsante verde **Code** nella pagina GitHub del repository (scheda HTTPS). Se il
repository è privato, prima chiedi al titolare di invitarti e accetta l'invito che arriva per email o nella pagina di
GitHub. Poi scegli uno dei due modi, sono equivalenti.

**Da Visual Studio Code** (più semplice se non hai mai usato Git):

1. **Ctrl+Shift+P** → scrivi `Git: Clone` → invio;
2. incolla l'indirizzo del repository e scegli la cartella dove tieni i progetti;
3. quando chiede se aprire la cartella clonata, rispondi **Apri**;
4. la prima volta Git chiede di accedere a GitHub: si apre il browser, conferma e basta.

**Dal terminale**, nella cartella dove tieni i progetti:

```bash
git clone <indirizzo-del-repository>
cd <nome-del-repository>
code .                                       # apre la cartella in Visual Studio Code
```

In tutti e due i casi, poi, una volta sola (se non l'hai mai fatto):

```bash
git config user.name "Nome Cognome"
git config user.email "la-tua@email.it"
```

> ⚠️ **Apri sempre la cartella `FRONTEND`**, quella che contiene `backend/` e `FrontendReact/`, non una delle due
> sottocartelle: tutti i comandi della guida partono da lì e il terminale di Visual Studio Code si apre nella
> cartella aperta. Lanciare `npm run build` o i test dal posto sbagliato crea cartelle inutili nella radice.

## 4. Configurazione locale: i file che non sono su GitHub

Alcuni file contengono password o chiavi, quindi **non sono nel repository**: ognuno crea i propri. Git li ignora
già (sono nei `.gitignore`), ma controlla sempre con `git status` di non caricarli. **Non vanno mai inviati in chat
o per email.**

| File | Serve per | Come ottenerlo |
|---|---|---|
| `backend/.env` | configurazione e password dello stack locale | copia di `backend/.env.example` (sotto) |
| `backend/nginx/certs/fullchain.pem` e `privkey.pem` | HTTPS in locale | comando OpenSSL (sotto) |
| `FrontendReact/.env` | `npm run dev` e l'app Android | copia di `FrontendReact/.env.example` |
| `backend/secrets/firebase-service-account.json` | notifiche push | **facoltativo**: senza, le notifiche restano dentro l'app |
| `FrontendReact/android/app/google-services.json` | push nell'app Android | **facoltativo**, come sopra |
| `FrontendReact/android/keystore/` e `keystore.properties` | firma dell'APK dato ai tester | **solo il titolare**: non si condividono |

Tutti i comandi seguenti vanno dati nel terminale **Git Bash** di Visual Studio Code ([sezione 2.2](#22-il-terminale-usa-git-bash-non-powershell)),
o nel terminale di sistema su macOS/Linux, partendo dalla cartella `FRONTEND`.

**`backend/.env`**

```bash
cd backend
cp .env.example .env
```

Apri `backend/.env` in Visual Studio Code (lo trovi nell'elenco a sinistra, dentro `backend`; i file che iniziano
con il punto ci sono, non sono nascosti) e sostituisci ogni `change-me`. Per `SECRET_KEY`, `SECURITY_PASSWORD_SALT`,
`DB_PASSWORD` e `RABBITMQ_PASSWORD` genera un valore casuale per ciascuno con:

```bash
openssl rand -hex 32
```

(solo lettere e numeri: la password del database finisce dentro un indirizzo, quindi niente `/`, `@` o `+`). Il resto
del file può restare com'è: le parti email, ngrok, dominio e Firebase sono facoltative.

**Certificato HTTPS di sviluppo** (sempre dalla cartella `backend/`, vale 365 giorni):

```bash
openssl req -x509 -nodes -newkey rsa:2048 -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem -days 365 -config nginx/certs/req.cnf -extensions v3_req
```

**`FrontendReact/.env`**

```bash
cd ../FrontendReact
cp .env.example .env
```

I valori di esempio vanno già bene per lavorare in locale.

## 5. Avviare l'app sul proprio PC

```bash
cd backend
docker compose up -d --build --wait
```

La prima volta ci vogliono 5–10 minuti: Docker scarica le immagini, costruisce il backend e l'app React e prepara il
database (le migrazioni partono da sole). Le volte successive bastano pochi secondi. Partono dieci servizi: `db`,
`rabbitmq`, `redis`, `web`, `ws` (chat), `fastapi`, `gps_worker`, `nginx`, `backup` (copie in `backend/backups/`) e `maintenance`.
Controlla con `docker compose ps`.

Poi, una volta sola, carica i punti d'interesse della mappa (fontanelle, parcheggi bici...):

```bash
docker compose exec web python -m scripts.import_map_data
```

1. Apri **https://localhost**. Il browser avvisa che il certificato non è sicuro: è normale in locale (è quello che
   hai creato tu). Scegli "Avanzate" → "Continua su localhost".
2. **Registrati**. Il codice fiscale viene calcolato dal modulo in base ai dati inseriti. Senza posta configurata in
   `backend/.env` (il caso normale in locale) l'email non viene verificata; con `MAIL_SERVER` e `MAIL_FROM` arriva un
   codice di 6 cifre da inserire nell'app (oppure: `docker compose exec web flask ror confirm-email la-tua@email.it`).
3. Diventa **amministratore** per creare ordini e bici dal pannello https://localhost/web/admin/:

   ```bash
   docker compose exec web flask ror grant-admin la-tua@email.it
   ```

4. Per usare il GPS attiva **"Sensori e GPS"** nella pagina *Posizione* (è spento per ogni account nuovo).

Per fermare tutto: `docker compose down` (i dati restano). Per ripartire da zero, **cancellando anche il database**:
`docker compose down -v`.

## 6. Lavorare con Git: rami e Pull Request

Non si lavora mai direttamente su `main`: ognuno usa un **ramo** suo e propone le modifiche con una **Pull Request**
(PR), che un'altra persona controlla prima di unirla.

```bash
git checkout main
git pull                                     # prendi le ultime novità
git checkout -b nome/cosa-sto-facendo        # es. marco/filtro-percorsi
```

Mentre lavori:

```bash
git status                                   # cosa è cambiato (controlla che non ci siano .env, chiavi, backup)
git add FrontendReact/src/pages/Percorsi.jsx # aggiungi i file che vuoi salvare
git commit -m "Filtro per data nella pagina Percorsi"
git push -u origin nome/cosa-sto-facendo     # la prima volta; poi basta git push
```

Scrivi i messaggi di commit **in italiano**, dicendo cosa cambia e, se serve, perché.

Poi su GitHub: **Compare & pull request** → verso `main` → compila il modulo della PR (spiega cosa hai fatto e come
l'hai provato; il modulo contiene già la lista dei controlli). La **CI di GitHub** parte da sola a ogni push e
controlla test e build di backend e frontend, le migrazioni e l'APK di prova. **Si unisce a `main` solo con la CI
verde** e dopo la revisione di un'altra persona.

Se nel frattempo `main` è andato avanti, aggiorna il tuo ramo e risolvi gli eventuali conflitti:

```bash
git checkout nome/cosa-sto-facendo
git pull origin main
```

## 7. Modificare il frontend (React)

Con lo stack Docker acceso (sezione 5), per vedere le modifiche all'istante:

```bash
cd FrontendReact
npm install          # la prima volta e quando cambia package.json
npm run dev          # apre http://localhost:3000 e si ricarica a ogni salvataggio
```

`npm run dev` inoltra le chiamate `/api`, `/ws`, `/stream` e `/session` allo stack Docker, quindi login e dati sono
quelli veri del tuo database locale.

Dove mettere le cose:

- **una pagina nuova** in `src/pages/` e la sua rotta in `src/App.jsx`;
- **le chiamate all'API** sempre in `src/services/` usando `src/services/api.js`, che aggiunge il cookie di sessione e
  il token CSRF e converte i nomi da `snake_case` a `camelCase` (mai `fetch` diretti nelle pagine);
- **ogni testo visibile** in `src/context/i18n/it.js`, `en.js` ed `es.js` (tre lingue), usato come
  `t.chiave || 'testo italiano'`;
- **colori e stili** con le variabili di `src/styles/core/variables.css` (tema chiaro e scuro);
- **codice solo per l'app Android** in `src/native/`, attivo con `isNativeApp()`: nel browser non deve cambiare nulla.

I test stanno accanto al codice, in cartelle `__tests__/` (Vitest + Testing Library):

```bash
npm test             # tutti i test unitari
npm run build        # build di produzione + controllo del service worker (deve passare)
```

Per vedere le modifiche anche su https://localhost (il sito servito da Nginx) ricostruisci l'immagine:
`cd ../backend && docker compose up -d --build nginx`.

## 8. Modificare il backend (Flask)

- Gli **endpoint** stanno in `backend/app/api/<area>.py` (blueprint `/api`). Gli errori hanno sempre la forma
  `{error, message, fields?}`.
- I **modelli** stanno in `backend/app/<area>/models.py` e importano `db` da `extensions.py`.
- La **configurazione** si legge da variabili d'ambiente in `backend/config.py`; una variabile nuova va aggiunta
  anche in `backend/.env.example` con un commento.

Il codice del backend è **dentro le immagini Docker**: dopo ogni modifica bisogna ricostruire (`restart` non basta).

```bash
cd backend
docker compose up -d --build web ws maintenance       # Flask
docker compose up -d --build fastapi gps_worker       # solo se hai toccato la parte GPS
docker compose logs -f --tail=100 web                 # log (Ctrl+C per uscire)
```

**Test del backend** (SQLite in memoria, girano nel container senza toccare i tuoi dati). Da Git Bash su Windows:

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm -v "$(pwd -W):/app" --entrypoint "" web sh -c "pip install --user -q -r requirements-dev.txt && python -m pytest -q"
```

Su macOS/Linux usa `$(pwd)` al posto di `$(pwd -W)` (e `MSYS_NO_PATHCONV=1` non serve). I test di `fastapi_app/` e
`gps_worker/` girano con gli altri (`requirements-dev.txt` installa anche le loro dipendenze); quelli di
`tests/test_worker_postgres.py` servono un PostgreSQL migrato (`ROR_WORKER_TEST_DATABASE_URI`) e girano nella CI. Ogni endpoint nuovo ha i suoi
test in `backend/tests/test_api_<area>.py`: la fixture `user_factory` di `tests/conftest.py` crea utenti con password
`password`. Aggiorna anche il contratto dell'API in `FrontendReact/API_CONTRACT.md` (e, se aggiungi un endpoint,
l'elenco in `FrontendReact/src/__tests__/apiContract.test.js`).

**Cambiare il database** (nuova tabella o colonna):

1. modifica il modello;
2. genera la migrazione (il file compare in `backend/migrations/versions/`: rileggilo, a volte va corretto a mano):

   ```bash
   MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W):/app" --entrypoint "" web flask db migrate -m "descrizione breve"
   ```

3. provala su un database PostgreSQL vuoto (salita, controllo, discesa e di nuovo salita):

   ```bash
   docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" migrations_check'
   MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W):/app" --entrypoint "" web sh -c 'export DATABASE_URL="postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@db:5432/migrations_check"; flask db upgrade && flask db check && flask db downgrade && flask db upgrade'
   docker compose exec db sh -c 'dropdb -U "$POSTGRES_USER" migrations_check'
   ```

   `flask db check` deve rispondere "No new upgrade operations detected";
4. `docker compose up -d --build web ws maintenance` applica la migrazione al tuo database.

Il test `tests/test_migrations.py` fallisce se un modello non ha la sua migrazione, e la CI ripete la prova su
PostgreSQL a ogni push.

Comandi utili del backend (`docker compose exec web flask ror <comando>`):

| Comando | A cosa serve |
|---|---|
| `grant-admin <email>` / `revoke-admin <email>` | dare o togliere il ruolo di amministratore |
| `reset-password <email>` | password temporanea per un account (anche il tuo, se l'hai dimenticata) |
| `confirm-email <email>` | conferma a mano l'email di un account nuovo (con la posta attiva, se il codice non arriva) |
| `delete-account <email>` | eliminare un account |
| `purge-expired --dry-run` | vedere cosa verrebbe cancellato dai tempi di conservazione |
| `cleanup-gpx --dry-run` | vedere i file GPX non più collegati a un percorso |
| `send-test-email <email>` / `send-test-push <email>` | provare email e notifiche push (se configurate) |

## 9. Come testare

### 9.1 Test automatici (sempre prima di una Pull Request)

| Test | Comando | Quando |
|---|---|---|
| Frontend | `cd FrontendReact && npm test` | a ogni modifica del frontend |
| Build del frontend | `cd FrontendReact && npm run build` | prima della PR |
| Backend | comando della sezione 8 | a ogni modifica del backend |
| Migrazioni | comandi della sezione 8 | quando cambi un modello |
| End-to-end (browser vero) | `cd FrontendReact && E2E_BROWSER_CHANNEL=msedge npx playwright test` | prima della PR, con lo stack acceso |

I test end-to-end creano account di prova tramite l'API e li cancellano alla fine. Con Chrome usa
`E2E_BROWSER_CHANNEL=chrome`; su macOS/Linux senza Edge né Chrome scarica una volta il browser dei test con
`npx playwright install chromium` e lancia `npx playwright test` senza la variabile. Nginx limita login e registrazione
a 20 richieste al minuto: non lanciarli molte volte di seguito.

### 9.2 Prova a mano nel browser

- **Due utenti insieme**: una finestra normale e una **InPrivate/in incognito** (cookie separati), due account diversi.
- **GPS senza muoversi**: premi F12 → menu ⋮ → *More tools* → **Sensors** → *Location*: scegli una città o scrivi
  latitudine e longitudine. In *Posizione* attiva "Sensori e GPS", poi nella Home premi **VAI**; cambia la posizione
  ogni tanto per "pedalare" e premi **Termina**: il percorso compare in *I miei percorsi* con il file GPX.
  Il rilevamento cadute ha bisogno dell'accelerometro: sul PC non si prova (ci sono i test automatici, oppure il telefono).
- **Consegne**: dal pannello https://localhost/web/admin/ crea un ordine; nell'altra finestra il rider lo accetta, lo
  ritira e lo consegna; i guadagni compaiono in *Panoramica uscite*.
- **Gruppi e chat**: crea un gruppo, invita l'altro account con il codice, scrivete in chat e condividete la posizione.
- **SOS**: dalla Home; il membro del gruppo lo vede nella Home e sulla mappa.
- **Telefono simulato**: F12 → icona del telefono (Ctrl+Shift+M) e larghezza 360 px.
- **Senza rete**: F12 → *Network* → *Offline*.

### 9.3 Sul telefono (PWA)

Per aprire la tua copia locale dal telefono serve un tunnel: **ngrok** ha un piano gratuito (ognuno con il proprio
account). Registrati su ngrok.com, copia l'authtoken e prendi il dominio statico gratuito; poi in `backend/.env`:

```env
NGROK_AUTHTOKEN=il-tuo-token
NGROK_DOMAIN=il-tuo-nome.ngrok-free.dev
```

```bash
cd backend
docker compose --profile ngrok up -d
```

Apri `https://il-tuo-nome.ngrok-free.dev` con Chrome sul telefono, tocca "Visit Site" nella pagina di avviso di ngrok
e installa l'app dal menu ⋮ → "Installa app". Il piano gratuito permette 20.000 richieste al mese: spegni il tunnel
quando non serve (`docker compose --profile ngrok stop ngrok`).

### 9.4 App Android

L'app apre il sito, quindi le modifiche al frontend si vedono nell'app senza ricompilarla (basta aggiornare Nginx).
Serve ricompilare solo se tocchi `FrontendReact/android/`, `src/native/` o i plugin.

- **Emulatore** di Android Studio contro lo stack locale: segui
  [`FrontendReact/android/README.md`](./FrontendReact/android/README.md) (`npm run android:sync:local`,
  `adb reverse tcp:8443 tcp:443`, `cd android && ./gradlew installDebug`, con `JAVA_HOME` su un JDK 21 o 22).
- **Sul tuo telefono**: con il tuo tunnel ngrok acceso, in `FrontendReact/.env` metti
  `CAP_SERVER_URL=https://il-tuo-nome.ngrok-free.dev`, poi `npm run android:sync` e `cd android && ./gradlew assembleDebug`.
  L'APK è in `android/app/build/outputs/apk/debug/app-debug.apk`: copialo sul telefono e installalo (va permessa
  l'installazione da origini sconosciute). Senza `google-services.json` non arrivano le notifiche push, il resto funziona.
- L'APK "ufficiale" per i tester (firmato) lo prepara solo il titolare.

## 10. Regole del progetto

Prima di aprire una Pull Request controlla che:

- [ ] i dati mostrati siano **reali** (nessun valore inventato o fisso che sembri vero);
- [ ] ogni testo nuovo sia nelle **tre lingue** (italiano, inglese, spagnolo); commenti e testi dell'interfaccia in italiano;
- [ ] ci siano i **test** per il codice nuovo e passino tutti (sezione 9.1);
- [ ] un endpoint nuovo sia descritto in `FrontendReact/API_CONTRACT.md`;
- [ ] un modello nuovo o modificato abbia la sua **migrazione** provata su PostgreSQL;
- [ ] un servizio esterno nuovo usato dal frontend sia aggiunto alla CSP (`backend/nginx/snippets/csp.conf`) e alla
      pagina Privacy (`FrontendReact/src/content/privacyNotice.js`);
- [ ] l'accessibilità regga: pulsanti con testo o `aria-label` uguale al testo visibile, contrasto sufficiente nei
      temi chiaro e scuro, uso da tastiera;
- [ ] non ci siano **segreti** nel codice né file `.env`, chiavi, certificati o backup nel commit.

Su Windows lascia a Git l'impostazione predefinita (`core.autocrlf=true`): i file del frontend restano con fine riga
Windows, mentre script `.sh`, file Python e configurazione di Nginx restano sempre in formato Linux grazie a
`backend/.gitattributes` (altrimenti non partirebbero nei container).

## 11. Problemi frequenti

| Problema | Soluzione |
|---|---|
| `MSYS_NO_PATHCONV=1 ...` o `E2E_BROWSER_CHANNEL=... npx playwright test` danno errore di sintassi | stai usando PowerShell: apri un terminale **Git Bash** ([sezione 2.2](#22-il-terminale-usa-git-bash-non-powershell)) |
| `openssl: command not found` (o "termine non riconosciuto") | come sopra: `openssl` arriva con Git for Windows e funziona da Git Bash |
| `docker: command not found` | Docker Desktop non è installato, oppure Visual Studio Code era aperto durante l'installazione: chiudilo e riaprilo |
| In Visual Studio Code non compare "Git Bash" tra i profili del terminale | Git for Windows non è installato, oppure va chiuso e riaperto Visual Studio Code |
| I comandi non trovano i file (`no such file or directory`) | il terminale è nella cartella sbagliata: `pwd` deve finire con `/FRONTEND` (o `/FRONTEND/backend` dove richiesto). Apri in Visual Studio Code la cartella `FRONTEND`, non una sottocartella |
| Docker Desktop non parte su Windows | attiva la virtualizzazione nel BIOS e aggiorna WSL (`wsl --update` da PowerShell) |
| Un container si chiude da solo e riparte (`docker inspect <nome>` dice `OOMKilled: true`) | ha superato il suo `mem_limit` in `docker-compose.yml`: alza il valore di quel servizio invece di togliere il limite |
| `docker compose ps` dice `unhealthy` per `gps_worker` | il worker non elabora più messaggi da oltre due minuti: guarda `docker compose logs gps_worker`. Dopo tre minuti si chiude da solo e Docker lo riavvia |
| `port is already allocated` (80, 443 o 5433) | chiudi il programma che usa la porta (IIS, Skype, un altro Nginx o PostgreSQL) o un altro stack Docker |
| Il browser dice "connessione non privata" | normale in locale: "Avanzate" → "Continua su localhost" |
| La mappa non ha punti d'interesse | `docker compose exec web python -m scripts.import_map_data` |
| "VAI" non parte | attiva "Sensori e GPS" nella pagina *Posizione* e consenti la posizione al browser |
| Login bloccato dopo 10 tentativi | `docker compose exec redis sh -c "redis-cli --scan --pattern 'login_failures:*' \| xargs -r redis-cli del"` |
| Errore 429 su login o registrazione | limite di 20 richieste al minuto: aspetta un minuto |
| Password dimenticata | `docker compose exec web flask ror reset-password la-tua@email.it` |
| Modifica al backend che non si vede | `docker compose up -d --build web ws maintenance` (`restart` non basta) |
| Modifica al frontend che non si vede su https://localhost | `docker compose up -d --build nginx` (con `npm run dev` invece è immediata) |
| Uno script `.sh` dà `$'\r': command not found` | lancialo da Git Bash; se il file ha i fine riga Windows, `git checkout -- <file>` lo ripristina |
| `npm install` fallisce | controlla `node -v` (serve 22.12 o più) |
| I test end-to-end non trovano Edge | usa `E2E_BROWSER_CHANNEL=chrome` oppure `npx playwright install chromium` |
| Le notifiche push non arrivano | normale senza i file di Firebase: le notifiche si vedono dentro l'app |
| Voglio ripartire da zero | `docker compose down -v` (cancella il database locale) e di nuovo la sezione 5 |

## 12. Dove approfondire

- [`FrontendReact/DOCUMENTAZIONE_FRONTEND.md`](./FrontendReact/DOCUMENTAZIONE_FRONTEND.md): architettura del frontend.
- [`FrontendReact/API_CONTRACT.md`](./FrontendReact/API_CONTRACT.md): tutte le API, con esempi.
- [`FrontendReact/android/README.md`](./FrontendReact/android/README.md): app Android.
- [`backend/README.md`](./backend/README.md) e [`backend/info/DOCUMENTAZIONE_TECNICA.md`](./backend/info/DOCUMENTAZIONE_TECNICA.md):
  backend e servizi Docker.
- [`backend/info/GUIDA_PRIVACY_GDPR.md`](./backend/info/GUIDA_PRIVACY_GDPR.md): dati personali e privacy.
- [`backend/DEPLOY.md`](./backend/DEPLOY.md): produzione, backup e PC usato come server per le prove.
- [`PLAN.md`](./PLAN.md) e [`ARCHITECTURE.md`](./ARCHITECTURE.md) (in spagnolo): stato del progetto e decisioni prese.
