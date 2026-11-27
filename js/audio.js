/**
 * MiniMatik — Shared Web Audio Context, Tactile Click & Legacy Prototype Synth
 *
 * Exposes the shared AudioContext manager for PR02 real sample decode/preview
 * and isolates temporary legacy oscillator voices used by ChordMatiK and SEQ-16
 * until future audio-engine PRs. Never used for soundbank loading or preview.
 */
import { state } from './state.js';
import { createAudioContextManager } from './sample-decoder.js';

export const audioCtxManager = createAudioContextManager();

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

// LEGACY PROTOTYPE BEHAVIOR (PR04/PR05): Temporary oscillator synth used only by
// ChordMatiK and SEQ-16 prototype triggers. Not routed from soundbank samples.
export function playMutatedVoice(midiNotes, duration = 0.36, waveOverride = null) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const jx = state.joystick.x; // -1..1
  const jy = state.joystick.y; // -1..1
  const mag = Math.min(1, Math.hypot(jx, jy));

  // Create BiquadFilter shaped by Joystick X/Y
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const baseCutoff = 1800 + jx * 1500;
  filter.frequency.setValueAtTime(Math.max(140, Math.min(6000, baseCutoff)), now);
  filter.Q.setValueAtTime(1 + Math.max(0, jy) * 14, now);

  const masterGain = ctx.createGain();
  const perVoice = 0.14 / Math.sqrt(midiNotes.length);
  masterGain.gain.setValueAtTime(perVoice, now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration + Math.max(0, jy) * 0.25);

  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  const wave = waveOverride || (state.joystick.xTarget === 'BITCRUSH' && Math.abs(jx) > 0.35 ? 'sawtooth' : 'triangle');

  midiNotes.forEach((midi, idx) => {
    const osc = ctx.createOscillator();
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);

    if (state.joystick.xTarget === 'PITCH WARP' && Math.abs(jx) > 0.08) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq * (1 + jx * 0.45)),
        now + duration * 0.85
      );
    } else if (mag > 0.2) {
      osc.detune.setValueAtTime((idx % 2 === 0 ? 1 : -1) * mag * 22, now);
    }

    osc.connect(filter);
    osc.start(now);
    osc.stop(now + duration + 0.3);
  });

  state.visualPulse = 1.0;
}
