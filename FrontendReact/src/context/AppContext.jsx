import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  supportedLanguages,
  RTL_CODES,
  normalizeLanguageCode,
  I18N_DICTIONARY,
  getI18n
} from './i18n';
import {
  playNotificationSound,
  playOrderHotSound,
  playSosSound,
  playChatSound
} from '../utils/audioUtils';
import { setApiLanguage } from '../services/api';
import { authService } from '../services/authService';
import { profileService } from '../services/profileService';

// Re-export per retrocompatibilità con tutte le pagine e componenti esistenti
export {
  supportedLanguages,
  RTL_CODES,
  normalizeLanguageCode,
  I18N_DICTIONARY,
  getI18n
};

/**
 * Contesto React globale per la gestione dello stato dell'applicazione RoR.
 */
export const AppContext = createContext();

/**
 * Chiavi utilizzate per la memorizzazione locale in localStorage.
 */
const STORAGE_KEYS = {
  THEME: 'ror-theme',
  VIEW_MODE: 'ror-view-mode',
  LANGUAGE: 'ror-language',
  USER_PROFILE: 'ror-user-profile',
  RIDE_SESSION: 'ror-ride-session'
};

/**
 * La copia del profilo nel telefono serve solo ad aprire l'app senza rete (nome, foto, impostazioni):
 * i dati anagrafici sensibili restano sul server e arrivano di nuovo a ogni verifica della sessione.
 */
const PRIVATE_PROFILE_FIELDS = ['fiscalCode', 'phone', 'birthDate', 'birthPlace', 'gender'];

export const profileForStorage = (profile) => {
  if (!profile) return profile;
  const copy = { ...profile };
  PRIVATE_PROFILE_FIELDS.forEach((field) => { delete copy[field]; });
  return copy;
};

/**
 * Provider del contesto globale RoR.
 * Gestisce tema, vista, localizzazione multilingue, profilo utente autenticato,
 * finestre modali, notifiche toast, notifiche push e stato della rete (online/offline).
 */
export const AppProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq && mq.matches) return 'dark';
      }
    } catch (e) {
      console.warn('Impossibile accedere a localStorage per il tema:', e);
    }
    return 'light';
  });

  const [viewMode, setViewModeState] = useState(() => {
    try {
      const savedViewMode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      if (savedViewMode === 'mobile' || savedViewMode === 'pc' || savedViewMode === 'desktop') return savedViewMode;
    } catch (e) {
      console.warn('Impossibile accedere a localStorage per la modalità vista:', e);
    }
    return 'mobile';
  });

  const [language, setLanguageState] = useState(() => {
    try {
      const savedLang = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
      if (savedLang) return normalizeLanguageCode(savedLang);
    } catch (e) {
      console.warn('Impossibile accedere a localStorage per la lingua:', e);
    }
    return 'it';
  });

  const [userProfile, setUserProfile] = useState(() => {
    try {
      const savedProfile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      return savedProfile ? JSON.parse(savedProfile) : null;
    } catch (e) {
      console.warn('Impossibile leggere il profilo da localStorage:', e);
      return null;
    }
  });

  /**
   * Stato della verifica di sessione con il backend:
   * 'checking' (all'avvio), 'authenticated', 'anonymous' oppure 'offline'
   * (server non raggiungibile: si usa il profilo in cache, se presente).
   */
  const [authStatus, setAuthStatus] = useState('checking');
  const userProfileRef = useRef(userProfile);
  // testi dei toast mostrati da callback stabili (sessione scaduta, tema, vista) nella lingua corrente:
  // prima erano scritti solo in italiano
  const languageRef = useRef(language);
  languageRef.current = language;
  const text = useCallback((key) => getI18n(languageRef.current)[key], []);
  // Incrementato a ogni login/logout: evita che una verifica di sessione lenta
  // sovrascriva un accesso appena effettuato.
  const authEpochRef = useRef(0);

  /**
   * Salva il nuovo profilo rider in memoria ed in localStorage.
   */
  const registerUser = useCallback((profile) => {
    authEpochRef.current += 1;
    userProfileRef.current = profile;
    setUserProfile(profile);
    // La lingua salvata sul server segue l'utente su tutti i dispositivi
    if (profile && profile.language) {
      const serverLanguage = normalizeLanguageCode(profile.language);
      setLanguageState((prev) => (prev === serverLanguage ? prev : serverLanguage));
    }
    setAuthStatus(profile ? 'authenticated' : 'anonymous');
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileForStorage(profile)));
    } catch (e) {
      console.warn('Impossibile salvare il profilo in localStorage:', e);
    }
  }, []);

  /**
   * Disconnette l'utente e rimuove il profilo dal salvataggio locale.
   */
  const logoutUser = useCallback((options = {}) => {
    const { remote = true } = options && typeof options === 'object' && !options.nativeEvent ? options : {};
    if (remote) {
      // Chiude la sessione anche sul server (ignora errori di rete: lo stato locale viene comunque pulito)
      authService.logout().catch(() => {});
      // logout volontario: la sessione di guida in corso non va conservata sul telefono
      window.dispatchEvent(new CustomEvent('ror:logout'));
    }
    authEpochRef.current += 1;
    userProfileRef.current = null;
    setUserProfile(null);
    setAuthStatus('anonymous');
    try {
      localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
      localStorage.removeItem(STORAGE_KEYS.RIDE_SESSION); // dati locali delle versioni precedenti
    } catch (e) {
      console.warn('Impossibile rimuovere i dati da localStorage:', e);
    }
  }, []);

  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    content: null,
    actionLabel: 'Capito',
    onConfirm: null
  });

  const [toast, setToast] = useState({
    isOpen: false,
    message: '',
    type: 'success'
  });

  const toastTimerRef = useRef(null);

  const [pushBanner, setPushBanner] = useState({
    visible: false,
    title: '',
    body: '',
    category: 'consegne'
  });

  const pushBannerTimerRef = useRef(null);

  // Rilevamento reattivo dello stato della rete (online / offline)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  // se l'app si apre già senza rete, al ritorno della connessione va mostrato l'avviso di ripristino
  const [wasOffline, setWasOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);

  useEffect(() => {
    let restoredTimer = null;

    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowRestoredNotice(true);
        if ('vibrate' in navigator) navigator.vibrate(20);
        restoredTimer = setTimeout(() => {
          setShowRestoredNotice(false);
          setWasOffline(false);
        }, 4000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowRestoredNotice(false);
      if ('vibrate' in navigator) navigator.vibrate([40, 60, 40]);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (restoredTimer) clearTimeout(restoredTimer);
    };
  }, [wasOffline]);

  const showToast = useCallback((message, type = 'success', durationMs = 2600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ isOpen: true, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, durationMs);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(prev => ({ ...prev, isOpen: false }));
  }, []);

  const setLanguage = useCallback((code) => {
    const normalized = normalizeLanguageCode(code);
    setLanguageState(normalized);

    const isRTL = RTL_CODES.includes(normalized);
    document.documentElement.lang = normalized;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

    try {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, normalized);
    } catch (e) {
      console.warn('Impossibile salvare la lingua in localStorage:', e);
    }

    // Utente autenticato: la preferenza viene salvata anche sul server
    const currentProfile = userProfileRef.current;
    if (currentProfile && currentProfile.language !== normalized) {
      const updatedProfile = { ...currentProfile, language: normalized };
      userProfileRef.current = updatedProfile;
      setUserProfile(updatedProfile);
      try {
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileForStorage(updatedProfile)));
      } catch (e) {
        console.warn('Impossibile aggiornare il profilo in localStorage:', e);
      }
      profileService.updateSettings({ language: normalized }).catch((err) => {
        console.warn('Impossibile salvare la lingua sul server:', err.message);
      });
    }

    const t = getI18n(normalized);
    showToast(t.applied || 'Lingua applicata ✓', 'success', 2200);
  }, [showToast]);

  /** Mostra il banner in alto per una notifica reale (le notifiche vivono sul server). */
  const triggerPushNotification = useCallback((title, body, category = 'sistema') => {
    // Feedback tattile tramite vibrazione
    if ('vibrate' in navigator) navigator.vibrate([35, 45, 35]);

    // Feedback sonoro sintetizzato a latenza zero in base alla categoria
    try {
      if (category === 'sicurezza' || category === 'sos') {
        playSosSound();
      } else if (category === 'consegne' || category === 'ordini') {
        playOrderHotSound();
      } else if (category === 'chat') {
        playChatSound();
      } else {
        playNotificationSound();
      }
    } catch (e) {
      // Ignora silenziosamente eventuali blocchi autoplay del browser
    }

    if (pushBannerTimerRef.current) clearTimeout(pushBannerTimerRef.current);
    setPushBanner({ visible: true, title, body, category });

    pushBannerTimerRef.current = setTimeout(() => {
      setPushBanner(prev => prev ? { ...prev, visible: false } : null);
    }, 5000);
  }, []);

  const hidePushNotification = useCallback(() => {
    if (pushBannerTimerRef.current) clearTimeout(pushBannerTimerRef.current);
    setPushBanner(prev => prev ? { ...prev, visible: false } : null);
  }, []);

  // i messaggi di errore del server arrivano nella lingua dell'app
  useEffect(() => {
    setApiLanguage(language);
  }, [language]);

  useEffect(() => {
    document.body.className = `theme-${theme} view-${viewMode}`;
    const isRTL = RTL_CODES.includes(language);
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
    } catch (e) {
      console.warn('Impossibile salvare le impostazioni in localStorage:', e);
    }
  }, [theme, viewMode, language]);

  /**
   * Riallinea il profilo con il backend (GET /api/auth/session).
   * @returns {Promise<object|null>} profilo aggiornato o null
   */
  const refreshSession = useCallback(async () => {
    const epoch = authEpochRef.current;
    try {
      const profile = await authService.getSession();
      if (epoch !== authEpochRef.current) return profile;
      if (profile) {
        registerUser(profile);
      } else {
        logoutUser({ remote: false });
      }
      return profile;
    } catch (error) {
      // Server irraggiungibile: si mantiene il profilo in cache in modalità offline
      if (epoch === authEpochRef.current) setAuthStatus('offline');
      return null;
    }
  }, [registerUser, logoutUser]);

  // Verifica della sessione reale all'avvio dell'app
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Sessione scaduta su un endpoint protetto: si torna al login
  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (!userProfileRef.current) return;
      logoutUser({ remote: false });
      showToast(text('sessionExpiredToast'), 'warning');
    };

    window.addEventListener('ror:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ror:unauthorized', handleUnauthorized);
  }, [logoutUser, showToast, text]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => {
      const nextTheme = prevTheme === 'light' ? 'dark' : 'light';
      showToast(text(nextTheme === 'dark' ? 'themeDarkToast' : 'themeLightToast'), 'info', 2200);
      return nextTheme;
    });
  }, [showToast, text]);

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    showToast(text(mode === 'mobile' ? 'viewMobileToast' : 'viewDesktopToast'), 'info', 2200);
  }, [showToast, text]);

  const openModal = useCallback((title, content, actionLabel = 'Capito', onConfirm = null) => {
    setModal({ isOpen: true, title, content, actionLabel, onConfirm });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  /** Getter attivo delle traduzioni `t` */
  const t = useMemo(() => getI18n(language), [language]);

  const contextValue = useMemo(() => ({
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    language,
    setLanguage,
    userProfile,
    authStatus,
    refreshSession,
    registerUser,
    logoutUser,
    t,
    modal,
    openModal,
    closeModal,
    toast,
    showToast,
    hideToast,
    pushBanner,
    triggerPushNotification,
    hidePushNotification,
    isOnline,
    setIsOnline,
    wasOffline,
    showRestoredNotice,
    setShowRestoredNotice
  }), [
    theme,
    toggleTheme,
    viewMode,
    setViewMode,
    language,
    setLanguage,
    userProfile,
    authStatus,
    refreshSession,
    registerUser,
    logoutUser,
    t,
    modal,
    openModal,
    closeModal,
    toast,
    showToast,
    hideToast,
    pushBanner,
    triggerPushNotification,
    hidePushNotification,
    isOnline,
    setIsOnline,
    wasOffline,
    showRestoredNotice,
    setShowRestoredNotice
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

/** Hook principale unificato per consumare l'intero contesto dell'app */
export const useApp = () => useContext(AppContext);

/** Hook granulare per la gestione del Tema e della Modalità di Visualizzazione */
export const useTheme = () => {
  const { theme, toggleTheme, viewMode, setViewMode } = useApp();
  return { theme, toggleTheme, viewMode, setViewMode };
};

/** Hook granulare per l'Internazionalizzazione e le Traduzioni */
export const useI18n = () => {
  const { language, setLanguage, t } = useApp();
  return { language, setLanguage, t };
};

/** Hook granulare per l'Autenticazione e il Profilo Rider */
export const useAuth = () => {
  const { userProfile, authStatus, refreshSession, registerUser, logoutUser } = useApp();
  return { userProfile, authStatus, refreshSession, registerUser, logoutUser };
};

/** Hook granulare per Feedback UI (Modali, Toast, Notifiche Push) */
export const useUI = () => {
  const {
    modal,
    openModal,
    closeModal,
    toast,
    showToast,
    hideToast,
    pushBanner,
    triggerPushNotification,
    hidePushNotification
  } = useApp();
  return {
    modal,
    openModal,
    closeModal,
    toast,
    showToast,
    hideToast,
    pushBanner,
    triggerPushNotification,
    hidePushNotification
  };
};

/** Hook granulare per la connettività di rete (online / offline) */
export const useNetwork = () => {
  const { isOnline, setIsOnline, wasOffline, showRestoredNotice, setShowRestoredNotice } = useApp();
  return { isOnline, setIsOnline, wasOffline, showRestoredNotice, setShowRestoredNotice };
};
