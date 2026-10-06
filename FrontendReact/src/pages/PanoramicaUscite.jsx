import React, { useState, useEffect, useCallback } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { downloadCSV } from '../utils/exportUtils';
import { riderService } from '../services';
import { countLabel, dayMonth, formatDuration, formatKm } from '../utils/statsFormat';

const PERIODS = [
  { id: 'week', key: 'filterSettimana', fallback: 'Settimana' },
  { id: 'month', key: 'filterMese', fallback: 'Mese' },
  { id: 'year', key: 'filterAnno', fallback: 'Anno' },
  { id: 'all', key: 'filterSempre', fallback: 'Sempre' }
];

const euro = (value) => `€ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

/**
 * Panoramica delle uscite e dei guadagni (GET /api/rider/earnings): compensi degli ordini
 * consegnati, km e tempo in sella delle uscite registrate, giorno per giorno.
 * L'app non gestisce pagamenti: gli importi sono quelli maturati con le consegne.
 */
export const PanoramicaUscite = () => {
  const { openModal, showToast, t, language } = useApp();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (selected) => {
    setError(null);
    setData(null);
    try {
      setData(await riderService.getEarnings(selected));
    } catch (err) {
      setError(err?.message || 'Errore');
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const summary = data?.summary;
  const days = data?.days || [];
  const periodLabel = t[PERIODS.find((p) => p.id === period).key] || PERIODS.find((p) => p.id === period).fallback;

  const handleExportCSV = () => {
    const rows = [
      ['Data', 'Consegne', 'Guadagni (EUR)', 'Uscite GPS', 'Km', 'Tempo in sella (min)'],
      ...days.map((d) => [d.date, d.deliveries, d.earnings.toFixed(2), d.rides, d.distanceKm.toFixed(2), Math.round(d.durationSec / 60)]),
      ['TOTALE', summary?.deliveries || 0, Number(summary?.earnings || 0).toFixed(2), '', Number(summary?.rideDistanceKm || 0).toFixed(2), Math.round((summary?.rideDurationSec || 0) / 60)]
    ];
    downloadCSV(`RoR_guadagni_${period}_${data?.today || ''}.csv`, rows)
      .then(() => showToast(t.usciteExportSuccess || 'Report CSV scaricato 📥', 'success'))
      .catch(() => showToast(t.nativeShareError || 'Impossibile condividere il file', 'error'));
  };

  const showDayDetail = (day) => openModal(
    dayMonth(day.date, language),
    `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${euro(day.earnings)}</strong> • ${day.deliveries} ${countLabel(day.deliveries, t.usciteDeliveryLower || 'consegna', t.usciteDeliveriesLower || 'consegne')}<br />${day.rides} ${countLabel(day.rides, t.usciteRideLower || 'uscita GPS', t.usciteRidesLower || 'uscite GPS')} • ${formatKm(day.distanceKm, 1)} km • ${formatDuration(day.durationSec)}</p>`
  );

  return (
    <PhoneFrame toolbarTitle={t.usciteToolbarTitle || 'RoR Panoramica Uscite'} showNavbar={true}>
      <HeaderBanner backTo="/impostazioni" />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-panoramica-uscite">

          <div className="user-welcome-row" style={{ marginBottom: '12px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.usciteTitle || 'Panoramica delle uscite'}
              </h2>
              <span className="greeting-subtitle">{t.usciteSub || 'Riepilogo guadagni, corse e tempo in sella'}</span>
            </div>
          </div>

          <section className="time-filter-bar" aria-label="Periodo" style={{ marginBottom: '12px' }}>
            {PERIODS.map((p) => (
              <button key={p.id} type="button" className={`filter-tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
                {t[p.key] || p.fallback}
              </button>
            ))}
          </section>

          {error && (
            <div role="alert" style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-main)' }}>
              <p style={{ fontSize: '0.86rem' }}>{t.usciteLoadError || 'Impossibile caricare i guadagni.'} {error}</p>
              <button type="button" className="filter-tab active retry-btn" onClick={() => load(period)}>{t.retryBtn || 'Riprova'}</button>
            </div>
          )}
          {!error && !data && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '40px auto' }}></div>}

          {data && (
            <>
              <div className="earnings-hero-card">
                <span className="earnings-badge">{periodLabel.toUpperCase()}</span>
                <div className="earnings-amount-row">
                  <span className="earnings-val">{euro(summary.earnings)}</span>
                </div>
                <span className="earnings-sub">
                  {summary.bonus > 0 ? `${euro(summary.pay)} + ${euro(summary.bonus)} bonus • ` : ''}
                  {t.usciteNoPayments || 'Maturati con le consegne completate (i pagamenti non passano dall\'app)'}
                </span>
              </div>

              <div className="uscite-metrics-grid">
                <div className="uscite-metric-card">
                  <span className="uscite-metric-label">{t.usciteDeliveriesLabel || 'Consegne'}</span>
                  <span className="uscite-metric-val">{summary.deliveries}</span>
                </div>
                <div className="uscite-metric-card">
                  <span className="uscite-metric-label">{t.usciteDistanceLabel || 'Distanza'}</span>
                  <span className="uscite-metric-val">{`${formatKm(summary.rideDistanceKm, 1)} km`}</span>
                </div>
                <div className="uscite-metric-card">
                  <span className="uscite-metric-label">{t.usciteSaddleLabel || 'In sella'}</span>
                  <span className="uscite-metric-val">{formatDuration(summary.rideDurationSec)}</span>
                </div>
              </div>

              <div className="user-welcome-row" style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-main)', margin: 0 }}>
                  {t.usciteByDayTitle || 'Giorno per giorno'}
                </h3>
                {days.length > 0 && (
                  <button onClick={handleExportCSV} type="button" className="action-pill-btn" style={{ padding: '6px 12px', fontSize: '0.76rem' }}>CSV</button>
                )}
              </div>

              <div className="rides-list-wrapper">
                {days.length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {t.usciteEmpty || 'Nessuna consegna o uscita registrata in questo periodo.'}
                  </p>
                )}
                {days.map((day) => (
                  <div key={day.date} className="ride-item-card" onClick={() => showDayDetail(day)} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
                    <div className="ride-head-row">
                      <span className="ride-title">{dayMonth(day.date, language)}</span>
                      <span className="ride-earn">{euro(day.earnings)}</span>
                    </div>
                    <div className="ride-foot-row">
                      <span className="ride-details">
                        {`${day.deliveries} ${countLabel(day.deliveries, t.usciteDeliveryLower || 'consegna', t.usciteDeliveriesLower || 'consegne')} • ${formatKm(day.distanceKm, 1)} km • ${formatDuration(day.durationSec)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
};
