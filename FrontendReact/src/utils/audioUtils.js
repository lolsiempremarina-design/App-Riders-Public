/**
 * Utilità audio nativa basata su Web Audio API per Rider of Riders (RoR).
 * Genera toni ed effetti sonori sintetizzati dinamici (ordini hot, chat flotta, sos, blocco bike)
 * con latenza zero (0ms), senza dipendenza da file audio esterni (.mp3),
 * garantendo il 100% di funzionamento offline e rispetto delle preferenze utente.
 */

export const TOGGLES_STORAGE_KEY = 'ror-notif-toggles';

/**
 * Recupera le preferenze audio memorizzate in localStorage.
 * @returns {object} Oggetto con i toggle push, sosSound, chatSound, orderSound.
 */
export const getAudioToggles = () => {
  try {
    const raw = localStorage.getItem(TOGGLES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        push: parsed.push ?? true,
        sosSound: parsed.sosSound ?? true,
        gpsSaver: parsed.gpsSaver ?? true,
        chatSound: parsed.chatSound ?? true,
        orderSound: parsed.orderSound ?? true
      };
    }
  } catch (e) {
    // Fallback sicuro se localStorage non è accessibile
  }
  return {
    push: true,
    sosSound: true,
    gpsSaver: true,
    chatSound: true,
    orderSound: true
  };
};

let audioCtx = null;

/**
 * Restituisce l'istanza singleton di AudioContext, riattivandola se sospesa.
 */
export const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

/**
 * Sintetizza un tono acustico personalizzato tramite oscillatore e controllo di guadagno.
 * 
 * @param {object} params
 * @param {number} params.frequency - Frequenza in Hertz (es. 440 per LA4).
 * @param {string} [params.type='sine'] - Tipo d'onda: 'sine', 'triangle', 'square', 'sawtooth'.
 * @param {number} [params.duration=0.15] - Durata in secondi.
 * @param {number} [params.volume=0.1] - Volume d'uscita (0.0 a 1.0).
 * @param {number} [params.delay=0] - Ritardo prima dell'emissione in secondi.
 */
export const playTone = ({ frequency = 440, type = 'sine', duration = 0.15, volume = 0.1, delay = 0 } = {}) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch (e) {
    // Non interrompe mai il flusso dell'applicazione in caso di restrizioni del browser
  }
};

/**
 * Suono per notifica e accettazione ordini Hot (chime moderno ascendente: D5 -> A5).
 */
export const playOrderHotSound = () => {
  const toggles = getAudioToggles();
  if (!toggles.orderSound) return;
  playTone({ frequency: 587.33, duration: 0.10, volume: 0.14 }); // Re5 (587 Hz)
  playTone({ frequency: 880.00, duration: 0.20, volume: 0.16, delay: 0.08 }); // La5 (880 Hz)
};

/**
 * Suono per messaggi della chat di gruppo della flotta (pop melodico: C5 -> E5).
 */
export const playChatSound = () => {
  const toggles = getAudioToggles();
  if (!toggles.chatSound) return;
  playTone({ frequency: 523.25, duration: 0.07, volume: 0.12 }); // Do5 (523 Hz)
  playTone({ frequency: 659.25, duration: 0.14, volume: 0.13, delay: 0.05 }); // Mi5 (659 Hz)
};

/**
 * Suono di allarme emergenza SOS o condivisione posizione di soccorso (impulsi incisivi: 880Hz).
 */
export const playSosSound = () => {
  const toggles = getAudioToggles();
  if (!toggles.sosSound) return;
  playTone({ frequency: 880, type: 'triangle', duration: 0.14, volume: 0.22 });
  playTone({ frequency: 880, type: 'triangle', duration: 0.24, volume: 0.22, delay: 0.16 });
};

/**
 * Suono di notifica generica e push banner (doppio chime cristallino: F5 -> C6).
 * Rispetta il toggle 'push' dalle preferenze audio dell'utente.
 */
export const playNotificationSound = () => {
  const toggles = getAudioToggles();
  if (!toggles.push) return;
  playTone({ frequency: 698.46, duration: 0.08, volume: 0.14 }); // Fa5 (698 Hz)
  playTone({ frequency: 1046.50, duration: 0.18, volume: 0.16, delay: 0.06 }); // Do6 (1046 Hz)
};

/**
 * Suono di blocco o sblocco elettronico della Bike IoT.
 * @param {boolean} isLocked - true per blocco (tono discendente), false per sblocco (tono ascendente).
 */
export const playLockSound = (isLocked = true) => {
  if (isLocked) {
    // Tono discendente soddisfacente (serratura chiusa)
    playTone({ frequency: 440, duration: 0.06, volume: 0.12 });
    playTone({ frequency: 220, duration: 0.10, volume: 0.14, delay: 0.04 });
  } else {
    // Tono ascendente brillante (serratura aperta)
    playTone({ frequency: 330, duration: 0.06, volume: 0.12 });
    playTone({ frequency: 660, duration: 0.12, volume: 0.15, delay: 0.04 });
  }
};
