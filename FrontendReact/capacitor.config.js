/**
 * Capacitor: app Android di RoR (fase 7).
 *
 * L'app apre il sito RoR (server.url) in una WebView: stesso cookie di sessione e stesse API della PWA,
 * nessun cambiamento all'autenticazione. L'indirizzo si sceglie quando si prepara il progetto Android:
 *   npm run android:sync          → CAP_SERVER_URL da .env (per i tester: il tunnel ngrok o il dominio)
 *   npm run android:sync:local    → https://localhost:8443 (emulatore con `adb reverse`, solo build di debug)
 * Vedi scripts/android-sync.mjs e android/README.md.
 */
import { readFileSync } from 'node:fs';

const serverUrl = (process.env.CAP_SERVER_URL || '').replace(/\/+$/, '');
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

if (!/^https:\/\/[^/]+$/.test(serverUrl)) {
  throw new Error('CAP_SERVER_URL mancante o non valido (https://host senza percorso): usa "npm run android:sync".');
}

const config = {
  appId: 'com.ror.rider',
  appName: 'RoR',
  // pagine locali minime: si vedono solo se il server non risponde (offline.html)
  webDir: 'native-shell',
  server: {
    url: serverUrl,
    errorPath: 'offline.html'
  },
  android: {
    // Il plugin del GPS in background lo richiede: senza, dopo 5 minuti in background le posizioni
    // non arrivano più alla WebView (capacitor-community/background-geolocation#89).
    useLegacyBridge: true,
    // L'app si presenta come "RoR-Android": il tunnel gratuito di ngrok mostra la sua pagina di avviso ("Visit Site")
    // solo ai browser, così i tester non la vedono. "Mobile" mantiene il comportamento da telefono di Leaflet.
    overrideUserAgent: `RoR-Android/${version} (Android; Mobile)`
  },
  plugins: {
    // icone chiare nelle barre di sistema: dietro c'è sempre il fondo scuro dell'app (styles.xml)
    SystemBars: {
      style: 'DARK'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

// require() di Capacitor CLI su un modulo ES: con questo nome Node restituisce direttamente l'oggetto
export { config as 'module.exports' };
export default config;
