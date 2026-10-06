# Il repository su GitHub (per chi lo amministra)

Il progetto è un **unico repository** su GitHub (radice con `backend/` e `FrontendReact/`, dal
28/09/2026). Questa pagina è per chi lo gestisce: accessi, regole di lavoro, CI e cosa non deve mai finire su GitHub.
La guida per chi scarica il progetto e lo modifica è [`CONTRIBUTING.md`](../../CONTRIBUTING.md) nella radice.

## Invitare un collega

- Repository di un account personale: **Settings → Collaborators → Add people**, con il nome utente GitHub del
  collega. Repository di un'organizzazione: **People** (o un **Team**) con permesso **Write** sul repository.
- Il collega accetta l'invito (email o notifica su GitHub) e segue `CONTRIBUTING.md`.
- A fine stage o quando qualcuno esce dal gruppo, togli l'accesso dalla stessa pagina.

Non serve condividere nessun file segreto: ognuno crea il proprio `backend/.env` e il proprio certificato locale, e
senza i file di Firebase tutto funziona (le notifiche restano dentro l'app). Se un collega lavora proprio sulle
notifiche push e ha bisogno dei file Firebase, consegnali di persona (chiavetta) o con un gestore di password
condiviso, **mai** in chat, per email o nel repository. La chiave di firma dell'APK (`FrontendReact/android/keystore/`
e `keystore.properties`) non si condivide con nessuno.

## Regole di lavoro

- **Nessun push diretto su `main`**: ogni modifica arriva con una Pull Request da un ramo personale, con la CI verde e
  la revisione di un'altra persona. Il modulo della PR (`.github/pull_request_template.md`) contiene già i controlli.
- Su GitHub Free la **protezione dei rami** dei repository privati non è disponibile (serve un piano a pagamento),
  quindi questa è una regola del gruppo. Con un piano che la offre: **Settings → Branches → Add rule** per `main`,
  con "Require a pull request before merging" e "Require status checks to pass" (job `backend`, `frontend`,
  `android-apk`).
- Per provare una PR sul proprio PC prima di approvarla:

  ```bash
  git fetch
  git checkout nome/ramo-del-collega
  ```

  poi i test e le prove a mano di `CONTRIBUTING.md` (sezione 9). Dopo un cambio al backend:
  `docker compose up -d --build web ws maintenance`; al frontend: `docker compose up -d --build nginx`.

## CI (GitHub Actions)

`.github/workflows/ci.yml` parte a ogni push e a ogni Pull Request:

| Job | Cosa controlla |
|---|---|
| `backend` | test pytest, migrazioni su PostgreSQL vuoto (salita, controllo, discesa, salita), vulnerabilità note delle dipendenze Python |
| `frontend` | test Vitest, build di produzione con controllo del service worker, `npm audit` |
| `android-apk` | build dell'APK di debug (scaricabile tra gli artefatti della CI) |

I repository privati su GitHub Free hanno **2.000 minuti di Actions al mese** gratuiti: bastano per il lavoro del
gruppo. Se finissero, la CI si ferma fino al mese successivo senza costi (a meno di aver impostato un limite di
spesa diverso da zero nella fatturazione: lascialo a 0).

Facoltativo: per un APK di prova con le notifiche push, crea il secret **`GOOGLE_SERVICES_JSON`** (Settings → Secrets
and variables → Actions → New repository secret) con il contenuto di `FrontendReact/android/app/google-services.json`.
Senza il secret l'APK si costruisce lo stesso, senza push.

## Cosa non deve mai finire su GitHub

`backend/.env` e `FrontendReact/.env`, `*.pem`, `*.key`, `*.csr`, `backend/secrets/*`, `*.jks`, `keystore.properties`,
`google-services.json`, `backend/backups/` (dump del database con dati personali).
Sono tutti nei `.gitignore`; controlla comunque `git status` prima di ogni commit.

Nella cronologia dei commit è rimasto il `google-services.json` del primo commit (configurazione client di Firebase).
Finché il repository è privato non è un problema.

## Se un giorno il repository diventasse pubblico

Prima di cambiarne la visibilità:

- limita la chiave API di Firebase all'app Android (Google Cloud Console → Credenziali → la chiave → restrizione
  "App Android" con pacchetto `com.ror.rider` e impronta SHA-1), perché resta nella cronologia;
- togli dai documenti i dati personali (email del titolare in `ARCHITECTURE.md` e `PLAN.md`, indirizzo del tunnel ngrok);
- scegli una licenza e aggiungi il file `LICENSE`.
