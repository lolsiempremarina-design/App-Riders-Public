import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { authService, authErrorMessage } from '../services';
import { isNativeApp } from '../native/platform';
import {
  calculatePasswordStrength,
  getRememberMePreference,
  setRememberMePreference,
  getSavedEmail,
  redirectPathFromState,
  adminReturnPath
} from '../utils/authUtils';

/** Evita l'iniezione di HTML nei testi mostrati nella modale. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export const Accedi = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openModal, showToast, t, registerUser } = useApp();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Dopo l'accesso si torna alla pagina protetta richiesta (o alla Home)
  const redirectTo = redirectPathFromState(location.state, '/');
  // ...oppure al pannello admin Flask, se l'accesso è partito da lì
  const adminNext = adminReturnPath(location.search);

  // App Android: sempre "Ricordami", perché l'app cancella il cookie di sessione a ogni avvio
  // (Capacitor) e l'accesso resta solo con il cookie "ricordami".
  const nativeApp = isNativeApp();

  // Inizializzazione della preferenza Ricordami e recupero dell'email salvata
  useEffect(() => {
    const isRemembered = getRememberMePreference();
    setRememberMe(nativeApp || isRemembered);
    if (isRemembered) {
      const savedEmail = getSavedEmail();
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  // Calcolo della sicurezza della password digitata
  const pwdStrength = calculatePasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    // Salvataggio della preferenza Ricordami su questo dispositivo
    setRememberMePreference(rememberMe, email);

    let profile = null;
    try {
      // Autenticazione reale verso il backend (cookie di sessione Flask-Security)
      profile = await authService.login(email.trim(), password, rememberMe);
    } catch (err) {
      const message = authErrorMessage(err, t);
      setErrorMessage(message);
      showToast(message, 'error', 3500);
      return;
    } finally {
      setIsLoading(false);
    }

    registerUser(profile);
    setPassword('');
    if (profile && profile.emailConfirmed === false) {
      navigate('/conferma-email', { replace: true }); // account non ancora confermato: prima il codice
      return;
    }
    const riderName = `${profile?.name || ''} ${profile?.surname || ''}`.trim() || profile?.username || 'Rider';
    openModal(
      t.accediModalSuccessTitle || 'Accesso Confermato! 🚀',
      `<p style="font-size:0.86rem; color:var(--text-main);">${escapeHtml(t.accediWelcomeBody || 'Bentornato {name}! La tua sessione è attiva.').replace('{name}', `<strong>${escapeHtml(riderName)}</strong>`)}</p>`,
      t.accediModalSuccessBtn || 'Accedi alla Dashboard',
      () => (adminNext ? window.location.assign(adminNext) : navigate(redirectTo, { replace: true }))
    );
  };

  const handleForgotPassword = () => {
    openModal(
      t.accediForgotTitle || 'Recupero password 🔑',
      `<p style="font-size:0.84rem; color:var(--text-main);">${escapeHtml(t.accediForgotBody || 'Per reimpostare la password contatta l\'amministratore della flotta RoR.')}</p>`
    );
  };

  return (
    <PhoneFrame showNavbar={false} toolbarTitle="RoR Accesso Rider">
      <HeaderBanner backTo="/login" />

      <div className="app-content" style={{ padding: '16px 16px 30px 16px' }}>
        <div className="app-page-view active" id="page-accedi">

          {/* INTESTAZIONE DI BENVENUTO CON ICONA RIDER */}
          <div className="user-welcome-row" style={{ marginBottom: '20px', gap: '14px' }}>
            <div className="auth-logo-circle" style={{ width: '48px', height: '48px', flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5.5" cy="17.5" r="3.5"></circle>
                <circle cx="18.5" cy="17.5" r="3.5"></circle>
                <circle cx="15" cy="4.5" r="1.5" fill="#059669"></circle>
                <path d="M12 17.5V14l-3-3 4-3 2 3h2.5"></path>
              </svg>
            </div>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.45rem' }}>{t.accediTitle || "Bentornato Rider!"}</h2>
              <span className="greeting-subtitle">{t.accediSubtitle || "Inserisci le tue credenziali per entrare."}</span>
            </div>
          </div>

          {/* SCHEDA DEL MODULO DI ACCESSO */}
          <form onSubmit={handleSubmit}>
            <div className="reg-card" style={{ marginBottom: '24px' }}>
              <div className="reg-field-group">

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="login-email">{t.accediEmailLabel || "Email o ID Matricola"}</label>
                  <div className="input-with-icon-wrapper">
                    <span className="input-icon-left">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </span>
                    <input
                      type="text"
                      id="login-email"
                      className="reg-input-text"
                      autoComplete="username"
                      autoCapitalize="none"
                      placeholder={t.accediEmailPlaceholder || "nome.cognome@email.com"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="login-password">{t.accediPasswordLabel || "Password Personale"}</label>
                  <div className="input-with-icon-wrapper">
                    <span className="input-icon-left">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="login-password"
                      className="reg-input-text"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="input-icon-right"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Mostra o nascondi password"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>
                  </div>

                  {/* Indicatore visivo di forza della password (Strength Meter) */}
                  {password && (
                    <div className="pwd-strength-container" role="status" aria-live="polite">
                      <div className="pwd-strength-bar-track">
                        <div
                          className="pwd-strength-bar-fill"
                          style={{
                            width: `${pwdStrength.percent}%`,
                            backgroundColor: pwdStrength.color
                          }}
                        />
                      </div>
                      <div className="pwd-strength-info">
                        <span className="pwd-strength-label">
                          {t.pwdStrengthLabel || "Sicurezza Password:"}{' '}
                          <strong style={{ color: pwdStrength.color }}>
                            {t[pwdStrength.labelKey] || pwdStrength.level}
                          </strong>
                        </span>
                        <span className="pwd-strength-hint">
                          {pwdStrength.level === 'strong'
                            ? (t.pwdStrengthRobust || "✓ Password robusta")
                            : (t.pwdStrengthHint || "Usa 8+ caratteri con lettere, numeri e simboli")}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={handleForgotPassword}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      textAlign: 'left'
                    }}
                  >
                    {t.accediForgotLink || 'Password dimenticata?'}
                  </button>
                </div>

                {/* SWITCH: RICORDAMI SU QUESTO DISPOSITIVO (nell'app Android è sempre attivo) */}
                {!nativeApp && <div className="auth-remember-row">
                  <label className="auth-remember-label" htmlFor="remember-device-toggle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
                      <line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                    <span>{t.authRememberDevice || "Ricordami su questo dispositivo"}</span>
                  </label>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="remember-device-toggle"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>}

              </div>
            </div>

            {/* ERRORE DI ACCESSO RESTITUITO DAL SERVER */}
            {errorMessage && (
              <div className="auth-form-error" role="alert">
                {errorMessage}
              </div>
            )}

            {/* PULSANTE DI ACCESSO STANDARD */}
            <button type="submit" className="save-btn" disabled={isLoading} style={{ marginBottom: '14px', opacity: isLoading ? 0.7 : 1 }}>
              <span>{isLoading ? (t.accediLoading || 'Accesso in corso...') :(t.accediSubmitBtn || "Accedi al Profilo")}</span>
              {!isLoading && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px', verticalAlign: '-3px' }}>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              )}
            </button>

          </form>

          {/* LINK PER REGISTRARE UN NUOVO ACCOUNT */}
          <p style={{ fontFamily: 'var(--font-main)', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Non hai ancora un account?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--text-success)',
                fontWeight: '800',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit'
              }}
            >
              {t.authCreateAccount || "Registrati ora"}
            </button>
          </p>

        </div>
      </div>
    </PhoneFrame>
  );
};
