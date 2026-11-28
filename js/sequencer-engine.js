/**
 * MiniMatik — PR05 Web Audio-Clock Lookahead Sequencer & Live Overdub Engine
 *
 * Pure, DOM-free scheduler driven strictly by AudioContext.currentTime.
 * Shares PR04's sampleVoiceEngine (no parallel voice manager, no oscillator fallback).
 *
 * Capabilities:
 * - Deterministic lookahead scheduling independent of DOM / Canvas frame rate
 * - Q ON (nearest 16th) / Q OFF (exact sub-step offset) live recording
 * - Continuous overdub across step 16 -> 1 loop boundaries
 * - Note-on / note-off duration capture (including notes held across bar boundaries)
 * - Next-bar queued scene switching while playing; immediate switch while stopped
 * - Glitch-free live BPM changes without restarting from step 1
 */
import {
  STEP_COUNT,
  TRACK_COUNT,
  SCENE_COUNT,
  DEFAULT_EVENT_DURATION_STEPS,
  getStepDurationSec,
  normalizeOnsetStep,
  getOwningStepIndex,
  quantizeOnsetStep,
  clampDurationSteps,
  migrateStep,
  addEventToStep,
  updateEventInStep
} from './sequencer-model.js';

export const SEQ_LOOKAHEAD_SEC = 0.08;
export const SEQ_SCHEDULER_INTERVAL_MS = 20;
export const SEQ_START_LEAD_SEC = 0.005;

export function createSequencerEngine({
  state,
  audioCtxManager,
  voiceEngine,
  setInterval: setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearInterval: clearIntervalFn = (id) => clearInterval(id),
  onVisualStep = () => {},
  onSceneChanged = () => {},
  onRecordingUpdated = () => {},
  onTransportChanged = () => {}
}) {
  let timerId = null;
  let currentBar = null; // { barIndex, startTime, endTime, stepDur, sceneIndex }
  let prevBar = null;
  let cursorStep = 0;    // Next unscheduled step position [0, 16] in currentBar
  let lastVisualStep = -1;
  let lastVisualBar = -1;

  // Active live-recorded note handles keyed by pointerId / key id
  const activeRecordings = new Map();

  function getAudioTime() {
    if (!audioCtxManager) return null;
    try {
      const ctx = typeof audioCtxManager.getExistingContext === 'function'
        ? (audioCtxManager.getExistingContext() || audioCtxManager.getContext())
        : audioCtxManager.getContext();
      return ctx ? (ctx.currentTime || 0) : null;
    } catch (_) {
      return null;
    }
  }

  function ensureRunningContext() {
    if (!audioCtxManager) return null;
    try {
      const ctx = audioCtxManager.getContext();
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch (_) {
      return null;
    }
  }

  function getAudibleBarAt(now) {
    if (!currentBar) return null;
    if (prevBar && now < currentBar.startTime) {
      return prevBar;
    }
    return currentBar;
  }

  function getMusicalPositionAt(now) {
    const bar = getAudibleBarAt(now);
    if (!bar) {
      return {
        barIndex: 0,
        stepPos: state.currentStep || 0,
        sceneIndex: state.currentScene,
        stepDur: getStepDurationSec(state.bpm)
      };
    }
    const rawPos = (now - bar.startTime) / bar.stepDur;
    const stepPos = Math.max(0, Math.min(STEP_COUNT - 1e-6, rawPos));
    return {
      barIndex: bar.barIndex,
      stepPos,
      sceneIndex: bar.sceneIndex,
      stepDur: bar.stepDur
    };
  }

  function scheduleWindowInBar(bar, windowStart, windowEnd) {
    const scene = state.scenes[bar.sceneIndex];
    if (!scene) return;

    const scheduledEvents = [];

    for (let t = 0; t < TRACK_COUNT; t++) {
      const trk = state.tracks[t];
      if (!trk || trk.muted) continue;

      const slot = trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
      const buffer = (slot && slot.loaded && slot.buffer) ? slot.buffer : null;
      if (!buffer) continue; // Real user samples only; empty/unassigned tracks stay silent

      const trackSteps = scene[t];
      if (!trackSteps) continue;

      const firstStep = Math.max(0, Math.floor(windowStart));
      const lastStep = Math.min(STEP_COUNT - 1, Math.floor(Math.max(windowStart, windowEnd - 1e-9)));

      for (let s = firstStep; s <= lastStep; s++) {
        const stepObj = migrateStep(trackSteps[s], s);
        if (!stepObj.events || stepObj.events.length === 0) continue;

        for (const ev of stepObj.events) {
          if (ev.onsetStep >= windowStart && ev.onsetStep < windowEnd) {
            if (ev._skipOnBar === bar.barIndex) {
              ev._skipOnBar = null;
              continue;
            }
            scheduledEvents.push({
              trackIndex: t,
              trk,
              buffer,
              ev,
              audioTime: bar.startTime + ev.onsetStep * bar.stepDur,
              durationSec: ev.durationSteps * bar.stepDur
            });
          }
        }
      }
    }

    // Sort chronologically so voice-cap stealing & Smart Chord Priority happen in exact musical order
    scheduledEvents.sort((a, b) => a.audioTime - b.audioTime);

    for (const item of scheduledEvents) {
      voiceEngine.triggerPerformance({
        trackIndex: item.trackIndex,
        buffer: item.buffer,
        midiNotes: item.ev.midiNotes,
        isChordGroup: item.ev.isChordGroup,
        playbackMode: item.trk.playbackMode,
        voiceMode: item.trk.voiceMode,
        strumEnabled: Boolean(item.ev.strumEnabled),
        strumMs: item.ev.strumMs,
        trackMuted: Boolean(item.trk.muted),
        startTime: item.audioTime,
        durationSec: item.durationSec,
        source: 'sequencer'
      });
    }
  }

  function tick() {
    if (!state.isPlaying || !currentBar) return;

    const now = getAudioTime();
    if (now === null) return;

    const horizon = now + SEQ_LOOKAHEAD_SEC;

    // 1. Schedule all events in [cursorStep, horizon] across bar boundaries
    let guard = 0;
    while (guard++ < 8) {
      const nextCursorTime = currentBar.startTime + cursorStep * currentBar.stepDur;
      if (nextCursorTime > horizon + 1e-9) {
        break;
      }

      const rawEnd = (horizon - currentBar.startTime) / currentBar.stepDur;
      const windowEnd = Math.min(STEP_COUNT, rawEnd);

      if (windowEnd > cursorStep + 1e-9) {
        scheduleWindowInBar(currentBar, cursorStep, windowEnd);
        cursorStep = windowEnd;
      } else if (cursorStep === 0 && currentBar.startTime <= horizon + 1e-9) {
        // Ensure exact step 0 onset is scheduled when horizon lands right on barStartTime
        const tinyEnd = 1e-6;
        scheduleWindowInBar(currentBar, 0, tinyEnd);
        cursorStep = tinyEnd;
      }

      // Check if lookahead has reached/crossed the end of this 16-step bar
      if (horizon >= currentBar.endTime - 1e-9 && cursorStep >= STEP_COUNT - 1e-9) {
        let nextScene = currentBar.sceneIndex;
        if (state.queuedScene !== null && Number.isInteger(state.queuedScene)) {
          nextScene = ((state.queuedScene % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT;
          state.queuedScene = null;
          // Cancel any future outgoing sequencer voices scheduled at/after bar boundary
          // without cancelling already sounding One-shots or already started Gate voices.
          if (typeof voiceEngine.cancelFutureVoices === 'function') {
            voiceEngine.cancelFutureVoices(currentBar.endTime, { source: 'sequencer' });
          }
        }

        prevBar = currentBar;
        const nextStepDur = getStepDurationSec(state.bpm);
        const nextStart = currentBar.endTime;
        currentBar = {
          barIndex: currentBar.barIndex + 1,
          startTime: nextStart,
          endTime: nextStart + STEP_COUNT * nextStepDur,
          stepDur: nextStepDur,
          sceneIndex: nextScene
        };
        cursorStep = 0;
      } else {
        break;
      }
    }

    // 2. Sync audible visual playhead and audible scene indicator to `now` (not lookahead!)
    const audibleBar = getAudibleBarAt(now);
    if (audibleBar) {
      if (state.currentScene !== audibleBar.sceneIndex) {
        state.currentScene = audibleBar.sceneIndex;
        onSceneChanged(audibleBar.sceneIndex);
      }

      const rawStep = Math.floor((now - audibleBar.startTime) / audibleBar.stepDur);
      const audibleStep = Math.max(0, Math.min(STEP_COUNT - 1, rawStep));

      if (audibleStep !== lastVisualStep || audibleBar.barIndex !== lastVisualBar) {
        lastVisualStep = audibleStep;
        lastVisualBar = audibleBar.barIndex;
        state.currentStep = audibleStep;
        onVisualStep({
          stepIndex: audibleStep,
          sceneIndex: audibleBar.sceneIndex,
          barIndex: audibleBar.barIndex
        });
      }
    }
  }

  function start() {
    stop(false);
    const ctx = ensureRunningContext();
    const now = ctx ? (ctx.currentTime || 0) : 0;
    const stepDur = getStepDurationSec(state.bpm);
    const startTime = now + SEQ_START_LEAD_SEC;

    state.isPlaying = true;
    state.currentStep = 0;
    lastVisualStep = -1;
    lastVisualBar = -1;
    prevBar = null;
    currentBar = {
      barIndex: 0,
      startTime,
      endTime: startTime + STEP_COUNT * stepDur,
      stepDur,
      sceneIndex: state.currentScene
    };
    cursorStep = 0;

    tick();
    timerId = setIntervalFn(tick, SEQ_SCHEDULER_INTERVAL_MS);
    onTransportChanged({ isPlaying: true, isRecording: state.isRecording });
    return true;
  }

  function stop(resetStep = true) {
    finalizeAllActiveRecordings();

    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }

    const wasPlaying = state.isPlaying;
    state.isPlaying = false;
    state.isRecording = false;
    state.queuedScene = null;
    currentBar = null;
    prevBar = null;
    cursorStep = 0;
    lastVisualStep = -1;
    lastVisualBar = -1;

    if (resetStep) {
      state.currentStep = 0;
    }

    if (wasPlaying) {
      onTransportChanged({ isPlaying: false, isRecording: false });
    }
  }

  function setRecording(enabled) {
    const next = Boolean(enabled);
    if (!next) {
      finalizeAllActiveRecordings();
    }
    state.isRecording = next;
    if (next && !state.isPlaying) {
      start();
      state.isRecording = true;
    }
    onTransportChanged({ isPlaying: state.isPlaying, isRecording: state.isRecording });
    return state.isRecording;
  }

  function setQuantize(enabled) {
    state.quantizeEnabled = Boolean(enabled);
    return state.quantizeEnabled;
  }

  /**
   * Requests a scene switch:
   * - While stopped: immediate switch, clears queuedScene.
   * - While playing: queues the scene for the next bar boundary (step 16 -> 1).
   *   Selecting the currently playing scene clears any queued scene.
   */
  function requestSceneChange(targetSceneIndex) {
    const normalized = ((Math.floor(targetSceneIndex) % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT;
    if (!state.isPlaying) {
      state.currentScene = normalized;
      state.queuedScene = null;
      onSceneChanged(normalized);
      return { immediate: true, currentScene: normalized, queuedScene: null };
    }

    if (normalized === state.currentScene) {
      state.queuedScene = null;
    } else {
      state.queuedScene = normalized;
    }
    onSceneChanged(state.currentScene);
    return { immediate: false, currentScene: state.currentScene, queuedScene: state.queuedScene };
  }

  /**
   * Adjusts BPM smoothly while playing without restarting from step 1.
   */
  function updateBpm(newBpm) {
    const clamped = Math.max(60, Math.min(200, Math.round(Number(newBpm) || 120)));
    state.bpm = clamped;

    if (!state.isPlaying || !currentBar) {
      return clamped;
    }

    const now = getAudioTime();
    if (now === null) return clamped;

    const audibleBar = getAudibleBarAt(now);
    const pos = getMusicalPositionAt(now);
    const newStepDur = getStepDurationSec(clamped);

    // Cancel future scheduled sequencer events and re-anchor current bar at `now`
    const cutoff = now + 0.002;
    if (typeof voiceEngine.cancelFutureVoices === 'function') {
      voiceEngine.cancelFutureVoices(cutoff, { source: 'sequencer' });
    }

    const reanchoredStart = now - pos.stepPos * newStepDur;
    currentBar = {
      barIndex: audibleBar.barIndex,
      startTime: reanchoredStart,
      endTime: reanchoredStart + STEP_COUNT * newStepDur,
      stepDur: newStepDur,
      sceneIndex: audibleBar.sceneIndex
    };
    prevBar = null;
    cursorStep = Math.min(STEP_COUNT, pos.stepPos + (0.002 / newStepDur));

    tick();
    return clamped;
  }

  /**
   * Captures a live note/chord onset during REC (continuous overdub, Q ON/OFF).
   * Never overwrites or deduplicates existing events.
   */
  function recordNoteOn(recordKey, {
    trackIndex,
    midiNotes,
    isChordGroup = false,
    strumEnabled = false,
    strumMs
  } = {}) {
    if (!state.isRecording) {
      return { recorded: false, reason: 'NOT_RECORDING' };
    }
    if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
      return { recorded: false, reason: 'NO_NOTES' };
    }

    const now = getAudioTime();
    const isClockActive = state.isPlaying && currentBar !== null && now !== null;
    const pos = isClockActive
      ? getMusicalPositionAt(now)
      : {
          barIndex: 0,
          stepPos: state.currentStep || 0,
          sceneIndex: state.currentScene,
          stepDur: getStepDurationSec(state.bpm)
        };

    let onsetStep;
    let owningStep;
    let skipOnBar = -1;

    if (state.quantizeEnabled) {
      const q = quantizeOnsetStep(pos.stepPos);
      onsetStep = q.onsetStep;
      owningStep = q.owningStep;
      if (isClockActive) {
        if (q.wrapped) {
          skipOnBar = pos.barIndex + 1;
        } else if (onsetStep >= pos.stepPos) {
          skipOnBar = pos.barIndex;
        }
      }
    } else {
      onsetStep = normalizeOnsetStep(pos.stepPos);
      owningStep = getOwningStepIndex(onsetStep);
      if (isClockActive) {
        skipOnBar = pos.barIndex;
      }
    }

    const ev = addEventToStep(state.scenes[pos.sceneIndex], trackIndex, owningStep, {
      midiNotes: [...midiNotes],
      onsetStep,
      durationSteps: DEFAULT_EVENT_DURATION_STEPS,
      isChordGroup: Boolean(isChordGroup),
      strumEnabled: Boolean(strumEnabled),
      strumMs
    });

    if (skipOnBar >= 0) {
      ev._skipOnBar = skipOnBar;
    }

    if (recordKey != null && isClockActive) {
      activeRecordings.set(recordKey, {
        sceneIndex: pos.sceneIndex,
        trackIndex,
        stepIdx: owningStep,
        eventId: ev.id,
        startTime: now,
        stepDur: pos.stepDur
      });
    }

    onRecordingUpdated({ sceneIndex: pos.sceneIndex, trackIndex, stepIdx: owningStep, event: ev });
    return {
      recorded: true,
      event: ev,
      sceneIndex: pos.sceneIndex,
      stepIdx: owningStep
    };
  }

  /**
   * Captures live note-off and stores exact musical duration (in steps) on the recorded event.
   * Works cleanly across loop boundaries (step 16 -> 1).
   */
  function recordNoteOff(recordKey) {
    if (recordKey == null) return { updated: false };
    const rec = activeRecordings.get(recordKey);
    if (!rec) return { updated: false };
    activeRecordings.delete(recordKey);

    const now = getAudioTime();
    if (now === null) return { updated: false };

    const heldSec = Math.max(0, now - rec.startTime);
    const durationSteps = clampDurationSteps(heldSec / rec.stepDur);

    const updated = updateEventInStep(
      state.scenes[rec.sceneIndex],
      rec.trackIndex,
      rec.stepIdx,
      rec.eventId,
      { durationSteps }
    );

    if (updated) {
      onRecordingUpdated({
        sceneIndex: rec.sceneIndex,
        trackIndex: rec.trackIndex,
        stepIdx: rec.stepIdx,
        event: updated
      });
    }

    return {
      updated: Boolean(updated),
      durationSteps,
      eventId: rec.eventId
    };
  }

  function finalizeAllActiveRecordings() {
    for (const key of Array.from(activeRecordings.keys())) {
      recordNoteOff(key);
    }
  }

  function getDebugState() {
    return {
      isPlaying: state.isPlaying,
      isRecording: state.isRecording,
      quantizeEnabled: state.quantizeEnabled,
      currentScene: state.currentScene,
      queuedScene: state.queuedScene,
      currentStep: state.currentStep,
      currentBar: currentBar ? { ...currentBar } : null,
      cursorStep,
      activeRecordingCount: activeRecordings.size
    };
  }

  function dispose() {
    stop(true);
  }

  return {
    start,
    stop,
    tick,
    setRecording,
    setQuantize,
    requestSceneChange,
    updateBpm,
    recordNoteOn,
    recordNoteOff,
    finalizeAllActiveRecordings,
    getMusicalPositionAt,
    getDebugState,
    dispose
  };
}
