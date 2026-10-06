import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Mock della classe standard WebSocket del browser
class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn().mockImplementation(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ wasClean: true });
    });
    MockWebSocket.instances.push(this);
  }

  // Simula apertura connessione
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  // Simula messaggio in arrivo
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  // Simula errore
  simulateError() {
    if (this.onerror) this.onerror(new Error('WebSocket connection error'));
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

describe('useWebSocket hook', () => {
  let originalWebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  it('inizializza la connessione automatica e aggiorna lo stato a connected', () => {
    const { result } = renderHook(() => useWebSocket('/ws/chat/milano-sud'));

    expect(MockWebSocket.instances.length).toBe(1);
    const wsInstance = MockWebSocket.instances[0];
    expect(wsInstance.url).toContain('/ws/chat/milano-sud');

    // Simula apertura del socket
    act(() => {
      wsInstance.simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('invia messaggi con sendMessage quando il socket è aperto', () => {
    const { result } = renderHook(() => useWebSocket('/ws/telemetry'));
    const wsInstance = MockWebSocket.instances[0];

    act(() => {
      wsInstance.simulateOpen();
    });

    let sendResult;
    act(() => {
      sendResult = result.current.sendMessage({ speed: 28, battery: 85 });
    });

    expect(sendResult).toBe(true);
    expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ speed: 28, battery: 85 }));
  });

  it('riceve messaggi e invoca la callback onMessage passata nelle opzioni', () => {
    const onMessageMock = vi.fn();
    const { result } = renderHook(() => useWebSocket('/ws/chat/test', { onMessage: onMessageMock }));
    const wsInstance = MockWebSocket.instances[0];

    act(() => {
      wsInstance.simulateOpen();
    });

    const payload = { author: 'Maria Verdi', text: 'Nuovo ordine hot Duomo!' };
    act(() => {
      wsInstance.simulateMessage(payload);
    });

    expect(result.current.lastMessage).toEqual(payload);
    expect(onMessageMock).toHaveBeenCalledWith(payload);
  });

  it('disconnette e pulisce il socket quando il componente viene smontato', () => {
    const { unmount } = renderHook(() => useWebSocket('/ws/chat/milano-sud'));
    const wsInstance = MockWebSocket.instances[0];

    act(() => {
      wsInstance.simulateOpen();
    });

    unmount();

    expect(wsInstance.close).toHaveBeenCalled();
  });

  describe('WebSocket Heartbeat (Ping/Pong) & Resilienza Connessione', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('invia ping periodico con intervallo specificato quando il socket è connesso', () => {
      const { result } = renderHook(() =>
        useWebSocket('/ws/telemetry', {
          heartbeat: true,
          pingInterval: 10000,
          pongTimeout: 3000
        })
      );
      const wsInstance = MockWebSocket.instances[0];

      act(() => {
        wsInstance.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
      expect(wsInstance.send).not.toHaveBeenCalled();

      // Avanza il timer di 10 secondi: deve inviare il ping
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    });

    it('gestisce il pong senza diffonderlo a onMessage o aggiornare lastMessage', () => {
      const onMessageMock = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket('/ws/chat/room1', {
          heartbeat: true,
          pingInterval: 5000,
          pongTimeout: 2000,
          onMessage: onMessageMock
        })
      );
      const wsInstance = MockWebSocket.instances[0];

      act(() => {
        wsInstance.simulateOpen();
      });

      // Simula invio ping al 5° secondo
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

      // Il server risponde con pacchetto pong
      act(() => {
        wsInstance.simulateMessage({ type: 'pong' });
      });

      // Non deve essere propagato come messaggio utente
      expect(onMessageMock).not.toHaveBeenCalled();
      expect(result.current.lastMessage).toBeNull();

      // Avanza di 3 secondi (oltre pongTimeout di 2s): il socket NON deve essere chiuso perché pong è arrivato
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(wsInstance.close).not.toHaveBeenCalled();
    });

    it('forza la chiusura del socket e riconnette se il server non risponde entro pongTimeout', () => {
      const { result } = renderHook(() =>
        useWebSocket('/ws/chat/room2', {
          heartbeat: true,
          pingInterval: 5000,
          pongTimeout: 2000,
          reconnectInterval: 3000
        })
      );
      const wsInstance = MockWebSocket.instances[0];

      act(() => {
        wsInstance.simulateOpen();
      });

      // Ping inviato a 5s
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(wsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

      // Nessun pong ricevuto entro i 2s di timeout -> il socket viene chiuso forzatamente
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(wsInstance.close).toHaveBeenCalled();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('reconnecting');

      // Dopo l'intervallo di reconnect (3s), un nuovo socket viene istanziato per riconnettere
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(MockWebSocket.instances.length).toBe(2);
    });

    it('non riconnette se il server rifiuta il canale (codice 1008, es. rimosso dal gruppo)', () => {
      const { result } = renderHook(() => useWebSocket('/ws/chat/7', { reconnectInterval: 3000 }));
      const wsInstance = MockWebSocket.instances[0];

      act(() => {
        wsInstance.simulateOpen();
      });
      act(() => {
        wsInstance.readyState = MockWebSocket.CLOSED;
        wsInstance.onclose({ code: 1008, wasClean: true });
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('disconnected');
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('non invia alcun ping se heartbeat è disattivato ({ heartbeat: false })', () => {
      renderHook(() =>
        useWebSocket('/ws/telemetry', {
          heartbeat: false,
          pingInterval: 5000
        })
      );
      const wsInstance = MockWebSocket.instances[0];

      act(() => {
        wsInstance.simulateOpen();
      });

      act(() => {
        vi.advanceTimersByTime(15000);
      });

      expect(wsInstance.send).not.toHaveBeenCalled();
    });
  });
});

