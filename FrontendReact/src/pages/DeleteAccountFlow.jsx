import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { authService, authErrorMessage } from '../services/authService';
import { useApp } from '../context/AppContext';

/**
 * Componente DeleteAccountFlow (Flusso Eliminazione Account Rider).
 * Conforme alle normative GDPR (Art. 17 Diritto all'oblio) e ai requisiti
 * di pubblicazione Apple App Store e Google Play Store.
 * 
 * Flusso a 3 passaggi:
 * 1. 'confirm': Avviso trasparente sulle conseguenze e perdita dati.
 * 2. 'password': Richiesta credenziali per convalida dell'identità.
 * 3. 'success': Conferma cancellazione definitiva e logout automatico.
 */
export const DeleteAccountFlow = () => {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'password' | 'success'
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { openModal, logoutUser, showToast, t } = useApp();

  // Conferma iniziale per passare all'inserimento password
  const handleConfirm = () => setStep('password');

  // Invio della richiesta di cancellazione al backend con password di sicurezza
  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      showToast(t.pwdStrengthHint || 'La password deve contenere almeno 6 caratteri', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      await authService.deleteAccount(password);
      // Pulizia immediata della sessione utente locale
      if (typeof logoutUser === 'function') {
        logoutUser();
      }
      setStep('success');
    } catch (error) {
      openModal(
        t.delAccErrorTitle || 'Errore Eliminazione',
        authErrorMessage(error, t) || t.delAccErrorDesc || 'Impossibile eliminare l\'account. Verifica la password.',
        t.delAccRetryBtn || 'Riprova',
        () => setStep('password')
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Ritorno alla schermata di registrazione al termine della procedura
  const handleFinish = () => {
    navigate('/register');
  };

  return (
    <PhoneFrame toolbarTitle={t.delAccToolbarTitle || 'Eliminazione Account'} showNavbar={false}>
      <HeaderBanner backTo="/profilo" />
      <div
        className="app-content"
        style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '75vh',
          textAlign: 'center'
        }}
      >
        {/* PASSAGGIO 1: AVVISO DI CONFERMA ELIMINAZIONE */}
        {step === 'confirm' && (
          <div
            style={{
              width: '100%',
              maxWidth: '340px',
              animation: 'rorFadeIn 0.3s ease-in',
              background: 'var(--bg-card)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '24px',
              padding: '28px 20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ fontSize: '3.2rem', marginBottom: '14px', lineHeight: 1 }}>⚠️</div>
            <h2
              style={{
                color: 'var(--text-danger)',
                fontSize: '1.4rem',
                fontWeight: 900,
                marginBottom: '14px',
                letterSpacing: '-0.3px'
              }}
            >
              {t.delAccWarningTitle || 'Attenzione!'}
            </h2>
            <p
              style={{
                fontSize: '0.88rem',
                color: 'var(--text-muted)',
                marginBottom: '28px',
                lineHeight: '1.55'
              }}
            >
              {t.delAccWarningDesc || 'Il tuo profilo verrà eliminato per sempre. Tutti i tuoi dati, lo storico delle uscite e i contatti SOS andranno persi. Sei sicuro di voler procedere?'}
            </p>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                width: '100%',
                justifyContent: 'center'
              }}
            >
              <button
                type="button"
                onClick={() => navigate('/profilo')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '16px',
                  border: '1px solid var(--border-card)',
                  backgroundColor: 'var(--bg-card-subtle)',
                  color: 'var(--text-main)',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.delAccCancelBtn || 'Annulla'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '16px',
                  border: 'none',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.delAccProceedBtn || 'Sì, procedi'}
              </button>
            </div>
          </div>
        )}

        {/* PASSAGGIO 2: VERIFICA IDENTITÀ CON PASSWORD */}
        {step === 'password' && (
          <div
            style={{
              width: '100%',
              maxWidth: '340px',
              animation: 'rorFadeIn 0.3s ease-in',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '24px',
              padding: '28px 20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '14px', lineHeight: 1 }}>🔒</div>
            <h2
              style={{
                color: 'var(--text-main)',
                fontSize: '1.3rem',
                fontWeight: 800,
                marginBottom: '10px'
              }}
            >
              {t.delAccVerifyTitle || 'Verifica Identità'}
            </h2>
            <p
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-muted)',
                marginBottom: '22px',
                lineHeight: '1.5'
              }}
            >
              {t.delAccVerifyDesc || 'Inserisci la password del tuo profilo per confermare l\'eliminazione definitiva.'}
            </p>

            <form
              onSubmit={handleSubmitPassword}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.delAccPasswordPlaceholder || 'Password del tuo profilo'}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: '16px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
                autoFocus
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '16px',
                    border: '1px solid var(--border-card)',
                    backgroundColor: 'var(--bg-card-subtle)',
                    color: 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer'
                  }}
                >
                  {t.delAccCancelBtn || 'Annulla'}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    flex: 1.5,
                    padding: '12px 14px',
                    borderRadius: '16px',
                    border: 'none',
                    backgroundColor: isLoading ? 'var(--border-card)' : '#EF4444',
                    color: '#FFFFFF',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    boxShadow: isLoading ? 'none' : '0 4px 14px rgba(239, 68, 68, 0.4)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isLoading
                    ? (t.delAccDeletingBtn || 'Eliminazione in corso...')
                    : (t.delAccSubmitBtn || 'Elimina Account')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PASSAGGIO 3: CONFERMA SUCCESSO ELIMINAZIONE */}
        {step === 'success' && (
          <div
            style={{
              width: '100%',
              maxWidth: '340px',
              animation: 'rorFadeIn 0.3s ease-in',
              background: 'var(--bg-card)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '24px',
              padding: '28px 20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ fontSize: '3.2rem', marginBottom: '14px', lineHeight: 1 }}>✅</div>
            <h2
              style={{
                color: 'var(--text-success)',
                fontSize: '1.35rem',
                fontWeight: 900,
                marginBottom: '12px'
              }}
            >
              {t.delAccSuccessTitle || 'Account Eliminato'}
            </h2>
            <p
              style={{
                fontSize: '0.86rem',
                color: 'var(--text-muted)',
                marginBottom: '26px',
                lineHeight: '1.5'
              }}
            >
              {t.delAccSuccessDesc || 'Il tuo profilo e tutti i dati telematici sono stati rimossi con successo dai nostri server.'}
            </p>
            <button
              type="button"
              onClick={handleFinish}
              style={{
                width: '100%',
                padding: '13px 24px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: 'var(--ror-cyan)',
                color: '#000000',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.88rem',
                boxShadow: '0 4px 14px rgba(155, 225, 145, 0.4)',
                transition: 'all 0.2s ease'
              }}
            >
              {t.delAccBackToRegisterBtn || 'Torna alla Registrazione'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes rorFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </PhoneFrame>
  );
};
