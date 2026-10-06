import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { useRideTracking, rideElapsedMs } from '../context/RideTrackingContext';
import { buildWeatherUrl, classifyWeather, formatTemperature } from '../utils/weatherUtils';
import { formatKm } from '../utils/statsFormat';
import { bikeService } from '../services/bikeService';
import { isNativeApp } from '../native/platform';

/** Cronometro "h:mm:ss" / "mm:ss". */
export const formatClock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const panelStyle = {
  margin: '0 0 14px 0',
  padding: '12px 14px',
  borderRadius: '16px',
  background: 'var(--bg-card-subtle)',
  border: '1px solid var(--border-light)',
  color: 'var(--text-main)',
  fontSize: '0.82rem'
};

const pillBtn = {
  height: '40px',
  padding: '0 16px',
  borderRadius: '20px',
  border: 'none',
  fontWeight: 800,
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-main)',
  whiteSpace: 'nowrap'
};

const metric = (value, unit, label) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
    <span style={{ fontSize: '1.35rem', fontWeight: 900, lineHeight: 1.1 }}>
      {value}<span style={{ fontSize: '0.72rem', fontWeight: 700, marginLeft: '2px' }}>{unit}</span>
    </span>
    <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>{label}</span>
  </div>
);

/**
 * Pagina Principale: meteo reale, sessione di guida con tracciamento GPS reale
 * (RideTrackingContext → /stream e /session/end), rilevamento cadute e SOS.
 */
export const Home = () => {
  const navigate = useNavigate();
  const { toggleTheme, openModal, showToast, t, userProfile } = useApp();
  const tracking = useRideTracking();
  const ride = tracking?.ride;
  const [now, setNow] = useState(() => Date.now());
  const [weatherData, setWeatherData] = useState(null);
  // 'loading' | 'ready' | 'unavailable' (posizione negata o servizio meteo non raggiungibile)
  const [weatherStatus, setWeatherStatus] = useState('loading');

  const isRunning = ride && ride.status !== 'idle';
  const [myBike, setMyBike] = useState(undefined); // undefined = caricamento, null = nessuna bici collegata

  // Bici collegata (le uscite GPS vengono conteggiate per lei)
  useEffect(() => {
    if (!userProfile) return undefined;
    let cancelled = false;
    bikeService.mine().then((bike) => { if (!cancelled) setMyBike(bike); }).catch(() => { if (!cancelled) setMyBike(null); });
    return () => { cancelled = true; };
  }, [userProfile]);

  // Cronometro della sessione attiva
  useEffect(() => {
    if (ride?.status !== 'active') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ride?.status]);

  /**
   * Meteo reale nella posizione del dispositivo (Open-Meteo, nessuna chiave richiesta).
   * Se la posizione non è disponibile il widget lo dice, senza mostrare valori inventati.
   */
  useEffect(() => {
    let cancelled = false;
    const fail = () => { if (!cancelled) setWeatherStatus('unavailable'); };
    if (!('geolocation' in navigator)) {
      fail();
      return undefined;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      fetch(buildWeatherUrl(pos.coords.latitude, pos.coords.longitude))
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data) => {
          if (cancelled) return;
          if (data && data.current && typeof data.current.temperature_2m === 'number') {
            setWeatherData(data.current);
            setWeatherStatus('ready');
          } else {
            setWeatherStatus('unavailable');
          }
        })
        .catch(fail);
    }, fail, { timeout: 10000, maximumAge: 10 * 60 * 1000 });
    return () => { cancelled = true; };
  }, []);

  const weatherCondition = classifyWeather(weatherData);
  const weatherConditionLabel = {
    good: t.homeWeatherStatusGood || 'Condizioni buone',
    rain: t.homeWeatherStatusRain || 'Pioggia',
    wind: t.homeWeatherStatusWind || 'Vento forte',
    cold: t.homeWeatherStatusCold || 'Freddo intenso',
    hot: t.homeWeatherStatusHot || 'Caldo intenso'
  }[weatherCondition];
  const weatherSummary = weatherStatus === 'ready'
    ? `${t.homeWeatherWind || 'Vento'} ${Math.round(weatherData.wind_speed_10m)} km/h • ${t.homeWeatherPrecipitation || 'Precipitazioni'} ${weatherData.precipitation} mm`
    : weatherStatus === 'loading'
      ? (t.homeWeatherLoading || 'Caricamento meteo...')
      : (t.homeWeatherUnavailable || 'Meteo non disponibile: attiva la posizione');

  const handleWeatherClick = () => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    const body = weatherStatus === 'ready'
      ? `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${formatTemperature(weatherData)} • ${weatherConditionLabel}</strong><br />${weatherSummary}.</p>`
      : `<p style="font-size:0.86rem; color:var(--text-main);">${weatherSummary}</p>`;
    openModal(t.homeWeatherModalTitle || 'Meteo nella tua posizione', body);
  };

  // ------------------------------------------------------------------ sessione
  const handleStart = async () => {
    if (!tracking) return;
    if ('vibrate' in navigator) navigator.vibrate(25);
    const started = await tracking.start();
    if (started) {
      showToast(isNativeApp()
        ? (t.rideStartedToastApp || 'Sessione avviata: il percorso si registra anche a schermo spento')
        : (t.rideStartedToast || 'Sessione avviata: tieni l\'app aperta per registrare il percorso'), 'success', 3500);
    }
  };

  const handleStop = () => {
    openModal(
      t.rideStopTitle || 'Terminare la sessione?',
      `<p style="font-size:0.86rem; color:var(--text-main);">${t.rideStopBody || 'Il percorso verrà salvato e comparirà in "I miei percorsi".'}</p>`,
      t.rideStopBtn || 'Termina',
      async () => {
        const saved = await tracking.stop();
        if (saved) showToast(t.rideSavedToast || 'Sessione terminata: percorso inviato', 'success', 3500);
      }
    );
  };

  const handleSos = () => {
    openModal(
      t.sosConfirmTitle || 'Inviare un SOS?',
      `<p style="font-size:0.86rem; color:var(--text-main);">${t.sosConfirmBody || 'Verrà registrato un SOS con la tua posizione, avvisati i contatti di emergenza (se configurati) e i membri dei tuoi gruppi.'}</p>`,
      t.sosConfirmBtn || 'Invia SOS',
      () => tracking?.triggerSos('manual')
    );
  };

  const errorText = {
    sensors_disabled: t.rideErrSensors || 'Per registrare il percorso attiva "Sensori" nelle impostazioni della posizione.',
    geolocation_denied: isNativeApp()
      ? (t.rideErrGeoDeniedApp || 'Il permesso di posizione è negato: abilitalo in Impostazioni → App → RoR → Autorizzazioni e riprendi.')
      : (t.rideErrGeoDenied || 'Il permesso di posizione è negato: abilitalo nelle impostazioni del browser e riprendi.'),
    geolocation_unsupported: t.rideErrGeoUnsupported || 'Questo dispositivo non fornisce la posizione GPS.',
    unauthorized: t.rideErrUnauthorized || 'Sessione di accesso scaduta: accedi di nuovo per inviare il percorso.'
  }[ride?.error];
  const syncText = ride?.syncError && ({
    not_sent: t.rideSyncNotSent || 'Punti non inviati: controlla la connessione e premi di nuovo "Termina".',
    end_failed: t.rideSyncEndFailed || 'Chiusura del percorso non riuscita: riprova "Termina".',
    service_unavailable: t.rideSyncUnavailable || 'Servizio di registrazione momentaneamente non disponibile: nuovo tentativo automatico.'
  }[ride.syncError] || t.rideSyncOffline || 'Connessione assente: i punti verranno inviati appena possibile.');

  const elapsed = ride ? rideElapsedMs(ride, now) : 0;
  // media sul tempo in movimento, come le statistiche dei percorsi: le soste non la abbassano
  const avgSpeed = ride?.movingMs > 0 ? ride.distanceKm / (ride.movingMs / 3600000) : 0;
  const statusLabel = {
    active: t.rideStatusActive || 'Sessione in corso',
    paused: ride?.restored ? (t.rideStatusRestored || 'Sessione ripristinata in pausa') : (t.rideStatusPaused || 'Sessione in pausa'),
    stopping: t.rideStatusStopping || 'Salvataggio del percorso...'
  }[ride?.status];
  const firstName = userProfile?.name || userProfile?.username || '';

  return (
    <PhoneFrame toolbarTitle="RoR Home">
      <HeaderBanner showProfileIcon={true} />

      <div className="app-content">
        <div className="app-page-view active" id="page-home">

          {/* SALUTO E TEMA */}
          <div className="user-welcome-row">
            <div className="user-greeting-text">
              <span className="greeting-subtitle">{`${t.homeHello || 'Ciao'}${firstName ? `, ${firstName}` : ''}!`}</span>
              <h2 className="greeting-main-title">{statusLabel || (t.homeReadyTitle || 'Pronto per partire?')}</h2>
            </div>
            <button className="quick-theme-btn" id="mini-theme-btn" title="Cambia Tema Scuro/Chiaro" aria-label="Cambia Tema" onClick={toggleTheme}>
              <svg className="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
          </div>

          {/* SOS DEI MEMBRI DEI MIEI GRUPPI */}
          {tracking?.groupAlerts?.length > 0 && (
            <section role="alert" style={{ ...panelStyle, background: '#FEE2E2', border: '1.5px solid #DC2626', color: '#7F1D1D' }}>
              {tracking.groupAlerts.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <strong>{`🚨 ${a.username} ${t.sosGroupToast || 'ha inviato un SOS'} (${a.createdAt.slice(11, 16)})`}</strong>
                  <Link to="/mappa" style={{ color: '#7F1D1D', fontWeight: 800, whiteSpace: 'nowrap' }}>{t.groupMapShort || 'Mappa'}</Link>
                </div>
              ))}
            </section>
          )}

          {/* ERRORI E STATO DI INVIO */}
          {(errorText || syncText) && (
            <section role="status" style={{ ...panelStyle, background: '#FEF3C7', border: '1px solid #F59E0B', color: '#78350F' }}>
              <p style={{ margin: 0 }}>{errorText || syncText}</p>
              {ride?.error === 'sensors_disabled' && (
                <Link to="/posizione" style={{ fontWeight: 800, color: 'inherit', textDecoration: 'underline' }}>{t.groupEnableSharing || 'Attivala nelle impostazioni'}</Link>
              )}
              {ride?.error === 'unauthorized' && (
                <Link to="/login" style={{ fontWeight: 800, color: 'inherit', textDecoration: 'underline' }}>{t.rideLoginAgain || 'Accedi'}</Link>
              )}
            </section>
          )}

          {/* ESITO DELL'ULTIMA SESSIONE */}
          {tracking?.lastResult && !isRunning && (
            <section role="status" style={panelStyle}>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>{t.rideLastSaved || 'Percorso inviato'}</strong>
                {` • ${formatKm(tracking.lastResult.distanceKm, 2)} km • ${formatClock(tracking.lastResult.activeMs)}`}
              </p>
              <p style={{ margin: 0, fontSize: '0.76rem' }}>
                {tracking.lastResult.pointsSent
                  ? (t.rideLastSavedBody || 'Comparirà tra pochi secondi in "I miei percorsi" e nelle statistiche.')
                  : (t.rideLastNoPoints || 'Nessuna posizione GPS registrata: non è stato salvato alcun percorso.')}
              </p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                {tracking.lastResult.pointsSent > 0 && <Link className="inline-link" to="/percorsi">{t.routesTitle || 'I miei percorsi'}</Link>}
                <button type="button" onClick={tracking.clearLastResult} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-main)' }}>
                  {t.sosClose || 'Chiudi'}
                </button>
              </div>
            </section>
          )}

          {/* METEO (posizione reale) */}
          <section className="weather-widget-card" aria-label={t.homeWeatherModalTitle || 'Meteo nella tua posizione'} onClick={handleWeatherClick} style={{ cursor: 'pointer' }}>
            <div className="weather-icon-box">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
              </svg>
            </div>
            <div className="weather-content weather-details">
              <div className="weather-top-row">
                <div className="temp-display">{weatherStatus === 'ready' ? formatTemperature(weatherData) : '--'}</div>
                {weatherConditionLabel && (
                  <div className="weather-badge">
                    <span>{weatherConditionLabel}</span>
                  </div>
                )}
              </div>
              <div className="time-display">{weatherSummary}</div>
            </div>
          </section>

          {/* SCHEDA SESSIONE */}
          <section className="ebike-main-card" aria-label={t.rideCardAria || 'Sessione di guida'}>
            <div className="ebike-card-header">
              <div className="ebike-title-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 className="ebike-name">
                    {myBike ? <Link to={`/bici/${myBike.code}`} style={{ color: 'inherit', textDecoration: 'none' }}>{myBike.label}</Link> : (t.homeEbikeName || 'Bike')}
                  </h3>
                  {ride?.status === 'active' && (
                    <span className="ebike-radar-pulse" title={t.rideGpsLive || 'GPS attivo'} aria-label={t.rideGpsLive || 'GPS attivo'}>
                      <span className="radar-dot"></span>
                      <span className="radar-wave"></span>
                    </span>
                  )}
                </div>
                <span className="ebike-sub">
                  {ride?.status === 'active' ? (t.rideInUse || 'IN USO') : ride?.status === 'paused' ? (t.rideOnPause || 'IN PAUSA') : (t.homeEbikeSub || 'NON IN USO')}
                  {myBike === null && <>{' • '}<Link className="inline-link" to="/bici">{t.homeLinkBike || 'Collega una bici'}</Link></>}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSos}
                aria-label={t.sosButtonAria || 'Invia SOS'}
                style={{ ...pillBtn, height: '36px', background: '#DC2626', color: '#FFFFFF', boxShadow: '0 2px 8px rgba(220,38,38,0.35)' }}
              >
                SOS
              </button>
            </div>

            <div className="ebike-image-wrapper">
              <picture>
                <source srcSet="/assets/home/ebike.webp" type="image/webp" />
                <img src="/assets/home/ebike.jpg" alt="Bike Rider of Riders" className="ebike-hero-img" loading="lazy" />
              </picture>
            </div>

            {!isRunning ? (
              <div className="hero-session-btn" id="btn-hero-session" role="button" tabIndex="0" onClick={handleStart}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStart(); } }}>
                <div className="session-text-container">
                  <span className="session-subtitle">{t.homeStartSessionSub || 'Inizia la tua'}</span>
                  <span className="session-main-title">{t.homeStartSessionTitle || 'Sessione'}</span>
                </div>
                <div className="btn-vai-pill">{t.homeStartSessionBtn || 'VAI'}</div>
                <picture>
                  <source srcSet="/assets/home/hero_cyclist.webp" type="image/webp" />
                  <img src="/assets/home/hero_cyclist.jpg" alt="" className="speed-artwork-img" loading="lazy" />
                </picture>
              </div>
            ) : (
              <div aria-live="polite" style={{ ...panelStyle, margin: '10px 0 0 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 6px', marginBottom: '10px' }}>
                  {metric(formatClock(elapsed), '', t.rideTime || 'Tempo')}
                  {metric(formatKm(ride.distanceKm, 2), 'km', t.rideDistance || 'Distanza')}
                  {metric(ride.status === 'active' && ride.currentSpeedKmh !== null ? Math.round(ride.currentSpeedKmh) : '—', 'km/h', t.rideSpeed || 'Velocità')}
                  {metric(avgSpeed ? avgSpeed.toFixed(1) : '—', 'km/h', t.rideAvg || 'Media')}
                </div>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.72rem', opacity: 0.8 }}>
                  {ride.status === 'active' && !ride.lastFix && (t.rideWaitingGps || 'In attesa del segnale GPS...')}
                  {ride.status === 'active' && ride.lastFix && `GPS ±${Math.round(ride.lastFix.accuracy || 0)} m${ride.gpsWeak ? ` • ${t.rideGpsWeak || 'segnale debole'}` : ''}`}
                  {` • ${t.ridePointsSent || 'punti inviati'}: ${ride.pointsSent}`}
                  {ride.pendingCount > 0 && ` • ${t.ridePointsPending || 'in attesa'}: ${ride.pendingCount}`}
                  {ride.status === 'active' && !ride.motionActive && ` • ${t.rideNoFallDetection || 'rilevamento cadute non disponibile su questo dispositivo'}`}
                </p>
                <div className="home-quick-actions-bar" style={{ position: 'static', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  {ride.status === 'active' && (
                    <button type="button" className="quick-action-pill" onClick={tracking.pause} style={pillBtn}>
                      {t.homePauseTurn || 'Pausa'}
                    </button>
                  )}
                  {ride.status === 'paused' && (
                    <button type="button" className="quick-action-pill paused" onClick={tracking.resume} style={pillBtn}>
                      {t.homeResumeTurn || 'Riprendi'}
                    </button>
                  )}
                  <button type="button" onClick={handleStop} disabled={ride.status === 'stopping'}
                    style={{ ...pillBtn, background: '#0F171A', color: '#FFFFFF' }}>
                    {ride.status === 'stopping' ? (t.rideStatusStopping || 'Salvataggio...') : (t.rideStopBtn || 'Termina')}
                  </button>
                  <button type="button" onClick={() => navigate('/mappa')} style={{ ...pillBtn, background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-light)' }}>
                    {t.groupMapShort || 'Mappa'}
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>
      </div>
    </PhoneFrame>
  );
};
