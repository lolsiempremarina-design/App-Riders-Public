import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { groupService, buildInviteLink } from '../services/groupService';
import { DEFAULT_AVATAR } from '../services/authService';
import { GroupChat } from '../components/GroupChat';

const cardStyle = {
  padding: '12px 14px',
  borderRadius: '16px',
  background: 'var(--bg-card-subtle)',
  border: '1px solid var(--border-light)',
  marginBottom: '14px'
};

const pillBtn = {
  fontFamily: 'var(--font-main)',
  whiteSpace: 'nowrap',
  height: '32px',
  padding: '0 12px',
  borderRadius: '16px',
  border: '1px solid var(--border-light)',
  background: 'var(--bg-card)',
  color: 'var(--text-main)',
  fontWeight: 700,
  fontSize: '0.74rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none'
};

const accentBtn = { ...pillBtn, border: 'none', background: 'var(--ror-cyan)', color: '#000000', fontWeight: 800 };

/**
 * Pagina del gruppo (/gruppo-chat?id=<id>) con dati reali (GET /api/groups/<id>):
 * membri e ruoli, codice e link d'invito, condivisione della posizione, uscita dal gruppo.
 * La chat in tempo reale usa il WebSocket /ws/chat/<id> (componente GroupChat).
 */
export const GruppoChat = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openModal, showToast, t, userProfile } = useApp();
  const groupId = searchParams.get('id');

  const [group, setGroup] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notfound | error
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) {
      setStatus('notfound');
      return;
    }
    setStatus('loading');
    try {
      setGroup(await groupService.get(groupId));
      setStatus('ready');
    } catch (err) {
      if (err?.status === 404) {
        setStatus('notfound');
      } else {
        setLoadError(err?.message || 'Errore');
        setStatus('error');
      }
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  /** Esegue un'azione sul gruppo e aggiorna i dati mostrati. */
  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      const updated = await action();
      if (updated && updated.id) setGroup(updated);
      else await load();
      if (successMessage) showToast(successMessage, 'success');
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message, 'success');
    } catch {
      showToast(text, 'info', 6000);
    }
  };

  const shareInvite = async () => {
    const link = buildInviteLink(group.inviteToken);
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text: t.groupInviteShareText || 'Unisciti al mio gruppo su RoR', url: link });
        return;
      } catch {
        // condivisione annullata: si copia il link
      }
    }
    copyText(link, t.groupLinkCopied || 'Link d\'invito copiato');
  };

  const sharePositionNow = () => {
    if (!('geolocation' in navigator)) {
      showToast(t.geoUnsupported || 'Geolocalizzazione non supportata', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => run(
        () => groupService.sharePosition(pos.coords.latitude, pos.coords.longitude),
        t.groupPositionShared || 'Posizione condivisa con i tuoi gruppi per 90 secondi'
      ),
      () => showToast(t.geoDenied || 'Impossibile accedere alla posizione GPS', 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const roleLabel = (role) => ({
    owner: t.groupRoleOwner || 'Proprietario',
    admin: t.groupRoleAdmin || 'Admin',
    member: t.groupRoleMember || 'Membro'
  }[role] || role);

  const confirmLeave = () => {
    const isLastMember = group.memberCount === 1;
    openModal(
      t.chatLeaveConfirmTitle || 'Uscire dal gruppo?',
      `<p style="font-size:0.86rem;color:var(--text-main);">${isLastMember
        ? (t.groupLeaveLastBody || 'Sei l\'ultimo membro: il gruppo verrà eliminato.')
        : group.myRole === 'owner'
          ? (t.groupLeaveOwnerBody || 'La proprietà del gruppo passerà all\'admin o al membro più anziano.')
          : (t.groupLeaveBody || 'Potrai rientrare solo con il codice o un link d\'invito.')}</p>`,
      t.chatLeaveBtn || 'Esci',
      async () => {
        try {
          const me = (group.members || []).find((m) => m.isMe);
          await groupService.removeMember(group.id, me ? me.userId : userProfile?.id);
          showToast(t.groupLeftToast || 'Sei uscito dal gruppo', 'success');
          navigate('/gruppi');
        } catch (err) {
          showToast(err?.message || 'Errore', 'error');
        }
      }
    );
  };

  const confirmRemove = (member) => {
    openModal(
      t.groupRemoveTitle || 'Rimuovere il membro?',
      `<p style="font-size:0.86rem;color:var(--text-main);">${member.username}</p>`,
      t.groupRemoveBtn || 'Rimuovi',
      () => run(() => groupService.removeMember(group.id, member.userId), t.groupMemberRemoved || 'Membro rimosso')
    );
  };

  const frame = (children) => (
    <PhoneFrame toolbarTitle={t.groupPageTitle || 'RoR Gruppo'}>
      <HeaderBanner backTo="/gruppi" />
      <div className="app-content" style={{ padding: '14px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-gruppo-chat">{children}</div>
      </div>
    </PhoneFrame>
  );

  if (status === 'loading') {
    return frame(<div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '60px auto' }}></div>);
  }
  if (status === 'notfound' || status === 'error') {
    return frame(
      <div role="alert" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-main)' }}>
        <p style={{ fontWeight: 700 }}>
          {status === 'notfound'
            ? (t.groupNotFound || 'Gruppo non trovato o non ne fai parte.')
            : `${t.groupsLoadError || 'Impossibile caricare il gruppo.'} ${loadError}`}
        </p>
        {status === 'error' && <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>}
        <Link to="/gruppi" style={{ ...pillBtn, marginTop: '12px' }}>{t.groupBackToList || 'Torna ai gruppi'}</Link>
      </div>
    );
  }

  const canManage = group.canManage;
  const isOwner = group.myRole === 'owner';
  const sharingEnabled = Boolean(userProfile?.sensorsEnabled && userProfile?.shareLocationWithGroups);

  return frame(
    <>
      {/* INTESTAZIONE DEL GRUPPO */}
      <section className="group-chat-header" style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="greeting-main-title" style={{ fontSize: '1.15rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {group.name}
          </h2>
          {group.description && (
            <p className="greeting-subtitle" style={{ fontSize: '0.78rem', margin: '4px 0 0 0' }}>{group.description}</p>
          )}
          <span className="greeting-subtitle" style={{ fontSize: '0.74rem', fontWeight: 600 }}>
            {`${group.memberCount} ${group.memberCount === 1 ? (t.groupMemberSingular || 'membro') : (t.groupMembers || 'Membri')}`}
            {' • '}
            <span style={{ color: 'var(--text-success)', fontWeight: 700 }}>
              {`${group.sharingCount} ${t.groupSharingNow || 'in mappa ora'}`}
            </span>
          </span>
        </div>
        <Link to={`/mappa?gruppo=${group.id}`} style={accentBtn}>{t.groupShowOnMap || 'Vedi sulla mappa'}</Link>
      </section>

      {/* CHAT IN TEMPO REALE */}
      <div style={{ ...cardStyle, background: 'var(--bg-card)' }}>
        <GroupChat groupId={group.id} myUserId={(group.members || []).find((m) => m.isMe)?.userId ?? userProfile?.id} />
      </div>

      {/* INVITI */}
      <section style={cardStyle} aria-label={t.groupInviteSection || 'Invita rider'}>
        <h3 className="section-card-title" style={{ fontSize: '0.95rem', margin: '0 0 8px 0' }}>{t.groupInviteSection || 'Invita rider'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, letterSpacing: '1px' }} aria-label={t.groupCodeLabel || 'Codice del gruppo'}>
            {group.code}
          </span>
          <button type="button" style={pillBtn} onClick={() => copyText(group.code, t.groupCodeCopied || 'Codice copiato')}>
            {t.groupCopyCode || 'Copia codice'}
          </button>
          {canManage && (
            <button type="button" style={pillBtn} disabled={busy}
              onClick={() => run(() => groupService.regenerateCode(group.id), t.groupCodeRegenerated || 'Nuovo codice generato: il vecchio non è più valido')}>
              {t.groupNewCode || 'Nuovo codice'}
            </button>
          )}
        </div>
        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            {group.inviteToken ? (
              <>
                <button type="button" style={accentBtn} onClick={shareInvite}>{t.groupShareLink || 'Condividi link d\'invito'}</button>
                <button type="button" style={pillBtn} disabled={busy}
                  onClick={() => run(() => groupService.revokeInvite(group.id), t.groupLinkRevoked || 'Link d\'invito disattivato')}>
                  {t.groupRevokeLink || 'Disattiva link'}
                </button>
              </>
            ) : (
              <button type="button" style={pillBtn} disabled={busy}
                onClick={() => run(() => groupService.regenerateInvite(group.id), t.groupLinkCreated || 'Nuovo link d\'invito creato')}>
                {t.groupCreateLink || 'Crea link d\'invito'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* POSIZIONE */}
      <section style={cardStyle} aria-label={t.groupLocationSection || 'Posizione'}>
        <h3 className="section-card-title" style={{ fontSize: '0.95rem', margin: '0 0 6px 0' }}>{t.groupLocationSection || 'Posizione'}</h3>
        {sharingEnabled ? (
          <button type="button" style={accentBtn} disabled={busy} onClick={sharePositionNow}>
            {t.groupShareMyPosition || 'Condividi la mia posizione ora'}
          </button>
        ) : (
          <p className="greeting-subtitle" style={{ fontSize: '0.78rem', margin: 0 }}>
            {t.groupSharingDisabled || 'La condivisione della posizione con i gruppi è disattivata.'}{' '}
            <Link className="inline-link" to="/posizione">{t.groupEnableSharing || 'Attivala nelle impostazioni'}</Link>
          </p>
        )}
      </section>

      {/* MEMBRI */}
      <section className="group-members-section" id="group-members" style={{ marginBottom: '16px' }}>
        <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 className="section-card-title" style={{ fontSize: '0.95rem' }}>{t.chatMembersTitle || 'Membri'}</h3>
          <span className="greeting-subtitle" style={{ fontSize: '0.78rem' }}>{group.memberCount}</span>
        </div>
        <ul className="group-members-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', listStyle: 'none', padding: 0, margin: 0 }}>
          {(group.members || []).map((member) => {
            const canRemove = !member.isMe && member.role !== 'owner' && (isOwner || (group.myRole === 'admin' && member.role === 'member'));
            return (
              <li
                className="group-member-row"
                key={member.userId}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '14px' }}
              >
                <img
                  src={member.avatar || DEFAULT_AVATAR}
                  alt=""
                  className="group-member-avatar"
                  onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_AVATAR; }}
                  style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {member.username}{member.isMe ? ` (${t.groupYou || 'tu'})` : ''}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {roleLabel(member.role)}
                    {member.isSharingLocation && <span style={{ color: 'var(--text-success)', fontWeight: 700 }}>{` • ${t.groupMemberOnMap || 'posizione condivisa'}`}</span>}
                  </div>
                </div>
                {isOwner && !member.isMe && (
                  <button type="button" style={pillBtn} disabled={busy}
                    onClick={() => run(() => groupService.setMemberRole(group.id, member.userId, member.role === 'admin' ? 'member' : 'admin'),
                      t.groupRoleUpdated || 'Ruolo aggiornato')}>
                    {member.role === 'admin' ? (t.groupMakeMember || 'Rendi membro') : (t.groupMakeAdmin || 'Rendi admin')}
                  </button>
                )}
                {canRemove && (
                  <button type="button" style={{ ...pillBtn, color: '#ef4444' }} disabled={busy} onClick={() => confirmRemove(member)}
                    aria-label={`${t.groupRemoveBtn || 'Rimuovi'} ${member.username}`}>
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <button className="btn-logout-danger" onClick={confirmLeave}>
        {t.chatLeaveBtn || 'Esci dal gruppo'}
      </button>
    </>
  );
};
