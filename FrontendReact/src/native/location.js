/**
 * Posizione durante una sessione di guida.
 *  - Browser / PWA: navigator.geolocation.watchPosition (solo con l'app aperta e lo schermo acceso).
 *  - App Android: plugin gratuito @capacitor-community/background-geolocation, con un servizio in primo
 *    piano e una notifica fissa: il GPS continua con l'app in background o lo schermo spento.
 * In entrambi i casi onFix riceve un oggetto con la forma di GeolocationPosition e onError un codice
 * come GeolocationPositionError (1 = permesso negato).
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

/**
 * @param {(pos: {coords: {latitude, longitude, accuracy, speed}, timestamp: number}) => void} onFix
 * @param {(err: {code: number, message?: string}) => void} onError
 * @param {{title: string, message: string}} notification - testo della notifica fissa (solo app Android)
 * @returns {Promise<() => void>} funzione che ferma il GPS
 */
export const watchLocation = async (onFix, onError, notification) => {
  if (isNativeApp()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: notification.title,
        backgroundMessage: notification.message,
        requestPermissions: true,
        stale: false,
        distanceFilter: 0
      },
      (location, error) => {
        if (error) {
          onError({ code: error.code === 'NOT_AUTHORIZED' ? 1 : 2, message: error.message });
        } else if (location) {
          onFix({
            coords: {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              speed: location.speed
            },
            timestamp: location.time
          });
        }
      }
    );
    return () => { BackgroundGeolocation.removeWatcher({ id }).catch(() => {}); };
  }
  const { geolocation } = navigator;
  const watchId = geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 30000
  });
  return () => geolocation.clearWatch(watchId);
};

/** Apre le impostazioni dell'app (permesso di posizione negato). Solo app Android. */
export const openLocationSettings = () => BackgroundGeolocation.openSettings().catch(() => {});
