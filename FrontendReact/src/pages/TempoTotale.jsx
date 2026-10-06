import React, { useState, useEffect, useCallback } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { statsService } from '../services/statsService';
import { bucketLabel, formatDuration, hoursValue, totalTimeSec } from '../utils/statsFormat';

const PERIOD_BY_TAB = { settimana: 'week', mese: 'month', anno: 'year', sempre: 'always' };

const pct = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

/**
 * Pagina Tempo Totale: tempo in sella reale (GET /api/stats/period), diviso in tempo in movimento
 * e pause dei percorsi GPS (il worker misura le pause tra il primo e l'ultimo punto).
 * Le uscite più vecchie senza l'ultimo punto registrato contano solo con il tempo in movimento, e lo si dice.
 */
export const TempoTotale = () => {
  const { toggleTheme, openModal, t, language } = useApp();
  const [activeFilterTab, setActiveFilterTab] = useState('settimana');
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [periodData, setPeriodData] = useState({});
  const [loadError, setLoadError] = useState(null);

  const filterTabs = [
    { id: 'settimana', label: t.filterSettimana || 'Settimana' },
    { id: 'mese', label: t.filterMese || 'Mese' },
    { id: 'anno', label: t.filterAnno || 'Anno' },
    { id: 'sempre', label: t.filterSempre || 'Sempre' }
  ];

  const loadPeriod = useCallback(async (tabId) => {
    setLoadError(null);
    try {
      const data = await statsService.getPeriod(PERIOD_BY_TAB[tabId]);
      setPeriodData((prev) => ({ ...prev, [tabId]: data }));
    } catch (err) {
      setLoadError(err?.message || 'Errore di caricamento');
    }
  }, []);

  useEffect(() => {
    if (!periodData[activeFilterTab]) loadPeriod(activeFilterTab);
  }, [activeFilterTab, periodData, loadPeriod]);

  const current = periodData[activeFilterTab];
  const period = PERIOD_BY_TAB[activeFilterTab];
  const days = (current?.buckets || []).map((bucket) => ({
    ...bucket,
    ...bucketLabel(period, bucket.key, {
      language,
      todayKey: current.today,
      todayLabel: t.dayOggi || 'Oggi',
      allLabel: t.filterSempre || 'Sempre'
    })
  }));
  const selectedIndex = activeDayIndex === null || activeDayIndex >= days.length ? days.length - 1 : activeDayIndex;
  const summary = days[selectedIndex]?.summary || current?.summary || {};

  const movingSec = summary.durationSec || 0;
  const pauseSec = summary.pauseSec || 0;
  const totalSec = totalTimeSec(summary);
  const pauseUnknownCount = summary.pauseUnknownCount || 0;

  const handleTabChange = (tabId) => {
    setActiveFilterTab(tabId);
    setActiveDayIndex(null);
  };

  const handlePedalataClick = () => {
    openModal(
      t.timeModalPedalataTitle || 'Tempo in movimento 🚴‍♂️',
      `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${formatDuration(movingSec)} (${pct(movingSec, totalSec)})</strong><br />${t.timeModalPedalataBody || 'Tempo in cui il GPS ti ha registrato in movimento nei percorsi del periodo.'}</p>`
    );
  };

  const handlePauseClick = () => {
    openModal(
      t.timeModalPauseTitle || 'Pause ☕',
      `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${formatDuration(pauseSec)} (${pct(pauseSec, totalSec)})</strong><br />${t.timeModalPauseBody || 'Percorso in pausa o senza posizioni GPS per più di 2 minuti.'}</p>`
    );
  };

  if (!current) {
    return (
      <PhoneFrame toolbarTitle="RoR Tempo Totale" showNavbar={true}>
        <HeaderBanner backTo="/statistiche" />
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
          {loadError ? (
            <>
              <p role="alert" style={{ textAlign: 'center', fontSize: '0.86rem' }}>{t.statsLoadError || 'Impossibile caricare le statistiche.'} {loadError}</p>
              <button type="button" className="filter-tab active retry-btn" onClick={() => loadPeriod(activeFilterTab)}>{t.retryBtn || 'Riprova'}</button>
            </>
          ) : (
            <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'}></div>
          )}
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame toolbarTitle="RoR Tempo Totale" showNavbar={true}>
      <HeaderBanner backTo="/statistiche" />

      <div className="app-content">
        <div className="app-page-view active" id="page-tempo-totale">

          {/* INTESTAZIONE */}
          <div className="user-welcome-row">
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.5rem' }}>{t.timeTitle || 'Tempo Totale'}</h2>
              <span className="greeting-subtitle">{t.timeSubtitle || 'Scopri le tue statistiche'}</span>
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

          {/* FILTRO PERIODO */}
          <section className="time-filter-bar" aria-label="Filtro Temporale">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`filter-tab ${activeFilterTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </section>

          {/* CHIP DEL PERIODO */}
          <section
            className="weekly-days-bar"
            aria-label="Selezione Periodo"
            style={days.length === 1 ? { justifyContent: 'center' } : {}}
          >
            {days.map((day, idx) => (
              <div
                key={day.key}
                className={`day-chip ${selectedIndex === idx ? 'active' : ''}`}
                onClick={() => setActiveDayIndex(idx)}
                role="button"
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  ...(days.length === 1 ? { maxWidth: '200px', flex: 'initial', width: '100%', padding: '10px 20px' } : {})
                }}
              >
                {day.num ? (
                  <>
                    <span className="day-label">{day.label}</span>
                    <span className="day-num">{day.num}</span>
                  </>
                ) : (
                  <span className="day-num" style={{ fontSize: '0.88rem', fontWeight: '800', lineHeight: 1.2 }}>
                    {day.label}
                  </span>
                )}
              </div>
            ))}
          </section>

          {/* RIEPILOGO */}
          <section className="speed-summary-display" aria-label="Valore Tempo Totale">
            <div className="speed-summary-label">
              <span className="sub-lbl">{t.timeSumSub || 'Hai totalizzato un'}</span>
              <h3 className="main-lbl">{t.timeSumMain || 'Tempo in sella di'}</h3>
            </div>
            <div className="speed-summary-val">
              <span className="big-num">{hoursValue(totalSec)}</span>
              <span className="unit-text">{t.timeSumUnit || 'Ore'}</span>
            </div>
          </section>
          <p className="greeting-subtitle" role="status" style={{ margin: '-6px 0 12px 0' }}>
            {summary.count
              ? `${summary.count} ${summary.count === 1 ? (t.statsRideSingular || 'uscita registrata') : (t.statsRidePlural || 'uscite registrate')} • ${formatDuration(totalSec)}`
              : (t.statsNoRidesPeriod || 'Nessuna uscita registrata in questo periodo.')}
          </p>

          {/* DETTAGLIO */}
          <section className="sommario-section" aria-label="Dettaglio Fasce di Tempo">
            <div className="stats-cards-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>

              <div className="stat-metric-card" onClick={handlePedalataClick} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <span className="metric-name">{t.timePedalataTitle || 'Tempo in movimento'}</span>
                  {totalSec > 0 && <span className="pct-badge positive">{`${pct(movingSec, totalSec)} ${t.timePedalataBadge || 'del Totale'}`}</span>}
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{hoursValue(movingSec)}</span>
                    <span className="metric-unit">{`h (${formatDuration(movingSec)})`}</span>
                  </div>
                  <div className="metric-icon-badge">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9BE191" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"></circle>
                      <polyline points="12 7 12 12 15 15"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="stat-metric-card" onClick={handlePauseClick} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
                <div className="stat-card-header">
                  <span className="metric-name">{t.timePauseTitle || 'Pause'}</span>
                  {totalSec > 0 && <span className="pct-badge positive">{`${pct(pauseSec, totalSec)} ${t.timePauseBadge || 'del Totale'}`}</span>}
                </div>
                <div className="stat-card-body">
                  <div className="metric-val-group">
                    <span className="metric-number">{hoursValue(pauseSec)}</span>
                    <span className="metric-unit">{`h (${formatDuration(pauseSec)})`}</span>
                  </div>
                  <div className="metric-icon-badge">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9BE191" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                  </div>
                </div>
              </div>

            </div>
            {pauseUnknownCount > 0 && (
              <p className="greeting-subtitle" style={{ marginTop: '10px', fontSize: '0.75rem' }}>
                {(t.timePauseUnknown || 'Uscite meno recenti senza pause registrate: {n}. Per queste conta solo il tempo in movimento.')
                  .replace('{n}', pauseUnknownCount)}
              </p>
            )}
          </section>

        </div>
      </div>
    </PhoneFrame>
  );
};
