import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { accountService } from '../services/accountService';
import { privacyNoticeFor } from '../content/privacyNotice';

const RETENTION_ORDER = ['routes_days', 'notifications_days', 'sos_alerts_days', 'chat_messages_days', 'live_position_sec'];

const Card = ({ title, children }) => (
  <section className="privacy-card">
    <div className="privacy-card-header">
      <span className="privacy-card-title">{title}</span>
    </div>
    {children}
  </section>
);

const List = ({ items }) => (
  <ul className="privacy-card-text" style={{ margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
    {items.map((item) => (
      Array.isArray(item)
        ? <li key={item[0]}><strong>{item[0]}:</strong> {item[1]}</li>
        : <li key={item}>{item}</li>
    ))}
  </ul>
);

/**
 * Informativa privacy dell'app: dati realmente trattati (src/content/privacyNotice.js),
 * titolare e tempi di conservazione dal server (GET /api/legal/privacy) ed esportazione reale
 * di tutti i dati personali (GET /api/account/export).
 */
export const Privacy = () => {
  const navigate = useNavigate();
  const { showToast, language, userProfile, authStatus } = useApp();
  const text = privacyNoticeFor(language);
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const signedIn = Boolean(userProfile) && authStatus !== 'anonymous';

  useEffect(() => {
    let cancelled = false;
    accountService.privacyInfo()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfoError(true); });
    return () => { cancelled = true; };
  }, []);

  const retentionValue = (key, value) => {
    if (key === 'live_position_sec') return text.retentionSeconds(value);
    return value ? text.retentionDays(value) : text.retentionUntilDeleted;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await accountService.downloadExport(userProfile?.username);
      showToast(text.exportDone, 'success');
    } catch {
      showToast(text.exportError, 'error');
    } finally {
      setExporting(false);
    }
  };

  const controller = info?.controller;

  return (
    <PhoneFrame toolbarTitle={text.title} showNavbar={true}>
      <HeaderBanner backTo={signedIn ? '/impostazioni' : '/login'} />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-privacy">
          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {text.title}
              </h2>
              <span className="greeting-subtitle">{text.subtitle}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card title={text.controllerTitle}>
              {controller?.configured ? (
                <p className="privacy-card-text">
                  {controller.name}<br />
                  {text.contactLabel}: <a className="inline-link" href={`mailto:${controller.email}`}>{controller.email}</a>
                </p>
              ) : (
                <p className="privacy-card-text" role="note">{info ? text.controllerMissing : (infoError ? text.retentionUnavailable : '…')}</p>
              )}
            </Card>

            <Card title={text.dataTitle}>
              <List items={text.data} />
            </Card>

            <Card title={text.sharingTitle}>
              <List items={text.sharing} />
            </Card>

            <Card title={text.retentionTitle}>
              {info ? (
                <List items={RETENTION_ORDER.map((key) => [text.retention[key], retentionValue(key, info.retention[key])])} />
              ) : (
                <p className="privacy-card-text">{infoError ? text.retentionUnavailable : '…'}</p>
              )}
              <p className="privacy-card-text" style={{ marginTop: '8px' }}>{text.retentionAccount}</p>
            </Card>

            <Card title={text.thirdPartyTitle}>
              <List items={text.thirdParty} />
            </Card>

            <Card title={text.rightsTitle}>
              <List items={text.rights} />
              <button type="button" className="profile-secondary-btn" onClick={() => navigate('/eliminazione-account')} style={{ marginTop: '10px' }}>
                {text.deletionPageLink}
              </button>
            </Card>

            {signedIn ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="save-btn" type="button" onClick={handleExport} disabled={exporting} style={{ flex: '1 1 180px' }}>
                  {text.exportButton}
                </button>
                <button type="button" onClick={() => navigate('/elimina-account')}
                  style={{ flex: '1 1 120px', borderRadius: '14px', border: '1px solid #EF4444', background: 'transparent', color: 'var(--text-danger)', fontWeight: 800, cursor: 'pointer', padding: '10px' }}>
                  {text.deleteButton}
                </button>
              </div>
            ) : (
              <p className="privacy-card-text">{text.exportLoginHint}</p>
            )}

            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.45, margin: 0 }}>{text.note}</p>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};
