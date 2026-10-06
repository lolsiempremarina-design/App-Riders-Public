# Contratto API reale Frontend React ↔ Backend Flask — RoR

Questo documento descrive le API **effettivamente implementate** dal backend Flask
(`backend/app/api/`) e usate dal frontend React (`src/services/`).
Viene aggiornato a ogni fase di integrazione.

---

## 1. Architettura e convenzioni

- **Stesso dominio.** Nginx serve la build di React su `/` e inoltra:
  - `/api/*` → Flask (`web:8000`); `/ws/*` → la stessa app Flask nel servizio `ws` (`ws:8000`, chat)
  - `/stream`, `/session/*` → FastAPI (ingestione GPS)
  - `/web/` e `/web/admin/*` → pannello admin di Flask (le vecchie pagine HTML sono state rimosse il 28/09/2026; il resto di `/web/` dà 404)
- **Base URL client:** `VITE_API_URL=/api` (in sviluppo il proxy di Vite inoltra a `https://localhost`).
- **Autenticazione:** cookie di sessione di Flask-Security (`session`, `remember_token`), HttpOnly + Secure + SameSite=Lax.
  Il frontend invia sempre `credentials: 'include'`. **Non** si usano JWT né token in `localStorage`.
- **CSRF:** ogni richiesta `POST/PUT/PATCH/DELETE` deve avere l'header `X-CSRFToken: <token>`.
  Il token si ottiene da `GET /api/auth/csrf` ed è incluso anche nelle risposte di sessione/login/registrazione (`csrf_token`).
  Se scade, il server risponde `400 {"error": "csrf_error"}` e il client ne richiede uno nuovo e riprova una volta.
- **Formato:** JSON UTF-8, chiavi `snake_case` nel backend. Il client le converte automaticamente in `camelCase`.
- **Cache:** tutte le risposte `/api/*` hanno `Cache-Control: no-store`.

### Formato degli errori

```json
{ "error": "validation_error", "message": "Some fields are not valid.", "fields": { "email": "This email is already registered." } }
```

`message` e i testi di `fields` sono nella lingua dell'app: `src/services/api.js` invia `Accept-Language` con la lingua
attiva (`it`, `en`, `es`; le altre lingue dell'elenco ricevono l'inglese, codici sconosciuti l'italiano) e il server li
traduce con `backend/app/api/messages.py` (`tests/test_api_messages.py` fallisce se un messaggio nuovo non ha le
traduzioni). Senza l'header: inglese. Gli errori della chat (WebSocket) seguono la lingua del profilo. Il codice
`error` non cambia mai. Le etichette dei campi nella lista degli errori vengono da `t.fieldLabels`.

| Status | `error` | Significato | Comportamento del frontend |
|---|---|---|---|
| 400 | `bad_request` / `csrf_error` | Dati mancanti / token CSRF non valido | Messaggio / nuovo token + retry |
| 401 | `unauthorized` | Sessione assente o scaduta | Evento `ror:unauthorized` → login |
| 401 | `invalid_credentials` | Login errato | Messaggio nel form |
| 403 | `forbidden`, `account_disabled`, `invalid_password` | Operazione non permessa | Messaggio |
| 404 | `not_found` | Risorsa inesistente | Messaggio |
| 409 | `conflict`, `already_authenticated`, `active_order_exists`, `order_unavailable`, `invalid_transition` | Conflitto con dati esistenti / stato dell'ordine cambiato | Messaggio (e aggiornamento dell'elenco ordini) |
| 422 | `validation_error` | Campi non validi (`fields`) | Elenco errori per campo |
| 429 | `too_many_requests` | Troppi tentativi di login (10 in 15 min) o troppe richieste di accesso dallo stesso IP (nginx) | Messaggio |
| 5xx | `server_error` | Errore interno | Messaggio generico |

---

## 2. Autenticazione e sessione (`/api/auth`) — Fase 1 ✅

### `GET /api/health`
`200 {"status": "ok"}`

### `GET /api/auth/csrf`
`200 {"csrf_token": "..."}`

### `GET /api/auth/session`
Non restituisce mai 401: serve all'avvio dell'app per sapere chi è connesso.
```json
{ "authenticated": true, "user": { ...User }, "csrf_token": "..." }
```

### `POST /api/auth/login`
Body: `{"identity": "email o username", "password": "...", "remember": true}`
- `200` → come `/auth/session` (autenticato)
- `401 invalid_credentials`, `403 account_disabled`, `429 too_many_requests`

### `POST /api/auth/logout`
`200 {"authenticated": false, "user": null, "csrf_token": "..."}`

### `GET /api/auth/me`
`200 User` · `401 unauthorized`

### `POST /api/auth/register`
```json
{
  "username": "mario_rossi",
  "email": "mario@example.com",
  "password": "********",
  "password_confirm": "********",
  "first_name": "Mario",
  "last_name": "Rossi",
  "date_of_birth": "1985-08-01",
  "gender": "M",
  "birth_city_country": "Roma (RM)",
  "tax_id_code": "RSSMRA85M01H501Q",
  "phone_number": "+39 348 1234567",
  "avatar": "data:image/jpeg;base64,... (opzionale, max 512 KB)",
  "language": "it",
  "remember": true,
  "sos_contact": { "name": "Maria Rossi", "phone": "+39 333 9876543", "email": "maria@example.com" }
}
```
- Il codice fiscale viene verificato contro nome, cognome, data di nascita e genere.
- Solo maggiorenni: almeno 18 anni compiuti alla data di oggi (fuso `APP_TIMEZONE`), altrimenti errore su `date_of_birth`.
  Il campo data della registrazione non accetta date più recenti (`latestAdultBirthDate` in `src/utils/authUtils.js`).
- `username`, `email`, `tax_id_code`, `phone_number` devono essere unici (senza distinzione maiuscole/minuscole).
- Password: 8–128 caratteri.
- `201` → sessione già attiva (come `/auth/session`) · `422 validation_error` con `fields` · `409 already_authenticated`

### `POST /api/auth/delete-account`
Body: `{"password": "..."}` → `200 {"success": true, ...}` · `403 invalid_password`
Elimina utente, contatti SOS, gruppi, percorsi GPX, cadute e posizione live.

### Oggetto `User`
```json
{
  "id": 7, "username": "mario_rossi", "email": "mario@example.com",
  "first_name": "Mario", "last_name": "Rossi", "full_name": "Mario Rossi",
  "phone_number": "+39 348 1234567", "tax_id_code": "RSSMRA85M01H501Q",
  "date_of_birth": "1985-08-01", "gender": "M", "birth_city_country": "Roma (RM)",
  "language": "it", "sensors_enabled": false, "share_location_with_groups": false,
  "avatar": null, "roles": [], "is_admin": false,
  "email_confirmed": true, "pending_email": null
}
```

### Conferma dell'email (solo con la posta configurata: `MAIL_SERVER` e `MAIL_FROM`)
Con la posta attiva un account nuovo riceve un codice di 6 cifre (valido 24 ore, al massimo 5 tentativi, un nuovo
codice al massimo ogni 60 s) e finché non lo inserisce `email_confirmed` è `false`: le altre API rispondono
`403 {"error": "email_not_confirmed"}` (restano `/auth/me`, `/settings`, `/devices`, `/auth/delete-account` e queste)
e l'app porta a `/conferma-email`. Anche `/auth/check_session` (FastAPI) risponde 401. Un indirizzo nuovo dal
Profilo resta in `pending_email` e sostituisce il vecchio solo dopo il suo codice. Gli account mai confermati
vengono eliminati dopo 48 ore (`flask ror purge-expired`). Senza posta configurata tutto resta come prima.

| Endpoint | Body → Risposta |
|---|---|
| `GET /api/auth/confirm-email` | → `{"confirmed", "email" (dove è andato il codice), "resend_in_sec", "mail_configured"}` |
| `POST /api/auth/confirm-email` | `{"code": "123456"}` → sessione con l'utente aggiornato · `422` (`code` sbagliato o scaduto) · `409 nothing_to_confirm` |
| `POST /api/auth/confirm-email/resend` | `{"email"?}` → come il `GET` · con `email` corregge l'indirizzo (account nuovo) o cambia quello da confermare · `429 code_wait` con `retry_after` · `503 email_not_configured` / `email_not_sent` |
| `DELETE /api/auth/confirm-email` | → sessione: annulla il cambio di email (non per un account nuovo) |


---

## 3. Profilo, contatti SOS e impostazioni — Fase 2 ✅

Tutti richiedono la sessione (`401 unauthorized` altrimenti).

### `GET /api/profile`
```json
{ "user": { ...User }, "stats": { "rides_count": 7, "total_distance_km": 42.5, "total_duration_min": 135.0 } }
```
Le statistiche sommano i percorsi GPS registrati (`rider_shifts`); `total_duration_min` è il tempo in movimento.

### `PATCH /api/profile`
Campi facoltativi: `username`, `email`, `phone_number`, `avatar` (`data:image/...;base64`, max 512 KB; `null` rimuove la foto).
Nome, cognome, codice fiscale e ruoli **non** sono modificabili. Risposta come `GET /api/profile` · `422` con `fields`.
Con la posta configurata una nuova `email` va in `user.pending_email` e la risposta ha `"email_confirmation_sent"`.

### `POST /api/profile/password`
Body: `{"current_password": "...", "new_password": "...", "new_password_confirm": "..."}`
`200 {"success": true, ...sessione}` — la sessione corrente resta attiva, gli altri dispositivi vengono disconnessi.

### `GET /api/sos-contacts`
`{"contacts": [SOSContact], "max_contacts": 5}` ordinati per priorità (2 alta → 0 bassa).

### `POST /api/sos-contacts`
Body: `{"name": "...", "phone": "...", "relationship": "...", "email": "...", "priority": 1}` → `201 SOSContact` · `409 limit_reached` (max 5) · `422`

### `PATCH /api/sos-contacts/<id>` · `DELETE /api/sos-contacts/<id>`
Solo contatti propri (`404` per quelli di altri utenti).

`SOSContact`: `{"id", "name", "phone", "email", "relationship", "priority", "created_at"}`

### `GET /api/settings` · `PATCH /api/settings`
```json
{ "language": "it", "sensors_enabled": true, "share_location_with_groups": false }
```
`language` accetta qualunque codice di 2 lettere supportato dall'app. Disattivando sensori o condivisione, la posizione live viene cancellata subito da Redis.

---

## 4. Statistiche, percorsi, gruppi e mappa — Fase 3 ✅

Tutti richiedono la sessione (`401 unauthorized`), tranne i punti d'interesse della mappa.

### Statistiche (`/api/stats`)

Calcolate da dati reali: i percorsi GPS (`rider_shifts`, scritti dal GPS worker; la tabella `activities` della
vecchia pagina `/telemetry/activity` è stata eliminata il 29/09/2026).
Date salvate in UTC e raggruppate nel calendario locale del rider (`APP_TIMEZONE`, predefinito `Europe/Rome`).
Un percorso GPS è attribuito al suo **inizio** (`started_at`, primo punto GPS; per i percorsi più vecchi `created_at` − durata).

Oggetto `Summary`:
```json
{
  "count": 2, "distance_km": 25.0, "duration_sec": 5400, "avg_speed_kmh": 16.67,
  "best_speed_kmh": 20.0,
  "pause_sec": 600, "pause_unknown_count": 1
}
```
- `duration_sec`: tempo **in movimento** (il worker esclude gli intervalli senza punti GPS più lunghi di
  `PAUSE_GAP_SEC`, 120 s); la velocità media si calcola su questo.
- `best_speed_kmh`: miglior velocità **media** di una singola uscita (non esiste un picco istantaneo registrato).
- `pause_sec`: pause dei percorsi, cioè il tempo tra il primo e l'ultimo punto GPS (`started_at`/`ended_at` di
  `rider_shifts`) che non è tempo in movimento. Tempo in sella della pagina Tempo Totale = `duration_sec` + `pause_sec`.
- `pause_unknown_count`: percorsi più vecchi senza l'ultimo punto registrato (e senza più il GPX da cui la
  migrazione `c3f8a1d6e2b9` lo ricava): le loro pause non si stimano, contano solo con il tempo in movimento.

#### `GET /api/stats/period?period=week|month|year|always`
```json
{
  "period": "week", "today": "2026-09-24", "timezone": "Europe/Rome",
  "summary": { ...Summary },
  "buckets": [
    { "key": "2026-09-24", "start": "2026-09-24", "end": "2026-09-24", "summary": { ...Summary },
      "series": [ { "key": "11:00", "count": 1, "distance_km": 15.0, "duration_sec": 3600, "avg_speed_kmh": 15.0 } ] }
  ]
}
```
| period | buckets (dal più vecchio) | `key` dei bucket | `key` della serie |
|---|---|---|---|
| `week` | ultimi 7 giorni (oggi incluso) | `YYYY-MM-DD` | ora `HH:00` |
| `month` | ultimi 6 mesi (corrente incluso) | `YYYY-MM` | giorno `YYYY-MM-DD` |
| `year` | anni con dati + anno corrente | `YYYY` | mese `YYYY-MM` |
| `always` | uno solo (dalla prima uscita a oggi) | `all` | mese `YYYY-MM` |

La serie contiene solo i punti con uscite. `400 bad_request` per un periodo non valido.

#### `GET /api/stats/overview`
```json
{ "today": "2026-09-24", "timezone": "Europe/Rome",
  "days": [ { "date": "2026-09-18", ...Summary }, "... 7 giorni ..." ],
  "week": { ...Summary }, "all_time": { ...Summary } }
```

### Percorsi GPS (`/api/routes`)

`Route`:
```json
{ "id": 7, "session_id": "…", "started_at": "2026-09-24T11:00:00", "ended_at": "2026-09-24T11:30:00",
  "distance_km": 12.0, "duration_sec": 1800, "avg_speed_kmh": 24.0, "has_gpx": true }
```
Orari in ora locale (`APP_TIMEZONE`): `ended_at` è l'ultimo punto GPS (per i percorsi più vecchi l'ora di chiusura).
`duration_sec` è il tempo in movimento. `has_gpx` è `false` se il file manca o è fuori da `GPX_STORAGE_DIR`.

- `GET /api/routes?limit=20&offset=0` → `{"routes": [Route], "total", "limit", "offset"}` (più recenti prima, `limit` max 100)
- `GET /api/routes/<id>` → `Route` + `"points": [[lat, lon, "ISO time"|null], ...]` (max 5000 punti)
- `GET /api/routes/<id>/gpx` → file `application/gpx+xml` in download (`ror-percorso-AAAA-MM-GG_HH-MM.gpx`) · `404` se non disponibile
- `DELETE /api/routes/<id>` → `{"success": true, "id": 7}` (elimina anche il file GPX)

Solo i propri percorsi: quelli di altri utenti rispondono `404`.

### Gruppi (`/api/groups`)

`Group` (elenco) e `GroupDetail` (dettaglio):
```json
{ "id": 3, "name": "Rider Navigli", "description": "…", "code": "abc-defg-hij", "my_role": "owner",
  "member_count": 3, "sharing_count": 1, "created_at": "…", "joined_at": "…",
  "members": [ { "user_id": 1, "username": "…", "first_name": "…", "avatar": null, "role": "owner",
                 "joined_at": "…", "is_me": true, "is_sharing_location": false } ],
  "can_manage": true, "invite_token": "…" }
```
`members`, `can_manage` e `invite_token` solo nel dettaglio; `invite_token` solo per `owner`/`admin`
(il frontend costruisce il link `https://<dominio>/gruppi?invito=<token>` e chiede conferma prima di unirsi).
`sharing_count` / `is_sharing_location`: membri con sensori e condivisione attivi e una posizione in Redis (< 90 s).

| Metodo e percorso | Chi | Body → Risposta |
|---|---|---|
| `GET /api/groups` | utente | → `{"groups": [Group]}` |
| `POST /api/groups` | utente | `{name (2-100), description? (≤255)}` → `201 GroupDetail` (diventa `owner`) · `422` |
| `POST /api/groups/join` | utente | `{code}` oppure `{token}` → `201 {"joined": true, "already_member": false, "group"}` · `200` se già membro · `422` codice errato · `404 invalid_invite` |
| `GET /api/groups/<id>` | membro | → `GroupDetail` · `404` se non membro |
| `PATCH /api/groups/<id>` | owner/admin | `{name?, description?}` → `GroupDetail` |
| `POST /api/groups/<id>/code` | owner/admin | → `GroupDetail` con nuovo codice (il vecchio non vale più) |
| `POST /api/groups/<id>/invite` · `DELETE /api/groups/<id>/invite` | owner/admin | nuovo link / link disattivato → `GroupDetail` |
| `PATCH /api/groups/<id>/members/<user_id>` | owner | `{role: "admin"\|"member"}` → membro · `400` su sé stessi |
| `DELETE /api/groups/<id>/members/<user_id>` | sé stessi / owner / admin (solo `member`) | → `{"success": true, "group_deleted": bool}` |
| `GET /api/groups/<id>/positions` | membro | → `{"positions": [{"user_id", "username", "lat", "lon", "ts"}], "ttl_sec": 90}` (`ttl_sec` = `POSITION_TTL` del `.env`, 90 di default) |
| `GET /api/groups/positions` | chiunque | posizioni dei membri di tutti i miei gruppi, ognuno una volta (la `Mappa` le chiede ogni 20 s con una richiesta sola) → `{"positions": [...], "group_count", "ttl_sec": 90}` |
| `POST /api/groups/position` | utente | `{lat, lon}` → `{"success": true, "expires_in_sec": 90}` (dura `POSITION_TTL` secondi, come la posizione della sessione GPS e il valore della pagina Privacy) · `403 location_sharing_disabled` · `422` |

Uscita dal gruppo: se esce l'`owner` la proprietà passa al primo `admin` (o al membro più anziano);
se esce l'ultimo membro il gruppo viene eliminato. Le posizioni sono visibili solo se il membro ha
`sensors_enabled` **e** `share_location_with_groups` attivi (controllato a ogni lettura).

### Punti d'interesse della mappa (`/api/v1`, pubblici)

`GET /api/v1/bicycle-parkings?gh5=u0nd9,u0nd3` · `GET /api/v1/fountains?gh5=…` · `GET /api/v1/toilets?gh5=…` · `GET /api/v1/bicycle_repair?gh5=…`
→ array di punti `{id, lat, lng, ...campi del tipo}` nelle celle geohash a 5 caratteri richieste (`400` senza `gh5`).
Dati importati da `backend/scripts/data/*.csv` con `python -m scripts.import_map_data`.
Il frontend li chiede da zoom 14 in su, al massimo 20 celle per richiesta, con cache per cella.

## 5. Tracciamento GPS, cadute e SOS — Fase 4 ✅

### Sessione di guida (FastAPI, stesso dominio, cookie di sessione Flask)

Gestita da `RideTrackingContext` (globale: continua cambiando pagina; salvata in `localStorage` e ripristinata "in pausa").
Richiede `sensors_enabled` (altrimenti FastAPI risponde `403` e l'app chiede di attivare "Sensori").

#### `POST /stream`
Body: **array** di punti (massimo 200, altrimenti `422`), inviati a blocchi ogni 20 s; in caso di errore restano in coda e
si reinviano in ordine, e dopo un tratto senza rete gli arretrati partono in più richieste da 200 (`STREAM_MAX_POINTS`):
```json
[{ "session_id": "uuid-v4", "lat": 45.46, "lon": 9.19, "speed_kmh": 18.0, "timestamp": 1790000000000,
   "is_confirmed_fall": false, "is_cancelled_fall": false }]
```
- Un punto per ogni spostamento vero (`src/tracking/geo.js`): precisione ≤ 50 m, niente salti > 90 km/h, timestamp
  crescenti, almeno 15 m dall'ultimo punto (1,5 × la precisione se è peggiore, fino a 40 m) ad almeno 2 km/h. Da fermi
  (posizione che "balla" entro quel margine) un punto ogni 15 s **con le coordinate del punto precedente** e `speed_kmh: 0`.
- `is_confirmed_fall: true` solo sul punto inviato quando una caduta diventa SOS → il worker scrive `fall_events`.
- `200 {"status": "ok", "count": n}` · `401` sessione assente · `403` sensori disattivati · `503` RabbitMQ non disponibile.

#### `POST /session/end`
Body `{"session_id": "..."}` → il GPS worker scrive il GPX e la riga `rider_shifts`:
- distanza sulla traccia completa (la semplificazione RDP serve solo al file GPX);
- `duration_min` = **tempo in movimento**: gli intervalli senza punti oltre `PAUSE_GAP_SEC` (120 s, pausa nell'app o fermo) non contano;
- stessa regola dell'app sul server (`MIN_MOVE_M` = 15, `MIN_MOVING_SPEED_KMH` = 2): un tratto più corto o più lento non
  aggiunge né distanza né tempo, quindi soste e "ballo" del GPS da fermi restano fuori;
- `started_at` = primo punto GPS (UTC). `GET /api/routes` e le statistiche usano questo orario.
- Se l'app non riceve la risposta (il percorso però è salvato) e il rider riprende la stessa sessione, i punti nuovi
  arrivano dopo la fine salvata: alla chiusura seguente si aggiungono allo stesso percorso (distanza e tempo sommati,
  stesso inizio). Una chiusura ripetuta senza punti nuovi non cambia nulla.

### Rilevamento cadute (nel browser)

Porting di `FallDetector.js` / `SignalProcessor.js` in `src/tracking/` (20 Hz, stessi parametri): impatto
(accelerazione ≥ 30 m/s², ×1.4 su pavé, jerk ≥ 250) + rotazione ≥ 200 °/s entro 1 s + velocità media ≤ 3,5 km/h
nei 3 s successivi. Poi 10 s di conto alla rovescia: "Sto bene" annulla, altrimenti SOS con `source: "fall"`.
`HeadingEstimator.js` non è stato portato: la sua orientazione non era usata né dal rilevatore né dal server.

### SOS (`/api/sos`)

`SOSAlert`:
```json
{ "id": 4, "source": "manual", "status": "active", "lat": 45.46, "lon": 9.19, "accuracy_m": 12,
  "map_url": "https://www.openstreetmap.org/?mlat=...", "emails_sent": 1,
  "created_at": "2026-09-25T12:00:00", "resolved_at": null }
```

| Metodo e percorso | Body → Risposta |
|---|---|
| `POST /api/sos` | `{source: "manual"\|"fall", lat?, lon?, accuracy_m?, session_id?, request_id?}` → `201 {"alert", "created": true, "notifications", "contacts": [SOSContact]}` · `200` con `created: false` se esiste un SOS attivo di meno di 60 s (nessuna email duplicata, posizione aggiornata) **o un SOS con lo stesso `request_id`, di qualsiasi età** · `422` (anche `request_id` che non è un UUID). `request_id`: UUID scelto dall'app per ogni SOS e rimandato uguale a ogni tentativo automatico (dal 05/10/2026 l'app riprova da sola finché l'SOS non arriva: 5, 10, 20, poi ogni 30 s); se un tentativo era arrivato e si era persa solo la risposta, il server restituisce quell'SOS invece di avvisare di nuovo i contatti. Facoltativo per le versioni precedenti dell'app |
| `POST /api/sos/<id>/resolve` | → `{"alert"}` (ai membri dei miei gruppi arriva la notifica `sicurezza` "✅ … sta bene"; se erano partite email, ai contatti arriva "sta bene"; solo la richiesta che chiude davvero l'SOS avvisa: con un doppio tocco una volta sola) · `404` se non è mio |
| `GET /api/sos/active` | → `{"mine": SOSAlert\|null, "groups": [SOSAlert + "user_id", "username", "phone_number"]}` (SOS attivi dei membri dei miei gruppi, ultime 6 h) |

`notifications`: `{"email_configured", "emails_sent", "emails_failed", "contacts_with_email", "group_members"}`.
I membri dei miei gruppi ricevono la notifica `sicurezza` "🚨 SOS da …" prima delle email ai contatti (un server di
posta lento o irraggiungibile la ritardava di decine di secondi).
Le email ai contatti con indirizzo partono solo se è configurato SMTP (`MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`,
`MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`); l'app mostra sempre l'esito reale e offre chiamata / SMS
precompilato ai contatti e il 112.

## 6. Consegne, guadagni, notifiche, punteggio, bici e chat — Fase 5 ✅

### Ordini (`/api/orders`)

Gli ordini li crea un amministratore dal pannello Flask `/web/admin/` (vedi sotto); i rider li accettano (o
l'amministratore li assegna a un rider), li ritirano e li consegnano dall'app (`Consegne.jsx`, `orderService`). Stati: `available` → `accepted` → `picked_up` → `delivered`
(oppure `cancelled` dal pannello). Un rider ha **al massimo un ordine attivo** (`accepted` o `picked_up`).

`Order` (orari locali Europe/Rome):
```json
{ "id": 12, "restaurant": "Pizzeria Da Mario", "pickup_address": "Via Padova 10", "delivery_address": "Via Tazzoli 13",
  "customer_name": "Luca", "items": "2 pizze", "notes": null, "distance_km": 2.4,
  "pay": 4.5, "bonus": 1.0, "total": 5.5, "status": "available",
  "created_at": "2026-09-25T12:00:00", "expires_at": "2026-09-25T12:10:00", "due_at": "2026-09-25T12:40:00",
  "accepted_at": null, "picked_up_at": null, "delivered_at": null,
  "seconds_left": 540 }
```
`seconds_left` solo per gli ordini `available` con scadenza dell'offerta; `on_time` (bool) solo per quelli `delivered`
con `due_at` (consegna promessa).

| Metodo e percorso | Body → Risposta |
|---|---|
| `GET /api/orders/available` | → `{"orders": [Order]}` (offerte non scadute, max 50, le più recenti prima) |
| `GET /api/orders/active` | → `{"order": Order\|null}` (il mio ordine in corso) |
| `POST /api/orders/<id>/accept` | → `{"order"}` · `409 active_order_exists` se ne ho già uno · `409 order_unavailable` se l'ha preso un altro rider o l'offerta è scaduta (aggiornamento condizionale: con due accettazioni simultanee ne vince una) |
| `PATCH /api/orders/<id>/status` | `{"status": "picked_up"\|"delivered"\|"released"}` → `{"order"}` · `released` (solo prima del ritiro) lo rimette tra i disponibili: gli altri rider ricevono "Di nuovo disponibile" (se l'offerta è scaduta nessun rider lo vede: la notifica "Ordine da riproporre" va agli amministratori) · `409 invalid_transition` · `404` se non è mio · `422` |
| `GET /api/orders/completed?period=today\|week\|month\|year\|all` | → `{"period", "orders": [Order], "summary"}` |
| `GET /api/rider/earnings?period=…` (default `week`) | → `{"period", "start", "today", "summary", "days": [{date, deliveries, earnings, distance_km, duration_sec, rides}]}` (giorni più recenti prima) |

`summary`: `{"deliveries", "pay", "bonus", "earnings", "distance_km", "on_time_rate"|null}`; in `/api/rider/earnings` anche
`ride_distance_km` e `ride_duration_sec` (percorsi GPS del periodo). `week` = ultimi 7 giorni compreso oggi, `month`/`year` =
dal primo del mese/anno. I guadagni sono **maturati** (pay + bonus degli ordini consegnati): l'app non gestisce pagamenti.

### Pannello amministratore (Flask, `/web/admin/`)

Solo utenti con ruolo `admin` (`flask ror grant-admin <email>` / `flask ror revoke-admin <email>`); in React la voce
"Pannello amministratore" di `Altro` compare se `user.is_admin`. Non c'è un login Flask: il pannello usa il cookie di
sessione dell'app. Senza sessione rimanda a `/accedi?next=/web/admin/...` e, dopo l'accesso, l'app torna alla pagina
del pannello (`next` accettato solo se inizia con `/web/admin`). `/web/` porta al pannello (gli utenti non admin
tornano all'app). `GET /auth/check_session` (solo interno, da FastAPI su `web:8000`) → 200 `{user_id, authenticated,
sensors_enabled, share_location_with_groups}` o 401 `{authenticated: false}`.
"Rider" = account attivo, non admin e con l'email confermata (quando la conferma è attiva): solo loro ricevono gli
ordini e le notifiche dei nuovi ordini.
- `/web/admin/` — elenco ordini (50 per pagina) con filtro per stato e per rider (`?status=`, `?rider=<id>`) e contatori.
- `/web/admin/orders/<id>` — scheda dell'ordine con tutti i dati e gli orari; da qui si modifica, si assegna e si annulla.
- `/web/admin/orders/new` — nuovo ordine: locale, indirizzi, cliente, articoli, note, km, compenso, bonus, validità dell'offerta
  e consegna promessa in minuti. Senza rider tutti i rider ricevono una notifica `consegne`; con "Assegna subito a" l'ordine
  nasce `accepted` per quel rider, che riceve una notifica, e gli altri non lo vedono.
- `/web/admin/orders/<id>/edit` — modifica di un ordine `available`, `accepted` o `picked_up` (riga bloccata durante il
  salvataggio). Validità dell'offerta e consegna promessa come data e ora locale; un'offerta scaduta con un nuovo orario
  futuro torna offerta e i rider ricevono "Di nuovo disponibile". Se cambia qualcosa che il rider vede, il rider dell'ordine
  riceve "Ordine modificato".
- `POST /web/admin/orders/<id>/assign` `{rider_id, expected}` — assegna un ordine `available` o `accepted` a un rider (o a
  nessuno: torna tra i disponibili e, se l'offerta non è scaduta, gli altri rider ricevono "Di nuovo disponibile"). Stesse regole dell'app: un ordine alla volta per rider, blocco della riga del rider e
  poi dell'ordine. `expected` è il rider mostrato dalla pagina: se nel frattempo un rider l'ha accettato o restituito,
  l'assegnazione è rifiutata invece di toglierlo a chi l'aveva appena preso. Notifiche "Ordine assegnato a te" al nuovo
  rider e "Ordine tolto" al precedente.
- `POST /web/admin/orders/<id>/cancel` `{confirm}` — annulla un ordine `available`, `accepted` o `picked_up` (il rider
  assegnato riceve una notifica). Il pannello non ha script (CSP), quindi la conferma è una casella da spuntare.
- `/web/admin/stats?from=&to=` — statistiche di un periodo di giorni locali (default oggi, al massimo un anno): consegne,
  importi, km, puntualità, ordini creati/annullati/scaduti, tempi tipici (mediana), grafico per ora/giorno/mese, tabella
  per rider; più gli ordini in corso adesso.
- `/web/admin/export/deliveries?from=&to=[&rider=]` e `/web/admin/export/riders?from=&to=` — CSV (UTF-8 con BOM, `;`,
  virgola decimale, `Cache-Control: no-store`) delle consegne e dei totali per rider. Solo i dati per pagare i rider:
  niente cliente, indirizzi o contenuto; i testi che iniziano con `=`, `+`, `-`, `@` sono scritti come testo.
- `/web/admin/bikes`, `/web/admin/bikes/new` — bici con QR verso `/bici/<codice>`.

### Notifiche (`/api/notifications`)

Create dal server: nuovo ordine, ordine assegnato, tolto, modificato o annullato (`consegne`), SOS di un membro del gruppo (`sicurezza`), nuovo membro nel
gruppo che amministro (`gruppi`), bici presa da un altro rider (`sistema`).
`Notification`: `{"id", "category": "consegne"|"sicurezza"|"gruppi"|"sistema", "title", "body", "link", "is_read", "created_at"}`.
`title` e `body` (anche della push Android) sono nella lingua del destinatario al momento dell'invio (`language` del
profilo: `it`, `en`, `es`; le altre lingue dell'elenco dell'app ricevono l'inglese, codici sconosciuti l'italiano, come
nell'app). Testi in `backend/app/messaging/texts.py`; con le stesse regole si sceglie la lingua delle email SOS.

| Metodo e percorso | Body → Risposta |
|---|---|
| `GET /api/notifications?limit=50&after_id=` | → `{"notifications": [Notification], "unread_count"}` (più recenti prima, `limit` ≤ 100; `after_id` = solo quelle nuove) |
| `POST /api/notifications/<id>/read` | `{"read": true\|false}` → `{"notification", "unread_count"}` |
| `POST /api/notifications/read-all` | `?category=consegne\|sicurezza\|gruppi\|sistema` facoltativo: solo quella categoria (quella sullo schermo, dal 05/10/2026) → `{"unread_count"}` (le non lette rimaste) · `422` categoria sconosciuta |
| `DELETE /api/notifications/<id>` | → `{"success": true, "unread_count"}` |
| `DELETE /api/notifications` | `?category=` facoltativo come sopra (senza: tutte) → `{"success": true, "deleted", "unread_count"}` · `422` categoria sconosciuta. L'app chiede conferma prima di chiamarlo |

`NotificationsContext` interroga `GET /api/notifications` ogni 30 s (e quando l'app torna visibile; nell'app Android con
le push attive ogni 2 minuti e subito all'arrivo di una push, `src/native/pushState.js`) e mostra un banner con
suono solo per le notifiche nuove. Le preferenze banner/suoni restano sul dispositivo (`localStorage`), non sono dati del server.

### Punteggio (`GET /api/score?days=7`)

Formula trasparente, calcolata dai dati reali: **10 punti/km** (percorsi GPS) + **20 per consegna** + **5 per
consegna puntuale** (entro `due_at`).
```json
{ "today": "2026-09-25", "total": 184,
  "days": [{ "date": "2026-09-25", "score": 64, "distance_km": 3.4, "deliveries": 1, "on_time": 1,
             "punctuality": 1.0, "safe_riding": 1.0 }],
  "rules": { "per_km": 10, "per_delivery": 20, "per_on_time": 5 } }
```
`punctuality` = consegne puntuali / consegne con `due_at`; `safe_riding` = percorsi del giorno senza caduta confermata /
percorsi del giorno; `null` quando non ci sono dati. `days` in ordine cronologico (max 31).

### Bici della community (`/api/bikes`)

`Bike`: `{"code": "013-001", "label", "model", "location", "description", "in_use", "is_mine",
"stats": {"rides", "distance_km", "riders", "co2_saved_kg", "last_ride_at"}}`; nella scheda di dettaglio anche
`history` (elenco di eventi), `contact_phone` e `co2_factor_kg_per_km` (0,12: stima rispetto a un'auto media).
Le statistiche vengono dai percorsi GPS registrati mentre la bici era collegata (`rider_shifts.bike_id`, scritto dal GPS worker).

| Metodo e percorso | Body → Risposta |
|---|---|
| `GET /api/bikes` (pubblico) | → `{"bikes": [Bike]}` |
| `GET /api/bikes/<code>` (pubblico, pagina del QR `/bici/<code>`) | → `{"bike"}` · `404` |
| `GET /api/bikes/mine` | → `{"bike": Bike\|null}` |
| `POST /api/bikes/<code>/link` | → `{"bike"}`: una bici per rider e un rider per bici; chi l'aveva prima riceve una notifica |
| `DELETE /api/bikes/mine` | → `{"bike": null}` |

### Chat di gruppo

REST (storico e invio di riserva) — solo membri del gruppo, altrimenti `404`:

| Metodo e percorso | Body → Risposta |
|---|---|
| `GET /api/groups/<id>/messages?before=<message_id>` | → `{"messages": [ChatMessage], "has_more"}` (50 per pagina, dal più vecchio) |
| `POST /api/groups/<id>/messages` | `{"text"}` oppure `{"kind": "location", "lat", "lon", "text"?}` → `201 {"message"}` · `422` (testo vuoto o > 1000 caratteri, coordinate non valide) |

`ChatMessage`: `{"id", "group_id", "user_id", "username", "avatar", "kind": "text"|"location", "text", "lat", "lon", "created_at"}`.

**WebSocket `wss://<host>/ws/chat/<group_id>`** (Flask + flask-sock; Nginx inoltra `/ws/` con gli header `Upgrade`, `Host` e
`X-Forwarded-*`). Autenticazione con il cookie di sessione; se l'utente non è membro o l'`Origin` non è il sito stesso il server
chiude con codice `1008`. I messaggi passano da Redis pub/sub (canale per gruppo), quindi arrivano a tutti i worker Gunicorn
(servizio `ws`, `-k gthread`, 2 processi da 100 thread: un thread per connessione, al massimo 5 chat aperte per account,
errore `too_many_connections` e chiusura `1008`; separato dall'API perché le chat aperte non la blocchino).
- Client → server: `{"type": "message", "text"}` · `{"type": "location", "lat", "lon", "text"?}` · `{"type": "typing"}` · `{"type": "ping"}`
  (l'app usa solo `typing` e `ping`: messaggi e posizioni li invia con la REST, vedi sotto)
- Server → client: `{"type": "ready"}` (primo evento di ogni connessione, vedi sotto) · `{"type": "message", "message": ChatMessage}` · `{"type": "typing", "user_id", "username"}` (max uno ogni 2 s) ·
  `{"type": "pong"}` · `{"type": "error", "message", "fields"?, "code"?}`
- Chi esce dal gruppo, ne viene tolto o elimina l'account smette subito di ricevere e di scrivere: il server invia
  `{"type": "error", "code": "not_a_member", ...}` e chiude con `1008` (evento interno `member_removed` su Redis, più un
  controllo dell'appartenenza a ogni messaggio e ogni 30 s). Con `1008` `useWebSocket` non riprova a collegarsi.
  Il socket non tiene occupata una connessione al database mentre aspetta.
- Il server invia un ping WebSocket ogni 25 s (il browser risponde da solo): una connessione senza risposta viene
  chiusa e smette di contare tra le 5 dell'account. Un messaggio oltre 64 KB chiude la connessione (codice `1009`).
  Al riavvio del servizio `ws` il conteggio delle chat aperte riparte da zero.

`GroupChat.jsx` invia sempre con la REST (`POST /api/groups/<id>/messages`), anche con il WebSocket connesso: risponde con il
messaggio salvato o con un errore (il testo resta nella casella) e il server lo inoltra a tutti via WebSocket. Prima,
con il WebSocket "connesso", il messaggio partiva da lì senza conferma e dopo un cambio di rete (connessione morta ma
ancora "aperta" fino a 30 s) spariva senza avviso. Il WebSocket serve a ricevere, al "sta scrivendo" e al ping; senza
connessione mostra "Non in tempo reale".

`ready` arriva quando Redis ha confermato l'iscrizione al canale del gruppo: da lì nessun messaggio si perde. Il browser vede il
WebSocket aperto un attimo prima (controllo dell'appartenenza e iscrizione), e un messaggio scritto in quell'attimo non era né
nello storico già caricato né nel WebSocket: l'altro membro lo vedeva solo ricaricando (06/10). A ogni `ready`, anche dopo una
riconnessione, `GroupChat.jsx` ricarica lo storico e aggiunge i messaggi mancanti senza doppioni.

### Manutenzione (CLI Flask)

- `flask ror grant-admin <email>` · `flask ror revoke-admin <email>`
- `flask ror confirm-email <email>` — conferma a mano un account nuovo che non riceve il codice (controllare prima l'indirizzo).
- `flask ror reset-password <email>` — password temporanea (stampata a terminale, da comunicare al rider di persona o
  per telefono); chiude tutte le sessioni dell'account (`fs_uniquifier` nuovo) e sblocca il login.
- `flask ror delete-account <email> [--yes]` — elimina un account su richiesta (es. via email dalla pagina `/eliminazione-account`).
- `flask ror cleanup-gpx [--dry-run]` — elimina i file GPX non più collegati a un percorso (e i `.gpx.tmp` di più di un giorno).
  Il GPS worker e l'app web girano entrambi come uid 1000, così l'app può cancellare i GPX quando si elimina un percorso o un account.

## 7. Dati personali, privacy e produzione — Fase 6 ✅

### Esportazione dei dati (GDPR, art. 15 e 20)

`GET /api/account/export` (sessione richiesta) → `200` file JSON (`Content-Disposition: attachment;
filename="ror-dati-personali-<username>-<AAAAMMGG>.json"`), chiavi originali `snake_case`, orari locali:

```json
{ "format": "ror-personal-data-export", "version": 2, "exported_at": "2026-09-25T20:30:00", "timezone": "Europe/Rome",
  "account": { "...": "come User" }, "sos_contacts": [], "groups": [{ "group_id", "name", "role", "joined_at" }],
  "routes": [{ "...": "come GET /api/routes", "gpx_download": "/api/routes/<id>/gpx" }],
  "fall_events": [], "sos_alerts": [], "orders": [], "notifications": [], "chat_messages": [],
  "devices": [{ "platform": "android", "registered_at", "last_seen_at" }],
  "bike": { "code", "label" } | null, "live_position": { "lat", "lon", "..." } | null,
  "shared_map_position": { "lat", "lon", "ts" } | null }
```
Negli ordini non c'è il nome del cliente (dato di un'altra persona). Il frontend lo scarica con
`accountService.downloadExport()` (`api.get(..., { raw: true })`) dalla pagina Privacy.

### Informazioni privacy (pubblico)

`GET /api/legal/privacy` →
```json
{ "controller": { "name": "…" | null, "email": "…" | null, "configured": false },
  "retention": { "live_position_sec": 90, "routes_days": 0, "notifications_days": 180,
                 "sos_alerts_days": 365, "chat_messages_days": 365, "backups_days": 14, "push_tokens_days": 60 },
  "sos_email_enabled": false, "push_enabled": true }
```
Valori da `.env`: `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL`, `POSITION_TTL`, `ROUTE_RETENTION_DAYS`,
`NOTIFICATION_RETENTION_DAYS`, `SOS_RETENTION_DAYS`, `CHAT_RETENTION_DAYS` (0 = finché l'utente non li elimina),
`BACKUP_KEEP_DAYS` (quanto restano i dati di un account eliminato nei backup), `PUSH_TOKEN_STALE_DAYS` (token push che
l'app non conferma da tanti giorni). `push_enabled` = il server ha la chiave Firebase (fase 7).

La pagina pubblica **`/eliminazione-account`** (richiesta da Google Play, funziona senza accesso) spiega come eliminare
l'account dall'app o via email al titolare e cosa viene cancellato / cosa resta, con contatto e durata dei backup presi da qui.

### Comuni italiani (pubblico)

`GET /api/municipalities` → `Cache-Control: public, max-age=86400`
```json
{ "source": "ISTAT - Elenco dei comuni italiani", "source_url": "https://www.istat.it/it/archivio/6789",
  "updated": "2024-01-26", "municipalities": [["Roma", "RM", "H501"], ["Milano", "MI", "F205"]] }
```
`[nome, sigla della provincia, codice catastale]`, serve alla registrazione per calcolare il codice fiscale
(`authService.getMunicipalities()`). Dati in `backend/app/data/municipalities.json`, generati dal file ufficiale ISTAT con
`python -m scripts.build_municipalities <csv> <data>`. I comuni soppressi o fusi prima dell'ultimo aggiornamento non ci sono:
chi è nato in uno di questi lo scrive, spunta "Il mio comune di nascita non esiste più" e inserisce il codice fiscale a
mano (come i nati all'estero). `POST /api/auth/register` non confronta il codice catastale con l'elenco: controlla
formato, carattere di controllo, nome, cognome, data di nascita e sesso.
`flask ror purge-expired` applica i tempi di conservazione (ogni giorno nel servizio `maintenance`, anche sul PC delle prove);
`flask ror send-test-email <email>` verifica la posta degli SOS.

### Nginx in produzione

- `429 {"error": "too_many_requests"}` anche da nginx: più di 20 richieste al minuto per IP su
  `/api/auth/login`, `/api/auth/register`, `/api/auth/delete-account`, `/api/profile/password`.
  L'IP è quello della connessione sulla porta 443; `X-Forwarded-For` vale solo sulla porta interna 8444 usata dal
  tunnel ngrok (l'ultimo indirizzo, aggiunto da ngrok), così non si può inventare un IP per aggirare il limite.
- Header su tutte le risposte: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
  L'app React riceve anche una `Content-Security-Policy`: script solo dal sito; connessioni verso il sito (anche `wss://`),
  tessere e ricerca OpenStreetMap, Open-Meteo; immagini da OpenStreetMap e flagcdn.com. Elenco dei comuni e QR delle bici
  vengono dal sito stesso (niente GitHub né api.qrserver.com). Il pannello admin `/web/` ha una CSP propria senza script
  (`csp-admin.conf`). Un nuovo servizio esterno va aggiunto in `backend/nginx/snippets/csp.conf` **e** nella pagina Privacy
  (`src/__tests__/externalServices.test.js` fallisce se un host non è dichiarato).
- Leaflet e i font sono inclusi nella build (nessun CDN né Google Fonts).
- Configurazione e procedura: `backend/DEPLOY.md` (`docker-compose.prod.yml`, Let's Encrypt, backup, manutenzione).

## 8. Endpoint esistenti non ancora usati dal frontend React

Nessuno: le vecchie pagine HTML di Flask e i loro endpoint (`/telemetry/*`, `/groups/*`, `/analytics/*`, `/auth/me`,
`/trigger_sos`...) sono stati rimossi il 28/09/2026. Restano solo `/web/admin/` e `/auth/check_session` (interno, per FastAPI).
La tabella `activities` che riempiva `/telemetry/activity` è stata eliminata il 29/09/2026 (migrazione `c3f8a1d6e2b9`).

## 9. App Android (Capacitor) — Fase 7 ✅

L'app (`android/`, id `com.ror.rider`) apre il sito RoR (`server.url` in `capacitor.config.js`) in una WebView:
**stesso cookie di sessione e stesse API**, nessun token. Differenze rispetto alla PWA (codice in `src/native/`):
- accesso sempre con "Ricordami" (Capacitor cancella il cookie di sessione a ogni avvio; resta `remember_token`);
- GPS con il plugin gratuito `@capacitor-community/background-geolocation` (servizio in primo piano, notifica fissa) e
  sensori per le cadute dal plugin locale `RorMotion` (20 Hz, anche a schermo spento): stesso `/stream`, stesso FallDetector;
- `/stream`, `/session/end` e `POST /api/sos` partono dall'HTTP nativo (`CapacitorHttp`, stessi cookie, `Referer` per il CSRF):
  in background Android rallenta le richieste della WebView;
- file GPX/CSV/JSON: menu "Condividi" di Android (plugin locale `RorSystem`); avviso di caduta come notifica di sistema;
- link d'invito e QR delle bici (App Links) aprono l'app; il tasto Indietro dalla Home manda l'app in background.

### Token delle notifiche push (`/api/devices`)

- `POST /api/devices` `{ "token": "<token Firebase>", "platform": "android" }` → `200 { "registered": true, "push_enabled": true }`.
  L'app lo chiama a ogni avvio dopo il login; lo stesso token passa all'account che ha fatto l'ultimo accesso sul telefono.
  `422` con token non valido (20–512 caratteri `A-Za-z0-9_:.-`) o piattaforma diversa da `android`.
- `DELETE /api/devices` `{ "token": "..." }` → `200 { "success": true, "removed": 0|1 }` (solo i token dell'utente).
- `POST /api/auth/logout` cancella da solo il token registrato nella sessione; eliminare l'account li cancella tutti.

Ogni notifica creata dal server (`notify()`: ordini, SOS dei gruppi, nuovi membri, bici) viene inviata anche come push
**dopo il commit** (thread in background, `app/push.py`, API HTTP v1 di Firebase Cloud Messaging) con
`data: { "link": "/consegne", "category": "consegne" }`: toccandola l'app apre `link`. Canali Android = categorie
(`sicurezza` e `consegne` con priorità alta) più `cadute` per l'avviso locale. I token rifiutati da Firebase
(`UNREGISTERED`, `SENDER_ID_MISMATCH`, 404) vengono cancellati. Senza chiave (`FCM_SERVICE_ACCOUNT_FILE`, file in
`backend/secrets/`, mai nel repository) le notifiche restano solo nell'app. Prova: `flask ror send-test-push <email>`.

### App Links (`GET /.well-known/assetlinks.json`, pubblico)

`200 [{ "relation": ["delegate_permission/common.handle_all_urls"], "target": { "namespace": "android_app",
"package_name": "com.ror.rider", "sha256_cert_fingerprints": ["AA:BB:..."] } }]` con `ANDROID_APP_ID` e
`ANDROID_CERT_SHA256` (impronte separate da virgole) in `.env`; `404` finché le impronte non sono configurate.

## 10. Prossime fasi

- **Fase 6.2 — Pubblicazione su un server** (facoltativa: le prove si fanno gratis con il tunnel ngrok).
- **Fase 8 — Prove su telefoni Android reali** (APK distribuito ai tester, senza store) **e, più avanti, Google Play.**
