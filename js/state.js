/**
 * MiniMatik — Shared Application State & Musical Constants
 *
 * Single source of truth for application state across all four modes,
 * 19-slot soundbank, 7 tracks, 64 scenes x 16 steps, ChordMatiK, and X/Y Mutate.
 */
import {
  createEmptySoundbank,
  createInitialTracks,
  getLoadedCount as getSoundbankLoadedCount
} from './soundbank-state.js';
import {
  CHROMATIC_ROOTS,
  NOTE_NAMES,
  STRUM_DEFAULT_MS
} from './chordmatik-theory.js';

export const DECK_MODES = ['SAMPLER', 'CHORDMATIK', 'SEQ', 'MUTATE'];

export const JP_MODE_TITLES = {
  SAMPLER: 'サウンドバンク',
  CHORDMATIK: 'コードマティック',
  SEQ: 'シーケンサー',
  MUTATE: 'ミューテーター'
};

export const MODE_DISPLAY_LABELS = {
  SAMPLER: '01. SAMPLER',
  CHORDMATIK: '02. CHORDMATIK',
  SEQ: '03. SEQ-16',
  MUTATE: '04. MUTATE'
};

// All 12 chromatic keys (C through B)
export const ROOT_NOTES = CHROMATIC_ROOTS;

export { NOTE_NAMES };

export function createInitialScenes() {
  // 64 Scenes x 7 Tracks x 16 Steps (each step stores trigger + absolute midiNotes + recorded X/Y automation)
  return Array.from({ length: 64 }, () =>
    Array.from({ length: 7 }, () =>
      Array.from({ length: 16 }, () => ({
        active: false,
        midiNotes: null,
        autoX: null, // -1..1 when recorded
        autoY: null  // -1..1 when recorded
      }))
    )
  );
}

export function createInitialState() {
  return {
    modeIndex: 0, // 0: SAMPLER, 1: CHORDMATIK, 2: SEQ, 3: MUTATE
    audioEnabled: true,
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    currentStep: 0,
    activeTrack: 0, // 0..6 (TRK 1..7)
    currentScene: 0, // 0..63 (SCN 01..64)
    selectedSlot: 0, // 0..18 (Slot 01..19)

    // 19 Soundbank slots — starts genuinely empty at 00/19 (no factory samples)
    soundbank: createEmptySoundbank(),

    // 7 Tracks — all unassigned on fresh load, defaults: ONE_SHOT / TAPE / POLY
    tracks: createInitialTracks(),

    // Sampler PR02 UI & capture state
    samplerUI: {
      overlayMode: null, // null | 'acquire' | 'record' | 'assign' | 'clear' | 'decoding'
      targetSlot: 0,
      isDecoding: false,
      pendingImportSlot: null,
      previewSlot: null,
      recordStatus: 'idle', // 'idle' | 'requesting' | 'recording' | 'stopping'
      recordElapsedMs: 0,
      feedbackText: 'TAP EMPTY SLOT TO RECORD OR IMPORT · SELECT LOADED TO PREVIEW OR ASSIGN',
      feedbackTone: 'neutral' // 'neutral' | 'success' | 'warn' | 'error'
    },

    scenes: createInitialScenes(),

    // ChordMatiK PR04 state
    chordmatik: {
      rootIndex: 0, // 0..11 (C..B)
      scaleMode: 'MAJOR', // 'MAJOR' | 'NATURAL_MINOR' | 'HARMONIC_MINOR'
      octave: 4,
      subMode: 'CHORD', // 'CHORD' | 'NOTE' | 'DRUM'
      strumMs: STRUM_DEFAULT_MS, // 20..150 ms
      modifiers: {
        '7TH': false,
        'SUS4': false,
        '9TH': false,
        'STRUM': false
      },
      lastVoicingName: 'C MAJ'
    },

    // Persistent Analog X/Y Joystick state
    joystick: {
      x: 0, // -1 to +1
      y: 0, // -1 to +1
      isDragging: false,
      springReturn: true,
      xTarget: 'FILTER CUTOFF',
      yTarget: 'RESONANCE'
    },

    visualPulse: 0,
    chordCalloutTimer: null,
    stepTimer: null
  };
}

export const state = createInitialState();

export function getLoadedCount(appState = state) {
  return getSoundbankLoadedCount(appState.soundbank);
}

export function hasTrackAutomation(sceneIdx, trackIdx, appState = state) {
  return appState.scenes[sceneIdx][trackIdx].some(st => st.autoX !== null || st.autoY !== null);
}

export function countTrackAutoSteps(sceneIdx, trackIdx, appState = state) {
  return appState.scenes[sceneIdx][trackIdx].filter(st => st.autoX !== null || st.autoY !== null).length;
}
