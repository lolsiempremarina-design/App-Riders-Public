import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { useApp } from '../context/AppContext';
import { bikeService, bikeQrImageUrl, bikePublicUrl } from '../services/bikeService';

const printStyle = `
  @media print {
    body { background: #fff !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .app-shell, .app-content, .app-page-view { background: #fff !important; }
    .no-print { display: none !important; }
    .print-card { box-shadow: none !important; border: 2px solid #0f172a !important; }
    .print-card * { color: #0f172a !important; }
  }
`;

const gradient = 'linear-gradient(135deg, rgba(155,225,145,0.22) 0%, rgba(255,255,255,0.9) 100%)';

const btn = {
  padding: '10px 14px',
  borderRadius: '14px',
  border: 'none',
  background: 'var(--ror-cyan)',
  color: '#000',
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'var(--font-main)'
};

const Stat = ({ label, value, hint }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '10px', textAlign: 'center' }}>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{value}</div>
    {hint && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{hint}</div>}
  </div>
);

const showQr = (openModal, bike) => openModal(
  `QR ${bike.code}`,
  <div style={{ textAlign: 'center' }}>
    <img src={bikeQrImageUrl(bike.code)} alt={`QR ${bike.code}`} style={{ width: '240px', height: '240px', background: '#fff', borderRadius: '12px' }} />
    <p style={{ fontSize: '0.8rem', marginTop: '8px', wordBreak: 'break-all' }}>{bikePublicUrl(bike.code)}</p>
  </div>
);

/** Elenco pubblico delle bici della community (GET /api/bikes) con statistiche reali. */
export const BikeCataloguePage = () => {
  const navigate = useNavigate();
  const { openModal, t } = useApp();
  const [bikes, setBikes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    bikeService.list().then(setBikes).catch((err) => setError(err?.message || 'Errore'));
  }, []);

  return (
    <PhoneFrame toolbarTitle="Community Bike">
      <div className="app-content" style={{ padding: '18px 16px 32px' }}>
        <div className="app-page-view active" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: gradient, borderRadius: '24px', padding: '18px 16px', color: 'var(--text-main)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', opacity: 0.72, marginBottom: '8px', textTransform: 'uppercase' }}>Community Bike Archive</div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-main)' }}>
              {bikes ? `${bikes.length} QR Bike` : 'QR Bike'}
            </h1>
          </div>

          {error && <p role="alert">{t.bikesLoadError || 'Impossibile caricare le bici.'} {error}</p>}
          {!bikes && !error && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '30px auto' }}></div>}

          {bikes && bikes.map((bike) => (
            <button
              key={bike.code}
              type="button"
              onClick={() => navigate(`/bici/${bike.code}`)}
              style={{ textAlign: 'left', border: '1px solid var(--border-light)', background: 'var(--bg-card)', borderRadius: '18px', padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-main)', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}
            >
              <img
                src={bikeQrImageUrl(bike.code)}
                alt={`QR ${bike.code}`}
                onClick={(event) => { event.stopPropagation(); showQr(openModal, bike); }}
                title="Ingrandisci QR"
                style={{ width: '64px', height: '64px', borderRadius: '12px', background: '#fff', border: '1px solid var(--border-light)', cursor: 'zoom-in' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{bike.code}</div>
                <div style={{ fontSize: '1rem', marginTop: '4px' }}>{bike.model || bike.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {`${bike.stats.distanceKm.toFixed(1)} km • ${bike.stats.rides} ${t.bikeRides || 'uscite'}`}{bike.inUse ? ` • ${t.bikeInUse || 'in uso'}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '1.2rem' }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
};

/** Scheda pubblica di una bici (aperta dal QR): statistiche reali e collegamento al proprio account. */
export const BikeHubPage = ({ bikeId: propBikeId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openModal, showToast, t, userProfile } = useApp();
  const params = useParams();
  const bikeCode = propBikeId || params.bikeId;
  const [bike, setBike] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notfound | error
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBike(await bikeService.get(bikeCode));
      setStatus('ready');
    } catch (err) {
      setStatus(err?.status === 404 ? 'notfound' : 'error');
    }
  }, [bikeCode]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.textContent = printStyle;
    document.head.appendChild(styleTag);
    return () => { document.head.removeChild(styleTag); };
  }, []);

  const link = async () => {
    if (!userProfile) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setBusy(true);
    try {
      setBike(await bikeService.link(bikeCode));
      showToast(t.bikeLinkedToast || 'Bici collegata: le tue uscite GPS verranno conteggiate per lei', 'success', 3500);
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await bikeService.unlink();
      await load();
      showToast(t.bikeUnlinkedToast || 'Bici scollegata', 'info');
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'ready') {
    return (
      <PhoneFrame toolbarTitle="Community Bike">
        <div className="app-content" style={{ padding: '24px 16px', textAlign: 'center' }}>
          {status === 'loading' && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '40px auto' }}></div>}
          {status === 'notfound' && <p role="alert">{t.bikeNotFound || 'Bici non trovata.'}</p>}
          {status === 'error' && <p role="alert">{t.bikesLoadError || 'Impossibile caricare la bici.'}</p>}
          <button type="button" style={btn} onClick={() => navigate('/bici')}>{t.bikeBackToList || 'Tutte le bici'}</button>
        </div>
      </PhoneFrame>
    );
  }

  const stats = bike.stats;
  return (
    <PhoneFrame toolbarTitle={bike.label}>
      <div className="app-content" style={{ padding: '18px 16px 32px' }}>
        <div className="app-page-view active" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="print-card" style={{ background: gradient, borderRadius: '24px', padding: '18px 16px', boxShadow: 'var(--shadow-md)', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', opacity: 0.72, textTransform: 'uppercase' }}>{bike.code}</div>
                <h1 style={{ margin: '6px 0', fontSize: '1.6rem', lineHeight: 1.1 }}>{bike.label}</h1>
                {bike.description && <div style={{ fontSize: '0.76rem', opacity: 0.8 }}>{bike.description}</div>}
              </div>
              <button type="button" onClick={() => showQr(openModal, bike)} aria-label={`Ingrandisci QR ${bike.code}`} style={{ border: 'none', background: 'none', padding: 0, cursor: 'zoom-in' }}>
                <img src={bikeQrImageUrl(bike.code)} alt={`QR code ${bike.code}`} style={{ width: '84px', height: '84px', background: '#fff', borderRadius: '12px' }} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <Stat label={t.bikeKm || 'Km percorsi'} value={`${stats.distanceKm.toFixed(1)} km`} />
            <Stat label={t.bikeCo2 || 'CO₂ evitata'} value={`${stats.co2SavedKg} kg`} hint={`${t.bikeCo2Estimate || 'stima auto'}: ${Math.round((bike.co2FactorKgPerKm || 0.12) * 1000)} g/km`} />
            <Stat label={t.bikeRiders || 'Rider'} value={stats.riders} />
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
            {stats.rides
              ? `${stats.rides} ${t.bikeRidesRecorded || 'uscite GPS registrate con questa bici'}`
              : (t.bikeNoRides || 'Nessuna uscita registrata ancora con questa bici.')}
          </p>

          {(bike.model || bike.location) && (
            <div style={{ fontSize: '0.84rem', color: 'var(--text-main)' }}>
              {bike.model && <strong>{bike.model}</strong>}{bike.model && bike.location && <br />}{bike.location}
            </div>
          )}

          {bike.history?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
              {bike.history.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}

          <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {bike.isMine ? (
              <>
                <span style={{ alignSelf: 'center', fontWeight: 800, fontSize: '0.84rem' }}>✓ {t.bikeIsMine || 'Collegata al tuo account'}</span>
                <button type="button" style={{ ...btn, background: 'var(--bg-card-subtle)', color: 'var(--text-main)' }} disabled={busy} onClick={unlink}>
                  {t.bikeUnlink || 'Scollega'}
                </button>
              </>
            ) : (
              <button type="button" style={btn} disabled={busy} onClick={link}>
                {userProfile ? (bike.inUse ? (t.bikeTakeOver || 'Usa questa bici (la prendi tu)') : (t.bikeUse || 'Usa questa bici')) : (t.bikeLoginToUse || 'Accedi per usare questa bici')}
              </button>
            )}
            {bike.contactPhone && (
              <a href={`tel:${bike.contactPhone.replace(/[^\d+]/g, '')}`} style={{ ...btn, background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-light)', textDecoration: 'none' }}>
                {t.bikeCall || 'Chiama'} {bike.contactPhone}
              </a>
            )}
            <button type="button" style={{ ...btn, background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-light)' }} onClick={() => window.print()}>
              {t.bikePrint || 'Stampa scheda'}
            </button>
            <button type="button" style={{ ...btn, background: 'transparent', color: 'var(--text-muted)' }} onClick={() => navigate('/bici')}>
              {t.bikeBackToList || 'Tutte le bici'}
            </button>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};
