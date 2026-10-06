# App Android di RoR (Capacitor)

L'app apre il sito RoR (`server.url` in `capacitor.config.js`) in una WebView: stesse pagine, stesse API e stesso cookie
di sessione della PWA. In più, grazie al codice nativo (`src/native/` in React, `app/src/main/java/com/ror/rider/`):

- GPS e rilevamento cadute continuano **a schermo spento** durante una sessione (notifica fissa "RoR registra il percorso");
- **notifiche push** (Firebase) di ordini, SOS dei gruppi, nuovi membri e bici, anche con l'app chiusa;
- avviso di caduta come notifica di Android; GPX/CSV/dati personali con il menu "Condividi";
- link d'invito ai gruppi e QR delle bici aprono l'app (App Links).

Tutto gratuito: plugin open source, Firebase Cloud Messaging (piano gratuito), APK distribuito senza store.

## Requisiti (una volta)

- Android Studio (SDK Android e emulatore). Da riga di comando serve un JDK 21 o 22 per Gradle 8.14: Android
  Studio 2026 porta Java 25, che Gradle 8.14 non supporta → `JAVA_HOME` su un JDK 21/22 (qui: `C:\Program Files\Java\jdk-22`),
  oppure in Android Studio *Settings → Build Tools → Gradle → Gradle JDK*.
- `android/local.properties` con `sdk.dir=C:/Users/<utente>/AppData/Local/Android/Sdk` (non versionato).
- `android/app/google-services.json` dalla console Firebase (progetto `ror-rider`, app `com.ror.rider`; non versionato).
- Server: chiave dell'account di servizio Firebase in `backend/secrets/firebase-service-account.json` (vedi il README
  di quella cartella) per inviare le push.

## Provare nell'emulatore (build di debug, server locale)

```bash
cd backend && docker compose up -d          # stack locale su https://localhost
cd ../FrontendReact
npm run android:sync:local                  # l'app apre https://localhost:8443
adb reverse tcp:8443 tcp:443                # porta 8443 dell'emulatore → Nginx di Docker (da ripetere a ogni avvio)
cd android && ./gradlew installDebug        # compila e installa nell'emulatore acceso
```

Solo la build di debug si fida del certificato autofirmato di `backend/nginx/certs/` (generato da `app/build.gradle`).
Il sito deve essere aggiornato nell'immagine Nginx (`docker compose up -d --build nginx`): l'app non contiene il codice React.
Debug della WebView: `chrome://inspect` in Chrome/Edge sul PC.

## APK per i tester (senza store)

1. In `FrontendReact/.env`: `CAP_SERVER_URL=https://<nome>.ngrok-free.dev` (il tunnel gratuito, `docker compose --profile ngrok up -d`)
   o il dominio del server. Poi `npm run android:sync`.
2. Chiave di firma (una volta, **da conservare**: senza la stessa chiave i telefoni non accettano gli aggiornamenti):
   `android/keystore/ror-release.jks` + `android/keystore.properties` (entrambi fuori dal repository):
   ```properties
   storeFile=keystore/ror-release.jks
   storePassword=...
   keyAlias=ror
   keyPassword=...
   ```
   Creazione: `keytool -genkeypair -keystore keystore/ror-release.jks -alias ror -keyalg RSA -keysize 2048 -validity 10000`.
3. `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.
4. Distribuzione gratuita e privata: **Firebase App Distribution** (console Firebase → App Distribution → carica l'APK →
   invita i tester per email: ricevono il link e gli aggiornamenti) oppure invio diretto del file. Sul telefono va
   permessa l'installazione da "origini sconosciute" per l'app usata per aprirlo.
5. Nuova versione: aumentare `version` in `package.json` (1.0.1 → versionCode 10001), `npm run android:sync`, `assembleRelease`.

Al primo avvio con il tunnel ngrok la WebView mostra la pagina di avviso di ngrok: si tocca "Visit Site" (ogni 7 giorni).

## App Links (link e QR che aprono l'app)

Android verifica `https://<host>/.well-known/assetlinks.json` (servito da Flask). Impronta SHA-256 della chiave di firma:
`keytool -list -v -keystore keystore/ror-release.jks -alias ror` → in `backend/.env`
`ANDROID_CERT_SHA256=AA:BB:...` (più impronte separate da virgole, es. anche quella di debug) e `docker compose up -d web`.
L'host dei link è quello di `server.url` al momento del build. Senza impronte i link si aprono nel browser.

## Note

- Il tasto Indietro dalla Home manda l'app in background (non la chiude): una sessione GPS continua.
- Alcuni produttori (Xiaomi, Huawei, Samsung...) chiudono le app in background per risparmiare batteria: per le sessioni
  lunghe escludere RoR dal risparmio energetico.
- Le richieste di `/stream`, `/session/end` e SOS partono dall'HTTP nativo (dopo ~5 minuti in background Android rallenta
  quelle della WebView). `android.useLegacyBridge` è attivo perché altrimenti le posizioni non arrivano più alla WebView
  dopo 5 minuti in background (plugin background-geolocation).
