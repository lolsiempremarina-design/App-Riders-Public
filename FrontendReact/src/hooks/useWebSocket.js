import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * URL base dei WebSocket: VITE_WS_URL se impostato, altrimenti lo stesso dominio
 * della pagina (wss:// in HTTPS). L'autenticazione usa il cookie di sessione.
 */
export const resolveWsBaseUrl = () => {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined' || !window.location) return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const DEFAULT_PING_PAYLOAD = JSON.stringify({ type: 'ping' });
const POLICY_VIOLATION = 1008; // codice di chiusura con cui il server rifiuta l'utente

/**
 * Hook personalizzato useWebSocket.
 * Gestisce la connessione WebSocket persistente con riconnessione automatica,
 * heartbeat (Ping/Pong) per rilevare connessioni zombie/mute (es. gallerie o rete mobile debole),
 * invio di messaggi autenticati e ricezione eventi in tempo reale per chat o telemetria IoT.
 *
 * @param {string} channel - Canale o endpoint WebSocket (es. '/ws/chat' o '/ws/telemetry')
 * @param {object} [options={}] - Configurazione opzionale
 * @param {function} [options.onMessage] - Callback invocata alla ricezione di un messaggio
 * @param {boolean} [options.autoConnect=true] - Se connettere automaticamente all'avvio
 * @param {number} [options.reconnectInterval=5000] - Millisecondi prima del tentativo di riconnessione
 * @param {boolean} [options.heartbeat=true] - Abilita o disabilita il battito cardiaco Ping/Pong
 * @param {number} [options.pingInterval=25000] - Intervallo in ms tra l'invio di messaggi ping (default: 25s)
 * @param {number} [options.pongTimeout=5000] - Timeout in ms per ricevere pong prima di forzare il reconnect (default: 5s)
 * @param {object|string} [options.pingPayload={ type: 'ping' }] - Payload inviato come ping
 * @returns {object} { isConnected, connectionStatus, lastMessage, sendMessage, connect, disconnect }
 */
export const useWebSocket = (channel, options = {}) => {
  const {
    onMessage,
    autoConnect = true,
    reconnectInterval = 5000,
    heartbeat = true,
    pingInterval = 25000,
    pongTimeout = 5000,
    pingPayload = DEFAULT_PING_PAYLOAD
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [lastMessage, setLastMessage] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingTimerRef = useRef(null);
  const pongTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);


  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const heartbeatRef = useRef({
    heartbeat,
    pingInterval,
    pongTimeout,
    pingPayload,
    reconnectInterval
  });
  useEffect(() => {
    heartbeatRef.current = {
      heartbeat,
      pingInterval,
      pongTimeout,
      pingPayload,
      reconnectInterval
    };
  }, [heartbeat, pingInterval, pongTimeout, pingPayload, reconnectInterval]);

  const clearHeartbeatTimers = useCallback(() => {
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  const schedulePing = useCallback((customDelay) => {
    const config = heartbeatRef.current;
    if (!config.heartbeat) return;

    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    const delay = typeof customDelay === 'number' ? customDelay : config.pingInterval;

    pingTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // Invia pacchetto ping
      try {
        const payload = typeof config.pingPayload === 'string'
          ? config.pingPayload
          : JSON.stringify(config.pingPayload);
        socketRef.current.send(payload);
      } catch (err) {
        console.warn('[WebSocket] Errore durante invio heartbeat ping:', err);
      }

      // Avvia timer attesa pong
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        console.warn(`[WebSocket] Heartbeat timeout (${config.pongTimeout}ms senza risposta pong). Riconnessione forzata in corso...`);
        if (socketRef.current) {
          try {
            socketRef.current.close();
          } catch {
            // socket già chiuso
          }
        }
      }, config.pongTimeout);
    }, delay);
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    clearHeartbeatTimers();
    if (socketRef.current) {
      // Rimuovi listener prima di chiudere per evitare trigger di onclose/onerror indesiderati
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.onopen = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    if (isMountedRef.current) {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    }
  }, [clearHeartbeatTimers]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !channel) return;
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const cleanChannel = channel.startsWith('/') ? channel : `/${channel}`;
    const url = `${resolveWsBaseUrl()}${cleanChannel}`;

    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) {
          setIsConnected(true);
          setConnectionStatus('connected');
        }
        clearHeartbeatTimers();
        if (heartbeatRef.current.heartbeat) {
          schedulePing(heartbeatRef.current.pingInterval);
        }
      };

      ws.onmessage = (event) => {
        let parsed = null;
        let isJson = false;
        try {
          parsed = JSON.parse(event.data);
          isJson = true;
        } catch {
          parsed = event.data;
        }

        // Verifica se si tratta di un pacchetto di risposta heartbeat
        const isPong = isJson && parsed && (parsed.type === 'pong' || parsed.action === 'pong');
        if (isPong) {
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = null;
          }
          if (heartbeatRef.current.heartbeat) {
            schedulePing(heartbeatRef.current.pingInterval);
          }
          return; // Non diffondere pong ai consumatori di messaggi
        }

        // Qualsiasi messaggio ricevuto attesta che la connessione è viva
        if (pongTimeoutRef.current) {
          clearTimeout(pongTimeoutRef.current);
          pongTimeoutRef.current = null;
        }
        if (heartbeatRef.current.heartbeat) {
          schedulePing(heartbeatRef.current.pingInterval);
        }

        if (isMountedRef.current) {
          setLastMessage(parsed);
        }
        if (onMessageRef.current) onMessageRef.current(parsed);
      };

      ws.onclose = (event) => {
        clearHeartbeatTimers();
        if (isMountedRef.current) {
          setIsConnected(false);
          // 1008 = il server rifiuta il canale (es. non fai più parte del gruppo): riprovare non serve
          if (event?.code === POLICY_VIOLATION) {
            setConnectionStatus('disconnected');
            return;
          }
          setConnectionStatus('reconnecting');
          // Riconnessione automatica dopo intervallo stabilito
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) connect();
          }, heartbeatRef.current.reconnectInterval);
        }
      };

      ws.onerror = () => {
        clearHeartbeatTimers();
        if (isMountedRef.current) {
          setIsConnected(false);
          setConnectionStatus('disconnected');
        }
      };
    } catch (err) {
      console.warn(`[WebSocket] Impossibile connettere a ${channel}:`, err.message);
      clearHeartbeatTimers();
      if (isMountedRef.current) {
        setIsConnected(false);
        setConnectionStatus('disconnected');
      }
    }
  }, [channel, schedulePing, clearHeartbeatTimers]);

  const sendMessage = useCallback((data) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      socketRef.current.send(payload);
      return true;
    }
    return false;
  }, []);

  // Gestione ciclo di vita montaggio componente
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Gestione connessione su channel o autoConnect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [channel, autoConnect, connect, disconnect]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    sendMessage,
    connect,
    disconnect
  };
};

