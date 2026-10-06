import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { statsService } from '../services/statsService';
import { bucketLabel, seriesLabel } from '../utils/statsFormat';

const PERIOD_BY_TAB = { settimana: 'week', mese: 'month', anno: 'year', sempre: 'always' };

const buildSmoothPath = (pts) => {
  if (!pts || pts.length === 0) return '';
  let d = `M ${pts[0].cx},${pts[0].cy}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.cx + (p2.cx - p0.cx) / 6;
    const cp1y = p1.cy + (p2.cy - p0.cy) / 6;
    const cp2x = p2.cx - (p3.cx - p1.cx) / 6;
    const cp2y = p2.cy - (p3.cy - p1.cy) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.cx},${p2.cy}`;
  }
  return d;
};

/**
 * Converte la serie reale del backend in punti del grafico SVG.
 * La scala verticale si adatta ai valori e restituisce le etichette dell'asse Y corrispondenti.
 * @param {Array<{label: string, speed: number, distanceKm: number, count: number}>} rawData
 */
export const generateChartFromRawData = (rawData) => {
  if (!rawData || rawData.length === 0) return { points: [], chartPathLine: '', chartPathArea: '', yTicks: [] };

  const speeds = rawData.map(d => d.speed);
  const minSpeed = Math.max(0, Math.floor(Math.min(...speeds) - 5));
  const maxSpeed = Math.ceil(Math.max(...speeds) + 5);
  const speedRange = maxSpeed - minSpeed || 1;
  const labelStep = Math.max(1, Math.ceil(rawData.length / 5));

  const points = rawData.map((d, i) => {
    const progress = rawData.length === 1 ? 0.5 : i / (rawData.length - 1);
    const cx = Math.round(16 + progress * (260 - 16));
    const cy = Math.round(124 - ((d.speed - minSpeed) / speedRange) * 108);
    return {
      cx, cy,
      speed: `${d.speed.toFixed(1)} Km/h`,
      day: d.label,
      distanceKm: d.distanceKm,
      count: d.count,
      showLabel: i % labelStep === 0 || i === rawData.length - 1
    };
  });

  const chartPathLine = points.length === 1
    ? `M 16,${points[0].cy} L 260,${points[0].cy}`
    : buildSmoothPath(points);
  const chartPathArea = `${chartPathLine} L 260,140 L 16,140 Z`;
  const yTicks = [0, 1, 2, 3].map((i) => Math.round(maxSpeed - (speedRange * i) / 3));
  return { points, chartPathLine, chartPathArea, yTicks };
};

/**
 * Pagina Velocità Media: dati reali dei percorsi GPS e delle attività registrate
 * (GET /api/stats/period), per settimana, mese, anno o da sempre.
 */
export const VelocitaMedia = () => {
  const { toggleTheme, openModal, t, language } = useApp();
  const [activeFilterTab, setActiveFilterTab] = useState('settimana');
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [activePointIndex, setActivePointIndex] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const [periodData, setPeriodData] = useState({});
  const [loadError, setLoadError] = useState(null);
  const svgRef = useRef(null);

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

  if (!current) {
    return (
      <PhoneFrame toolbarTitle="RoR Velocità Media" showNavbar={true}>
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

  const period = PERIOD_BY_TAB[activeFilterTab];
  const days = (current.buckets || []).map((bucket) => ({
    ...bucket,
    ...bucketLabel(period, bucket.key, {
      language,
      todayKey: current.today,
      todayLabel: t.dayOggi || 'Oggi',
      allLabel: t.filterSempre || 'Sempre'
    })
  }));
  const selectedIndex = activeDayIndex === null || activeDayIndex >= days.length ? days.length - 1 : activeDayIndex;
  const selectedChip = days[selectedIndex];
  const summary = selectedChip?.summary || current.summary;
  const hasRides = (summary?.count || 0) > 0;

  const displayedSpeed = (summary?.avgSpeedKmh || 0).toFixed(1);
  const displayedPeak = `${(summary?.bestSpeedKmh || 0).toFixed(1)} Km/h`;

  const chart = generateChartFromRawData((selectedChip?.series || []).map((p) => ({
    label: seriesLabel(period, p.key, language),
    speed: p.avgSpeedKmh,
    distanceKm: p.distanceKm,
    count: p.count
  })));
  const currentChartPathLine = chart.chartPathLine;
  const currentChartPathArea = chart.chartPathArea;
  const currentPoints = chart.points;

  const handleTabChange = (tabId) => {
    setActiveFilterTab(tabId);
    setActivePointIndex(null);
    setIsHovering(false);
    setActiveDayIndex(null);
  };

  const handleDaySelect = (idx) => {
    setActiveDayIndex(idx);
    setActivePointIndex(null);
    setIsHovering(false);
  };

  const handlePointClick = (pt) => {
    if (!pt) return;
    openModal(
      `${t.speedModalTitle || 'Velocità media'}: ${pt.speed} 🚴‍♂️`,
      `<p style="font-size:0.86rem; color:var(--text-main);"><strong>${pt.day}</strong><br />${(pt.distanceKm || 0).toFixed(2)} km • ${pt.count} ${pt.count === 1 ? (t.statsRideSingular || 'uscita registrata') : (t.statsRidePlural || 'uscite registrate')}</p>`
    );
  };

  const getClosestPointIndex = (clientX) => {
    if (!svgRef.current || !currentPoints || currentPoints.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0) return null;
    const relX = clientX - rect.left;
    const svgX = (relX / rect.width) * 280;

    if (svgX <= currentPoints[0].cx) return 0;
    const lastIdx = currentPoints.length - 1;
    if (svgX >= currentPoints[lastIdx].cx) return lastIdx;

    let low = 0;
    let high = lastIdx;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (currentPoints[mid].cx <= svgX) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return Math.abs(currentPoints[low].cx - svgX) <= Math.abs(currentPoints[high].cx - svgX) ? low : high;
  };

  const handlePointerEnter = (e) => {
    setIsHovering(true);
    const idx = getClosestPointIndex(e.clientX);
    if (idx !== null) {
      setActivePointIndex(idx);
    }
  };

  const handlePointerMove = (e) => {
    const idx = getClosestPointIndex(e.clientX);
    if (idx !== null) {
      setIsHovering((prev) => (prev ? prev : true));
      setActivePointIndex((prev) => (prev !== idx ? idx : prev));
    }
  };

  const handlePointerLeave = () => {
    setIsHovering(false);
    setActivePointIndex(null);
  };

  const handleChartClick = (e) => {
    const idx = getClosestPointIndex(e.clientX);
    if (idx !== null) {
      setActivePointIndex(idx);
      setIsHovering(true);
      const pt = currentPoints[idx];
      if (pt) {
        handlePointClick(pt);
      }
    }
  };

  const activePoint = activePointIndex !== null ? currentPoints[activePointIndex] : null;

  return (
    <PhoneFrame toolbarTitle="RoR Velocità Media" showNavbar={true}>
      <HeaderBanner backTo="/statistiche" />

      {/* APP SCROLLABLE CONTENT BODY */}
      <div className="app-content">

        {/* PAGE VIEW: VELOCITA MEDIA DETAIL */}
        <div className="app-page-view active" id="page-velocita-media">

          {/* PAGE TITLE HEADER */}
          <div className="user-welcome-row">
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.5rem' }}>{t.speedTitle || 'Velocità Media'}</h2>
              <span className="greeting-subtitle">{t.speedSubtitle || 'Scopri le tue statistiche'}</span>
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

          {/* TIME FILTER SEGMENTED BAR */}
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

          {/* BARRA DEI CHIP DINAMICI PER PERIODO SELEZIONATO */}
          <section
            className="weekly-days-bar"
            aria-label="Selezione Periodo"
            style={days.length === 1 ? { justifyContent: 'center' } : {}}
          >
            {days.map((day, idx) => (
              <div
                key={day.key}
                className={`day-chip ${selectedIndex === idx ? 'active' : ''}`}
                onClick={() => handleDaySelect(idx)}
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

          {/* SEZIONE PRINCIPALE DI RIEPILOGO DELLA VELOCITÀ */}
          <section className="speed-summary-display" aria-label="Valore Velocità Media">
            <div className="speed-summary-label">
              <span className="sub-lbl">{t.speedSumSub || 'Hai totalizzato una'}</span>
              <h3 className="main-lbl">{t.speedSumMain || 'Velocità media di'}</h3>
            </div>

            <div className="speed-summary-val">
              <span className="big-num">{displayedSpeed}</span>
              <span className="unit-text">Km/h</span>
            </div>
          </section>
          {!hasRides && (
            <p className="greeting-subtitle" role="status" style={{ margin: '-6px 0 12px 0' }}>
              {t.statsNoRidesPeriod || 'Nessuna uscita registrata in questo periodo.'}
            </p>
          )}

          {/* SCHEDA GRAFICO DELL'ANDAMENTO DELLA VELOCITÀ */}
          <section className="trend-chart-card" aria-label="Grafico Andamento Velocità">
            {/* Elemento accessibile per metriche e test */}
            <span className="sr-only">{t.speedBestLabel || 'Miglior media di una uscita'}: {displayedPeak}</span>

            <div className="chart-card-header">
              <div>
                <h3 className="chart-card-title">{t.speedChartTitle || 'Il tuo andamento'}</h3>
                <span className={`chart-card-subtitle ${isHovering && activePoint ? 'active' : ''}`}>
                  {isHovering && activePoint
                    ? `${
                        activeFilterTab === 'settimana' && activePoint.hour
                          ? `${t.speedHourPrefix || 'Ore'} ${activePoint.hour} • `
                          : (activePoint.day || (activePoint.hour && activeFilterTab !== 'settimana') || activePoint.date
                              ? `${activePoint.day || activePoint.hour || activePoint.date} • `
                              : '')
                      }${activePoint.speed}`
                    : `${t.speedBestLabel || 'Miglior media di una uscita'}: ${displayedPeak}`}
                </span>
              </div>
            </div>
            
            {currentPoints.length === 0 ? (
              <p className="greeting-subtitle" style={{ padding: '24px 8px', textAlign: 'center' }}>
                {t.statsNoChartData || 'Nessun dato da mostrare nel grafico.'}
              </p>
            ) : (
            <div className="chart-container">
              {/* ETICHETTE ASSE Y DELLA GRIGLIA */}
              <div className="chart-y-axis" aria-hidden="true">
                {chart.yTicks.map((tick, i) => <span key={i}>{tick}</span>)}
              </div>

              {/* GRAFICO A ONDE SVG SENZA PUNTI FISSI - INTERATTIVO AL PASSAGGIO MOUSE */}
              <div
                className="chart-svg-wrapper"
                onPointerEnter={handlePointerEnter}
                onPointerMove={handlePointerMove}
                onMouseMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
                onMouseLeave={handlePointerLeave}
                onTouchStart={(e) => {
                  if (e.touches && e.touches[0]) {
                    handlePointerEnter(e.touches[0]);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches && e.touches[0]) {
                    handlePointerMove(e.touches[0]);
                  }
                }}
                onClick={handleChartClick}
                style={{ cursor: 'crosshair' }}
              >
                <svg
                  ref={svgRef}
                  className="chart-svg"
                  viewBox="0 0 280 142"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {/* Linee orizzontali tratteggiate della griglia */}
                  <line x1="0" y1="10" x2="280" y2="10" stroke="rgba(15, 23, 26, 0.08)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1="45" x2="280" y2="45" stroke="rgba(15, 23, 26, 0.08)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1="80" x2="280" y2="80" stroke="rgba(15, 23, 26, 0.08)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1="115" x2="280" y2="115" stroke="rgba(15, 23, 26, 0.08)" strokeWidth="1" strokeDasharray="4 4" />

                  {/* Linea guida verticale attiva SOLO al passaggio del mouse */}
                  {isHovering && activePoint && (
                    <line
                      x1={activePoint.cx}
                      y1="10"
                      x2={activePoint.cx}
                      y2="124"
                      stroke="#72CA67"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.85"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Area sfumata sotto la curva continua e pulita */}
                  <path d={currentChartPathArea} fill="url(#chart-area-grad)" opacity="0.45" />

                  {/* Curva continua di andamento */}
                  <path d={currentChartPathLine} fill="none" stroke="url(#chart-line-grad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Area invisibile allargata per tocco e passaggio mouse agevole sulla linea */}
                  <path d={currentChartPathLine} fill="none" stroke="transparent" strokeWidth="32" style={{ cursor: 'crosshair' }} />

                  {/* Etichette asse X delle ore o date in basso */}
                  {currentPoints.map((pt, idx) => {
                    const isLabelVisible = pt.showLabel === true || (pt.showLabel === undefined && activeFilterTab !== 'settimana' && activeFilterTab !== 'mese' && activeFilterTab !== 'anno' && activeFilterTab !== 'sempre');
                    if (!isLabelVisible) return null;
                    const isPointActive = isHovering && activePointIndex === idx;
                    return (
                      <text
                        key={`label-${idx}`}
                        x={pt.cx}
                        y="136"
                        textAnchor="middle"
                        className={`chart-x-label ${isPointActive ? 'active' : ''}`}
                        onMouseEnter={() => {
                          setIsHovering(true);
                          setActivePointIndex(idx);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsHovering(true);
                          setActivePointIndex(idx);
                          handlePointClick(pt);
                        }}
                      >
                        {pt.month || pt.day || pt.hour || pt.date}
                      </text>
                    );
                  })}

                  {/* Nodo indicatore attivo visibile SOLO al passaggio del mouse */}
                  {isHovering && activePoint && (
                    <g className="chart-active-indicator" style={{ pointerEvents: 'none' }}>
                      <circle
                        cx={activePoint.cx}
                        cy={activePoint.cy}
                        r="11"
                        fill="rgba(156, 226, 146, 0.45)"
                        className="chart-halo-ring"
                      />
                      <circle
                        cx={activePoint.cx}
                        cy={activePoint.cy}
                        r="5.5"
                        fill="#0F171A"
                        stroke="#9CE292"
                        strokeWidth="3"
                      />
                    </g>
                  )}

                  {/* Tooltip galleggiante attivo SOLO al passaggio del mouse */}
                  {isHovering && activePoint && (() => {
                    const isTopZone = activePoint.cy < 38;
                    const clampedX = Math.max(52, Math.min(228, activePoint.cx));
                    const tooltipY = isTopZone ? activePoint.cy + 22 : activePoint.cy - 18;
                    const arrowShiftX = activePoint.cx - clampedX;
                    return (
                      <g
                        className="chart-active-tooltip"
                        transform={`translate(${clampedX}, ${tooltipY})`}
                        style={{ pointerEvents: 'none' }}
                      >
                        <rect
                          x="-48"
                          y="-21"
                          width="96"
                          height="23"
                          rx="11.5"
                          fill="#0F171A"
                          stroke="#9CE292"
                          strokeWidth="1.3"
                        />
                        {isTopZone ? (
                          <polygon
                            points="-4,-21 4,-21 0,-25.5"
                            fill="#0F171A"
                            transform={`translate(${arrowShiftX}, 0)`}
                          />
                        ) : (
                          <polygon
                            points="-4,2 4,2 0,6.5"
                            fill="#0F171A"
                            transform={`translate(${arrowShiftX}, 0)`}
                          />
                        )}
                        <text
                          x="0"
                          y="-6"
                          textAnchor="middle"
                          fontFamily="'Plus Jakarta Sans', sans-serif"
                          fontSize="8.5"
                        >
                          {(activePoint.day || activePoint.hour) && (
                            <tspan fill="#9CE292" fontWeight="700">{(activePoint.day || activePoint.hour)} • </tspan>
                          )}
                          <tspan fill="#FFFFFF" fontWeight="800">{activePoint.speed}</tspan>
                        </text>
                      </g>
                    );
                  })()}

                  <defs>
                    <linearGradient id="chart-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#A2E698" />
                      <stop offset="100%" stopColor="#72CA67" />
                    </linearGradient>
                    <linearGradient id="chart-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#9CE292" />
                      <stop offset="100%" stopColor="#9CE292" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            )}
          </section>

        </div> {/* FINE VISTA PAGINA VELOCITÀ MEDIA */}

      </div> {/* FINE CONTENUTO APP */}
    </PhoneFrame>
  );
};
