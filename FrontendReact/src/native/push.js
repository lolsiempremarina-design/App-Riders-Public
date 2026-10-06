/**
 * Notifiche push dell'app Android (Firebase Cloud Messaging, plugin @capacitor/push-notifications).
 * Il server invia la stessa notifica che compare in Notifiche (ordini, SOS dei gruppi, nuovi membri, bici);
 * con l'app chiusa la mostra Android, toccandola si apre la pagina indicata (data.link).
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { deviceService } from '../services/deviceService';

/** Canali Android: uno per categoria delle notifiche del server, più gli avvisi di caduta. */
export const CHANNELS = [
  { id: 'sicurezza', key: 'nativeChannelSafety', fallback: 'SOS e sicurezza', importance: 5, vibration: true },
  { id: 'cadute', key: 'nativeChannelFalls', fallback: 'Cadute rilevate', importance: 5, vibration: true },
  { id: 'consegne', key: 'nativeChannelDeliveries', fallback: 'Consegne', importance: 4, vibration: true },
  { id: 'gruppi', key: 'nativeChannelGroups', fallback: 'Gruppi', importance: 3, vibration: false },
  { id: 'sistema', key: 'nativeChannelSystem', fallback: 'Sistema', importance: 3, vibration: false }
];

/** Crea (o rinomina nella lingua attuale) i canali delle notifiche. */
export const createChannels = async (t = {}) => {
  for (const channel of CHANNELS) {
    await PushNotifications.createChannel({
      id: channel.id,
      name: t[channel.key] || channel.fallback,
      importance: channel.importance,
      visibility: 1,
      vibration: channel.vibration
    }).catch(() => {});
  }
};

/** Permesso di mostrare notifiche (Android 13+: lo chiede la prima volta). true se concesso. */
export const requestNotificationPermission = async () => {
  try {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    return status.receive === 'granted';
  } catch {
    return false;
  }
};

/** Permesso delle notifiche ancora concesso (senza chiederlo): l'utente può toglierlo dalle impostazioni. */
export const notificationPermissionGranted = async () => {
  try {
    return (await PushNotifications.checkPermissions()).receive === 'granted';
  } catch {
    return false;
  }
};

/** Token Firebase di questo telefono (null se non arriva entro il timeout). */
const obtainToken = (timeoutMs = 20000) => new Promise((resolve) => {
  const handles = [];
  const finish = (value) => {
    handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
    clearTimeout(timer);
    resolve(value);
  };
  const timer = setTimeout(() => finish(null), timeoutMs);
  handles.push(PushNotifications.addListener('registration', ({ value }) => finish(value || null)));
  handles.push(PushNotifications.addListener('registrationError', () => finish(null)));
  PushNotifications.register().catch(() => finish(null));
});

/**
 * Registra il telefono sul server per ricevere le push dell'utente connesso.
 * @returns {Promise<{status: 'enabled'|'server_disabled'|'denied'|'unavailable'}>}
 */
export const registerForPush = async () => {
  if (!(await requestNotificationPermission())) return { status: 'denied' };
  const token = await obtainToken();
  if (!token) return { status: 'unavailable' };
  const result = await deviceService.register(token);
  return { status: result?.pushEnabled ? 'enabled' : 'server_disabled' };
};

/** Pagina da aprire per una push toccata (solo percorsi interni dell'app). */
export const pushLink = (notification) => {
  const link = notification?.data?.link;
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : '/notifiche';
};
