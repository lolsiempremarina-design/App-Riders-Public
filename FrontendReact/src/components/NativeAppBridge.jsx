import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { useApp } from '../context/AppContext';
import { isNativeApp } from '../native/platform';
import { createChannels, notificationPermissionGranted, pushLink, registerForPush } from '../native/push';
import { requestRefresh, setPushActive } from '../native/pushState';

/**
 * Solo nell'app Android (dentro il router, non disegna nulla):
 *  - link d'invito e QR delle bici (App Links) → pagina dell'app;
 *  - notifica push toccata → pagina indicata dal server; push ricevuta con l'app aperta → banner e dati
 *    della sua categoria aggiornati subito (requestRefresh);
 *  - tasto Indietro: pagina precedente, dalla Home l'app va in background (non si chiude: la sessione GPS continua);
 *  - dopo il login il telefono si registra per le push dell'utente; se funzionano, notifiche, SOS e ordini
 *    si controllano più di rado (native/pushState.js).
 */
export const NativeAppBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, t } = useApp();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const native = isNativeApp();

  useEffect(() => {
    if (!native) return undefined;
    const openLink = (url) => {
      try {
        const target = new URL(url);
        if (target.host === window.location.host && target.pathname !== '/') navigate(`${target.pathname}${target.search}`);
      } catch {
        // URL non valido: si resta dove si è
      }
    };
    // app aperta da chiusa con un link (QR di una bici, invito): l'evento è partito prima di React
    CapacitorApp.getLaunchUrl().then((launch) => { if (launch?.url) openLink(launch.url); }).catch(() => {});
    const handles = [
      CapacitorApp.addListener('appUrlOpen', ({ url }) => openLink(url)),
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && pathRef.current !== '/') navigate(-1);
        else CapacitorApp.minimizeApp();
      }),
      // la WebView non emette visibilitychange: al ritorno in primo piano si ricaricano notifiche, SOS e
      // ordini; se nel frattempo l'utente ha tolto il permesso delle notifiche si torna ai controlli frequenti
      CapacitorApp.addListener('resume', () => {
        requestRefresh();
        notificationPermissionGranted().then((granted) => { if (!granted) setPushActive(false); });
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => navigate(pushLink(notification))),
      PushNotifications.addListener('pushNotificationReceived', (notification) => requestRefresh(notification?.data?.category))
    ];
    return () => handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
  }, [native, navigate]);

  // nomi dei canali nella lingua scelta
  useEffect(() => {
    if (native) createChannels(t);
  }, [native, t]);

  const userId = userProfile?.id ?? null;
  useEffect(() => {
    if (!native) return undefined;
    if (userId === null) {
      setPushActive(false); // dopo il logout il server ha già dimenticato il token di questo telefono
      return undefined;
    }
    let cancelled = false;
    registerForPush().then(({ status }) => {
      if (!cancelled) setPushActive(status === 'enabled');
    }).catch(() => {
      // offline o Firebase non raggiungibile: si riprova al prossimo avvio (intanto controlli frequenti)
      if (!cancelled) setPushActive(false);
    });
    return () => { cancelled = true; };
  }, [native, userId]);

  return null;
};
