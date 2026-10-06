/**
 * App Android (Capacitor, fase 7): lo stesso codice React gira nel browser/PWA e nella WebView dell'app.
 * Le funzioni native (GPS e sensori in background, notifiche push, condivisione file) si usano solo qui.
 */
import { Capacitor } from '@capacitor/core';

/** true dentro l'app Android, false nel browser, nella PWA e nei test. */
export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
