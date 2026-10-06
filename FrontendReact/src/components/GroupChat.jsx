import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { chatService } from '../services/chatService';
import { normalizeData } from '../services/api';
import { playChatSound } from '../utils/audioUtils';

const TYPING_SHOW_MS = 3500;
const TYPING_SEND_EVERY_MS = 2500;

const bubbleTime = (iso) => (iso ? iso.slice(11, 16) : '');
const osmLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

/** Unisce i messaggi senza doppioni e in ordine: lo storico può arrivare prima o dopo quelli del WebSocket. */
const mergeMessages = (prev, incoming) => {
  const known = new Set(prev.map((m) => m.id));
  const missing = incoming.filter((m) => !known.has(m.id));
  return missing.length ? [...prev, ...missing].sort((a, b) => a.id - b.id) : prev;
};

/**
 * Chat di gruppo in tempo reale: storico da /api/groups/<id>/messages, messaggi nuovi dal
 * WebSocket /ws/chat/<id>. L'invio passa sempre per HTTP (conferma o errore), il WebSocket serve a ricevere.
 */
export const GroupChat = ({ groupId, myUserId }) => {
  const { t, showToast } = useApp();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading');
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const stickToBottomRef = useRef(true);

  const append = useCallback((incoming) => {
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
  }, []);

  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;

  useEffect(() => {
    let cancelled = false;
    // un altro gruppo: niente messaggi del precedente
    setMessages([]);
    setHasMore(false);
    setStatus('loading');
    chatService.history(groupId)
      .then(({ messages: history, hasMore: more }) => {
        if (cancelled) return;
        // unione e non sostituzione: un messaggio arrivato dal WebSocket mentre si caricava lo storico resta
        setMessages((prev) => mergeMessages(prev, history));
        setHasMore(more);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
  }, [groupId]);

  // "ready" arriva a ogni connessione (anche la prima) quando il server riceve davvero i messaggi del gruppo: il
  // browser vede il WebSocket aperto un attimo prima, e un messaggio scritto in quell'attimo non era né nello storico
  // né nel WebSocket (si vedeva solo ricaricando). Qui lo storico si carica di nuovo e si uniscono i mancanti; vale
  // anche per quelli scritti mentre il WebSocket era chiuso (riconnessione).
  const catchUp = () => {
    const forGroup = groupId;
    chatService.history(forGroup)
      .then(({ messages: latest }) => {
        if (groupIdRef.current === forGroup) setMessages((prev) => mergeMessages(prev, latest));
      })
      .catch(() => {});
  };

  const { isConnected, connectionStatus, sendMessage } = useWebSocket(`/ws/chat/${groupId}`, {
    onMessage: (raw) => {
      const event = normalizeData(raw);
      if (!event || typeof event !== 'object') return;
      if (event.type === 'ready') {
        catchUp();
      } else if (event.type === 'message' && event.message) {
        append(event.message);
        if (event.message.userId !== myUserId) {
          setTyping(null);
          playChatSound();
        }
      } else if (event.type === 'typing' && event.userId !== myUserId) {
        setTyping(event.username);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(null), TYPING_SHOW_MS);
      } else if (event.type === 'error' && event.code === 'not_a_member') {
        showToast(t.chatNotMemberAnymore || 'Non fai più parte di questo gruppo.', 'error');
      } else if (event.type === 'error' && event.code === 'too_many_connections') {
        showToast(t.chatTooManyOpen || 'Hai troppe chat aperte (al massimo 5): chiudine una e riapri questa.', 'error');
      } else if (event.type === 'error' && event.message) {
        showToast(event.message, 'error');
      }
    }
  });

  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  // resta in fondo alla conversazione se l'utente era già in fondo
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    try {
      const { messages: older, hasMore: more } = await chatService.history(groupId, messages[0].id);
      stickToBottomRef.current = false;
      setMessages((prev) => [...older, ...prev]);
      setHasMore(more);
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    }
  };

  // Invio sempre via HTTP: risponde con il messaggio salvato oppure con un errore, e il server lo inoltra anche a
  // chi è connesso al WebSocket. Prima, con il WebSocket "connesso", il messaggio partiva da lì senza conferma:
  // dopo un cambio di rete (wifi → dati, galleria) la connessione resta "aperta" fino a 30 s pur essendo morta,
  // e il messaggio spariva senza avviso, con il testo già cancellato.
  const send = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    stickToBottomRef.current = true;
    setSending(true);
    try {
      append(await chatService.send(groupId, value));
      // cancella solo il testo inviato: quello scritto nel frattempo resta
      setText((current) => (current.trim() === value ? '' : current));
    } catch (err) {
      showToast(err?.message || 'Errore', 'error'); // il testo resta nella casella: si può riprovare
    } finally {
      setSending(false);
    }
  };

  const shareLocation = () => {
    if (!('geolocation' in navigator)) {
      showToast(t.geoUnsupported || 'Geolocalizzazione non supportata', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      stickToBottomRef.current = true;
      try {
        append(await chatService.sendLocation(groupId, lat, lon));
      } catch (err) {
        showToast(err?.message || 'Errore', 'error');
      }
    }, () => showToast(t.geoDenied || 'Impossibile accedere alla posizione GPS', 'error'), { enableHighAccuracy: true, timeout: 10000 });
  };

  const onChange = (event) => {
    setText(event.target.value);
    const now = Date.now();
    if (isConnected && event.target.value.trim() && now - lastTypingSentRef.current > TYPING_SEND_EVERY_MS) {
      lastTypingSentRef.current = now;
      sendMessage({ type: 'typing' });
    }
  };

  const statusLabel = {
    connected: t.chatStatusConnected || 'In tempo reale',
    reconnecting: t.chatStatusReconnecting || 'Riconnessione...',
    disconnected: t.chatStatusDisconnected || 'Non in tempo reale'
  }[connectionStatus] || (t.chatStatusDisconnected || 'Non in tempo reale');

  return (
    <section aria-label={t.chatTitle || 'Chat di Gruppo'} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="section-card-title" style={{ fontSize: '0.95rem', margin: 0 }}>{t.chatTitle || 'Chat di Gruppo'}</h3>
        <span role="status" style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', background: isConnected ? 'rgba(5,150,105,0.15)' : 'rgba(217,119,6,0.15)', color: isConnected ? '#059669' : '#D97706' }}>
          {statusLabel}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="group-chat-messages"
        aria-label={t.chatHistoryAria || 'Messaggi del gruppo'}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '180px', maxHeight: '340px', overflowY: 'auto', padding: '10px', background: 'var(--bg-card-subtle)', borderRadius: '16px', border: '1px solid var(--border-light)' }}
      >
        {hasMore && (
          <button type="button" onClick={loadOlder} style={{ alignSelf: 'center', background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>
            {t.chatLoadOlder || 'Messaggi precedenti'}
          </button>
        )}
        {status === 'loading' && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '20px auto' }}></div>}
        {status === 'error' && <p role="alert" style={{ fontSize: '0.8rem' }}>{t.chatLoadError || 'Impossibile caricare i messaggi.'}</p>}
        {status === 'ready' && messages.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>{t.chatEmpty || 'Nessun messaggio: scrivi il primo!'}</p>
        )}
        {messages.map((m) => {
          const mine = m.userId === myUserId;
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', background: mine ? '#047857' : 'var(--bg-card)', color: mine ? '#fff' : 'var(--text-main)', padding: '8px 12px', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', border: mine ? 'none' : '1px solid var(--border-light)' }}>
              {!mine && <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.7 }}>{m.username}</div>}
              {m.kind === 'location' ? (
                <a href={osmLink(m.lat, m.lon)} target="_blank" rel="noopener noreferrer" style={{ color: mine ? '#fff' : 'var(--text-success)', fontWeight: 700, fontSize: '0.84rem' }}>
                  📍 {m.text || (t.chatLocationMsg || 'Posizione condivisa')}
                </a>
              ) : (
                <div style={{ fontSize: '0.86rem', lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              )}
              <div style={{ fontSize: '0.64rem', textAlign: 'right', opacity: 0.75 }}>{bubbleTime(m.createdAt)}</div>
            </div>
          );
        })}
        {typing && (
          <div className="chat-typing-indicator" role="status" aria-live="polite" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            {typing} {t.chatTyping || 'sta scrivendo...'}
          </div>
        )}
      </div>

      <form onSubmit={send} className="group-chat-composer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={shareLocation} aria-label={t.chatShareLocationBtn || 'Condividi posizione'} title={t.chatShareLocationBtn || 'Condividi posizione'}
          style={{ width: '42px', height: '42px', borderRadius: '14px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0 }}>
          📍
        </button>
        <input
          value={text}
          onChange={onChange}
          maxLength={1000}
          placeholder={t.chatComposerPlaceholderReal || 'Scrivi al gruppo...'}
          aria-label={t.chatComposerAria || 'Testo del messaggio'}
          style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: '14px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.86rem' }}
        />
        <button type="submit" disabled={sending || !text.trim()}
          style={{ height: '42px', padding: '0 16px', borderRadius: '14px', background: 'var(--ror-cyan)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-main)', flexShrink: 0 }}>
          {t.chatSendBtn || 'Invia'}
        </button>
      </form>
    </section>
  );
};
