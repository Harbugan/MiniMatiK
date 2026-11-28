/**
 * MiniMatik — Mode 03 SEQ-16 Grid, Real Sample Sequencer UI & Transport Controls (PR05)
 *
 * Replaces legacy SEQ-16 oscillator and setInterval playback with Web Audio-clock
 * scheduling of each track's assigned user sample via sampleVoiceEngine.
 *
 * Supports:
 * - 64 scenes x 7 tracks x 16 steps with multiple independent note/chord events per step
 * - Live REC Q ON/OFF, continuous overdub across bar boundaries, and note-on/off duration
 * - Tap-to-toggle default step + Note Detail overlay (never flattens multi-event steps)
 * - Next-bar queued scene switching while playing; immediate switch while stopped
 * - Copy Entire Scene (all 7 tracks + notes + X/Y automation) with overwrite protection
 */
import { state, ROOT_NOTES } from './state.js';
import { audioCtxManager, playClick, sampleVoiceEngine, stopAllPerformanceAudio } from './audio.js';
import { updateAllHUD } from './display.js';
import { setJoystickPosition } from './mutate.js';
import {
  SCENE_COUNT,
  STEP_COUNT,
  DEFAULT_EVENT_DURATION_STEPS,
  getStepDurationSec,
  getSubStepOffset,
  formatMidiNote,
  clampMidi,
  migrateStep,
  addEventToStep,
  updateEventInStep,
  deleteEventFromStep,
  toggleDefaultStep,
  isSceneEmpty,
  copyEntireScene
} from './sequencer-model.js';
import { createSequencerEngine } from './sequencer-engine.js';

const LONG_PRESS_MS = 380;

function formatSceneNum(idx) {
  return String(idx + 1).padStart(2, '0');
}

function getDefaultStepMidi() {
  const rootSemi = ROOT_NOTES[state.chordmatik.rootIndex]?.semi ?? 0;
  return clampMidi(60 + rootSemi);
}

function auditionTrackEvent(trackIndex, {
  midiNotes,
  isChordGroup = false,
  durationSteps = DEFAULT_EVENT_DURATION_STEPS,
  strumEnabled = false,
  strumMs
}) {
  const trk = state.tracks[trackIndex];
  if (!trk || trk.muted) return { triggered: false, reason: 'TRACK_MUTED' };
  const slot = trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
  const buffer = (slot && slot.loaded && slot.buffer) ? slot.buffer : null;
  if (!buffer) return { triggered: false, reason: 'NO_SAMPLE' };

  const durationSec = durationSteps * getStepDurationSec(state.bpm);
  return sampleVoiceEngine.triggerPerformance({
    trackIndex,
    buffer,
    midiNotes,
    isChordGroup,
    playbackMode: trk.playbackMode,
    voiceMode: trk.voiceMode,
    strumEnabled,
    strumMs,
    trackMuted: Boolean(trk.muted),
    durationSec,
    source: 'live'
  });
}

function handleVisualStep({ stepIndex, sceneIndex }) {
  const sceneTracks = state.scenes[sceneIndex];
  if (!sceneTracks) return;
  const activeTrackStep = sceneTracks[state.activeTrack][stepIndex];

  // Preserve PR06-boundary step-level X/Y automation record & replay on active track
  if (state.isRecording && state.joystick.isDragging) {
    activeTrackStep.autoX = state.joystick.x;
    activeTrackStep.autoY = state.joystick.y;
  } else if (!state.joystick.isDragging && activeTrackStep.autoX !== null && activeTrackStep.autoY !== null) {
    setJoystickPosition(activeTrackStep.autoX, activeTrackStep.autoY);
  }

  renderSequencerGrid();
  updateAllHUD();
}

export const sequencerEngine = createSequencerEngine({
  state,
  audioCtxManager,
  voiceEngine: sampleVoiceEngine,
  onVisualStep: handleVisualStep,
  onSceneChanged: () => {
    renderSequencerGrid();
    if (state.sequencerUI.detailOpen) renderNoteDetailOverlay();
    if (state.sequencerUI.copyOverlayOpen) renderCopySceneOverlay();
    updateAllHUD();
  },
  onRecordingUpdated: () => {
    renderSequencerGrid();
    if (state.sequencerUI.detailOpen) renderNoteDetailOverlay();
  },
  onTransportChanged: () => {
    updateTransportIndicators();
    updateAllHUD();
  }
});

export function updateQuantizeButtons() {
  const qOn = Boolean(state.quantizeEnabled);
  const seqBtn = document.getElementById('btnSeqQuantize');
  if (seqBtn) {
    seqBtn.textContent = qOn ? 'Q: ON' : 'Q: OFF';
    seqBtn.className = qOn
      ? 'hw-btn bg-cyan-500/20 border border-cyan-400/70 text-cyan-300 text-[10px] font-mono-tech font-extrabold px-2 py-0.5 rounded-md cursor-pointer'
      : 'hw-btn bg-amber-500/20 border border-amber-400/70 text-amber-300 text-[10px] font-mono-tech font-extrabold px-2 py-0.5 rounded-md cursor-pointer';
  }
  const trBtn = document.getElementById('btnTransportQuantize');
  if (trBtn) {
    trBtn.textContent = qOn ? 'Q:ON' : 'Q:OFF';
    trBtn.className = qOn
      ? 'px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 text-[9px] font-extrabold cursor-pointer'
      : 'px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[9px] font-extrabold cursor-pointer';
  }
}

export function updateTransportIndicators() {
  const led = document.getElementById('transportLed');
  const lbl = document.getElementById('transportStatusLabel');
  if (!led || !lbl) return;

  if (state.isRecording) {
    led.className = 'w-2 h-2 rounded-full bg-red-500 rec-blink';
    lbl.textContent = 'LIVE REC';
    lbl.className = 'font-bold text-red-400';
  } else if (state.isPlaying) {
    led.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]';
    lbl.textContent = 'RUNNING';
    lbl.className = 'font-bold text-emerald-400';
  } else {
    led.className = 'w-2 h-2 rounded-full bg-zinc-700';
    lbl.textContent = 'STOPPED';
    lbl.className = 'font-bold text-zinc-400';
  }
  updateQuantizeButtons();
}

export function renderSequencerGrid() {
  const grid = document.getElementById('sequencerStepGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const steps = state.scenes[state.currentScene][state.activeTrack];
  const selectedStep = state.sequencerUI.selectedStep;

  steps.forEach((rawStep, i) => {
    const stepData = migrateStep(rawStep, i);
    const eventCount = stepData.events.length;
    const isActive = eventCount > 0;
    const hasMulti = eventCount > 1;
    const hasMicro = stepData.events.some(ev => getSubStepOffset(ev.onsetStep) > 0.005);
    const isPlayhead = state.isPlaying && state.currentStep === i;
    const isSelected = selectedStep === i;
    const isQuarter = i % 4 === 0;
    const hasAuto = stepData.autoX !== null || stepData.autoY !== null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.stepIndex = String(i);
    btn.className = `hw-btn h-12 sm:h-14 rounded-xl font-mono-tech text-xs font-extrabold flex flex-col items-center justify-between p-1.5 cursor-pointer border ${
      isActive
        ? (hasMulti ? 'bg-[#b5271a] text-white border-amber-300' : 'bg-[#d93829] text-white border-amber-300/80')
        : (isQuarter ? 'bg-zinc-700 text-zinc-200 border-zinc-600' : 'bg-zinc-800 text-zinc-400 border-zinc-700')
    } ${isPlayhead ? 'ring-2 ring-cyan-300 scale-[1.03]' : (isSelected ? 'ring-1 ring-amber-300/80' : '')}`;

    const topLed = isPlayhead
      ? 'bg-cyan-300 shadow-[0_0_8px_#67e8f9]'
      : (isActive ? 'bg-amber-300' : 'bg-zinc-950');

    const countBadge = hasMulti
      ? `<span class="text-[8px] px-1 rounded bg-black/50 text-amber-300 font-extrabold leading-tight">×${eventCount}</span>`
      : (hasMicro ? `<span class="text-[8px] text-cyan-200 leading-tight" title="Microtimed event">~</span>` : '');

    const autoDot = hasAuto
      ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" title="Recorded X/Y Automation"></span>`
      : `<span class="w-1.5 h-1.5"></span>`;

    btn.innerHTML = `
      <div class="flex items-center justify-between w-full gap-0.5">
        <span class="w-2 h-2 rounded-full shrink-0 ${topLed}"></span>
        ${countBadge}
        ${autoDot}
      </div>
      <span>${String(i + 1).padStart(2, '0')}</span>
    `;

    // Support tap-to-toggle (safe on multi-event) + long-press to open Note Detail
    let longPressTimer = null;
    let longPressTriggered = false;

    btn.addEventListener('pointerdown', () => {
      longPressTriggered = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        openNoteDetailOverlay(i);
      }, LONG_PRESS_MS);
    });

    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };
    btn.addEventListener('pointerup', cancelLongPress);
    btn.addEventListener('pointercancel', cancelLongPress);
    btn.addEventListener('pointerleave', cancelLongPress);

    btn.addEventListener('click', () => {
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }

      state.sequencerUI.selectedStep = i;
      const defaultMidi = getDefaultStepMidi();
      const res = toggleDefaultStep(
        state.scenes[state.currentScene],
        state.activeTrack,
        i,
        [defaultMidi]
      );

      if (res.action === 'added' && res.event) {
        const aud = auditionTrackEvent(state.activeTrack, res.event);
        if (!aud.triggered) {
          state.sequencerUI.feedbackText = aud.reason === 'TRACK_MUTED'
            ? `STEP ${String(i + 1).padStart(2, '0')} ADDED · TRK ${state.activeTrack + 1} MUTED (SILENT)`
            : `STEP ${String(i + 1).padStart(2, '0')} ADDED · TRK ${state.activeTrack + 1} UNASSIGNED (SILENT)`;
        } else {
          state.sequencerUI.feedbackText = `STEP ${String(i + 1).padStart(2, '0')} ON (${formatMidiNote(defaultMidi)})`;
        }
        renderSequencerGrid();
        updateStatusLine();
      } else if (res.action === 'removed') {
        playClick(480);
        state.sequencerUI.feedbackText = `STEP ${String(i + 1).padStart(2, '0')} CLEARED`;
        renderSequencerGrid();
        updateStatusLine();
      } else if (res.action === 'open_detail') {
        // Multi-event step: NEVER flatten or delete silently; open Note Detail!
        openNoteDetailOverlay(i);
      }
    });

    grid.appendChild(btn);
  });

  const detailBtn = document.getElementById('btnStepDetail');
  if (detailBtn) {
    detailBtn.textContent = `DETAIL S${String(selectedStep + 1).padStart(2, '0')}`;
  }
  updateStatusLine();
}

function updateStatusLine() {
  const el = document.getElementById('seqStatusText');
  if (!el) return;
  if (state.queuedScene !== null) {
    el.textContent = `NEXT BAR → SCN ${formatSceneNum(state.queuedScene)} · ${state.sequencerUI.feedbackText}`;
    el.className = 'truncate text-right text-cyan-300 font-bold';
  } else {
    el.textContent = state.sequencerUI.feedbackText;
    el.className = 'truncate text-right text-zinc-400';
  }
}

export function openNoteDetailOverlay(stepIdx = state.sequencerUI.selectedStep) {
  state.sequencerUI.selectedStep = ((Math.floor(stepIdx) % STEP_COUNT) + STEP_COUNT) % STEP_COUNT;
  state.sequencerUI.copyOverlayOpen = false;
  state.sequencerUI.detailOpen = true;

  const copyOv = document.getElementById('seqCopySceneOverlay');
  if (copyOv) copyOv.classList.add('hidden');

  const detailOv = document.getElementById('seqNoteDetailOverlay');
  if (detailOv) detailOv.classList.remove('hidden');

  renderNoteDetailOverlay();
  renderSequencerGrid();
}

export function closeNoteDetailOverlay() {
  state.sequencerUI.detailOpen = false;
  const detailOv = document.getElementById('seqNoteDetailOverlay');
  if (detailOv) detailOv.classList.add('hidden');
}

export function renderNoteDetailOverlay() {
  const list = document.getElementById('seqDetailEventsList');
  const title = document.getElementById('seqDetailTitle');
  const countLbl = document.getElementById('seqDetailCountLabel');
  if (!list || !title || !countLbl) return;

  const stepIdx = state.sequencerUI.selectedStep;
  const trackIdx = state.activeTrack;
  const sceneIdx = state.currentScene;
  const stepObj = migrateStep(state.scenes[sceneIdx][trackIdx][stepIdx], stepIdx);

  title.textContent = `STEP ${String(stepIdx + 1).padStart(2, '0')} DETAIL // TRK ${trackIdx + 1} · SCN ${formatSceneNum(sceneIdx)}`;
  countLbl.textContent = `${stepObj.events.length} EVENT${stepObj.events.length === 1 ? '' : 'S'}`;

  list.innerHTML = '';

  if (stepObj.events.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'text-[11px] text-zinc-400 text-center py-6 border border-dashed border-zinc-700 rounded-xl';
    emptyMsg.textContent = 'NO EVENTS ON THIS STEP · TAP "+ ADD EVENT" TO INSERT ONE';
    list.appendChild(emptyMsg);
    return;
  }

  stepObj.events.forEach((ev, idx) => {
    const offsetPct = Math.round(getSubStepOffset(ev.onsetStep) * 100);
    const durStr = ev.durationSteps.toFixed(2);

    const row = document.createElement('div');
    row.className = 'bg-black/55 border border-zinc-700 rounded-xl p-2 flex flex-col gap-1.5';
    row.dataset.eventId = ev.id;

    // Row 1: Event badge, pitches (with per-pitch semitone edit & remove), +NOTE, audition, delete event
    const topRow = document.createElement('div');
    topRow.className = 'flex flex-wrap items-center justify-between gap-1.5';

    const leftCluster = document.createElement('div');
    leftCluster.className = 'flex flex-wrap items-center gap-1';

    const idxTag = document.createElement('span');
    idxTag.className = 'text-[9px] font-extrabold text-amber-300 bg-zinc-800 px-1.5 py-0.5 rounded';
    idxTag.textContent = `#${idx + 1}`;
    leftCluster.appendChild(idxTag);

    ev.midiNotes.forEach((midi, notePos) => {
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-0.5 bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-[10px] font-bold text-white';

      const dn = document.createElement('button');
      dn.type = 'button';
      dn.className = 'text-zinc-400 hover:text-white px-0.5 cursor-pointer';
      dn.textContent = '−';
      dn.title = 'Pitch down 1 semitone';
      dn.addEventListener('click', () => {
        const nextNotes = [...ev.midiNotes];
        nextNotes[notePos] = clampMidi(nextNotes[notePos] - 1);
        updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, { midiNotes: nextNotes });
        auditionTrackEvent(trackIdx, ev);
        renderNoteDetailOverlay();
        renderSequencerGrid();
      });

      const lbl = document.createElement('span');
      lbl.className = 'text-cyan-300 px-0.5';
      lbl.textContent = formatMidiNote(midi);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'text-zinc-400 hover:text-white px-0.5 cursor-pointer';
      up.textContent = '+';
      up.title = 'Pitch up 1 semitone';
      up.addEventListener('click', () => {
        const nextNotes = [...ev.midiNotes];
        nextNotes[notePos] = clampMidi(nextNotes[notePos] + 1);
        updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, { midiNotes: nextNotes });
        auditionTrackEvent(trackIdx, ev);
        renderNoteDetailOverlay();
        renderSequencerGrid();
      });

      chip.appendChild(dn);
      chip.appendChild(lbl);
      chip.appendChild(up);

      if (ev.midiNotes.length > 1) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'text-red-400 hover:text-red-300 pl-0.5 cursor-pointer';
        rm.textContent = '×';
        rm.title = 'Remove pitch from chord';
        rm.addEventListener('click', () => {
          const nextNotes = ev.midiNotes.filter((_, p) => p !== notePos);
          updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, {
            midiNotes: nextNotes,
            isChordGroup: nextNotes.length > 1
          });
          renderNoteDetailOverlay();
          renderSequencerGrid();
        });
        chip.appendChild(rm);
      }

      leftCluster.appendChild(chip);
    });

    const addPitchBtn = document.createElement('button');
    addPitchBtn.type = 'button';
    addPitchBtn.className = 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer';
    addPitchBtn.textContent = '+NOTE';
    addPitchBtn.title = 'Add another pitch to this event';
    addPitchBtn.addEventListener('click', () => {
      const topNote = ev.midiNotes[ev.midiNotes.length - 1] ?? 60;
      const nextNotes = [...ev.midiNotes, clampMidi(topNote + 4)];
      updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, {
        midiNotes: nextNotes,
        isChordGroup: nextNotes.length > 1
      });
      renderNoteDetailOverlay();
      renderSequencerGrid();
    });
    leftCluster.appendChild(addPitchBtn);

    const rightActions = document.createElement('div');
    rightActions.className = 'flex items-center gap-1 shrink-0';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'hw-btn bg-[#2f80ed] hover:bg-[#3d8ef8] text-white text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer';
    playBtn.textContent = '▶';
    playBtn.title = 'Audition event with assigned track sample';
    playBtn.addEventListener('click', () => {
      auditionTrackEvent(trackIdx, ev);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'hw-btn bg-[#d93829] hover:bg-[#eb493a] text-white text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer';
    delBtn.textContent = 'DEL';
    delBtn.title = 'Delete only this event';
    delBtn.addEventListener('click', () => {
      deleteEventFromStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id);
      playClick(420);
      renderNoteDetailOverlay();
      renderSequencerGrid();
    });

    rightActions.appendChild(playBtn);
    rightActions.appendChild(delBtn);

    topRow.appendChild(leftCluster);
    topRow.appendChild(rightActions);

    // Row 2: Microtiming Offset & Duration controls
    const timingRow = document.createElement('div');
    timingRow.className = 'flex flex-wrap items-center justify-between gap-2 text-[10px] pt-1 border-t border-zinc-800';

    // Offset cluster
    const offsetWrap = document.createElement('div');
    offsetWrap.className = 'flex items-center gap-1';
    offsetWrap.innerHTML = `<span class="text-zinc-400">OFFSET</span>`;

    const offMinus = document.createElement('button');
    offMinus.type = 'button';
    offMinus.className = 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-1.5 py-0.5 rounded font-bold cursor-pointer';
    offMinus.textContent = '−5%';
    offMinus.addEventListener('click', () => {
      const nextOff = Math.max(0, Math.round((getSubStepOffset(ev.onsetStep) - 0.05) * 100) / 100);
      updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, { subStepOffset: nextOff });
      renderNoteDetailOverlay();
      renderSequencerGrid();
    });

    const offVal = document.createElement('span');
    offVal.className = 'text-cyan-300 font-bold w-10 text-center tabular-nums';
    offVal.textContent = `+${offsetPct}%`;

    const offPlus = document.createElement('button');
    offPlus.type = 'button';
    offPlus.className = 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-1.5 py-0.5 rounded font-bold cursor-pointer';
    offPlus.textContent = '+5%';
    offPlus.addEventListener('click', () => {
      const nextOff = Math.min(0.95, Math.round((getSubStepOffset(ev.onsetStep) + 0.05) * 100) / 100);
      updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, { subStepOffset: nextOff });
      renderNoteDetailOverlay();
      renderSequencerGrid();
    });

    offsetWrap.appendChild(offMinus);
    offsetWrap.appendChild(offVal);
    offsetWrap.appendChild(offPlus);

    // Duration cluster
    const durWrap = document.createElement('div');
    durWrap.className = 'flex items-center gap-1';
    durWrap.innerHTML = `<span class="text-zinc-400">LEN</span>`;

    const durMinus = document.createElement('button');
    durMinus.type = 'button';
    durMinus.className = 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-1.5 py-0.5 rounded font-bold cursor-pointer';
    durMinus.textContent = '−';
    durMinus.addEventListener('click', () => {
      const stepDelta = ev.durationSteps > 2 ? 0.5 : 0.25;
      updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, {
        durationSteps: Math.max(0.25, Math.round((ev.durationSteps - stepDelta) * 100) / 100)
      });
      renderNoteDetailOverlay();
    });

    const durVal = document.createElement('span');
    durVal.className = 'text-amber-300 font-bold w-12 text-center tabular-nums';
    durVal.textContent = `${durStr}st`;

    const durPlus = document.createElement('button');
    durPlus.type = 'button';
    durPlus.className = 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-1.5 py-0.5 rounded font-bold cursor-pointer';
    durPlus.textContent = '+';
    durPlus.addEventListener('click', () => {
      const stepDelta = ev.durationSteps >= 2 ? 0.5 : 0.25;
      updateEventInStep(state.scenes[sceneIdx], trackIdx, stepIdx, ev.id, {
        durationSteps: Math.min(16, Math.round((ev.durationSteps + stepDelta) * 100) / 100)
      });
      renderNoteDetailOverlay();
    });

    durWrap.appendChild(durMinus);
    durWrap.appendChild(durVal);
    durWrap.appendChild(durPlus);

    timingRow.appendChild(offsetWrap);
    timingRow.appendChild(durWrap);

    row.appendChild(topRow);
    row.appendChild(timingRow);
    list.appendChild(row);
  });
}

export function openCopySceneOverlay() {
  state.sequencerUI.detailOpen = false;
  state.sequencerUI.copyOverlayOpen = true;
  state.sequencerUI.copyDestScene = (state.currentScene + 1) % SCENE_COUNT;

  const detailOv = document.getElementById('seqNoteDetailOverlay');
  if (detailOv) detailOv.classList.add('hidden');

  const copyOv = document.getElementById('seqCopySceneOverlay');
  if (copyOv) copyOv.classList.remove('hidden');

  renderCopySceneOverlay();
}

export function closeCopySceneOverlay() {
  state.sequencerUI.copyOverlayOpen = false;
  const copyOv = document.getElementById('seqCopySceneOverlay');
  if (copyOv) copyOv.classList.add('hidden');
}

export function renderCopySceneOverlay() {
  const srcLabel = document.getElementById('copySceneSourceLabel');
  const select = document.getElementById('copyDestSelect');
  const banner = document.getElementById('copySceneStatusBanner');
  const confirmBtn = document.getElementById('btnCopySceneConfirm');
  if (!srcLabel || !select || !banner || !confirmBtn) return;

  const src = state.currentScene;
  const dest = ((state.sequencerUI.copyDestScene % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT;
  state.sequencerUI.copyDestScene = dest;

  srcLabel.innerHTML = `SOURCE: <strong class="text-amber-300">SCN ${formatSceneNum(src)}</strong> (ALL 7 TRACKS · NOTES · X/Y AUTO)`;

  if (select.options.length !== SCENE_COUNT) {
    select.innerHTML = '';
    for (let i = 0; i < SCENE_COUNT; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `SCN ${formatSceneNum(i)}`;
      select.appendChild(opt);
    }
  }
  select.value = String(dest);

  if (dest === src) {
    banner.textContent = `SELECT A DESTINATION DIFFERENT FROM SOURCE SCN ${formatSceneNum(src)}`;
    banner.className = 'text-[10px] px-2.5 py-2 rounded-xl border bg-zinc-900 border-zinc-700 text-zinc-400 font-bold';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'SAME SCENE';
    confirmBtn.className = 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 py-2 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-not-allowed';
    return;
  }

  const empty = isSceneEmpty(state.scenes[dest]);
  confirmBtn.disabled = false;

  if (empty) {
    banner.textContent = `DESTINATION SCN ${formatSceneNum(dest)} IS EMPTY · SAFE TO COPY`;
    banner.className = 'text-[10px] px-2.5 py-2 rounded-xl border bg-emerald-950/60 border-emerald-500/50 text-emerald-300 font-bold';
    confirmBtn.textContent = `COPY TO SCN ${formatSceneNum(dest)}`;
    confirmBtn.className = 'hw-btn bg-[#2f80ed] hover:bg-[#3d8ef8] text-white py-2 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-pointer';
  } else {
    banner.textContent = `⚠ WARNING: SCN ${formatSceneNum(dest)} HAS EXISTING DATA AND WILL BE OVERWRITTEN`;
    banner.className = 'text-[10px] px-2.5 py-2 rounded-xl border bg-red-950/70 border-red-500/70 text-red-300 font-bold';
    confirmBtn.textContent = `OVERWRITE SCN ${formatSceneNum(dest)}`;
    confirmBtn.className = 'hw-btn bg-[#d93829] hover:bg-[#eb493a] text-white py-2 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-pointer';
  }
}

export function closeSequencerOverlays() {
  closeNoteDetailOverlay();
  closeCopySceneOverlay();
}

export function hasOpenSequencerOverlay() {
  return Boolean(state.sequencerUI.detailOpen || state.sequencerUI.copyOverlayOpen);
}

export function startTransport() {
  sequencerEngine.start();
  renderSequencerGrid();
  updateTransportIndicators();
  updateAllHUD();
}

export function stopTransport(resetStep = true) {
  sequencerEngine.stop(resetStep);
  if (!state.joystick.isDragging && state.joystick.springReturn) {
    setJoystickPosition(0, 0);
  }
  updateTransportIndicators();
  renderSequencerGrid();
  updateAllHUD();
}

export function toggleQuantize() {
  sequencerEngine.setQuantize(!state.quantizeEnabled);
  playClick(state.quantizeEnabled ? 1020 : 680);
  updateQuantizeButtons();
  state.sequencerUI.feedbackText = state.quantizeEnabled
    ? 'REC QUANTIZE ON (NEAREST 16TH STEP)'
    : 'REC QUANTIZE OFF (EXACT PERFORMED TIMING)';
  updateStatusLine();
}

export function requestSceneChange(targetSceneIndex) {
  return sequencerEngine.requestSceneChange(targetSceneIndex);
}

export function stepSceneSelection(delta) {
  const base = state.isPlaying && state.queuedScene !== null ? state.queuedScene : state.currentScene;
  const target = ((base + delta) % SCENE_COUNT + SCENE_COUNT) % SCENE_COUNT;
  return requestSceneChange(target);
}

export function updateSequencerBpm(newBpm) {
  const bpm = sequencerEngine.updateBpm(newBpm);
  updateAllHUD();
  return bpm;
}

export function recordLiveNoteOn(recordKey, payload) {
  return sequencerEngine.recordNoteOn(recordKey, payload);
}

export function recordLiveNoteOff(recordKey) {
  return sequencerEngine.recordNoteOff(recordKey);
}

export function initSequencer() {
  // Quantize toggles (in SEQ-16 toolbar & persistent Transport bar)
  const seqQBtn = document.getElementById('btnSeqQuantize');
  if (seqQBtn) seqQBtn.addEventListener('click', toggleQuantize);
  const trQBtn = document.getElementById('btnTransportQuantize');
  if (trQBtn) trQBtn.addEventListener('click', toggleQuantize);

  // Step Detail open/close & add event
  const detailBtn = document.getElementById('btnStepDetail');
  if (detailBtn) {
    detailBtn.addEventListener('click', () => {
      playClick(880);
      openNoteDetailOverlay(state.sequencerUI.selectedStep);
    });
  }

  const detailClose = document.getElementById('btnSeqDetailClose');
  if (detailClose) {
    detailClose.addEventListener('click', () => {
      playClick(540);
      closeNoteDetailOverlay();
    });
  }

  const detailAdd = document.getElementById('btnSeqDetailAddEvent');
  if (detailAdd) {
    detailAdd.addEventListener('click', () => {
      const stepIdx = state.sequencerUI.selectedStep;
      const defaultMidi = getDefaultStepMidi();
      const ev = addEventToStep(state.scenes[state.currentScene], state.activeTrack, stepIdx, {
        midiNotes: [defaultMidi],
        onsetStep: stepIdx,
        durationSteps: DEFAULT_EVENT_DURATION_STEPS,
        isChordGroup: false
      });
      auditionTrackEvent(state.activeTrack, ev);
      renderNoteDetailOverlay();
      renderSequencerGrid();
    });
  }

  // RND PAT — generates real sample events (ZERO oscillator fallback)
  document.getElementById('btnRndSteps').addEventListener('click', () => {
    const scene = state.scenes[state.currentScene];
    const trackIdx = state.activeTrack;
    const rootSemi = ROOT_NOTES[state.chordmatik.rootIndex]?.semi ?? 0;

    for (let i = 0; i < STEP_COUNT; i++) {
      const stepObj = migrateStep(scene[trackIdx][i], i);
      stepObj.events = [];
      const active = Math.random() > (i % 4 === 0 ? 0.25 : 0.72);
      if (active) {
        addEventToStep(scene, trackIdx, i, {
          midiNotes: [clampMidi(60 + rootSemi + (i % 7) * 2)],
          onsetStep: i,
          durationSteps: DEFAULT_EVENT_DURATION_STEPS,
          isChordGroup: false
        });
      } else {
        stepObj.active = false;
        stepObj.midiNotes = null;
      }
    }

    // Audition only via real assigned user sample (silent if unassigned/muted)
    auditionTrackEvent(trackIdx, {
      midiNotes: [clampMidi(60 + rootSemi)],
      isChordGroup: false,
      durationSteps: 1.0
    });
    state.sequencerUI.feedbackText = `RANDOM PATTERN GENERATED ON TRK ${trackIdx + 1}`;
    renderSequencerGrid();
    if (state.sequencerUI.detailOpen) renderNoteDetailOverlay();
  });

  // Copy Entire Scene overlay controls
  const btnCopyScene = document.getElementById('btnCopyScene');
  if (btnCopyScene) {
    btnCopyScene.addEventListener('click', () => {
      playClick(900);
      openCopySceneOverlay();
    });
  }

  const copyClose = document.getElementById('btnCopySceneClose');
  const copyCancel = document.getElementById('btnCopySceneCancel');
  if (copyClose) copyClose.addEventListener('click', () => { playClick(520); closeCopySceneOverlay(); });
  if (copyCancel) copyCancel.addEventListener('click', () => { playClick(520); closeCopySceneOverlay(); });

  const copyDestSelect = document.getElementById('copyDestSelect');
  if (copyDestSelect) {
    copyDestSelect.addEventListener('change', () => {
      state.sequencerUI.copyDestScene = Number(copyDestSelect.value) || 0;
      renderCopySceneOverlay();
    });
  }

  const stepCopyDest = (delta) => {
    state.sequencerUI.copyDestScene = ((state.sequencerUI.copyDestScene + delta) % SCENE_COUNT + SCENE_COUNT) % SCENE_COUNT;
    playClick(760);
    renderCopySceneOverlay();
  };
  const copyPrev = document.getElementById('copyDestPrev');
  const copyNext = document.getElementById('copyDestNext');
  const copyPlus8 = document.getElementById('copyDestPlus8');
  if (copyPrev) copyPrev.addEventListener('click', () => stepCopyDest(-1));
  if (copyNext) copyNext.addEventListener('click', () => stepCopyDest(1));
  if (copyPlus8) copyPlus8.addEventListener('click', () => stepCopyDest(8));

  const copyConfirm = document.getElementById('btnCopySceneConfirm');
  if (copyConfirm) {
    copyConfirm.addEventListener('click', () => {
      const src = state.currentScene;
      const dest = state.sequencerUI.copyDestScene;
      const res = copyEntireScene(state.scenes, src, dest);
      if (res.copied) {
        playClick(1120);
        state.sequencerUI.feedbackText = `COPIED ENTIRE SCN ${formatSceneNum(src)} → SCN ${formatSceneNum(dest)} (SOURCE PRESERVED)`;
        closeCopySceneOverlay();
        renderSequencerGrid();
        updateAllHUD();
      }
    });
  }

  // Clear active track steps in current scene (preserves X/Y automation)
  document.getElementById('btnClearSteps').addEventListener('click', () => {
    const steps = state.scenes[state.currentScene][state.activeTrack];
    steps.forEach((rawStep, i) => {
      const st = migrateStep(rawStep, i);
      st.events = [];
      st.active = false;
      st.midiNotes = null;
    });
    playClick(380);
    state.sequencerUI.feedbackText = `CLEARED ALL STEPS ON TRK ${state.activeTrack + 1}`;
    renderSequencerGrid();
    if (state.sequencerUI.detailOpen) renderNoteDetailOverlay();
  });

  // Transport Controls
  document.getElementById('btnPlay').addEventListener('click', () => {
    if (!state.isPlaying) startTransport();
  });

  document.getElementById('btnStop').addEventListener('click', () => {
    stopTransport(true);
    stopAllPerformanceAudio();
    playClick(400);
  });

  document.getElementById('btnLiveRec').addEventListener('click', () => {
    const nextRec = !state.isRecording;
    sequencerEngine.setRecording(nextRec);
    playClick(state.isRecording ? 1280 : 520);
    updateTransportIndicators();
    renderSequencerGrid();
    updateAllHUD();
  });

  updateQuantizeButtons();
  updateTransportIndicators();
}
