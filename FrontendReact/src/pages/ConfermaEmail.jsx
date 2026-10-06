import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { authService, authErrorMessage } from '../services';

/** Messaggio dell'errore: quello del campo, se il server lo indica (già nella lingua dell'app). */
const errorText = (err, t) => (err?.fields ? Object.values(err.fields)[0] : null) || authErrorMessage(err, t);

/**
 * Conferma dell'email con il codice di 6 cifre inviato dal server (solo con la posta configurata):
 *  - account nuovo: finché il codice non è confermato l'app porta qui (ProtectedRoute); si può correggere
 *    un indirizzo scritto male o uscire;
 *  - cambio di email dal Profilo: la nuova email vale solo dopo il codice; il cambio si può annullare.
 */
export const ConfermaEmail = () => {
  const navigate = useNavigate();
  const { userProfile, registerUser, logoutUser, showToast, t } = useApp();
  const changing = Boolean(userProfile?.emailConfirmed && userProfile?.pendingEmail);
  const [state, setState] = useState(null);      // {email, resendInSec, mailConfigured}
  const [wait, setWait] = useState(0);           // secondi prima di poter chiedere un nuovo codice
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await authService.getEmailConfirmation();
      setState(data);
      setWait(data.resendInSec || 0);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  // solo all'apertura: dopo la conferma il profilo cambia e la pagina porta altrove da sé
  useEffect(() => {
    if (userProfile?.emailConfirmed && !userProfile?.pendingEmail) {
      navigate('/profilo', { replace: true }); // niente da confermare
      return;
    }
    load();
  }, [load]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorText(err, t));
      if (err?.data?.retry_after) setWait(err.data.retry_after); // troppo presto per un nuovo codice
    } finally {
      setBusy(false);
    }
  };

  const confirm = (event) => {
    event.preventDefault();
    run(async () => {
      const profile = await authService.confirmEmail(code.trim());
      registerUser(profile);
      showToast(changing ? (t.confirmEmailChangedToast || 'Email aggiornata ✓') : (t.confirmEmailDoneToast || 'Email confermata ✓'),
        'success', 2500);
      navigate(changing ? '/profilo' : '/', { replace: true });
    });
  };

  const resend = (email) => run(async () => {
    const data = await authService.resendEmailCode(email);
    setState((prev) => ({ ...prev, ...data }));
    setWait(data.resendInSec || 60);
    setNewEmail('');
    setCode('');
    showToast((t.confirmEmailResentToast || 'Nuovo codice inviato a {email}').replace('{email}', data.email), 'success', 3000);
  });

  const cancelChange = () => run(async () => {
    registerUser(await authService.cancelEmailChange());
    navigate('/profilo', { replace: true });
  });

  const email = state?.email || userProfile?.pendingEmail || userProfile?.email || '';

  return (
    <PhoneFrame showNavbar={false} toolbarTitle="RoR Conferma email">
      <HeaderBanner backTo={changing ? '/profilo' : '/login'} />

      <div className="app-content" style={{ padding: '16px 16px 30px 16px' }}>
        <div className="app-page-view active" id="page-conferma-email">
          <div className="user-greeting-text" style={{ marginBottom: '18px' }}>
            <h2 className="greeting-main-title" style={{ fontSize: '1.4rem' }}>
              {changing ? (t.confirmEmailChangeTitle || 'Conferma la nuova email') : (t.confirmEmailTitle || 'Conferma la tua email')}
            </h2>
            <span className="greeting-subtitle">
              {state && !state.mailConfigured
                ? (t.confirmEmailNoMail || 'Il servizio email non è attivo: chiedi all\'amministratore di confermare il tuo account.')
                : (t.confirmEmailSentTo || 'Abbiamo inviato un codice di 6 cifre a {email}. Scade tra 24 ore: controlla anche lo spam.')
                  .replace('{email}', email)}
            </span>
          </div>

          <form onSubmit={confirm} className="reg-card" style={{ marginBottom: '18px' }}>
            <div className="reg-field-group">
              <div className="reg-field-wrapper">
                <label className="reg-field-label" htmlFor="confirm-code">{t.confirmEmailCodeLabel || 'Codice di conferma'}</label>
                <input id="confirm-code" className="reg-input-text" inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]{6}" maxLength={6} placeholder="123456" required value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            {error && <div className="auth-form-error" role="alert" style={{ marginTop: '12px' }}>{error}</div>}
            <button type="submit" className="save-btn" disabled={busy || code.length !== 6} style={{ marginTop: '14px' }}>
              {t.confirmEmailSubmit || 'Conferma'}
            </button>
            <button type="button" className="forgot-password-link" disabled={busy || wait > 0} onClick={() => resend()}
              style={{ background: 'transparent', border: 'none', padding: 0, marginTop: '12px', cursor: wait > 0 ? 'default' : 'pointer', font: 'inherit' }}>
              {wait > 0
                ? (t.confirmEmailResendIn || 'Nuovo codice tra {sec} s').replace('{sec}', String(wait))
                : (t.confirmEmailResend || 'Invia un nuovo codice')}
            </button>
          </form>

          <form className="reg-card" style={{ marginBottom: '18px' }}
            onSubmit={(e) => { e.preventDefault(); resend(newEmail.trim()); }}>
            <div className="reg-field-group">
              <div className="reg-field-wrapper">
                <label className="reg-field-label" htmlFor="confirm-new-email">
                  {t.confirmEmailWrongAddress || 'Indirizzo sbagliato? Scrivi quello giusto: ti inviamo un nuovo codice.'}
                </label>
                <input id="confirm-new-email" type="email" className="reg-input-text" autoCapitalize="none" required
                  placeholder="nome.cognome@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="save-btn" disabled={busy || wait > 0} style={{ marginTop: '14px' }}>
              {t.confirmEmailSendTo || 'Invia il codice a questo indirizzo'}
            </button>
          </form>

          {changing ? (
            <button type="button" className="save-btn" disabled={busy} onClick={cancelChange}
              style={{ background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-card)' }}>
              {t.confirmEmailCancelChange || 'Annulla il cambio di email'}
            </button>
          ) : (
            <button type="button" className="save-btn" disabled={busy} onClick={() => { logoutUser(); navigate('/login', { replace: true }); }}
              style={{ background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-card)' }}>
              {t.confirmEmailLogout || 'Esci'}
            </button>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
};
