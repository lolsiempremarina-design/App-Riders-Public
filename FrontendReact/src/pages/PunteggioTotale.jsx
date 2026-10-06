import React, { useState, useEffect, useCallback } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { riderService } from '../services';
import { countLabel, weekdayShort } from '../utils/statsFormat';

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

/** Punti del grafico (asse Y da 90 = minimo a 15 = massimo). */
export const buildScoreChart = (scores) => {
  if (!scores.length) return { points: [], line: '', area: '' };
  const max = Math.max(...scores, 1);
  const points = scores.map((score, i) => ({
    cx: Math.round(10 + (scores.length === 1 ? 0.5 : i / (scores.length - 1)) * 280),
    cy: Math.round(90 - (score / max) * 75)
  }));
  const line = buildSmoothPath(points);
  return { points, line, area: `${line} L 290,100 L 10,100 Z` };
};

const pctLabel = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

/**
 * Punteggio del rider con dati reali (GET /api/score): 10 punti per km, 20 per consegna,
 * 5 per consegna puntuale. Composizione: puntualità e guida senza cadute.
 */
export const PunteggioTotale = () => {
  const { openModal, t, language } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await riderService.getScore(7));
    } catch (err) {
      setError(err?.message || 'Errore');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rules = data?.rules || { perKm: 10, perDelivery: 20, perOnTime: 5 };
  const showRules = () => openModal(
    t.punteggioInfoTitle || 'Come si calcola il punteggio',
    `<p style="font-size:0.86rem; color:var(--text-main); line-height:1.5;">• ${rules.perKm} ${t.punteggioRuleKm || 'punti per ogni km registrato (percorsi GPS e attività)'}<br />• ${rules.perDelivery} ${t.punteggioRuleDelivery || 'punti per ogni consegna completata'}<br />• ${rules.perOnTime} ${t.punteggioRuleOnTime || 'punti extra per ogni consegna entro l\'orario promesso'}</p>`
  );

  if (!data) {
    return (
      <PhoneFrame toolbarTitle={t.punteggioToolbarTitle || 'RoR Punteggio'} showNavbar={true}>
        <HeaderBanner backTo="/statistiche" />
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
          {error ? (
            <>
              <p role="alert" style={{ fontSize: '0.86rem' }}>{t.punteggioLoadError || 'Impossibile caricare il punteggio.'} {error}</p>
              <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>
            </>
          ) : <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'}></div>}
        </div>
      </PhoneFrame>
    );
  }

  const days = data.days || [];
  const selected = activeDayIndex === null ? days.length - 1 : activeDayIndex;
  const day = days[selected] || { score: 0, distanceKm: 0, deliveries: 0 };
  const previous = selected > 0 ? days[selected - 1] : null;
  const delta = previous ? day.score - previous.score : null;
  const chart = buildScoreChart(days.map((d) => d.score));
  const dayName = (d) => (d.date === data.today ? (t.dayOggi || 'Oggi') : weekdayShort(d.date, language));

  const composition = [
    {
      key: 'punctuality',
      title: t.punteggioCompPunctuality || 'Puntualità',
      value: day.punctuality,
      desc: t.punteggioCompPunctualityDesc || 'Consegne completate entro l\'orario promesso, sul totale di quelle con un orario.'
    },
    {
      key: 'safe',
      title: t.punteggioCompSafe || 'Uscite senza cadute',
      value: day.safeRiding,
      desc: t.punteggioCompSafeDesc || 'Percorsi GPS del giorno in cui non è stata confermata nessuna caduta.'
    }
  ];

  return (
    <PhoneFrame toolbarTitle={t.punteggioToolbarTitle || 'RoR Punteggio'} showNavbar={true}>
      <HeaderBanner backTo="/statistiche" />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-punteggio">

          <section className="score-hero-card" onClick={showRules} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
            <span className="sr-only">{`${t.punteggioScoreLabel || 'Punteggio'}: `}</span>
            <div className="score-hero-header">
              <span className="livello-oro-lbl">{dayName(day).toUpperCase()}</span>
              {delta !== null && <span className="score-trend-chip">{`${delta >= 0 ? '+' : ''}${delta} pts`}</span>}
            </div>
            <div className="score-hero-val-group">
              <span className="score-hero-number">{day.score}</span>
              <span className="score-hero-total">{t.punteggioPoints || 'punti'}</span>
            </div>
            <div className="score-hero-footer">
              <span>{`${Number(day.distanceKm || 0).toFixed(1)} km`}</span>
              <span>{`${day.deliveries} ${countLabel(day.deliveries, t.usciteDeliveryLower || 'consegna', t.usciteDeliveriesLower || 'consegne')}`}</span>
              <span>{`${t.punteggioWeekTotal || '7 gg'}: ${data.total}`}</span>
            </div>
          </section>

          <section className="andamento-card" aria-label="Andamento Giornaliero Punteggio">
            <div className="andamento-header">
              <h3 className="andamento-title">{t.punteggioTrendTitle || 'Andamento giornaliero'}</h3>
              <span className="andamento-period-badge">{t.punteggioTrendBadge || 'Ultimi 7 gg'}</span>
            </div>
            <div className="trend-graph-wrapper">
              <svg viewBox="0 0 300 100" preserveAspectRatio="none" style={{ width: '100%', height: '110px' }} aria-hidden="true">
                <defs>
                  <linearGradient id="score-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#9CE292" />
                    <stop offset="100%" stopColor="#9CE292" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chart.area} fill="url(#score-area-grad)" opacity="0.45" />
                <path d={chart.line} fill="none" stroke="#72CA67" strokeWidth="3" strokeLinecap="round" />
                {chart.points.map((pt, idx) => (
                  <circle key={idx} cx={pt.cx} cy={pt.cy} r={selected === idx ? 6 : 3.5}
                    fill={selected === idx ? '#0F171A' : '#72CA67'} stroke={selected === idx ? '#9BE191' : 'none'} strokeWidth={selected === idx ? 3.5 : 0} />
                ))}
              </svg>
            </div>
            <div className="trend-graph-days-row">
              {days.map((d, idx) => (
                <span key={d.date} className={`graph-day-item ${selected === idx ? 'active' : ''}`} onClick={() => setActiveDayIndex(idx)} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
                  {dayName(d)}
                </span>
              ))}
            </div>
          </section>

          <section className="composizione-card" aria-label="Composizione Punteggio">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <h3 className="composizione-title" style={{ marginBottom: 0 }}>{t.punteggioCompTitle || 'COMPOSIZIONE'}</h3>
              <button type="button" onClick={showRules} aria-label={t.punteggioInfoTitle || 'Come si calcola il punteggio'}
                style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border-light)', background: 'var(--bg-card-subtle)', color: 'var(--text-main)', fontWeight: 800, cursor: 'pointer' }}>
                i
              </button>
            </div>
            {composition.map((item) => (
              <div key={item.key} className="comp-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => openModal(`${item.title} (${pctLabel(item.value)})`, `<p style="font-size:0.86rem; color:var(--text-main);">${item.desc}${item.value === null || item.value === undefined ? `<br />${t.punteggioNoData || 'Nessun dato per questo giorno.'}` : ''}</p>`)}>
                <div className="comp-header">
                  <span className="comp-name">{item.title}</span>
                  <span className="comp-pct-val">{pctLabel(item.value)}</span>
                </div>
                <div className="comp-progress-track">
                  <div className="comp-progress-fill" style={{ width: item.value ? `${Math.round(item.value * 100)}%` : '0%', transition: 'width 0.5s ease-in-out' }}></div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </PhoneFrame>
  );
};
