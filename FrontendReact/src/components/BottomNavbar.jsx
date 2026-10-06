import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const BottomNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const isBiciActive = path === '/';
  const isTelemetryActive = path.includes('/statistiche') || path.includes('/velocita_media') || path.includes('/tempo_totale') || path.includes('/consegne') || path.includes('/punteggio_totale');
  const isMapActive = path.includes('/mappa');
  const isSettingsActive = path.includes('/altro') || path.includes('/info') || path.includes('/profilo') || path.includes('/gruppi') || path.includes('/gruppo-chat') || path.includes('/lingua') || path.includes('/notifiche') || path.includes('/impostazioni') || path.includes('/panoramica_uscite') || path.includes('/privacy') || path.includes('/posizione') || path.includes('/register') || path.includes('/accedi');

  let activeIndex = 0;
  if (isTelemetryActive) activeIndex = 1;
  else if (isMapActive) activeIndex = 2;
  else if (isSettingsActive) activeIndex = 3;

  const handleNavClick = (targetPath) => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    navigate(targetPath);
  };

  return (
    <nav className="custom-bottom-navbar" id="custom-navbar" aria-label="Navegazione Principale">
      <div className="navbar-inner-wrapper" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', padding: 0, margin: 0 }}>
        
        {/* PILLOLA FLUTTUANTE ANIMATA DI STATO ATTIVO */}
        <div
          className="sliding-active-pill"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '25%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
            zIndex: 1
          }}
        >
          <div style={{
            width: '72px',
            height: '44px',
            background: 'linear-gradient(135deg, #9CE292 0%, #7BCC71 100%)',
            boxShadow: '0px 4px 14px rgba(123, 204, 113, 0.42)',
            borderRadius: '22px'
          }} />
        </div>

        {/* SCHEDA 1: BICI (HOME) */}
        <button
          className={`nav-tab-item ${isBiciActive ? 'active' : ''}`}
          data-tab="bici"
          aria-label="Bici Home"
          onClick={() => handleNavClick('/')}
          style={{ zIndex: 2 }}
        >
          <div className="icon-container" style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <picture>
              <source srcSet="/assets/home/icons/nav_bici.webp" type="image/webp" />
              <img
                src="/assets/home/icons/nav_bici.png"
                alt="Icona Bici Rider"
                className="nav-icon-img"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.parentNode.innerHTML = `<svg class="hd-nav-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l2.5 4.5"/><path d="M12 17.5V14l-3-4 4-4h4"/><path d="M5.5 17.5L9 10"/></svg>`;
                }}
              />
            </picture>
          </div>
        </button>

        {/* SCHEDA 2: TELEMETRIA / STATISTICHE */}
        <button
          className={`nav-tab-item ${isTelemetryActive ? 'active' : ''}`}
          data-tab="telemetry"
          aria-label="Telemetria"
          onClick={() => handleNavClick('/statistiche')}
          style={{ zIndex: 2 }}
        >
          <div className="icon-container" style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="hd-nav-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision">
              <line x1="5" y1="20" x2="5" y2="14" strokeWidth="3" />
              <line x1="12" y1="20" x2="12" y2="4" strokeWidth="3" />
              <line x1="19" y1="20" x2="19" y2="9" strokeWidth="3" />
            </svg>
          </div>
        </button>

        {/* SCHEDA 3: MAPPA */}
        <button
          className={`nav-tab-item ${isMapActive ? 'active' : ''}`}
          data-tab="map"
          aria-label="Mappa RoR"
          onClick={() => handleNavClick('/mappa')}
          style={{ zIndex: 2 }}
        >
          <div className="icon-container" style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="hd-nav-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision">
              <path d="M12 1.8 C8.8 1.8 6.2 4.4 6.2 7.6 C6.2 11.8 12 17 12 17 C12 17 17.8 11.8 17.8 7.6 C17.8 4.4 15.2 1.8 12 1.8 Z" fill="currentColor" stroke="none" />
              <circle cx="12" cy="7.5" r="2" fill="#FFFFFF" stroke="none" />
              <path d="M 4.5,13.5 C 4.5,18 6,19.5 8,19.5 H 16 C 18,19.5 19.5,18 19.5,13.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
            </svg>
          </div>
        </button>

        {/* SCHEDA 4: ALTRO / IMPOSTAZIONI */}
        <button
          className={`nav-tab-item ${isSettingsActive ? 'active' : ''}`}
          data-tab="settings"
          aria-label="Impostazioni Altro"
          onClick={() => handleNavClick('/altro')}
          style={{ zIndex: 2 }}
        >
          <div className="icon-container" style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="hd-nav-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" shapeRendering="geometricPrecision">
              <circle cx="5" cy="12" r="2.5" />
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="19" cy="12" r="2.5" />
            </svg>
          </div>
        </button>

      </div>
    </nav>
  );
};

