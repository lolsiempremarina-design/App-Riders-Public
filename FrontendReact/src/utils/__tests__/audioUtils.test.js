import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAudioToggles,
  getAudioContext,
  playTone,
  playOrderHotSound,
  playChatSound,
  playSosSound,
  playNotificationSound,
  playLockSound,
  TOGGLES_STORAGE_KEY
} from '../audioUtils';

describe('audioUtils - Web Audio API Synthesis Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('retrieves default audio toggles when localStorage is empty', () => {
    const toggles = getAudioToggles();
    expect(toggles.orderSound).toBe(true);
    expect(toggles.chatSound).toBe(true);
    expect(toggles.sosSound).toBe(true);
  });

  it('reads customized audio toggles from localStorage', () => {
    localStorage.setItem(
      TOGGLES_STORAGE_KEY,
      JSON.stringify({ orderSound: false, chatSound: true, sosSound: false })
    );

    const toggles = getAudioToggles();
    expect(toggles.orderSound).toBe(false);
    expect(toggles.chatSound).toBe(true);
    expect(toggles.sosSound).toBe(false);
  });

  it('instantiates and provides singleton AudioContext', () => {
    const ctx = getAudioContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx.createOscillator).toBe('function');
    expect(typeof ctx.createGain).toBe('function');
  });

  it('synthesizes a tone with playTone', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');
    const createGainSpy = vi.spyOn(ctx, 'createGain');

    playTone({ frequency: 440, duration: 0.1 });

    expect(createOscSpy).toHaveBeenCalled();
    expect(createGainSpy).toHaveBeenCalled();
  });

  it('plays order chime when orderSound is enabled', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playOrderHotSound();
    expect(createOscSpy).toHaveBeenCalledTimes(2); // D5 + A5
  });

  it('does not play order chime when orderSound is disabled in toggles', () => {
    localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify({ orderSound: false }));
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playOrderHotSound();
    expect(createOscSpy).not.toHaveBeenCalled();
  });

  it('plays chat pop when chatSound is enabled', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playChatSound();
    expect(createOscSpy).toHaveBeenCalledTimes(2);
  });

  it('does not play chat pop when chatSound is disabled', () => {
    localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify({ chatSound: false }));
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playChatSound();
    expect(createOscSpy).not.toHaveBeenCalled();
  });

  it('plays SOS alert when sosSound is enabled', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playSosSound();
    expect(createOscSpy).toHaveBeenCalledTimes(2);
  });

  it('plays notification chime when push is enabled', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playNotificationSound();
    expect(createOscSpy).toHaveBeenCalledTimes(2); // F5 + C6
  });

  it('does not play notification chime when push is disabled in toggles', () => {
    localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify({ push: false }));
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    playNotificationSound();
    expect(createOscSpy).not.toHaveBeenCalled();
  });

  it('plays lock and unlock sound effects with distinct pitch sequences', () => {
    const ctx = getAudioContext();
    const createOscSpy = vi.spyOn(ctx, 'createOscillator');

    // Locked
    playLockSound(true);
    expect(createOscSpy).toHaveBeenCalledTimes(2);

    // Unlocked
    playLockSound(false);
    expect(createOscSpy).toHaveBeenCalledTimes(4);
  });
});
