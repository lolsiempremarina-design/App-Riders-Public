import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { notificationService } from '../services/notificationService';
import { getAudioToggles } from '../utils/audioUtils';
import { usePollInterval, useRefreshOn } from '../native/pushState';
import { shouldPollNow } from '../native/appState';

/**
 * Notifiche reali del server (/api/notifications): contatore dei non letti per tutta l'app
 * e banner in alto quando ne arriva una nuova (se l'utente non l'ha disattivato nelle preferenze).
 */
const POLL_MS = 30000;
const POLL_PUSH_MS = 120000; // app Android con le push attive: ogni novità arriva subito come push
const BACKGROUND_POLL_MS = 120000; // app in background o scheda nascosta: banner e suono bastano ogni 2 minuti
const MAX_BANNERS = 3;

const NotificationsContext = createContext(null);

export const NotificationsProvider = ({ children }) => {
  const { userProfile, triggerPushNotification } = useApp();
  const userId = userProfile?.id ?? null; // il polling si riavvia solo se cambia utente
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenIdRef = useRef(null);
  const lastRefreshRef = useRef(0);
  const pushRef = useRef(triggerPushNotification);
  pushRef.current = triggerPushNotification;

  const refresh = useCallback(async () => {
    lastRefreshRef.current = Date.now();
    try {
      const { notifications, unreadCount: count } = await notificationService.list({
        limit: 20,
        afterId: lastSeenIdRef.current || undefined
      });
      setUnreadCount(count);
      if (notifications.length === 0) return;
      const newest = notifications[0].id;
      if (lastSeenIdRef.current !== null && getAudioToggles().push) {
        // solo quelle arrivate dopo l'apertura dell'app, dalla più vecchia alla più recente
        notifications.slice(0, MAX_BANNERS).reverse().forEach((n) => pushRef.current(n.title, n.body || '', n.category));
      }
      lastSeenIdRef.current = Math.max(newest, lastSeenIdRef.current || 0);
    } catch {
      // offline o sessione scaduta: si riprova al prossimo giro
    }
  }, []);

  const pollMs = usePollInterval(POLL_MS, POLL_PUSH_MS);
  useEffect(() => {
    if (userId === null) {
      lastSeenIdRef.current = null;
      setUnreadCount(0);
      return undefined;
    }
    refresh();
    // pagina di nuovo visibile o app di nuovo in primo piano: useRefreshOn qui sotto
    const interval = setInterval(() => { if (shouldPollNow(lastRefreshRef.current, BACKGROUND_POLL_MS)) refresh(); }, pollMs);
    return () => clearInterval(interval);
  }, [userId, refresh, pollMs]);

  // app Android: push ricevuta con l'app aperta (qualsiasi categoria) o ritorno in primo piano
  useRefreshOn(null, () => { if (userId !== null) refresh(); });

  const value = useMemo(() => ({ unreadCount, setUnreadCount, refresh }), [unreadCount, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

/** { unreadCount, setUnreadCount, refresh } — valori neutri fuori dal provider (es. nei test). */
export const useNotifications = () => useContext(NotificationsContext) || { unreadCount: 0, setUnreadCount: () => {}, refresh: async () => {} };
