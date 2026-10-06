import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { IconButton } from './IconButton';

/**
 * Componente DevToolbar.
 * Barra dello sviluppatore posizionata nella parte superiore dello schermo.
 * Permette l'alternanza rapida tra tema Chiaro/Scuro, modalità di visualizzazione
 * Mobile/Desktop e l'accesso diretto alla schermata di autenticazione.
 * Visibile solo in sviluppo (vedi PhoneFrame) e mai sui telefoni (CSS a schermo intero).
 *
 * @param {Object} props
 * @param {string} [props.title='RoR React App'] - Titolo visualizzato sul badge di stato.
 */
export const DevToolbar = ({ title = 'RoR React App' }) => {
  const { toggleTheme, viewMode, setViewMode } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="dev-toolbar" role="banner">
      {/* INDICATORE DI STATO CON PULSAZIONE VERDE */}
      <div className="brand-badge">
        <span className="dot-pulse"></span>
        <strong>{title}</strong>
      </div>

      {/* SELETTORE MODALITÀ DI VISUALIZZAZIONE (MOBILE / PC) */}
      <div className="device-toggle-container" role="group" aria-label="Cambio Modalità Display">
        <button
          className={`toggle-btn ${viewMode === 'mobile' ? 'active' : ''}`}
          onClick={() => setViewMode('mobile')}
          title="Vista Smartphone Mobile"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          <span>Vista Mobile</span>
        </button>
        <button
          className={`toggle-btn ${viewMode === 'pc' ? 'active' : ''}`}
          onClick={() => setViewMode('pc')}
          title="Vista Desktop PC"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <span>Vista PC / Tablet</span>
        </button>

        {/* ACCESSO RAPIDO LOGIN / REGISTRAZIONE */}
        {location.pathname !== '/login' && (
          <button
            className="toggle-btn"
            title="Pagina Login/Register"
            onClick={() => navigate('/login')}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Login / Signup</span>
          </button>
        )}
      </div>

      {/* PULSANTE PER CAMBIARE TEMA E BADGE REACT ATTIVO */}
      <div className="toolbar-actions">
        <IconButton
          variant="theme"
          id="btn-theme-toggle"
          ariaLabel="Cambia Tema Scuro/Chiaro"
          onClick={toggleTheme}
        />
        <span className="status-chip"><i className="status-dot"></i> React Active</span>
      </div>
    </header>
  );
};

