# RoR - Documentazione funzionale

**Versione:** 3.0  
**Aggiornamento:** 28 settembre 2026 (fasi 1–7)  
**Ambito:** funzionalità visibili e comportamento applicativo

## 1. Panoramica

RoR (Rider of Riders) supporta chi lavora in bici: percorsi GPS, sicurezza (cadute e SOS), consegne e guadagni, gruppi
con chat, bici della community e notifiche. L'interfaccia è l'app React (browser, PWA installabile e app Android); Flask
fornisce l'API JSON, la chat in tempo reale, il pannello amministratore e le notifiche push. La telemetria passa da
FastAPI, RabbitMQ e un worker dedicato, senza esporre database, cache o broker.

## 2. Account e profilo

Gli utenti possono:

- registrarsi con nome, cognome, dati di nascita, codice fiscale (calcolato dal comune ISTAT o inserito a mano per i
  nati all'estero e in comuni soppressi o fusi), email, telefono, username e un contatto di emergenza;
- accedere con email o username (blocco dopo 10 tentativi falliti) e restare connessi con "Ricordami";
- modificare profilo, foto, password e contatti SOS;
- scaricare tutti i propri dati (JSON) e consultare la pagina Privacy con titolare e tempi di conservazione;
- eliminare l'account dal Profilo, oppure chiederlo via email dalla pagina pubblica `/eliminazione-account`.

In assenza di email di recupero, l'amministratore può generare una password temporanea con `flask ror reset-password`.

## 3. Sessione GPS, cadute e SOS

- Dalla Home il rider avvia la sessione ("VAI"): distanza, velocità e tempo in movimento; pausa e ripresa; "Termina"
  salva il percorso con file GPX in "I miei percorsi". Senza rete i punti restano sul telefono e partono dopo.
- Durante la sessione accelerometro e giroscopio vengono analizzati sul telefono: dopo urto, rotazione e immobilità
  parte un conto alla rovescia di 10 secondi; se il rider non preme "Sto bene" parte un SOS automatico.
- SOS manuale in qualsiasi momento, con la posizione; avvisati i membri dei gruppi (Home, mappa, notifica) e, se l'SMTP
  è configurato, i contatti di emergenza via email. L'app mostra sempre l'esito reale e propone di chiamare o il 112.
- Nel browser GPS e cadute funzionano con l'app aperta; nell'**app Android** anche a schermo spento (notifica fissa) e la
  caduta rilevata in background compare come avviso di Android.

## 4. Gruppi e chat

Ruoli `owner`, `admin`, `member`; ingresso con codice o link d'invito; gestione dei ruoli; chi esce per ultimo elimina
il gruppo. Chat in tempo reale (WebSocket) con invio della posizione. La posizione live di un membro è visibile solo agli
altri membri dello stesso gruppo e solo se lui attiva "Condividi posizione con i gruppi".

## 5. Mappa

Tessere OpenStreetMap, ricerca indirizzi, punti d'interesse dal database del progetto (fontanelle, servizi igienici,
ciclofficine, parcheggi bici), percorsi salvati, posizioni del gruppo e SOS attivi.

## 6. Consegne e guadagni

Gli amministratori creano gli ordini dal pannello `/web/admin/` (accesso con il login dell'app) e tutti i rider ricevono
una notifica. Il rider accetta (un ordine attivo alla volta), conferma il ritiro e la consegna; prima del ritiro può
rinunciare. Compensi e bonus maturati sono in "Panoramica uscite" con esportazione CSV; l'app non effettua pagamenti.
Punteggio: 10 punti per km, 20 per consegna, 5 in più se puntuale.

## 7. Bici della community

Ogni bici ha una scheda pubblica con QR code, chilometri, CO₂ evitata stimata e rider, calcolati dai percorsi reali. Un
rider collega una bici alla volta; se un altro la prende, il precedente riceve una notifica.

## 8. Notifiche

Il server crea notifiche per nuovi ordini, ordini annullati, SOS dei gruppi, nuovi membri e bici prese da altri. Nell'app
compaiono in "Notifiche" e come banner; nell'**app Android** arrivano anche come notifiche push con l'app chiusa, e
toccandole si apre la pagina giusta.

## 9. Sicurezza percepibile dall'utente

- Accesso con cookie di sessione e protezione CSRF; blocco dopo troppi tentativi e limite di richieste per IP.
- Traffico solo HTTPS; il certificato autofirmato serve esclusivamente allo sviluppo locale.
- Le richieste telemetriche senza sessione restituiscono `401`; l'identità non viene mai presa dal payload del client.
- Il telefono conserva una copia del profilo senza codice fiscale, telefono e dati di nascita.

## 10. Dati trattati e conservazione

Account e anagrafica, contatti SOS, gruppi e messaggi, posizione live temporanea (90 s), percorsi e GPX, cadute e SOS,
ordini e compensi, notifiche, token push dell'app Android. I tempi di conservazione sono configurabili e applicati ogni
giorno (`flask ror purge-expired`); dettaglio in `GUIDA_PRIVACY_GDPR.md`.

## 11. Componenti operativi e verifica

Stack Docker: PostgreSQL, RabbitMQ, Redis, Flask/Gunicorn, FastAPI/Uvicorn, GPS worker, Nginx (con l'app React), backup
giornaliero, manutenzione giornaliera (tempi di conservazione) e, solo per le prove dal telefono, il tunnel ngrok. Il
servizio web applica le migrazioni all'avvio. Ultima verifica
(28/09/2026): 128 test backend, 288 test frontend, e2e 6/6, prova dell'app Android nell'emulatore. Dettagli tecnici e
comandi in `DOCUMENTAZIONE_TECNICA.md` e `GITHUB_SETUP.md`.
