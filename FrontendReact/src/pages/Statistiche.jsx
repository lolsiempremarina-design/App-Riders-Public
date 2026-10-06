import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { statsService } from '../services/statsService';
import { riderService } from '../services/riderService';
import { countLabel, weekdayShort, formatDuration, formatKm, hoursValue, totalTimeSec } from '../utils/statsFormat';

const GAUGE_CIRCUMFERENCE = 440;

const ArrowBadge = () => (
  <div className="arrow-badge">
    <svg className="arrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  </div>
);

/**
 * Pagina Statistiche & Attività con dati reali (GET /api/stats/overview):
 * ultimi 7 giorni di percorsi GPS e attività registrate.
 */
export const Statistiche = () => {
  const navigate = useNavigate();
  const { toggleTheme, openModal, t, language } = useApp();
  const [overview, setOverview] = useState(null);
  const [score, setScore] = useState(null);       // /api/score (7 giorni)
  const [earnings, setEarnings] = useState(null); // /api/rider/earnings (settimana)
  const [loadError, setLoadError] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [stats, scoreData, earningsData] = await Promise.all([
        statsService.getOverview(),
        riderService.getScore(7).catch(() => null),
        riderService.getEarnings('week').catch(() => null)
      ]);
      setScore(scoreData);
      setEarnings(earningsData);
      setOverview(stats);
    } catch (err) {
      setLoadError(err?.message || 'Errore di caricamento');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!overview) {
    return (
      <PhoneFrame toolbarTitle="RoR Statistiche &amp; Attività" showNavbar={true}>
        <HeaderBanner showProfileIcon={true} />
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
          {loadError ? (
            <>
              <p role="alert" style={{ textAlign: 'center', fontSize: '0.86rem' }}>{t.statsLoadError || 'Impossibile caricare le statistiche.'} {loadError}</p>
              <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>
            </>
          ) : (
            <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'}></div>
          )}
        </div>
      </PhoneFrame>
    );
  }

  const days = overview.days || [];
  const selectedIndex = activeDayIndex === null ? days.length - 1 : activeDayIndex;
  const day = days[selectedIndex] || { count: 0, distanceKm: 0, durationSec: 0, avgSpeedKmh: 0 };
  const previous = selectedIndex > 0 ? days[selectedIndex - 1] : null;
  const isToday = day.date === overview.today;
  const dayName = isToday ? (t.dayOggi || 'Oggi') : weekdayShort(day.date, language);

  const maxKm = Math.max(0, ...days.map((d) => d.distanceKm || 0));
  const fill = maxKm > 0 ? (day.distanceKm || 0) / maxKm : 0;
  const dashOffset = Math.round(GAUGE_CIRCUMFERENCE * (1 - fill));
  const deltaKm = previous ? (day.distanceKm || 0) - (previous.distanceKm || 0) : null;
  const ridesLabel = (count) => `${count} ${count === 1 ? (t.statsRideSingular || 'uscita registrata') : (t.statsRidePlural || 'uscite registrate')}`;

  const handleGaugeClick = () => {
    openModal(
      `${dayName} • ${formatKm(day.distanceKm, 2)} km 🚴`,
      `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${ridesLabel(day.count)}</strong><br />${t.statsTimeTitle || 'Tempo totale'}: ${formatDuration(totalTimeSec(day))} • ${t.statsSpeedTitle || 'Velocità media'}: ${(day.avgSpeedKmh || 0).toFixed(1)} km/h<br />${t.statsWeekTotal || 'Ultimi 7 giorni'}: ${formatKm(overview.week?.distanceKm, 1)} km • ${t.statsAllTimeTotal || 'Da sempre'}: ${formatKm(overview.allTime?.distanceKm, 1)} km</p>`
    );
  };

  const dayScore = score?.days?.find((d) => d.date === day.date);
  const dayEarnings = earnings?.days?.find((d) => d.date === day.date);

  return (
    <PhoneFrame toolbarTitle="RoR Statistiche &amp; Attività" showNavbar={true}>
      <HeaderBanner showProfileIcon={true} />

      <div className="app-content">
        <div className="app-page-view active" id="page-telemetry">

          {/* INTESTAZIONE */}
          <div className="user-welcome-row">
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.55rem' }}>{t.statsTitle || 'Attività'}</h2>
              <span className="greeting-subtitle">{t.statsSubtitle || 'Scopri le tue statistiche'}</span>
            </div>
            <button
              className="quick-theme-btn"
              id="mini-theme-btn"
              title="Cambia Tema Scuro/Chiaro"
              aria-label="Cambia Tema"
              onClick={toggleTheme}
            >
              <svg className="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
          </div>

          {/* ULTIMI 7 GIORNI */}
          <section className="weekly-days-bar" aria-label="Selezione Giorni Settimana">
            {days.map((d, idx) => (
              <div
                key={d.date}
                className={`day-chip ${selectedIndex === idx ? 'active' : ''}`}
                onClick={() => setActiveDayIndex(idx)}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
              >
                <span className="day-label">{d.date === overview.today ? (t.dayOggi || 'Oggi') : weekdayShort(d.date, language)}</span>
                <span className="day-num">{Number(d.date.slice(8, 10))}</span>
              </div>
            ))}
          </section>

          {/* KM DEL GIORNO (anello proporzionale al giorno migliore della settimana) */}
          <section
            className="points-gauge-card"
            onClick={handleGaugeClick}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
          >
            {/* il nome letto dallo screen reader contiene anche il testo visibile (WCAG 2.5.3) */}
            <span className="sr-only">{`${t.statsDayDistance || 'Distanza del giorno'}: `}</span>
            <div className="gauge-ring-container">
              <svg className="gauge-svg" viewBox="0 0 190 190" aria-hidden="true">
                <circle cx="95" cy="95" r="82" stroke="rgba(15, 23, 26, 0.06)" strokeWidth="14" fill="none" />
                <circle cx="95" cy="95" r="82" stroke="#0F171A" strokeWidth="12" fill="none" style={{ filter: 'drop-shadow(0 4px 10px rgba(15, 23, 26, 0.12))' }} />
                <circle
                  cx="95" cy="95" r="70"
                  stroke="url(#gauge-green-grad)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={GAUGE_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 95 95)"
                  style={{ filter: 'drop-shadow(0 2px 10px rgba(123, 204, 113, 0.6))', transition: 'stroke-dashoffset 0.8s ease-out' }}
                />
                <defs>
                  <linearGradient id="gauge-green-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A2E698" />
                    <stop offset="100%" stopColor="#72CA67" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="gauge-center-text">
                <span className="gauge-val">{formatKm(day.distanceKm)}</span>
                <span className="gauge-lbl-badge">KM</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '14px', width: '100%', flexWrap: 'wrap' }}>
              {deltaKm !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  <span className={`pct-badge ${deltaKm >= 0 ? 'positive' : 'negative'}`} style={deltaKm < 0 ? { background: '#F2B8B8', color: '#0F171A' } : {}}>
                    {`${deltaKm >= 0 ? '+' : ''}${deltaKm.toFixed(1)} km`}
                  </span>
                  <span>{t.statsVsPreviousDay || 'vs giorno prima'}</span>
                </div>
              )}
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(15,23,26,0.2)' }}></div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {ridesLabel(day.count)}
              </div>
            </div>
          </section>

          {/* SOMMARIO DEL GIORNO SELEZIONATO */}
          <section className="sommario-section" aria-label="Sommario Statistiche">
            <div className="sommario-header-row">
              <h3 className="sommario-title">{t.statsSummaryTitle || 'Sommario'}</h3>
              <span className="sommario-subtitle-badge">{dayName}</span>
            </div>

            <div className="stats-cards-grid">

              {/* VELOCITÀ MEDIA */}
              <div className="stat-metric-card" onClick={() => navigate('/velocita_media')} style={{ cursor: 'pointer' }} title="Apri dettaglio Velocità Media" role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="metric-name">{t.statsSpeedTitle || 'Velocità media'}</span>
                    <span className="pct-badge positive" style={{ fontSize: '0.6rem', padding: '1px 6px', width: 'fit-content', marginTop: '3px' }}>
                      {`${t.statsWeekShort || '7 gg'}: ${(overview.week?.avgSpeedKmh || 0).toFixed(1)}`}
                    </span>
                  </div>
                  <ArrowBadge />
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{(day.avgSpeedKmh || 0).toFixed(1)}</span>
                    <span className="metric-unit">Km/h</span>
                  </div>
                  <div className="metric-icon-badge">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9BE191" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 12l3-3"></path>
                      <path d="M7.5 16.5A6 6 0 0 1 6 12a6 6 0 0 1 12 0 6 6 0 0 1-1.5 4.5"></path>
                    </svg>
                  </div>
                </div>
              </div>

              {/* TEMPO TOTALE */}
              <div className="stat-metric-card" onClick={() => navigate('/tempo_totale')} style={{ cursor: 'pointer' }} title="Apri dettaglio Tempo Totale" role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="metric-name">{t.statsTimeTitle || 'Tempo totale'}</span>
                    <span className="pct-badge positive" style={{ fontSize: '0.6rem', padding: '1px 6px', width: 'fit-content', marginTop: '3px' }}>
                      {formatDuration(totalTimeSec(day))}
                    </span>
                  </div>
                  <ArrowBadge />
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{hoursValue(totalTimeSec(day))}</span>
                    <span className="metric-unit">h</span>
                  </div>
                  <div className="metric-icon-badge">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9BE191" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"></circle>
                      <polyline points="12 7 12 12 15 15"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              {/* CONSEGNE DEL GIORNO */}
              <div className="stat-metric-card" onClick={() => navigate('/consegne')} style={{ cursor: 'pointer' }} title="Apri Consegne" role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="metric-name">{t.statsConsegneTitle || 'Consegne'}</span>
                    <span className="pct-badge positive" style={{ fontSize: '0.6rem', padding: '1px 6px', width: 'fit-content', marginTop: '3px' }}>
                      {`€${Number(dayEarnings?.earnings || 0).toFixed(2)}`}
                    </span>
                  </div>
                  <ArrowBadge />
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{dayScore ? dayScore.deliveries : (dayEarnings?.deliveries ?? '—')}</span>
                    <span className="metric-unit">{countLabel(dayScore ? dayScore.deliveries : dayEarnings?.deliveries, t.usciteDeliveryLower || 'consegna', t.statsConsegneUnit || 'consegne')}</span>
                  </div>
                </div>
              </div>

              {/* PUNTEGGIO DEL GIORNO */}
              <div className="stat-metric-card" onClick={() => navigate('/punteggio_totale')} style={{ cursor: 'pointer' }} title="Apri Punteggio" role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="metric-name">{t.statsTotalPointsTitle || 'Punteggio'}</span>
                    <span className="pct-badge positive" style={{ fontSize: '0.6rem', padding: '1px 6px', width: 'fit-content', marginTop: '3px' }}>
                      {`${t.statsWeekShort || '7 gg'}: ${score ? score.total : '—'}`}
                    </span>
                  </div>
                  <ArrowBadge />
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{dayScore ? dayScore.score : '—'}</span>
                    <span className="metric-unit">{t.punteggioPoints || 'punti'}</span>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* STORICO PERCORSI GPS */}
          <section className="sommario-section" aria-label={t.routesTitle || 'I miei percorsi'}>
            <div className="stat-metric-card" onClick={() => navigate('/percorsi')} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
              <div className="stat-card-header">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="metric-name">{t.routesTitle || 'I miei percorsi'}</span>
                  <span className="greeting-subtitle" style={{ fontSize: '0.72rem' }}>
                    {`${t.statsAllTimeTotal || 'Da sempre'}: ${ridesLabel(overview.allTime?.count || 0)} • ${formatKm(overview.allTime?.distanceKm, 1)} km`}
                  </span>
                </div>
                <ArrowBadge />
              </div>
            </div>
          </section>

        </div>
      </div>
    </PhoneFrame>
  );
};
