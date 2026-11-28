/**
 * MiniMatik — PR05 Sequencer Data Model, Migration & Scene Copy Primitives
 *
 * Pure, DOM-free module defining the multi-event step schema, deterministic
 * Q ON/OFF onset math, in-memory migration from legacy {active,midiNotes,autoX,autoY}
 * step objects, per-event CRUD, and whole-scene deep cloning/copying.
 */
import { NOTE_NAMES, STRUM_DEFAULT_MS } from './chordmatik-theory.js';

export const SCENE_COUNT = 64;
export const TRACK_COUNT = 7;
export const STEP_COUNT = 16;

export const DEFAULT_EVENT_DURATION_STEPS = 1.0;
export const MIN_DURATION_STEPS = 0.125; // 1/8 of a 16th step (~15.6ms at 120 BPM)
export const MAX_DURATION_STEPS = 16.0;  // Up to a full 16-step bar

let nextEventCounter = 1;

export function generateEventId() {
  return `ev_${nextEventCounter++}`;
}

export function getStepDurationSec(bpm) {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? Math.max(30, Math.min(300, bpm)) : 120;
  return 60 / safeBpm / 4; // 16th note at 4/4
}

export function getBarDurationSec(bpm) {
  return getStepDurationSec(bpm) * STEP_COUNT;
}

/**
 * Wraps any step position into [0, 16).
 */
export function normalizeOnsetStep(onsetStep) {
  const n = Number(onsetStep);
  if (!Number.isFinite(n)) return 0;
  const wrapped = ((n % STEP_COUNT) + STEP_COUNT) % STEP_COUNT;
  // Guard against floating-point edge case where wrapped === 16
  return wrapped >= STEP_COUNT ? 0 : wrapped;
}

/**
 * Returns the owning 16th-note step index (0..15) for a normalized onsetStep in [0, 16).
 */
export function getOwningStepIndex(onsetStep) {
  const norm = normalizeOnsetStep(onsetStep);
  return Math.floor(norm) % STEP_COUNT;
}

/**
 * Returns the sub-step microtiming offset in [0, 1) within the owning 16th step.
 */
export function getSubStepOffset(onsetStep) {
  const norm = normalizeOnsetStep(onsetStep);
  const offset = norm - Math.floor(norm);
  return Math.max(0, Math.min(0.9999, offset));
}

/**
 * Deterministic Q ON quantization to the nearest 16th step.
 * Exact half-step ties (k + 0.5) round half-up to k + 1, wrapping 15.5 -> 0 (next bar).
 */
export function quantizeOnsetStep(rawStepPos) {
  const norm = normalizeOnsetStep(rawStepPos);
  const rounded = Math.round(norm);
  const wrapped = rounded >= STEP_COUNT;
  const onsetStep = rounded % STEP_COUNT;
  return {
    onsetStep,
    owningStep: onsetStep,
    wrapped
  };
}

export function clampDurationSteps(durationSteps) {
  const d = Number(durationSteps);
  if (!Number.isFinite(d) || d <= 0) return DEFAULT_EVENT_DURATION_STEPS;
  return Math.max(MIN_DURATION_STEPS, Math.min(MAX_DURATION_STEPS, d));
}

export function clampMidi(midi) {
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) return 60;
  return Math.max(24, Math.min(108, m));
}

export function normalizeMidiList(midiNotes) {
  if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
    return [60];
  }
  const cleaned = midiNotes
    .map(Number)
    .filter(Number.isFinite)
    .map(clampMidi)
    .sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : [60];
}

export function formatMidiNote(midi) {
  const m = clampMidi(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

export function createNoteEvent({
  id = null,
  midiNotes = [60],
  onsetStep = 0,
  durationSteps = DEFAULT_EVENT_DURATION_STEPS,
  isChordGroup = false,
  strumEnabled = false,
  strumMs = STRUM_DEFAULT_MS
} = {}) {
  const normalizedNotes = normalizeMidiList(midiNotes);
  return {
    id: id || generateEventId(),
    midiNotes: normalizedNotes,
    onsetStep: normalizeOnsetStep(onsetStep),
    durationSteps: clampDurationSteps(durationSteps),
    isChordGroup: Boolean(isChordGroup),
    strumEnabled: Boolean(strumEnabled),
    strumMs: Number.isFinite(Number(strumMs)) ? Number(strumMs) : STRUM_DEFAULT_MS
  };
}

export function createEmptyStep() {
  return {
    active: false,
    midiNotes: null,
    events: [],
    autoX: null,
    autoY: null
  };
}

export function createEmptyTrackSteps() {
  return Array.from({ length: STEP_COUNT }, () => createEmptyStep());
}

export function createEmptyScene() {
  return Array.from({ length: TRACK_COUNT }, () => createEmptyTrackSteps());
}

export function createInitialScenes() {
  return Array.from({ length: SCENE_COUNT }, () => createEmptyScene());
}

/**
 * Keeps legacy {active, midiNotes} fields synchronized with the authoritative `events` array.
 */
export function syncStepLegacyFields(stepObj) {
  if (!stepObj) return stepObj;
  if (!Array.isArray(stepObj.events)) {
    stepObj.events = [];
  }
  stepObj.active = stepObj.events.length > 0;
  stepObj.midiNotes = stepObj.events.length > 0 ? [...stepObj.events[0].midiNotes] : null;
  return stepObj;
}

/**
 * Migrates a legacy {active, midiNotes, autoX, autoY} step object in place without
 * losing manually entered notes or X/Y automation. Idempotent on already-migrated steps.
 */
export function migrateStep(stepObj, stepIndex = 0) {
  if (!stepObj || typeof stepObj !== 'object') {
    return createEmptyStep();
  }

  const safeStepIdx = ((Math.floor(Number(stepIndex)) % STEP_COUNT) + STEP_COUNT) % STEP_COUNT;

  if (!Array.isArray(stepObj.events)) {
    stepObj.events = [];
  }

  // Legacy active step with midiNotes but no migrated events yet
  if (stepObj.events.length === 0 && stepObj.active && Array.isArray(stepObj.midiNotes) && stepObj.midiNotes.length > 0) {
    stepObj.events.push(
      createNoteEvent({
        midiNotes: stepObj.midiNotes,
        onsetStep: safeStepIdx,
        durationSteps: DEFAULT_EVENT_DURATION_STEPS,
        isChordGroup: stepObj.midiNotes.length > 1,
        strumEnabled: false
      })
    );
  } else if (stepObj.events.length > 0) {
    // Normalize any existing events
    stepObj.events = stepObj.events.map((ev) =>
      createNoteEvent({
        id: ev.id,
        midiNotes: ev.midiNotes,
        onsetStep: Number.isFinite(ev.onsetStep) ? ev.onsetStep : safeStepIdx,
        durationSteps: ev.durationSteps,
        isChordGroup: ev.isChordGroup,
        strumEnabled: ev.strumEnabled,
        strumMs: ev.strumMs
      })
    );
  }

  if (stepObj.autoX === undefined) stepObj.autoX = null;
  if (stepObj.autoY === undefined) stepObj.autoY = null;

  return syncStepLegacyFields(stepObj);
}

export function migrateScene(scene) {
  if (!Array.isArray(scene)) return createEmptyScene();
  for (let t = 0; t < Math.min(TRACK_COUNT, scene.length); t++) {
    const trackSteps = scene[t];
    if (!Array.isArray(trackSteps)) {
      scene[t] = createEmptyTrackSteps();
      continue;
    }
    for (let s = 0; s < Math.min(STEP_COUNT, trackSteps.length); s++) {
      trackSteps[s] = migrateStep(trackSteps[s], s);
    }
  }
  return scene;
}

export function migrateScenes(scenes) {
  if (!Array.isArray(scenes)) return createInitialScenes();
  for (let i = 0; i < scenes.length; i++) {
    scenes[i] = migrateScene(scenes[i]);
  }
  return scenes;
}

/**
 * Adds a new independent note/chord event to the owning step (never deduplicates or overwrites).
 * Returns the newly created event.
 */
export function addEventToStep(scene, trackIdx, stepIdx, eventInput = {}) {
  const safeStepIdx = ((Math.floor(stepIdx) % STEP_COUNT) + STEP_COUNT) % STEP_COUNT;
  const stepObj = migrateStep(scene[trackIdx][safeStepIdx], safeStepIdx);
  const onsetStep = Number.isFinite(eventInput.onsetStep)
    ? normalizeOnsetStep(eventInput.onsetStep)
    : safeStepIdx;

  const ev = createNoteEvent({
    ...eventInput,
    onsetStep
  });

  stepObj.events.push(ev);
  // Keep events sorted by onsetStep while preserving insertion order for equal onsets
  stepObj.events.sort((a, b) => a.onsetStep - b.onsetStep);
  syncStepLegacyFields(stepObj);
  return ev;
}

/**
 * Updates one event on a step without altering any sibling events.
 * If sub-step offset is patched, clamps within [0, 0.99] of the owning step.
 */
export function updateEventInStep(scene, trackIdx, stepIdx, eventId, patch = {}) {
  const stepObj = migrateStep(scene[trackIdx][stepIdx], stepIdx);
  const ev = stepObj.events.find((e) => e.id === eventId);
  if (!ev) return null;

  if (Array.isArray(patch.midiNotes) && patch.midiNotes.length > 0) {
    ev.midiNotes = normalizeMidiList(patch.midiNotes);
  }
  if (Number.isFinite(patch.subStepOffset)) {
    const clampedOffset = Math.max(0, Math.min(0.99, Number(patch.subStepOffset)));
    ev.onsetStep = normalizeOnsetStep(stepIdx + clampedOffset);
  } else if (Number.isFinite(patch.onsetStep)) {
    ev.onsetStep = normalizeOnsetStep(patch.onsetStep);
  }
  if (Number.isFinite(patch.durationSteps)) {
    ev.durationSteps = clampDurationSteps(patch.durationSteps);
  }
  if (typeof patch.isChordGroup === 'boolean') {
    ev.isChordGroup = patch.isChordGroup;
  }
  if (typeof patch.strumEnabled === 'boolean') {
    ev.strumEnabled = patch.strumEnabled;
  }
  if (Number.isFinite(patch.strumMs)) {
    ev.strumMs = Number(patch.strumMs);
  }

  stepObj.events.sort((a, b) => a.onsetStep - b.onsetStep);
  syncStepLegacyFields(stepObj);
  return ev;
}

/**
 * Deletes a single event from a step while preserving all other events on that step.
 */
export function deleteEventFromStep(scene, trackIdx, stepIdx, eventId) {
  const stepObj = migrateStep(scene[trackIdx][stepIdx], stepIdx);
  const before = stepObj.events.length;
  stepObj.events = stepObj.events.filter((e) => e.id !== eventId);
  syncStepLegacyFields(stepObj);
  return stepObj.events.length < before;
}

/**
 * Safe step tap handler:
 * - Empty step (0 events) -> adds 1 default event at the step grid onset.
 * - Single-event step (1 event) -> removes that event (toggles off).
 * - Multi-event step (2+ events) -> DOES NOT flatten or delete; returns { action: 'open_detail' }.
 */
export function toggleDefaultStep(scene, trackIdx, stepIdx, defaultMidiNotes = [60]) {
  const stepObj = migrateStep(scene[trackIdx][stepIdx], stepIdx);

  if (stepObj.events.length === 0) {
    const ev = addEventToStep(scene, trackIdx, stepIdx, {
      midiNotes: defaultMidiNotes,
      onsetStep: stepIdx,
      durationSteps: DEFAULT_EVENT_DURATION_STEPS,
      isChordGroup: Array.isArray(defaultMidiNotes) && defaultMidiNotes.length > 1
    });
    return { action: 'added', event: ev };
  }

  if (stepObj.events.length === 1) {
    stepObj.events = [];
    syncStepLegacyFields(stepObj);
    return { action: 'removed', event: null };
  }

  return { action: 'open_detail', event: null };
}

/**
 * Returns true if all 7 tracks x 16 steps have zero note events and zero X/Y automation.
 */
export function isSceneEmpty(scene) {
  if (!Array.isArray(scene)) return true;
  for (let t = 0; t < scene.length; t++) {
    const trackSteps = scene[t];
    if (!Array.isArray(trackSteps)) continue;
    for (let s = 0; s < trackSteps.length; s++) {
      const st = trackSteps[s];
      if (!st) continue;
      if ((Array.isArray(st.events) && st.events.length > 0) || st.active) {
        return false;
      }
      if (st.autoX !== null || st.autoY !== null) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Deep-clones an entire scene (all 7 tracks, all events with fresh IDs, and X/Y automation).
 */
export function cloneScene(sourceScene) {
  return sourceScene.map((trackSteps, _tIdx) =>
    trackSteps.map((rawStep, sIdx) => {
      const st = migrateStep({ ...rawStep, events: Array.isArray(rawStep.events) ? [...rawStep.events] : [] }, sIdx);
      const clonedEvents = st.events.map((ev) =>
        createNoteEvent({
          midiNotes: [...ev.midiNotes],
          onsetStep: ev.onsetStep,
          durationSteps: ev.durationSteps,
          isChordGroup: ev.isChordGroup,
          strumEnabled: ev.strumEnabled,
          strumMs: ev.strumMs
        })
      );
      const stepCopy = {
        active: clonedEvents.length > 0,
        midiNotes: clonedEvents.length > 0 ? [...clonedEvents[0].midiNotes] : null,
        events: clonedEvents,
        autoX: st.autoX,
        autoY: st.autoY
      };
      return stepCopy;
    })
  );
}

/**
 * Copies the entire source scene to destIndex without mutating sourceIndex.
 */
export function copyEntireScene(scenes, sourceIndex, destIndex) {
  if (!Array.isArray(scenes)) {
    return { copied: false, reason: 'INVALID_SCENES' };
  }
  if (
    !Number.isInteger(sourceIndex) ||
    !Number.isInteger(destIndex) ||
    sourceIndex < 0 ||
    sourceIndex >= scenes.length ||
    destIndex < 0 ||
    destIndex >= scenes.length
  ) {
    return { copied: false, reason: 'OUT_OF_RANGE' };
  }
  if (sourceIndex === destIndex) {
    return { copied: false, reason: 'SAME_SCENE' };
  }

  const overwritten = !isSceneEmpty(scenes[destIndex]);
  scenes[destIndex] = cloneScene(scenes[sourceIndex]);
  return {
    copied: true,
    sourceIndex,
    destIndex,
    overwritten
  };
}
