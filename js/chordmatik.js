/**
 * MiniMatik — Mode 02 ChordMatiK (Real User-Sample 7-Pad Performance Surface — PR04)
 *
 * Replaces legacy oscillator playback with assigned user AudioBuffer voices via
 * sampleVoiceEngine. Supports 12 chromatic keys, Major/Natural Minor/Harmonic Minor
 * scales, stackable Hold+Toggle modifiers (7TH/SUS4/9TH/STRUM), adjustable Low-to-High
 * STRUM, Mono Up 1/8-note arpeggio, Smart Chord Priority (Option A), Gate/One-shot,
 * 8-voice per-track management, and absolute MIDI live recording.
 */
import { state, ROOT_NOTES } from './state.js';
import { formatSlotNumber } from './soundbank-state.js';
import {
  MODIFIER_IDS,
  SAMPLE_REFERENCE_MIDI,
  getScale,
  normalizeRootIndex,
  getPadTriggerData,
  strumSliderToMs,
  strumMsToSlider,
  createModifierController
} from './chordmatik-theory.js';
import { playClick, sampleVoiceEngine } from './audio.js';
import { updateAllHUD, showChordCallout } from './display.js';
import { renderSequencerGrid } from './sequencer.js';

// Active pointer and keyboard ownership maps (ensures clean Gate release across track switches)
const activePadPointers = new Map(); // pointerId -> { trackIndex, groupId, el, degreeIdx }
const activeKeyPresses = new Map();  // degreeIdx -> { trackIndex, groupId, el }

let modifierController = createModifierController({
  onChange: (snapshot) => {
    for (const mod of MODIFIER_IDS) {
      state.chordmatik.modifiers[mod] = snapshot[mod].active;
    }
    renderChordMatiKUI();
  }
});

function isPadStillHeld(el) {
  if (!el) return false;
  for (const rec of activePadPointers.values()) {
    if (rec.el === el) return true;
  }
  for (const rec of activeKeyPresses.values()) {
    if (rec.el === el) return true;
  }
  return false;
}

function getActiveModifiers() {
  return modifierController.getActiveModifiers();
}

export function renderChordMatiKUI() {
  const trk = state.tracks[state.activeTrack];
  const slot = trk && trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
  const hasSample = Boolean(slot && slot.loaded && slot.buffer);
  const activeMods = getActiveModifiers();
  const modSnapshot = modifierController.getSnapshot();

  // 1. Chromatic KEY selector
  const keySelect = document.getElementById('cmKeySelect');
  if (keySelect) {
    keySelect.value = String(normalizeRootIndex(state.chordmatik.rootIndex));
  }

  // 2. SCALE buttons (Major / Natural Minor / Harmonic Minor)
  document.querySelectorAll('.cm-scale-btn').forEach(btn => {
    const active = btn.dataset.cmScale === state.chordmatik.scaleMode;
    btn.className = active
      ? 'cm-scale-btn px-2 py-0.5 rounded font-bold cursor-pointer bg-cyan-400 text-black'
      : 'cm-scale-btn px-2 py-0.5 rounded font-bold cursor-pointer text-zinc-400 hover:text-white';
  });

  // 3. Submode buttons (CHORD / NOTE / DRUM)
  document.querySelectorAll('.cm-submode-btn').forEach(btn => {
    const active = btn.dataset.cmMode === state.chordmatik.subMode;
    btn.className = active
      ? 'cm-submode-btn px-2 py-0.5 rounded font-bold cursor-pointer bg-amber-300 text-black'
      : 'cm-submode-btn px-2 py-0.5 rounded font-bold cursor-pointer text-zinc-400 hover:text-white';
  });

  // 4. Octave readout
  const octLabel = document.getElementById('cmOctLabel');
  if (octLabel) {
    octLabel.textContent = `OCT ${state.chordmatik.octave}`;
  }

  // 5. Per-track Playback (1-SHOT / GATE) & Voice (POLY / MONO) controls
  const trkTag = document.getElementById('cmTrackModeTag');
  if (trkTag && trk) {
    trkTag.textContent = `T${trk.id}`;
  }

  document.querySelectorAll('.cm-playback-btn').forEach(btn => {
    const active = trk && btn.dataset.trackPlayback === trk.playbackMode;
    btn.className = active
      ? 'cm-playback-btn px-1.5 py-0.5 rounded font-bold cursor-pointer bg-[#27ae60] text-white'
      : 'cm-playback-btn px-1.5 py-0.5 rounded font-bold cursor-pointer text-zinc-400 hover:text-white';
  });

  document.querySelectorAll('.cm-voice-btn').forEach(btn => {
    const active = trk && btn.dataset.trackVoice === trk.voiceMode;
    btn.className = active
      ? 'cm-voice-btn px-1.5 py-0.5 rounded font-bold cursor-pointer bg-[#2f80ed] text-white'
      : 'cm-voice-btn px-1.5 py-0.5 rounded font-bold cursor-pointer text-zinc-400 hover:text-white';
  });

  // 6. STRUM Slow-Fast slider & Mono ARP override indicator
  const strumSlider = document.getElementById('cmStrumSlider');
  const strumMsLabel = document.getElementById('cmStrumMsLabel');
  const strumWrap = document.getElementById('cmStrumWrap');
  const isMono = trk && trk.voiceMode === 'MONO';
  if (strumSlider) {
    strumSlider.value = String(strumMsToSlider(state.chordmatik.strumMs));
  }
  if (strumMsLabel) {
    strumMsLabel.textContent = isMono ? 'ARP 1/8' : `${state.chordmatik.strumMs}ms`;
    strumMsLabel.className = isMono
      ? 'text-[9px] font-bold text-cyan-300 w-12 text-right tabular-nums'
      : 'text-[9px] font-bold text-orange-300 w-10 text-right tabular-nums';
  }
  if (strumWrap) {
    strumWrap.classList.toggle('opacity-55', Boolean(isMono));
  }

  // 7. Four Modifiers ABOVE the 7 Chord Pads (7TH / SUS4 / 9TH / STRUM)
  document.querySelectorAll('.cm-mod-btn').forEach(btn => {
    const mod = btn.dataset.mod;
    const snap = modSnapshot[mod];
    if (!snap) return;

    const isStrumDisabledByMono = mod === 'STRUM' && isMono;
    btn.classList.toggle('ring-2', snap.active);
    btn.classList.toggle('ring-amber-300', snap.latched && !snap.held);
    btn.classList.toggle('ring-white', snap.held);
    btn.classList.toggle('bg-zinc-700', snap.active);
    btn.classList.toggle('bg-zinc-800', !snap.active);
    btn.classList.toggle('is-pressed', snap.held);
    btn.classList.toggle('opacity-60', Boolean(isStrumDisabledByMono));
    btn.setAttribute('aria-pressed', snap.active ? 'true' : 'false');

    const badge = btn.querySelector('.cm-mod-state');
    if (badge) {
      if (snap.held) {
        badge.textContent = snap.momentary ? 'HOLD' : 'ON';
        badge.className = 'cm-mod-state text-[8px] px-1 rounded bg-white text-black font-extrabold';
      } else if (snap.latched) {
        badge.textContent = isStrumDisabledByMono ? 'MONO' : 'LATCH';
        badge.className = 'cm-mod-state text-[8px] px-1 rounded bg-amber-300 text-black font-extrabold';
      } else {
        badge.textContent = isStrumDisabledByMono ? 'ARP' : 'OFF';
        badge.className = 'cm-mod-state text-[8px] px-1 rounded bg-black/40 text-zinc-500';
      }
    }
  });

  // 8. Update 7 Pad Roman numerals & dynamic chord/note/drum labels
  for (let deg = 0; deg < 7; deg++) {
    const data = getPadTriggerData({
      rootIndex: state.chordmatik.rootIndex,
      scaleMode: state.chordmatik.scaleMode,
      degreeIndex: deg,
      octave: state.chordmatik.octave,
      subMode: state.chordmatik.subMode,
      modifiers: activeMods
    });
    const romanEl = document.getElementById(`degRoman-${deg}`);
    const lblEl = document.getElementById(`degLabel-${deg}`);
    if (romanEl) romanEl.textContent = data.roman;
    if (lblEl) lblEl.textContent = data.padLabel;
  }

  // 9. Engine / Track sample status footer
  const statusEl = document.getElementById('cmEngineStatus');
  if (statusEl && trk) {
    const scale = getScale(state.chordmatik.scaleMode);
    const rootName = ROOT_NOTES[normalizeRootIndex(state.chordmatik.rootIndex)].name;
    if (!state.audioEnabled) {
      statusEl.textContent = `AUDIO OFF · TRK ${trk.id} SILENT`;
      statusEl.className = 'truncate text-zinc-500';
    } else if (trk.muted) {
      statusEl.textContent = `TRK ${trk.id} MUTED (SILENT) · ${rootName} ${scale.shortLabel}`;
      statusEl.className = 'truncate text-red-400 font-bold';
    } else if (!hasSample) {
      statusEl.textContent = `TRK ${trk.id} UNASSIGNED (SILENT) · ASSIGN SAMPLE IN 01.SAMPLER`;
      statusEl.className = 'truncate text-amber-300/90';
    } else {
      const modeSummary = `${trk.voiceMode === 'MONO' ? 'MONO ARP' : 'POLY'} · ${trk.playbackMode === 'GATE' ? 'GATE' : '1-SHOT'}`;
      statusEl.textContent = `S${formatSlotNumber(trk.assignedSlot)} ${slot.name} · ${modeSummary} · REF C4`;
      statusEl.className = 'truncate text-emerald-400 font-bold';
    }
  }

  const voicingEl = document.getElementById('cmVoicingReadout');
  if (voicingEl) {
    voicingEl.textContent = `VOICING: ${state.chordmatik.lastVoicingName}`;
  }

  updateAllHUD();
}

export function triggerChordMatiKPad(degreeIdx, el = null, { pointerId = null, isKeyboard = false } = {}) {
  const activeMods = getActiveModifiers();
  modifierController.notifyPadTriggered();

  const triggerData = getPadTriggerData({
    rootIndex: state.chordmatik.rootIndex,
    scaleMode: state.chordmatik.scaleMode,
    degreeIndex: degreeIdx,
    octave: state.chordmatik.octave,
    subMode: state.chordmatik.subMode,
    modifiers: activeMods
  });

  const trackIndex = state.activeTrack;
  const trk = state.tracks[trackIndex];
  const slot = trk && trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
  const buffer = (slot && slot.loaded && slot.buffer) ? slot.buffer : null;

  // Trigger real user sample via PR04 sampleVoiceEngine (ZERO oscillator fallback)
  const result = sampleVoiceEngine.triggerPerformance({
    trackIndex,
    buffer,
    midiNotes: triggerData.midiNotes,
    isChordGroup: triggerData.isChordGroup,
    playbackMode: trk ? trk.playbackMode : 'ONE_SHOT',
    voiceMode: trk ? trk.voiceMode : 'POLY',
    strumEnabled: Boolean(activeMods.STRUM),
    strumMs: state.chordmatik.strumMs,
    trackMuted: Boolean(trk && trk.muted)
  });

  // Track ownership for Gate release even if activeTrack changes before release
  if (result.triggered && result.groupId !== null) {
    if (pointerId !== null) {
      activePadPointers.set(pointerId, {
        trackIndex,
        groupId: result.groupId,
        el,
        degreeIdx
      });
    } else if (isKeyboard) {
      activeKeyPresses.set(degreeIdx, {
        trackIndex,
        groupId: result.groupId,
        el
      });
    }
  } else if (pointerId !== null && el) {
    // Still track visual release for silent/unassigned pads
    activePadPointers.set(pointerId, {
      trackIndex,
      groupId: null,
      el,
      degreeIdx
    });
  } else if (isKeyboard && el) {
    activeKeyPresses.set(degreeIdx, {
      trackIndex,
      groupId: null,
      el
    });
  }

  // Build concise callout & voicing readout
  let calloutText = triggerData.calloutLabel;
  if (!result.triggered && result.reason === 'NO_SAMPLE') {
    calloutText = `${triggerData.calloutLabel} [NO SAMPLE]`;
  } else if (!result.triggered && result.reason === 'TRACK_MUTED') {
    calloutText = `${triggerData.calloutLabel} [MUTED]`;
  }

  state.chordmatik.lastVoicingName = triggerData.calloutLabel;
  const voicingEl = document.getElementById('cmVoicingReadout');
  if (voicingEl) {
    voicingEl.textContent = `VOICING: ${triggerData.calloutLabel}`;
  }
  showChordCallout(calloutText);

  // Live Record stores exact absolute triggered MIDI pitches (unaffected by later KEY/SCALE changes)
  if (state.isRecording) {
    const stepObj = state.scenes[state.currentScene][trackIndex][state.currentStep];
    stepObj.active = true;
    stepObj.midiNotes = [...triggerData.midiNotes];
    renderSequencerGrid();
  }

  if (el) {
    el.classList.add('key-fired');
    if (pointerId === null && !isKeyboard) {
      setTimeout(() => {
        if (!isPadStillHeld(el)) {
          el.classList.remove('key-fired');
        }
      }, 140);
    }
  }

  return { triggerData, result, referenceMidi: SAMPLE_REFERENCE_MIDI };
}

export function releaseChordMatiKPointer(pointerId) {
  const rec = activePadPointers.get(pointerId);
  if (!rec) return false;
  activePadPointers.delete(pointerId);

  if (rec.groupId !== null) {
    sampleVoiceEngine.releasePerformance(rec.trackIndex, rec.groupId);
  }
  if (rec.el && !isPadStillHeld(rec.el)) {
    rec.el.classList.remove('key-fired');
  }
  return true;
}

export function releaseChordMatiKKey(degreeIdx) {
  const rec = activeKeyPresses.get(degreeIdx);
  if (!rec) return false;
  activeKeyPresses.delete(degreeIdx);

  if (rec.groupId !== null) {
    sampleVoiceEngine.releasePerformance(rec.trackIndex, rec.groupId);
  }
  if (rec.el && !isPadStillHeld(rec.el)) {
    rec.el.classList.remove('key-fired');
  }
  return true;
}

export function releaseAllChordMatiKInputs() {
  for (const pointerId of Array.from(activePadPointers.keys())) {
    releaseChordMatiKPointer(pointerId);
  }
  for (const deg of Array.from(activeKeyPresses.keys())) {
    releaseChordMatiKKey(deg);
  }
  for (const mod of MODIFIER_IDS) {
    if (modifierController.isHeld(mod)) {
      modifierController.pointerCancel(mod);
    }
  }
}

export function initChordMatiK() {
  // 1. Seven performance pads: Pointer events only (prevents duplicate click after touch)
  document.querySelectorAll('[data-degree]').forEach(pad => {
    const degreeIdx = Number(pad.dataset.degree);

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (typeof pad.setPointerCapture === 'function') {
        try { pad.setPointerCapture(e.pointerId); } catch (_) {}
      }
      triggerChordMatiKPad(degreeIdx, pad, { pointerId: e.pointerId });
    });

    const handlePadRelease = (e) => {
      releaseChordMatiKPointer(e.pointerId);
    };

    pad.addEventListener('pointerup', handlePadRelease);
    pad.addEventListener('pointercancel', handlePadRelease);
    pad.addEventListener('lostpointercapture', handlePadRelease);
  });

  // 2. Four Hold+Toggle Modifiers above pads (7TH / SUS4 / 9TH / STRUM) — Pointer events only
  document.querySelectorAll('.cm-mod-btn').forEach(btn => {
    const mod = btn.dataset.mod;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (typeof btn.setPointerCapture === 'function') {
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      }
      modifierController.pointerDown(mod, e.pointerId);
    });

    btn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      modifierController.pointerUp(mod, e.pointerId);
    });

    const handleModCancel = (e) => {
      modifierController.pointerCancel(mod, e.pointerId);
    };
    btn.addEventListener('pointercancel', handleModCancel);
    btn.addEventListener('lostpointercapture', handleModCancel);

    // Keyboard accessibility (Space/Enter) without firing after pointer clicks
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        modifierController.setLatched(mod, !modifierController.isLatched(mod));
      }
    });
  });

  // 3. Chromatic KEY controls (12 keys; changes apply only to subsequent triggers)
  const keySelect = document.getElementById('cmKeySelect');
  if (keySelect) {
    keySelect.addEventListener('change', () => {
      state.chordmatik.rootIndex = normalizeRootIndex(Number(keySelect.value));
      playClick(850);
      renderChordMatiKUI();
    });
  }

  const keyPrev = document.getElementById('cmKeyPrev');
  if (keyPrev) {
    keyPrev.addEventListener('click', () => {
      state.chordmatik.rootIndex = normalizeRootIndex(state.chordmatik.rootIndex - 1);
      playClick(780);
      renderChordMatiKUI();
    });
  }

  const keyNext = document.getElementById('cmKeyNext');
  if (keyNext) {
    keyNext.addEventListener('click', () => {
      state.chordmatik.rootIndex = normalizeRootIndex(state.chordmatik.rootIndex + 1);
      playClick(880);
      renderChordMatiKUI();
    });
  }

  // 4. SCALE buttons (Major / Natural Minor / Harmonic Minor; changes apply only to subsequent triggers)
  document.querySelectorAll('.cm-scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chordmatik.scaleMode = btn.dataset.cmScale;
      playClick(920);
      renderChordMatiKUI();
    });
  });

  // 5. Submode buttons (CHORD / NOTE / DRUM)
  document.querySelectorAll('.cm-submode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chordmatik.subMode = btn.dataset.cmMode;
      playClick(900);
      renderChordMatiKUI();
    });
  });

  // 6. Octave controls
  document.getElementById('cmOctDown').addEventListener('click', () => {
    state.chordmatik.octave = Math.max(2, state.chordmatik.octave - 1);
    playClick(620);
    renderChordMatiKUI();
  });

  document.getElementById('cmOctUp').addEventListener('click', () => {
    state.chordmatik.octave = Math.min(6, state.chordmatik.octave + 1);
    playClick(880);
    renderChordMatiKUI();
  });

  // 7. Per-track Playback Mode (ONE_SHOT / GATE)
  document.querySelectorAll('.cm-playback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const trk = state.tracks[state.activeTrack];
      if (!trk) return;
      trk.playbackMode = btn.dataset.trackPlayback === 'GATE' ? 'GATE' : 'ONE_SHOT';
      playClick(860);
      renderChordMatiKUI();
    });
  });

  // 8. Per-track Voice Mode (POLY / MONO)
  document.querySelectorAll('.cm-voice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const trk = state.tracks[state.activeTrack];
      if (!trk) return;
      const nextVoice = btn.dataset.trackVoice === 'MONO' ? 'MONO' : 'POLY';
      trk.voiceMode = nextVoice;
      if (nextVoice === 'MONO') {
        sampleVoiceEngine.enforceVoiceMode(state.activeTrack, 'MONO');
      }
      playClick(860);
      renderChordMatiKUI();
    });
  });

  // 9. STRUM Slow-Fast slider (20..150 ms)
  const strumSlider = document.getElementById('cmStrumSlider');
  if (strumSlider) {
    strumSlider.addEventListener('input', () => {
      state.chordmatik.strumMs = strumSliderToMs(strumSlider.value);
      const lbl = document.getElementById('cmStrumMsLabel');
      const trk = state.tracks[state.activeTrack];
      if (lbl && (!trk || trk.voiceMode !== 'MONO')) {
        lbl.textContent = `${state.chordmatik.strumMs}ms`;
      }
    });
  }

  // Prevent stuck held inputs if window loses focus
  window.addEventListener('blur', () => {
    releaseAllChordMatiKInputs();
  });
}
