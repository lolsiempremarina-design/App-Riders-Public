# RoR - Guida progettuale privacy e GDPR

**Aggiornamento:** 2 ottobre 2026 (app React e app Android, fasi 1–7, pannello admin)  
**Ambito:** promemoria tecnico-organizzativo per la progettazione  
**Avvertenza:** questo documento non è consulenza legale e non certifica la conformità del servizio.

## 1. Perché la privacy è centrale

RoR può trattare dati account, dati anagrafici e codice fiscale, appartenenza a gruppi e messaggi della chat, contatti
SOS, posizione live, tracce GPX, eventi di caduta e allarmi SOS, ordini e compensi, notifiche e, nell'app Android, un
identificativo del telefono per le notifiche push. La geolocalizzazione permette di ricostruire spostamenti, orari e
abitudini; richiede quindi misure proporzionate al contesto e alle finalità reali. Nell'app Android GPS e sensori
continuano anche a schermo spento durante una sessione avviata dal rider (con una notifica fissa sempre visibile).

La posizione non è automaticamente una categoria particolare di dati ai sensi dell'articolo 9 GDPR, ma può comportare rischi elevati e può rivelare indirettamente informazioni molto delicate.

## 2. Stato tecnico attuale

| Dato | Dove viene trattato | Comportamento attuale |
|---|---|---|
| Account e anagrafica | PostgreSQL | solo maggiorenni (18 anni compiuti, controllo del server e dell'app); con la posta configurata l'email va confermata con un codice e un account mai confermato viene eliminato dopo 48 ore; fino all'eliminazione dell'account (dal Profilo, o su richiesta con `flask ror delete-account`) |
| Ruoli, gruppi e chat | PostgreSQL | visibili ai membri del gruppo; messaggi conservati `CHAT_RETENTION_DAYS` (365) |
| Posizione live | Redis | aggiornata durante una sessione GPS, TTL di 90 secondi; i membri dei gruppi la vedono solo se il rider attiva la condivisione |
| Traccia GPX e metadati del percorso | volume Docker, PostgreSQL | alla chiusura della sessione; fino a eliminazione (`ROUTE_RETENTION_DAYS`, 0 = finché il rider non li elimina) |
| Sensori di movimento | solo sul telefono | analizzati sul dispositivo; al server arriva solo una caduta confermata |
| Caduta confermata e allarmi SOS | PostgreSQL | allarmi SOS conservati `SOS_RETENTION_DAYS` (365) |
| Contatti SOS | PostgreSQL | email inviata solo quando parte un SOS e se l'SMTP è configurato |
| Ordini e compensi | PostgreSQL | all'eliminazione dell'account restano senza il nome del rider; gli ordini e le loro notifiche vanno solo ad account attivi, non admin e con l'email confermata |
| Esportazioni CSV del pannello admin | file scaricato dall'amministratore | solo per pagare i rider: username, data, locale, km, importi, puntualità; niente cliente, indirizzi o contenuto. Una volta scaricato il file esce dal server: conservarlo e cancellarlo secondo le regole del titolare |
| Notifiche | PostgreSQL | `NOTIFICATION_RETENTION_DAYS` (180) |
| Token push (app Android) | PostgreSQL + Firebase Cloud Messaging | cancellato al logout, all'eliminazione dell'account, se Firebase lo rifiuta o dopo `PUSH_TOKEN_STALE_DAYS` (60) senza conferme |
| Meteo | Open-Meteo | riceve la posizione arrotondata a circa 1 km |
| Backup | volume/copia esterna | un account eliminato resta nei backup `BACKUP_KEEP_DAYS` (14) |

I tempi si applicano ogni giorno con `flask ror purge-expired` (servizio `maintenance`, attivo sia in produzione sia sul
PC usato come server per le prove) e sono mostrati
all'utente nella pagina Privacy (`GET /api/legal/privacy`). Questa tabella descrive il codice, non stabilisce per quanto
tempo i dati debbano essere conservati in un servizio reale: i valori vanno approvati dal titolare.

## 3. Decisioni obbligatorie per il titolare

Prima di offrire il servizio a utenti reali occorre documentare almeno:

1. titolare del trattamento e contatto privacy (configurati il 28/09/2026 in `PRIVACY_CONTROLLER_NAME` /
   `PRIVACY_CONTACT_EMAIL`: "Proyecto RoR – Rider of Riders"; per un uso reale il titolare dovrebbe essere una persona
   o un ente identificabile);
2. finalità distinta per ogni categoria di dato;
3. base giuridica applicabile a ogni finalità;
4. soggetti autorizzati a vedere posizione, GPX, cadute e contatti SOS;
5. tempi di conservazione e cancellazione, inclusi backup e log;
6. fornitori, subfornitori, luoghi di hosting e trasferimenti internazionali (oggi: OpenStreetMap/Nominatim,
   Open-Meteo e flagcdn chiamati dal telefono; **Google Firebase Cloud Messaging** per le notifiche push dell'app
   Android, che può comportare trasferimenti fuori dall'UE; per le email SOS ai contatti di emergenza il servizio di
   posta configurato in `MAIL_*`, per le prove **Gmail di Google** con un account dedicato al progetto, che riceve
   indirizzo del contatto, nome, telefono e posizione del rider e può comportare trasferimenti fuori dall'UE);
7. modalità di esercizio dei diritti degli interessati;
8. procedura per violazioni dei dati personali;
9. necessità e contenuto di una valutazione d'impatto (DPIA).

## 4. Privacy by design e minimizzazione

- Raccogliere soltanto i campi necessari alla funzione dichiarata.
- Rendere evidente quando il tracking è attivo e chi può vedere la posizione.
- Consentire all'utente di interrompere la condivisione live.
- Mantenere breve il TTL della posizione live e motivare ogni estensione.
- Separare autorizzazioni applicative, accessi tecnici e accessi amministrativi.
- Cifrare il traffico e proteggere database, broker, cache, backup e volume GPX.
- Evitare dati personali e segreti nei log.
- Verificare la cancellazione dei dati collegati quando viene eliminato un account.

## 5. Trasparenza e diritti

L'informativa dovrebbe spiegare con linguaggio chiaro:

- quali dati vengono raccolti;
- perché vengono raccolti;
- chi può consultarli;
- per quanto tempo vengono conservati;
- quali funzioni sono obbligatorie e quali opzionali;
- come revocare un consenso quando il consenso è la base applicabile;
- come chiedere accesso, rettifica, portabilità o cancellazione;
- come contattare il titolare o il DPO, se designato.

L'applicazione dispone della pagina Privacy (dati trattati, servizi esterni, tempi di conservazione presi dal server),
dell'esportazione completa dei dati in JSON (art. 15 e 20), della cancellazione dell'account dal Profilo e della pagina
pubblica `/eliminazione-account` per chiederla anche senza app (richiesta da Google Play). La procedura organizzativa
deve coprire anche copie di backup, log, archivi e sistemi di terzi (es. i token presso Firebase).

## 6. DPIA

L'articolo 35 GDPR richiede una DPIA quando il trattamento previsto può presentare un rischio elevato per i diritti e le libertà delle persone. Tracking sistematico, scala, durata, vulnerabilità degli interessati, combinazione di dati e funzioni di sicurezza sono elementi da valutare nel contesto concreto.

Per RoR è opportuno eseguire e documentare uno screening DPIA prima del rilascio. Se lo screening indica rischio elevato, la DPIA deve precedere il trattamento e descrivere necessità, proporzionalità, rischi, misure e rischio residuo. Se il rischio elevato residuo non può essere mitigato, occorre valutare la consultazione preventiva dell'autorità competente.

## 7. Checklist prima della produzione

- [ ] Registro dei trattamenti completato.
- [ ] Finalità, base giuridica e tempi di conservazione approvati.
- [ ] Informativa e meccanismi di controllo coerenti con il codice.
- [ ] Screening DPIA e, se necessario, DPIA completati.
- [ ] Contratti e ruoli dei fornitori verificati.
- [ ] Backup, restore e cancellazione provati.
- [ ] Gestione centralizzata e rotazione dei segreti.
- [ ] Controlli di accesso e audit log definiti.
- [ ] Piano di risposta agli incidenti e data breach.
- [ ] Test di sicurezza e dipendenze aggiornati.

## 8. Fonti ufficiali

- [Regolamento (UE) 2016/679 - testo consolidato](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EDPB - Data protection impact assessment](https://www.edpb.europa.eu/topics/accountability-and-compliance-tools/data-protection-impact-assessment_en)
- [EDPB - Data protection by design e conformità per PMI](https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en)
- [EDPB - Linee guida DPIA e trattamenti ad alto rischio](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/data-protection-impact-assessments-high-risk-processing_en)

## 9. File tecnici esaminati

- `app/auth/models.py`, `app/auth/account.py` (eliminazione dell'account)
- `app/api/account.py` (esportazione, informazioni privacy), `app/api/devices.py`, `app/push.py` (notifiche push)
- `app/admin/reports.py` (statistiche e CSV del pannello admin)
- `app/cli.py` (`purge-expired`, `delete-account`)
- `fastapi_app/main.py`
- `gps_worker/worker_consumer.py`
- `gps_worker/stream_manager.py`
- `config.py`
- `docker-compose.yml`
- `../FrontendReact/src/content/privacyNotice.js` (testi della pagina Privacy)
