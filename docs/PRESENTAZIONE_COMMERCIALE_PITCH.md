# 🎯 Rider of Riders (RoR) - Presentazione Commerciale B2B
## Pitch Deck per Clienti Enterprise, Flotte di Consegna e Investitori

> 📁 **File PowerPoint generato:** `RoR_Presentazione_Commerciale_B2B.pptx` (formato standard 16:9 Widescreen pronto per Microsoft PowerPoint, Keynote o Google Presentazioni).

> 🆕 **Versione aggiornata (29/09/2026) per investitori e commissione:** `RoR_Presentazione_Investitori_2026.pptx`,
> 20 slide con schermate dell'app reale e note del relatore in ogni slide. Riprende tutti i contenuti di questa versione,
> ma distingue ciò che **funziona oggi** da ciò che è **visione** (hardware IoT, Smart Lock, blockchain, pilota a Milano)
> e aggiorna i numeri: 131 test backend, 294 frontend, 6 end-to-end; conto alla rovescia delle cadute di 10 secondi, non 30.
> Aggiunge la visione "Gig Economy Solidale", le fonti di ricavo, il team, la roadmap del Business Plan 2027–2029 e la
> richiesta di investimento. Le percentuali di questa versione senza fonte (furti, turnover) sono diventate obiettivi da
> misurare nel pilota. Le proiezioni separano il valore delle consegne gestite (€216k → €21,6M) dai ricavi di RoR
> (commissione del 15%, SaaS, marketplace: €37k → €4,3M), con le ipotesi scritte nella slide.

---

## 📑 Struttura delle Slide & Note del Relatore (Speaker Notes)

### Slide 1: Copertina & Visione
- **Titolo:** Rider of Riders (RoR)
- **Sottotitolo:** La rivoluzione IoT per la gestione intelligente delle flotte urbane, la sicurezza dei rider e l'ottimizzazione dell'ultimo miglio.
- **Pillole Tecnologiche:**
  - *IoT & Telemetria Live:* Sensori MPU-6050, GPS & Smart Lock
  - *Frontend PWA Reattivo:* Installabile, Offline-First, 60 FPS
  - *Backend Scalabile:* Microservizi FastAPI + RabbitMQ + Flask
- 🎙️ **Cosa dire (Discorso di vendita):**
  > *"Buongiorno a tutti. Oggi vi presentiamo RoR, la prima piattaforma phygital end-to-end che connette biciclette urbane, intelligenza cloud e dispositivi mobili per trasformare radicalmente l'efficienza e la sicurezza della logistica dell'ultimo miglio."*

---

### Slide 2: Il Problema del Mercato (Pain Points)
- **Punti Chiave:**
  1. **Scatola Nera sulla Flotta:** Impossibilità di sapere in tempo reale posizione, usura e stato operativo effettivo dei mezzi.
  2. **Sicurezza & Incidenti Rider:** Mancanza di sistemi di allarme rapido in caso di cadute, aumentando rischi e responsabilità legali.
  3. **Furti di Biciclette:** Enormi perdite di capitale e blocchi operativi durante i turni di consegna per furti non contrastati.
  4. **Turnover Elevato (Fino al 45% annuo):** Rider demotivati e costi continui di selezione e onboarding.
- 🎙️ **Cosa dire:**
  > *"Chiunque gestisca oggi una flotta di rider a due ruote si scontra con 4 problemi enormi: non sa esattamente come vengono usati i mezzi, teme gli incidenti stradali, subisce continui furti di biciclette e perde i migliori rider a causa della frustrazione sul campo."*

---

### Slide 3: La Nostra Soluzione: Ecosistema Phygital Integrato
- **I 3 Livelli dell'Ecosistema:**
  - **1. Hardware & IoT:** Centralina compatta sul telaio con GPS, accelerometro/giroscopio MPU-6050, batteria dedicata a lunga durata e Smart Lock elettronico blindato.
  - **2. Mobile Experience (PWA):** Web App installabile istantaneamente senza barriere di store, reattiva a 60 FPS, multilingua e funzionante anche offline.
  - **3. Cloud & Analytics:** Architettura ibrida a microservizi (FastAPI per telemetria ad alta frequenza, Flask per la logica di business e RBAC, RabbitMQ per non perdere un singolo dato).
- 🎙️ **Cosa dire:**
  > *"RoR non è solo un'app e non è solo un lucchetto: è un ecosistema phygital completo che fonde il veicolo fisico con il cloud in tempo reale, offrendo controllo totale all'azienda e uno strumento affidabile al lavoratore."*

---

### Slide 4: Frontend PWA - Esperienza Rider Eccellente
- **Vantaggi dell'App:**
  - *Mobile-First & Offline-First:* Il rider non si ferma se entra in galleria o se la rete mobile 4G/5G perde temporaneamente segnale.
  - *Leggerezza Estrema:* Bundle iniziale di soli 48 kB gzip; tempi di avvio istantanei anche su telefoni entry-level.
  - *Mappa e Punti d'Interesse Urbani:* Navigazione con punti acqua potabile, bagni pubblici e ciclo-stalli custoditi a Milano.
  - *Audio Web API Nativo:* Feedback sonori sintetizzati in tempo reale per apertura e chiusura lucchetto.
- 🎙️ **Cosa dire:**
  > *"L'app è stata progettata per la strada: zero fronzoli, massima leggibilità anche sotto la luce diretta del sole, mappe utili e un'autonomia della batteria dello smartphone preservata al massimo grazie all'ottimizzazione estrema del codice."*

---

### Slide 5: Backend & Cloud - Architettura Ibrida Scalabile
- **Componenti Chiave:**
  - **Flask 3.1 & Flask-Security-Too:** Gestione sicura di sessioni, utenti, autenticazione e controllo degli accessi a ruoli (RBAC).
  - **FastAPI:** Microservizio asincrono per l'ingestione massiva di coordinate GPS con latenza sub-secondo.
  - **RabbitMQ & Celery/Worker:** Coda di messaggi affidabile con persistenza per garantire zero data loss durante le ore di punta.
  - **PostgreSQL & Redis:** Database relazionale storicizzato per tracciati GPX e cache ultra-veloce per le sessioni attive.
  - **Docker Compose & Nginx:** Deploy pronto all'uso con containerizzazione modulare su 7 servizi orchestrati.
- 🎙️ **Cosa dire:**
  > *"Sotto il cofano non c'è un giocattolo, ma un'infrastruttura di livello enterprise. Abbiamo separato la gestione utenti dal flusso GPS ad alta frequenza, permettendo al sistema di gestire migliaia di biciclette contemporaneamente senza rallentamenti."*

---

### Slide 6: Sicurezza Salva-Vita: Algoritmo FallDetector & SOS
- **Come Funziona:**
  1. Il sensore MPU-6050 registra una decelerazione o inclinazione anomala indicativa di impatto o caduta.
  2. L'app avvia un conto alla rovescia di emergenza visivo e acustico.
  3. Se il rider non disattiva l'allarme (perché incosciente o impossibilitato), il sistema invia le coordinate GPS ai 5 contatti di emergenza prioritari e alla centrale operativa.
- 🎙️ **Cosa dire:**
  > *"La vita del rider viene prima di tutto. Con il nostro algoritmo FallDetector, se un rider cade di notte su una strada isolata, la famiglia e la centrale operativa ricevono subito la posizione esatta. Questo salva vite e dimezza i tempi di soccorso."*

---

### Slide 7: Gamification, Fidelizzazione e Blockchain
- **Pilastri del Coinvolgimento:**
  - **Punteggio Trasparente (0-100):** Basato su puntualità, guida prudente (dati telemetrici oggettivi) e tasso di completamento corse.
  - **Badge & Livelli (Gold Pro):** Classifiche cittadine che premiano la qualità del servizio anziché la sola velocità sfrenata.
  - **Ricompense Certificate su Blockchain:** Sblocco di bonus economici reali su wallet Infocert.
- 🎙️ **Cosa dire:**
  > *"Invece di incentivare la corsa contro il tempo che provoca incidenti, RoR premia la puntualità calcolata e la sicurezza stradale. I rider virtuosi guadagnano di più e restano con l'azienda, riducendo il turnover del 30%."*

---

### Slide 8: Proposta di Valore B2B (ROI Aziendale)
- **I Numeri del Ritorno sull'Investimento:**
  - **-40% Furti e Smarrimenti:** Il blocco elettronico e il GPS dissuadono i ladri e facilitano il recupero immediato.
  - **-25% Costi Assicurativi:** Certificazione telemetrica della sicurezza stradale per negoziare polizze flotta a tariffe agevolate.
  - **-30% Costi di Turnover:** Maggiore fidelizzazione e soddisfazione del personale.
  - **Manutenzione Preventiva:** Allerte automatiche basate sui chilometri percorsi per revisione freni e copertoni prima che avvengano rotture.

---

### Slide 9: Modello di Business & Monetizzazione
- **Piani Commerciali:**
  - **SaaS B2B (€12 - €19 / mese per bici):** Accesso dashboard flotta, licenza app rider, telemetria e SOS cadute.
  - **Kit Hardware IoT:** Fornitura centralina + Smart Lock (vendita diretta o noleggio operativo mensile).
  - **Enterprise & Partnership:** Integrazione API nei sistemi gestionali aziendali e accordi con officine convenzionate.

---

### Slide 10: Qualità Ingegneristica & Affidabilità
- **Metriche Tecniche Collaudate:**
  - **31 Suite di Test Frontend (164 test passati al 100%)** con Vitest.
  - **14 Test Automatici Backend** con pytest.
  - **1.2 secondi di Build Time** e bundle ultra-ottimizzato.
  - **Heartbeat 25s Ping/Pong** per connessioni WebSocket stabili in mobilità.

---

### Slide 11: Roadmap di Scalabilità
- **Fase 1 (Oggi):** Pilota completato e validato a Milano con tracciati ciclabili, fontanelle e ciclo-hub.
- **Fase 2 (Q1 2027):** Espansione a Torino, Roma, Bologna e accordi quadro con i grandi player del delivery.
- **Fase 3 (Q3 2027):** Intelligenza artificiale per routing predittivo meteo/traffico e manutenzione predittiva automatica.

---

### Slide 12: Chiusura & Call to Action
- **Messaggio Finale:**
  > *"RoR è pronta a trasformare la vostra flotta in un asset tecnologico intelligente, redditizio e sicuro. Parliamo oggi stesso del vostro progetto pilota."*
- **Contatti:** Milano, Italia • partnership@ror-delivery.it
