import React, { useEffect, useState } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { profileService, authErrorMessage } from '../services';
import { isNativeApp } from '../native/platform';

/** Mappa impostazione (UI) → campo del backend */
const SETTING_FIELDS = {
  sensorsEnabled: 'sensors_enabled',
  shareLocationWithGroups: 'share_location_with_groups'
};

export const Posizione = () => {
  const { openModal, showToast, t, userProfile, registerUser } = useApp();

  /** Impostazioni salvate sul server (sensori e condivisione posizione con i gruppi) */
  const [settings, setSettings] = useState({
    sensorsEnabled: Boolean(userProfile?.sensorsEnabled),
    shareLocationWithGroups: Boolean(userProfile?.shareLocationWithGroups)
  });
  const [savingKey, setSavingKey] = useState(null);

  /** Stato reale del GPS del dispositivo */
  const [gps, setGps] = useState({ status: 'idle', accuracy: null, lat: null, lon: null, place: '' });

  useEffect(() => {
    let isMounted = true;
    profileService.getSettings()
      .then((serverSettings) => {
        if (!isMounted || !serverSettings) return;
        setSettings({
          sensorsEnabled: Boolean(serverSettings.sensorsEnabled),
          shareLocationWithGroups: Boolean(serverSettings.shareLocationWithGroups)
        });
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  /** Legge la posizione reale solo se l'utente ha autorizzato i sensori */
  useEffect(() => {
    if (!settings.sensorsEnabled) {
      setGps({ status: 'disabled', accuracy: null, lat: null, lon: null, place: '' });
      return undefined;
    }
    if (!('geolocation' in navigator)) {
      setGps((prev) => ({ ...prev, status: 'unsupported' }));
      return undefined;
    }
    let isMounted = true;
    setGps((prev) => ({ ...prev, status: 'searching' }));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isMounted) return;
        const next = { status: 'fix', accuracy: Math.round(coords.accuracy), lat: coords.latitude, lon: coords.longitude, place: '' };
        setGps(next);
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&accept-language=it&lat=${coords.latitude}&lon=${coords.longitude}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const address = data?.address || {};
            const place = address.suburb || address.city_district || address.city || address.town || address.village || '';
            if (isMounted && place) setGps((prev) => ({ ...prev, place }));
          })
          .catch(() => {});
      },
      (error) => {
        if (isMounted) setGps((prev) => ({ ...prev, status: error.code === 1 ? 'denied' : 'error' }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
    return () => { isMounted = false; };
  }, [settings.sensorsEnabled]);

  /** Salva sul server l'impostazione modificata (con ripristino in caso di errore) */
  const handleToggle = async (key) => {
    const previous = settings;
    const nextValue = !settings[key];
    const next = { ...settings, [key]: nextValue };
    setSettings(next);
    setSavingKey(key);
    try {
      const saved = await profileService.updateSettings({ [SETTING_FIELDS[key]]: nextValue });
      const confirmed = {
        sensorsEnabled: Boolean(saved.sensorsEnabled),
        shareLocationWithGroups: Boolean(saved.shareLocationWithGroups)
      };
      setSettings(confirmed);
      if (userProfile) registerUser({ ...userProfile, ...confirmed });
      showToast(t.settingsSavedToast || 'Impostazione salvata ✓', 'success', 1800);
    } catch (err) {
      setSettings(previous);
      showToast(authErrorMessage(err, t), 'error', 3000);
    } finally {
      setSavingKey(null);
    }
  };

  const gpsBadge = {
    idle: t.posGpsIdle || 'GPS • IN ATTESA',
    searching: t.posGpsSearching || 'GPS • RICERCA SEGNALE...',
    fix: t.posGpsFix || 'GPS FIX • ATTIVO',
    disabled: t.posGpsDisabled || 'SENSORI DISATTIVATI',
    denied: t.posGpsDenied || 'PERMESSO GPS NEGATO',
    unsupported: t.posGpsUnsupported || 'GPS NON DISPONIBILE',
    error: t.posGpsError || 'GPS • SEGNALE NON TROVATO'
  }[gps.status];

  const gpsTitle = gps.status === 'fix'
    ? (gps.place || `${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}`)
    : (gps.status === 'disabled' ? (t.posGpsNotUsed || 'Posizione non usata') : (t.posGpsUnknown || 'Posizione sconosciuta'));

  const gpsSub = gps.status === 'fix'
    ? (t.posGpsAccuracy || 'Precisione: ± {m} metri').replace('{m}', gps.accuracy)
    : gps.status === 'disabled'
      ? (t.posGpsEnableSensors || 'Attiva "Sensori e GPS" per usare la posizione')
      : gps.status === 'denied'
        ? (isNativeApp()
          ? (t.posGpsAllowApp || 'Consenti la posizione a RoR nelle impostazioni del telefono')
          : (t.posGpsAllowBrowser || 'Consenti la posizione nelle impostazioni del browser'))
        : (t.posGpsWaiting || 'In attesa del segnale GPS');

  // Elementi React (non una stringa HTML): i testi vengono dalle traduzioni, prima erano solo in italiano
  const handleGpsHeroClick = () => {
    const p = { margin: 0 };
    openModal(
      t.posHeroModalTitle || 'Stato GPS & Telemetria 📡',
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.86rem', color: 'var(--text-main)' }}>
        {gps.status === 'fix' ? (
          <>
            <p style={p}><strong>{t.posModalCoords || 'Coordinate'}:</strong> {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</p>
            <p style={p}><strong>{t.posModalAccuracy || 'Accuratezza GPS'}:</strong> {(t.posModalAccuracyValue || '± {m} metri').replace('{m}', String(gps.accuracy))}</p>
            {gps.place && <p style={p}><strong>{t.posModalZone || 'Zona'}:</strong> {gps.place}</p>}
          </>
        ) : <p style={p}>{gpsSub}</p>}
        <p style={p}>
          <strong>{t.posModalSensors || 'Sensori'}:</strong> {settings.sensorsEnabled ? (t.posModalSensorsOn || 'attivi') : (t.posModalSensorsOff || 'disattivati')}
          {' • '}
          <strong>{t.posModalSharing || 'Condivisione ai gruppi'}:</strong> {settings.shareLocationWithGroups ? (t.posModalSharingOn || 'attiva') : (t.posModalSharingOff || 'disattivata')}
        </p>
      </div>
    );
  };

  return (
    <PhoneFrame toolbarTitle={t.posToolbarTitle || "RoR Posizione & GPS"} showNavbar={true}>
      <HeaderBanner backTo="/impostazioni" />

      {/* APP SCROLLABLE CONTENT BODY */}
      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>

        {/* VISTA PAGINA POSIZIONE & GPS */}
        <div className="app-page-view active" id="page-posizione">

          {/* INTESTAZIONE TITOLO PAGINA */}
          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.posTitle || 'POSIZIONE & GPS'}
              </h2>
              <span className="greeting-subtitle">{t.posSubtitle || 'Stato del segnale GPS e sensori'}</span>
            </div>
          </div>

          {/* SCHEDA HERO POSIZIONE GPS */}
          <div
            className="gps-hero-card"
            onClick={handleGpsHeroClick}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
          >
            <span className="gps-status-badge">
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: gps.status === 'fix' ? '#9BE191' : '#F59E0B', display: 'inline-block' }}></span>
              {gpsBadge}
            </span>
            <div className="gps-title-row">
              <span className="gps-location-title">{gpsTitle}</span>
              <div className="gps-pin-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
            </div>
            <span className="gps-sub-info">{gpsSub}</span>
          </div>

          {/* SEZIONE 1: SCHEDA TRACCIAMENTO & SENSORI */}
          <div className="pref-card">
            <span className="pref-card-title">{t.posSec1Title || 'TRACCIAMENTO & SENSORI'}</span>

            {/* INTERRUTTORE 1: SENSORI E GPS (salvato sul server) */}
            <div className="toggle-row-item">
              <div className="toggle-row-info">
                <span className="toggle-row-title">{t.posToggleSensorsTitle || 'Sensori e GPS'}</span>
                <span className="toggle-row-sub">{t.posToggleSensorsSub || 'Permette di registrare i percorsi e di rilevare le cadute durante la guida'}</span>
              </div>
              <label className="switch" aria-label={t.posToggleSensorsTitle || 'Sensori e GPS'}>
                <input
                  type="checkbox"
                  id="toggle-sensors-enabled"
                  checked={settings.sensorsEnabled}
                  disabled={savingKey !== null}
                  onChange={() => handleToggle('sensorsEnabled')}
                />
                <span className="switch-slider"></span>
              </label>
            </div>

            {/* INTERRUTTORE 2: CONDIVISIONE POSIZIONE CON I GRUPPI (salvato sul server) */}
            <div className="toggle-row-item">
              <div className="toggle-row-info">
                <span className="toggle-row-title">{t.posToggleShareTitle || 'Condividi posizione con i gruppi'}</span>
                <span className="toggle-row-sub">
                  {settings.sensorsEnabled
                    ? (t.posToggleShareSub || 'I membri dei tuoi gruppi vedono la tua posizione live sulla mappa')
                    : (t.posToggleShareNeedsSensors || 'Richiede i sensori attivi per funzionare')}
                </span>
              </div>
              <label className="switch" aria-label={t.posToggleShareTitle || 'Condividi posizione con i gruppi'}>
                <input
                  type="checkbox"
                  id="toggle-share-location"
                  checked={settings.shareLocationWithGroups}
                  disabled={savingKey !== null}
                  onChange={() => handleToggle('shareLocationWithGroups')}
                />
                <span className="switch-slider"></span>
              </label>
            </div>
          </div>

        </div> {/* FINE VISTA PAGINA POSIZIONE */}
      </div> {/* FINE CONTENUTO APP */}
    </PhoneFrame>
  );
};
