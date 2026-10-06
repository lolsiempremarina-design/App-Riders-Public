import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { accountService } from '../services/accountService';
import { accountDeletionFor } from '../content/accountDeletion';

const Card = ({ title, children }) => (
  <section className="privacy-card">
    <div className="privacy-card-header">
      <h3 className="privacy-card-title" style={{ margin: 0, fontSize: 'inherit' }}>{title}</h3>
    </div>
    {children}
  </section>
);

const listStyle = { margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' };

/**
 * Pagina pubblica (senza accesso) per chiedere la cancellazione dell'account, richiesta da Google Play:
 * dall'app (/elimina-account, subito) o via email al titolare, con ciò che viene cancellato e ciò che resta.
 * Contatto e durata dei backup arrivano dal server (GET /api/legal/privacy).
 */
export const EliminazioneAccount = () => {
  const navigate = useNavigate();
  const { language, userProfile, authStatus } = useApp();
  const text = accountDeletionFor(language);
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(false);
  const signedIn = Boolean(userProfile) && authStatus !== 'anonymous';

  useEffect(() => {
    let cancelled = false;
    accountService.privacyInfo()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfoError(true); });
    return () => { cancelled = true; };
  }, []);

  const controller = info?.controller;
  const backupDays = info?.retention?.backups_days;
  const mailto = controller?.configured
    ? `mailto:${controller.email}?subject=${encodeURIComponent(text.emailSubject)}&body=${encodeURIComponent(text.emailBody)}`
    : null;

  return (
    <PhoneFrame toolbarTitle={text.title} showNavbar={signedIn}>
      <HeaderBanner backTo={signedIn ? '/privacy' : '/login'} />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-account-deletion">
          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {text.title}
              </h2>
              <span className="greeting-subtitle">{text.subtitle}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card title={text.inAppTitle}>
              <ol className="privacy-card-text" style={listStyle}>
                {text.inAppSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <button className="save-btn" type="button" onClick={() => navigate('/elimina-account')} style={{ marginTop: '12px' }}>
                {signedIn ? text.inAppButtonSignedIn : text.inAppButton}
              </button>
            </Card>

            <Card title={text.emailTitle}>
              {mailto ? (
                <>
                  <p className="privacy-card-text">{text.emailText}</p>
                  <p className="privacy-card-text" style={{ marginTop: '8px' }}>
                    {controller.name}: <a className="inline-link" href={mailto}>{controller.email}</a>
                  </p>
                </>
              ) : (
                <p className="privacy-card-text" role="note">
                  {info ? text.emailMissing : (infoError ? text.emailUnavailable : '…')}
                </p>
              )}
            </Card>

            <Card title={text.deletedTitle}>
              <ul className="privacy-card-text" style={listStyle}>
                {text.deleted.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </Card>

            <Card title={text.keptTitle}>
              <ul className="privacy-card-text" style={listStyle}>
                <li>{text.keptOrders}</li>
                <li>{backupDays ? text.keptBackups(backupDays) : text.keptBackupsUnknown}</li>
                <li>{text.keptLogs}</li>
              </ul>
            </Card>

            <button type="button" className="profile-secondary-btn" onClick={() => navigate('/privacy')}>
              {text.privacyLink}
            </button>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};
