# RoR - Presentazione del progetto

**Rider of Riders**  
**Versione documentazione:** 3.0  
**Aggiornamento:** 28 settembre 2026 (fasi 1–7)

## 1. Obiettivo

RoR è un'app per chi lavora in bici, pensata per rider urbani e gruppi di lavoro. Riunisce percorsi GPS, sicurezza
(rilevamento cadute e SOS), consegne e guadagni, gruppi con chat e posizione condivisa, bici della community e notifiche.

Il progetto separa l'interfaccia (app React: browser, PWA installabile e app Android) dall'API Flask e
dall'elaborazione dei flussi GPS, gestita in modo asincrono. Tutto è gratuito: software open source, tunnel ngrok per
le prove dal telefono e APK distribuito senza store.

## 2. Valore funzionale

- Registrazione con codice fiscale verificato e profilo protetto; eliminazione dell'account e download dei propri dati.
- Sessione GPS con percorso e file GPX; nell'app Android anche a schermo spento.
- Rilevamento cadute con conto alla rovescia e SOS automatico; SOS manuale; avviso ai gruppi e ai contatti di emergenza.
- Consegne: ordini dal pannello amministratore, accetta → ritira → consegna, guadagni e punteggio.
- Gruppi privati con ruoli `owner`, `admin` e `member`, codice o link d'invito, chat in tempo reale.
- Mappa con punti d'interesse per il lavoro su strada e posizione dei membri che la condividono.
- Bici della community con QR code e statistiche reali.
- Notifiche nell'app e notifiche push sul telefono (app Android).
- Italiano, inglese e spagnolo; tema chiaro/scuro; accessibilità verificata.

## 3. Architettura in breve

```text
App React (browser / PWA / app Android)
   |
   v
Nginx (HTTPS, serve l'app React)
   |---------------------|----------------------|
   v                     v                      v
Flask / Gunicorn      FastAPI / Uvicorn      WebSocket chat (Flask)
   |      \              |
   |       \             v
   |        \         RabbitMQ
   |         \           |
   |          \          v
   |           \      GPS worker
   |            \        |
   |----------|--\-------|---------|
              v   v                v
         PostgreSQL  Firebase      Redis
              |      (push)
              v
          Volume GPX
```

Dieci servizi Docker formano lo stack: `db`, `rabbitmq`, `redis`, `web`, `fastapi`, `gps_worker`, `nginx`, `backup`
(copia giornaliera di database e GPX), `maintenance` (tempi di conservazione applicati ogni giorno) e, solo per le prove
dal telefono, `ngrok`.

## 4. Flusso di un turno

1. Il rider accede e preme "VAI" nella Home.
2. L'app invia i punti GPS a blocchi (anche a schermo spento nell'app Android) e analizza i sensori per le cadute.
3. FastAPI verifica la sessione direttamente con Flask; l'identità viene dalla sessione, non dal payload.
4. RabbitMQ accoda i messaggi; il worker aggiorna la posizione live in Redis e accumula i punti validi.
5. Nel frattempo il rider riceve ordini (notifica push), li accetta e li consegna.
6. Alla chiusura il worker genera il GPX, calcola distanza e tempo in movimento e salva il percorso.
7. La posizione live viene eliminata.

## 5. Scelte di sicurezza

- Password con bcrypt e blocco dopo 10 tentativi; cookie di sessione `HttpOnly`, `SameSite=Lax`, `Secure`; CSRF.
- Nginx con HTTPS, intestazioni di sicurezza, Content-Security-Policy e limite di richieste sulle azioni sensibili.
- Separazione tra reti frontend e backend; database esposto solo su localhost (in produzione mai).
- `.env`, chiavi TLS, chiave di Firebase e chiave di firma dell'APK esclusi dal repository e dalle immagini.
- Tempi di conservazione configurabili e applicati ogni giorno; nessun contenuto inventato nell'app.
- Audit automatico delle dipendenze (Python e npm) nella CI.

## 6. Stack principale

| Area | Tecnologia validata |
|---|---|
| App | React 18, Vite 8, React Router 7, Leaflet, PWA (Workbox) |
| App Android | Capacitor 8, plugin gratuiti, Firebase Cloud Messaging |
| Web e API | Flask 3.1.3, Flask-Security-Too 5.8.2, Gunicorn 26.2.0, flask-sock |
| Ingestione | FastAPI 0.141.1, Uvicorn 0.34.0 |
| Runtime | Python 3.12, Node.js 22 |
| Persistenza | PostgreSQL 15, SQLAlchemy 2.0.52 |
| Messaggistica | RabbitMQ 3.13, Pika 1.3.2, Redis 7 |
| Proxy | Nginx Alpine |
| Orchestrazione | Docker Compose |

## 7. Qualità verificata

Collaudo del 28 settembre 2026:

- 128 test automatici del backend superati senza avvisi;
- migrazioni verificate su PostgreSQL vuoto (anche il ritorno alla versione precedente);
- 288 test del frontend superati, build di produzione e controllo del service worker superati;
- 6 test end-to-end con un browser vero (navigazione, consegna completa, chat tra due utenti, app senza rete);
- nessuna vulnerabilità nota nelle dipendenze npm;
- app Android provata nell'emulatore: notifiche push reali, 6 minuti a schermo spento, caduta simulata con SOS,
  link delle bici che aprono l'app.

## 8. Cosa serve prima di un uso reale

- Prove su telefoni Android reali con più rider e calibrazione del rilevamento cadute.
- DPIA quando il trattamento previsto presenta rischio elevato; informativa legale completa.
- Per pubblicarla (facoltativo, con costi): server e dominio, email SMTP, copia esterna dei backup, monitoraggio,
  eventualmente Google Play.
- Definire responsabilità e permessi operativi del team.

## 9. Documenti collegati

- `../README.md`: panoramica e sviluppo del backend; `../DEPLOY.md`: produzione;
- `GITHUB_SETUP.md`: avvio della copia privata;
- `DOCUMENTAZIONE_TECNICA.md`: architettura e operazioni;
- `DocumentazioneFlask.md`: funzionalità;
- `GUIDA_PRIVACY_GDPR.md`: privacy;
- `../../FrontendReact/README.md`, `../../FrontendReact/API_CONTRACT.md`, `../../FrontendReact/android/README.md`.
