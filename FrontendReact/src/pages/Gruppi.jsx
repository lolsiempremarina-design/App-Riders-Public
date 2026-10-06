import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { groupService } from '../services/groupService';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid var(--border-light)',
  background: 'var(--bg-card)',
  color: 'var(--text-main)',
  fontSize: '0.86rem',
  boxSizing: 'border-box'
};

const primaryBtn = {
  fontFamily: 'var(--font-main)',
  whiteSpace: 'nowrap',
  height: '38px',
  padding: '0 16px',
  borderRadius: '19px',
  border: 'none',
  background: 'var(--ror-cyan)',
  color: '#000000',
  fontWeight: 800,
  fontSize: '0.8rem',
  cursor: 'pointer'
};

const GroupIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

/** Messaggio del primo campo non valido restituito dall'API. */
const firstFieldError = (err) => (err?.fields ? Object.values(err.fields)[0] : null) || err?.message || 'Errore';

/**
 * Pagina I Miei Gruppi: gruppi reali dell'utente (GET /api/groups), creazione,
 * adesione con codice o link d'invito (/gruppi?invito=<token>).
 */
export const Gruppi = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openModal, showToast, t } = useApp();
  const [groups, setGroups] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [panel, setPanel] = useState(null); // null | 'create' | 'join'
  const [form, setForm] = useState({ name: '', description: '', code: '' });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setGroups(await groupService.list());
      setStatus('ready');
    } catch (err) {
      setLoadError(err?.message || 'Errore');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGroup = useCallback((group) => navigate(`/gruppo-chat?id=${group.id}`), [navigate]);

  // Link d'invito: si chiede conferma prima di entrare nel gruppo.
  const inviteToken = searchParams.get('invito');
  useEffect(() => {
    if (!inviteToken) return;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('invito');
      setSearchParams(next, { replace: true });
    };
    openModal(
      t.groupInviteTitle || 'Invito a un gruppo',
      `<p style="font-size:0.86rem; color:var(--text-main);">${t.groupInviteBody || 'Hai aperto un link d\'invito. Vuoi unirti al gruppo?'}</p>`,
      t.groupInviteJoinBtn || 'Unisciti',
      async () => {
        try {
          const result = await groupService.joinByToken(inviteToken);
          showToast(result.alreadyMember
            ? (t.groupAlreadyMember || 'Fai già parte di questo gruppo')
            : `${t.groupJoinedToast || 'Ti sei unito al gruppo'} ${result.group.name}`, 'success');
          openGroup(result.group);
        } catch (err) {
          showToast(err?.message || 'Link d\'invito non valido', 'error');
        }
      }
    );
    clearParam();
  }, [inviteToken]);

  const togglePanel = (name) => {
    setPanel((prev) => (prev === name ? null : name));
    setFormError(null);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const group = await groupService.create({ name: form.name.trim(), description: form.description.trim() });
      showToast(`${t.groupCreatedToast || 'Gruppo creato'}: ${group.name}`, 'success');
      setForm({ name: '', description: '', code: '' });
      openGroup(group);
    } catch (err) {
      setFormError(firstFieldError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await groupService.joinByCode(form.code.trim());
      showToast(result.alreadyMember
        ? (t.groupAlreadyMember || 'Fai già parte di questo gruppo')
        : `${t.groupJoinedToast || 'Ti sei unito al gruppo'} ${result.group.name}`, 'success');
      openGroup(result.group);
    } catch (err) {
      setFormError(firstFieldError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const term = searchTerm.trim().toLowerCase();
  const filteredGroups = groups.filter((g) => !term
    || g.name.toLowerCase().includes(term)
    || (g.description || '').toLowerCase().includes(term));

  const roleLabel = (role) => ({
    owner: t.groupRoleOwner || 'Proprietario',
    admin: t.groupRoleAdmin || 'Admin',
    member: t.groupRoleMember || 'Membro'
  }[role] || role);

  return (
    <PhoneFrame toolbarTitle={t.gruppiTitle || 'RoR I Miei Gruppi'} showNavbar={true}>
      <HeaderBanner backTo="/altro" />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-gruppi">

          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.4rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.gruppiMainTitle || t.gruppiTitle || 'I Miei Gruppi'}
              </h2>
              <span className="greeting-subtitle">{t.gruppiRealSub || 'Crea un gruppo o unisciti con un codice'}</span>
            </div>
          </div>

          {/* AZIONI: CREA / UNISCITI */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button type="button" style={primaryBtn} aria-expanded={panel === 'create'} onClick={() => togglePanel('create')}>
              + {t.groupCreateBtn || 'Crea gruppo'}
            </button>
            <button type="button" style={{ ...primaryBtn, background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-light)' }}
              aria-expanded={panel === 'join'} onClick={() => togglePanel('join')}>
              {t.groupJoinBtn || 'Unisciti con codice'}
            </button>
          </div>

          {panel === 'create' && (
            <form onSubmit={handleCreate} className="stat-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }} aria-label={t.groupCreateBtn || 'Crea gruppo'}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                {t.groupNameLabel || 'Nome del gruppo'}
                <input style={inputStyle} value={form.name} maxLength={100} required minLength={2}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                {t.groupDescLabel || 'Descrizione (facoltativa)'}
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={form.description} maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              {formError && <p role="alert" style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0 }}>{formError}</p>}
              <button type="submit" style={primaryBtn} disabled={submitting}>{t.groupCreateSubmit || 'Crea'}</button>
            </form>
          )}

          {panel === 'join' && (
            <form onSubmit={handleJoin} className="stat-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }} aria-label={t.groupJoinBtn || 'Unisciti con codice'}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                {t.groupCodeLabel || 'Codice del gruppo'}
                <input style={inputStyle} value={form.code} placeholder="abc-defg-hij" required autoCapitalize="none"
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </label>
              {formError && <p role="alert" style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0 }}>{formError}</p>}
              <button type="submit" style={primaryBtn} disabled={submitting}>{t.groupJoinSubmit || 'Unisciti'}</button>
            </form>
          )}

          {/* RICERCA */}
          {groups.length > 0 && (
            <div className="search-bar-inline">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b6b68" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                id="gruppi-search-input"
                placeholder={t.gruppiSearchRealPh || 'Cerca tra i tuoi gruppi...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}

          <div className="gruppi-list-wrapper" id="gruppi-cards-container">
            {status === 'loading' && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '30px auto' }}></div>}

            {status === 'error' && (
              <div role="alert" style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-main)' }}>
                <p style={{ fontSize: '0.86rem' }}>{t.groupsLoadError || 'Impossibile caricare i gruppi.'} {loadError}</p>
                <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>
              </div>
            )}

            {status === 'ready' && groups.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px', color: 'var(--text-main)' }}>
                  {t.groupsEmptyTitle || 'Non fai ancora parte di nessun gruppo'}
                </div>
                <div style={{ fontSize: '0.78rem' }}>
                  {t.groupsEmptyBody || 'Crea un gruppo e condividi il codice, oppure inserisci il codice che ti hanno dato.'}
                </div>
              </div>
            )}

            {status === 'ready' && groups.length > 0 && filteredGroups.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px', color: 'var(--text-main)' }}>
                  {t.gruppiNoResultsTitle || 'Nessun gruppo trovato'}
                </div>
              </div>
            )}

            {status === 'ready' && filteredGroups.map((group) => (
              <div
                key={group.id}
                className="group-card"
                onClick={() => openGroup(group)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openGroup(group);
                  }
                }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <span className="group-avatar" style={{ pointerEvents: 'none' }}><GroupIcon /></span>
                  <span className="group-info" style={{ pointerEvents: 'none' }}>
                    <span className="group-title">{group.name}</span>
                    <span className="group-sub">
                      {`${group.memberCount} ${group.memberCount === 1 ? (t.groupMemberSingular || 'membro') : (t.groupMembers || 'Membri')}`} &bull;{' '}
                      <span className={`group-badge ${group.sharingCount ? '' : 'offline'}`}>
                        {group.sharingCount
                          ? `${group.sharingCount} ${t.groupSharingNow || 'in mappa ora'}`
                          : roleLabel(group.myRole)}
                      </span>
                    </span>
                  </span>
                </div>
                <span className="group-chevron" style={{ pointerEvents: 'none' }}>&#8250;</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </PhoneFrame>
  );
};
