/**
 * MiniMatik — Shared Web Audio Context & Real User-Sample Voice Engine
 *
 * Exposes the shared AudioContext manager for PR02 sample decode/preview and the
 * unified PR04/PR05 user-sample voice engine for ChordMatiK and SEQ-16.
 * No factory instruments or musical oscillator fallbacks exist anywhere in this module.
 */
import { state } from './state.js';
import { createAudioContextManager } from './sample-decoder.js';
import { createSampleVoiceEngine } from './sample-voice-engine.js';

export const audioCtxManager = createAudioContextManager();

export const sampleVoiceEngine = createSampleVoiceEngine(audioCtxManager, {
  getBpm: () => state.bpm,
  isAudioEnabled: () => state.audioEnabled,
  onAudioActivity: () => {
    state.visualPulse = 1.0;
  }
});

export function stopAllPerformanceAudio() {
  sampleVoiceEngine.stopAll();
}

export function ensureAudioCtx() {
  if (!state.audioEnabled) return null;
  if (!audioCtxManager.isWebAudioSupported()) return null;
  try {
    const ctx = audioCtxManager.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch (_) {
    return null;
  }
}

export function playClick(freq = 920, dur = 0.025) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
