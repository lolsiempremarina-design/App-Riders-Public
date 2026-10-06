# 🚴‍♂️ Rider of Riders (RoR) — Frontend React e app Android

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF.svg)](https://capacitorjs.com/)

App per chi lavora in bici: percorsi GPS, rilevamento cadute e SOS, consegne e guadagni, gruppi con chat e bici della
community. Funziona nel browser, come PWA installabile e come **app Android** (Capacitor). Tutti i dati arrivano dal
backend Flask del progetto (`../backend/`), servito da Nginx sullo stesso dominio.

Documentazione: [`DOCUMENTAZIONE_FRONTEND.md`](./DOCUMENTAZIONE_FRONTEND.md) (architettura),
[`API_CONTRACT.md`](./API_CONTRACT.md) (API), [`android/README.md`](./android/README.md) (app Android).
**Per iniziare a lavorare sul progetto** (installazione, avvio, Git, test): [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## ✨ Funzioni

- **🛰️ Sessione GPS** dalla Home: distanza, tempo in movimento, percorso salvato con file GPX; nell'app Android anche a
  schermo spento.
- **🚨 Sicurezza**: rilevamento cadute con conto alla rovescia e SOS automatico, SOS manuale, avvisi ai contatti di
  emergenza (email se configurata) e ai membri dei gruppi.
- **📦 Consegne**: ordini creati dal pannello amministratore, accetta → ritira → consegna, guadagni per giorno ed
  esportazione CSV, punteggio.
- **👥 Gruppi**: codice o link d'invito, ruoli, chat in tempo reale (WebSocket), posizione condivisa sulla mappa.
- **🗺️ Mappa** Leaflet con tessere OpenStreetMap, ricerca indirizzi, punti d'interesse del backend, percorsi e gruppo.
- **🚲 Bici della community** con scheda pubblica, QR code e statistiche reali.
- **🔔 Notifiche** del server nell'app e, nell'app Android, notifiche push (Firebase).
- **🌍 Italiano, inglese e spagnolo**, tema chiaro/scuro, accessibilità (contrasto, tastiera, zoom).
- **🔐 Privacy**: download dei propri dati (JSON), eliminazione dell'account, pagina pubblica per chiederla.

## 🚀 Avvio

Prerequisiti: **Node.js 22.12+** e lo stack Docker del backend in esecuzione (`cd ../backend && docker compose up -d`,
sito su https://localhost).

```bash
npm install
npm run dev        # http://localhost:3000, con proxy verso https://localhost per /api, /ws, /stream, /session
npm test           # test unitari (Vitest)
npm run build      # build di produzione in dist/ + controllo del service worker
```

In Docker la build viene fatta dall'immagine Nginx (`Dockerfile`): dopo una modifica al frontend
`cd ../backend && docker compose up -d --build nginx`. Test end-to-end con lo stack attivo:
`E2E_BROWSER_CHANNEL=msedge npx playwright test`.

App Android (emulatore, APK per i tester, firma, App Links): [`android/README.md`](./android/README.md).

## 🗂️ Struttura

```text
FrontendReact/
├── android/          # progetto Android (Capacitor) con i plugin locali RorMotion e RorSystem
├── e2e/              # test Playwright con account reali creati e cancellati dai test
├── public/           # icone PWA e immagini
├── scripts/          # controllo del service worker, icone, preparazione del progetto Android
├── src/
│   ├── components/   # componenti condivisi (navigazione, modali, chat, sovrapposizione SOS/cadute...)
│   ├── content/      # testi lunghi in 3 lingue (guida, privacy, eliminazione account)
│   ├── context/      # AppContext, sessione GPS (RideTrackingContext), notifiche, i18n
│   ├── native/       # funzioni dell'app Android (GPS e sensori in background, push, condivisione file)
│   ├── pages/        # schermate
│   ├── services/     # client dell'API (cookie di sessione + CSRF)
│   ├── tracking/     # filtri GPS e rilevamento cadute
│   └── utils/        # codice fiscale, esportazione, audio, meteo...
├── capacitor.config.js
└── vite.config.js
```

## 🛠️ Tecnologie

React 18, Vite 8 con vite-plugin-pwa, React Router 7, Leaflet, Capacitor 8 (plugin gratuiti), Vitest 5 e Playwright,
icone Lucide. Servizi esterni usati dal telefono (dichiarati nella pagina Privacy): OpenStreetMap, Nominatim,
Open-Meteo, flagcdn.com e, solo nell'app Android, Firebase Cloud Messaging.

## 📜 Licenza

Non ancora definita (il progetto non contiene un file `LICENSE`).
