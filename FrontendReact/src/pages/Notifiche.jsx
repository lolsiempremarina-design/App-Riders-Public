import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../context/NotificationsContext';
import { notificationService } from '../services/notificationService';
import { playSosSound, playChatSound, playOrderHotSound, getAudioToggles, TOGGLES_STORAGE_KEY } from '../utils/audioUtils';
import { dateTimeShort } from '../utils/statsFormat';

const CATEGORY_COLORS = { consegne: '#10B981', sicurezza: '#DC2626', gruppi: '#0EA5E9', sistema: '#6B7280' };

const triggerHaptic = (pattern = 15) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
};

/**
 * Pagina Notifiche: avvisi reali creati dal server (nuovi ordini, SOS dei gruppi, nuovi membri, bici)
 * e preferenze di questo dispositivo (banner e suoni).
 */
export const Notifiche = () => {
  const navigate = useNavigate();
  const { openModal, showToast, t, language } = useApp();
  const { setUnreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState('avvisi');
  const [categoryFilter, setCategoryFilter] = useState('tutti');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [toggles, setToggles] = useState(() => {
    const { push, sosSound, chatSound, orderSound } = getAudioToggles();
    return { push, sosSound, chatSound, orderSound };
  });

  const load = useCallback(async () => {
    try {
      const { notifications, unreadCount } = await notificationService.list({ limit: 100 });
      setItems(notifications);
      setUnreadCount(unreadCount);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [setUnreadCount]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(toggles));
    } catch {
      // preferenze solo per questa sessione
    }
  }, [toggles]);

  const apply = async (action, update) => {
    try {
      const result = await action();
      update();
      if (result && typeof result.unreadCount === 'number') setUnreadCount(result.unreadCount);
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    }
  };

  const toggleRead = (n, event) => {
    event.stopPropagation();
    triggerHaptic();
    apply(() => notificationService.markRead(n.id, !n.isRead),
      () => setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: !n.isRead } : x))));
  };

  const remove = (n, event) => {
    event.stopPropagation();
    triggerHaptic([20, 30]);
    apply(() => notificationService.remove(n.id), () => setItems((prev) => prev.filter((x) => x.id !== n.id)));
  };

  // "Segna tutte" ed "Elimina tutte" valgono per la categoria sullo schermo: prima agivano su tutte, anche con il
  // filtro "Consegne" attivo (e cancellavano gli SOS dei gruppi). L'eliminazione chiede conferma: è definitiva.
  const scope = categoryFilter === 'tutti' ? null : categoryFilter;
  const inScope = (n) => !scope || n.category === scope;

  const markAll = () => apply(() => notificationService.markAllRead(scope), () => {
    setItems((prev) => prev.map((x) => (inScope(x) ? { ...x, isRead: true } : x)));
    showToast(t.notifAllReadToast || 'Tutte le notifiche segnate come lette ✓', 'success', 2000);
  });

  const clearAll = () => {
    const count = items.filter(inScope).length;
    openModal(
      scope ? (t.notifClearShownTitle || 'Eliminare le notifiche di questa categoria?') : (t.notifClearAllTitle || 'Eliminare tutte le notifiche?'),
      <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)' }}>
        {`${t.notifClearBody || 'Verranno eliminate definitivamente'}: ${count}.`}
      </p>,
      t.notifClearConfirm || 'Elimina',
      () => apply(() => notificationService.clear(scope), () => {
        setItems((prev) => prev.filter((x) => !inScope(x)));
        showToast(t.notifClearedToast || 'Notifiche eliminate', 'info', 2000);
      })
    );
  };

  const open = (n) => {
    triggerHaptic();
    if (!n.isRead) {
      apply(() => notificationService.markRead(n.id, true),
        () => setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))));
    }
    // elementi React e non una stringa HTML: il testo arriva dal server (indirizzi, nomi dei gruppi) e prima veniva
    // interpretato come HTML, così "Via Roma 1 <scala B>" perdeva "<scala B>"
    openModal(
      n.title,
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: CATEGORY_COLORS[n.category] || '#6B7280' }}>{dateTimeShort(n.createdAt, language)}</span>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.45 }}>{n.body || ''}</p>
      </div>,
      n.link ? (t.notifOpenBtn || 'Apri') : (t.notifCloseBtn || 'Chiudi'),
      n.link ? () => navigate(n.link) : null
    );
  };

  const handleToggle = (key) => {
    triggerHaptic(20);
    const next = !toggles[key];
    setToggles((prev) => ({ ...prev, [key]: next }));
    if (next) {
      if (key === 'sosSound') setTimeout(playSosSound, 0);
      if (key === 'chatSound') setTimeout(playChatSound, 0);
      if (key === 'orderSound') setTimeout(playOrderHotSound, 0);
    }
  };

  const categories = [
    { id: 'tutti', label: t.chipTutti || 'Tutti' },
    { id: 'consegne', label: t.chipConsegne || 'Consegne' },
    { id: 'sicurezza', label: t.chipSicurezza || 'Sicurezza & SOS' },
    { id: 'gruppi', label: t.chipGruppi || 'Gruppi' },
    { id: 'sistema', label: t.chipSistema || 'Sistema' }
  ];
  const visible = items.filter(inScope);
  const unreadCount = visible.filter((n) => !n.isRead).length;

  const prefs = [
    { key: 'push', title: t.togglePushRealTitle || 'Banner per le nuove notifiche', sub: t.togglePushRealSub || 'Mostra in alto gli avvisi che arrivano mentre usi l\'app' },
    { key: 'orderSound', title: t.toggleOrderTitle || 'Suono per ordini', sub: t.toggleOrderSubReal || 'Nuovi ordini e avanzamento della consegna' },
    { key: 'sosSound', title: t.toggleSosRealTitle || 'Suono per SOS e cadute', sub: t.toggleSosRealSub || 'Allarme acustico per SOS e caduta rilevata' },
    { key: 'chatSound', title: t.toggleChatTitle || 'Suono per la chat di gruppo', sub: t.toggleChatSubReal || 'Nuovi messaggi mentre la chat è aperta' }
  ];

  return (
    <PhoneFrame toolbarTitle={t.notifToolbarTitle || 'RoR Notifiche'}>
      <HeaderBanner backTo="/altro" />

      <div className="app-content" style={{ padding: '12px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-notifiche">
          <div className="user-welcome-row" style={{ marginBottom: '10px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.notifTitle || 'Notifiche'}
              </h2>
              <span className="greeting-subtitle">
                {unreadCount > 0 ? `${unreadCount} ${t.notifNewCount || 'da leggere'}` : (t.notifSubtitle || 'Nessuna notifica da leggere')}
              </span>
            </div>
          </div>

          <div className="tabs-row" style={{ marginBottom: '12px' }}>
            <button className={`tab-btn ${activeTab === 'avvisi' ? 'active' : ''}`} id="tab-avvisi-btn" onClick={() => setActiveTab('avvisi')}>
              {t.tabAvvisi || 'Avvisi'} {unreadCount > 0 && <span style={{ background: '#E11D48', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px' }}>{unreadCount}</span>}
            </button>
            <button className={`tab-btn ${activeTab === 'preferenze' ? 'active' : ''}`} id="tab-preferenze-btn" onClick={() => setActiveTab('preferenze')}>
              {t.tabPreferenze || 'Preferenze'}
            </button>
          </div>

          {activeTab === 'avvisi' && (
            <div id="view-avvisi-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="category-filter-chips" style={{ marginBottom: '2px' }}>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    style={{
                      padding: '6px 12px', borderRadius: '16px', border: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
                      background: categoryFilter === cat.id ? 'var(--ror-cyan)' : 'var(--bg-card-subtle)',
                      color: categoryFilter === cat.id ? '#000000' : 'var(--text-muted)', fontWeight: 800, fontSize: '0.74rem',
                      fontFamily: 'var(--font-main)'
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {visible.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={markAll} disabled={unreadCount === 0} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                    {scope ? (t.notifMarkShown || 'Segna queste come lette') : (t.notifMarkAll || 'Segna tutte come lette')}
                  </button>
                  <button type="button" onClick={clearAll} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                    {scope ? (t.notifClearShown || 'Elimina queste') : (t.notifClearAll || 'Elimina tutte')}
                  </button>
                </div>
              )}

              {status === 'loading' && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '30px auto' }}></div>}
              {status === 'error' && (
                <div role="alert" style={{ textAlign: 'center', padding: '20px 8px' }}>
                  <p style={{ fontSize: '0.86rem' }}>{t.notifLoadError || 'Impossibile caricare le notifiche.'}</p>
                  <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>
                </div>
              )}
              {status === 'ready' && visible.length === 0 && (
                <p style={{ textAlign: 'center', padding: '30px 12px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  {t.notifEmpty || 'Nessuna notifica. Qui arriveranno nuovi ordini, SOS dei tuoi gruppi e altri avvisi.'}
                </p>
              )}

              {visible.map((n) => (
                <div
                  key={n.id}
                  onClick={() => open(n)}
                  role="button"
                  tabIndex={0}
                  className="notif-item-card"
                  style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', borderRadius: '16px', cursor: 'pointer',
                    background: n.isRead ? 'var(--bg-card)' : 'var(--bg-card-subtle)', border: '1px solid var(--border-light)'
                  }}
                >
                  <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', marginTop: '5px', flexShrink: 0, background: n.isRead ? 'transparent' : (CATEGORY_COLORS[n.category] || '#6B7280'), border: `2px solid ${CATEGORY_COLORS[n.category] || '#6B7280'}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.isRead ? 600 : 800, fontSize: '0.86rem', color: 'var(--text-main)' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>{n.body}</div>}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>{dateTimeShort(n.createdAt, language)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button type="button" onClick={(e) => toggleRead(n, e)} aria-label={n.isRead ? (t.notifMarkUnread || 'Segna come non letta') : (t.notifMarkRead || 'Segna come letta')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
                      {n.isRead ? '○' : '✓'}
                    </button>
                    <button type="button" onClick={(e) => remove(n, e)} aria-label={t.notifDelete || 'Elimina notifica'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#ef4444' }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'preferenze' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                {t.notifPrefsNote || 'Preferenze di questo dispositivo.'}
              </p>
              {prefs.map((pref) => (
                <label key={pref.key} className="toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="toggle-title">{pref.title}</span>
                    <span className="toggle-sub">{pref.sub}</span>
                  </span>
                  <input type="checkbox" checked={Boolean(toggles[pref.key])} onChange={() => handleToggle(pref.key)} />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
};
