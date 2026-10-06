import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { useApp } from '../context/AppContext';

export const Login = () => {
  const navigate = useNavigate();
  // Si passa avanti la pagina protetta richiesta (es. un link d'invito) ad accesso e registrazione
  const { state: fromState } = useLocation();
  const { openModal, t } = useApp();

  return (
    <PhoneFrame showNavbar={false} toolbarTitle="RoR Login & Onboarding">
      <div className="app-content" style={{ padding: 0, overflowY: 'auto', background: 'var(--bg-main)' }}>

        {/* INTESTAZIONE EROICA CON LOGO DEL BRAND */}
        <div className="auth-hero-header">
          <div className="auth-logo-circle">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5.5" cy="17.5" r="3.5"></circle>
              <circle cx="18.5" cy="17.5" r="3.5"></circle>
              <circle cx="15" cy="4.5" r="1.5" fill="#059669"></circle>
              <path d="M12 17.5V14l-3-3 4-3 2 3h2.5"></path>
            </svg>
          </div>
          <h1 className="auth-brand-name">RoR</h1>
          <span className="auth-brand-tag">RIDER OF RIDERS</span>
        </div>

        {/* CORPO DELLA SCHEDA AUTENTICAZIONE */}
        <div className="auth-body-container">
          <h2 className="auth-welcome-title">{t.authJoin || "Unisciti alla flotta"}</h2>
          <p className="auth-welcome-sub">
            {t.authJoinText || "Registra i tuoi percorsi con il GPS del telefono, ricevi ordini di consegna e resta in contatto con il tuo gruppo."}
          </p>

          {/* 3 BADGE A PILLOLA: funzioni reali dell'app */}
          <div className="auth-feature-pills">
            <span className="auth-pill-badge">GPS</span>
            <span className="auth-pill-badge">SOS</span>
            <span className="auth-pill-badge">{t.authBadgeDeliveries || "Consegne"}</span>
          </div>

          {/* PULSANTI DI AZIONE */}
          <div className="auth-actions-group">
            <button className="auth-btn-primary" onClick={() => navigate('/register', { state: fromState })}>
              <span>{t.authCreateAccount || "Crea nuovo account"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>

            <button className="auth-btn-secondary" onClick={() => navigate('/accedi', { state: fromState })}>
              {t.authHaveAccount || "Ho già un account"}
            </button>
          </div>

          {/* TERMINI E CONDIZIONI DI SERVIZIO */}
          <p className="auth-terms-disclaimer">
            {t.authContinueAccept || 'Continuando accetti i'}{' '}
            <button
              type="button"
              onClick={() =>
                openModal(
                  t.authTerms || 'Termini di Servizio RoR 📄',
                  `<p style="font-size:0.84rem; color:var(--text-main);">${t.authTermsBody || 'RoR registra solo i percorsi che avvii tu e gestisce consegne, gruppi e SOS. Come vengono usati i tuoi dati è spiegato nella pagina Privacy; le condizioni del servizio sono stabilite da chi lo gestisce.'}</p>`
                )
              }
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit'
              }}
            >
              {t.authTerms || "Termini"}
            </button>{' '}
            {t.authAndThe || "e l'"}<button
              type="button"
              onClick={() => navigate('/privacy')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit'
              }}
            >
              {t.authPrivacy || "Informativa Privacy"}
            </button>.
          </p>

        </div>

      </div>
    </PhoneFrame>
  );
};
