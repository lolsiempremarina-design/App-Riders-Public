# RoR — Rider of Riders

App per chi lavora in bici: percorsi GPS, rilevamento cadute e SOS, consegne e guadagni, gruppi con chat, bici della
community e notifiche. Funziona nel browser, come PWA installabile e come app Android. Tutti i dati arrivano dal
backend del progetto: niente dati inventati.

| Cartella | Contenuto |
|---|---|
| [`backend/`](./backend/) | Flask (API JSON, chat WebSocket, pannello admin), FastAPI + RabbitMQ + worker per il GPS, PostgreSQL, Redis, Nginx, Docker Compose |
| [`FrontendReact/`](./FrontendReact/) | App React (Vite, PWA) e progetto Android (Capacitor) in `FrontendReact/android/` |
| [`docs/`](./docs/) | Presentazione commerciale del progetto |

## Vuoi modificare o provare il progetto?

Leggi **[CONTRIBUTING.md](./CONTRIBUTING.md)**: programmi da installare, configurazione, avvio, come lavorare con
Git e le Pull Request, come modificare frontend e backend, come testare (automatico, a mano, sul telefono, app
Android) e soluzioni ai problemi frequenti.

## Avvio rapido

Su un PC dove c'è **solo Visual Studio Code** mancano tre programmi: installa prima **Git for Windows**, **Docker
Desktop** e **Node.js 22.12+** ([CONTRIBUTING.md, sezione 2](./CONTRIBUTING.md#2-programmi-da-installare-si-parte-da-visual-studio-code)),
poi imposta **Git Bash** come terminale di Visual Studio Code: i comandi qui sotto in PowerShell non funzionano.

Dal terminale Git Bash:

```bash
git clone <indirizzo-del-repository>   # su GitHub: pulsante verde "Code", scheda HTTPS
cd <nome-del-repository>/backend
cp .env.example .env            # poi sostituisci i valori change-me (vedi CONTRIBUTING.md, sezione 4)
openssl req -x509 -nodes -newkey rsa:2048 -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem -days 365 -config nginx/certs/req.cnf -extensions v3_req
docker compose up -d --build --wait
docker compose exec web python -m scripts.import_map_data
```

Apri **https://localhost** (accetta l'avviso del certificato di sviluppo) e registrati. Per il pannello admin:
`docker compose exec web flask ror grant-admin la-tua@email.it`.

## Documentazione

- [CONTRIBUTING.md](./CONTRIBUTING.md): guida completa per chi collabora.
- Frontend: [README](./FrontendReact/README.md), [architettura](./FrontendReact/DOCUMENTAZIONE_FRONTEND.md),
  [API](./FrontendReact/API_CONTRACT.md), [app Android](./FrontendReact/android/README.md).
- Backend: [README](./backend/README.md), [produzione e backup](./backend/DEPLOY.md),
  [documentazione tecnica, funzionale e privacy](./backend/info/),
  [repository su GitHub](./backend/info/GITHUB_SETUP.md) (per chi lo amministra).
- Stato del progetto e prossimi passi: [PLAN.md](./PLAN.md); documentazione dell'architettura: [ARCHITECTURE.md](./ARCHITECTURE.md) (in spagnolo).
