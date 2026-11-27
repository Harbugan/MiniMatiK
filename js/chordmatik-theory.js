/**
 * MiniMatik — ChordMatiK Musical Theory, Voicing & Modifier State Helpers (PR04)
 *
 * Pure, deterministic musical calculations with zero DOM or Web Audio dependencies:
 * - 12 chromatic keys and 3 scales (Major, Natural Minor [default minor], Harmonic Minor)
 * - Diatonic triads, sevenths, ninths, and SUS4 (replaces third) with stackable modifiers
 * - Tape playback-rate pitch transposition anchored at fixed reference C4 (MIDI 60)
 * - STRUM Slow-Fast mapping and Mono 1/8-note arpeggio timing
 * - Hold + Toggle modifier controller (short tap latches, long hold is momentary)
 */

export const SAMPLE_REFERENCE_MIDI = 60; // C4 -> playbackRate = 1.0 (native sample pitch)
export const MIN_PLAYBACK_RATE = 0.0625; // -4 octaves
export const MAX_PLAYBACK_RATE = 16.0;   // +4 octaves

export const STRUM_MIN_MS = 20;          // Fastest strum spacing (ms between notes)
export const STRUM_MAX_MS = 150;         // Slowest strum spacing (ms between notes)
export const STRUM_DEFAULT_MS = 55;      // Initial musical default

export const MODIFIER_HOLD_THRESHOLD_MS = 350;

export const CHROMATIC_ROOTS = [
  { name: 'C',  semi: 0 },
  { name: 'C#', semi: 1 },
  { name: 'D',  semi: 2 },
  { name: 'D#', semi: 3 },
  { name: 'E',  semi: 4 },
  { name: 'F',  semi: 5 },
  { name: 'F#', semi: 6 },
  { name: 'G',  semi: 7 },
  { name: 'G#', semi: 8 },
  { name: 'A',  semi: 9 },
  { name: 'A#', semi: 10 },
  { name: 'B',  semi: 11 }
];

export const NOTE_NAMES = CHROMATIC_ROOTS.map(r => r.name);

export const SCALES = {
  MAJOR: {
    id: 'MAJOR',
    label: 'MAJOR',
    shortLabel: 'MAJ',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    romans: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
  },
  NATURAL_MINOR: {
    id: 'NATURAL_MINOR',
    label: 'NATURAL MINOR',
    shortLabel: 'MIN',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    romans: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
  },
  HARMONIC_MINOR: {
    id: 'HARMONIC_MINOR',
    label: 'HARMONIC MINOR',
    shortLabel: 'HARM',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    romans: ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']
  }
};

export const SCALE_IDS = ['MAJOR', 'NATURAL_MINOR', 'HARMONIC_MINOR'];
export const DEFAULT_MINOR_SCALE = 'NATURAL_MINOR';
export const MODIFIER_IDS = ['7TH', 'SUS4', '9TH', 'STRUM'];

// Single-sample hit offsets for DRUM submode (pad 0 is native pitch C4 / MIDI 60;
// preserves DRUM pad performance without inventing synthetic factory drums).
export const DRUM_PAD_OFFSETS = [0, -5, -2, 2, 5, 7, 12];

export function getScale(scaleMode) {
  return SCALES[scaleMode] || SCALES.MAJOR;
}

export function normalizeRootIndex(rootIndex) {
  const n = CHROMATIC_ROOTS.length;
  return ((Math.trunc(Number(rootIndex) || 0) % n) + n) % n;
}

export function midiToPlaybackRate(midi, referenceMidi = SAMPLE_REFERENCE_MIDI) {
  const rate = Math.pow(2, (midi - referenceMidi) / 12);
  return Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
}

export function midiToNoteName(midi) {
  const clamped = Math.round(midi);
  const pitchClass = ((clamped % 12) + 12) % 12;
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

export function getScaleStepOffset(scaleIntervals, stepIndex) {
  const octaves = Math.floor(stepIndex / 7);
  const degree = ((stepIndex % 7) + 7) % 7;
  return scaleIntervals[degree] + octaves * 12;
}

export function classifyTriadQuality(thirdInterval, fifthInterval) {
  if (thirdInterval === 4 && fifthInterval === 7) return 'maj';
  if (thirdInterval === 3 && fifthInterval === 7) return 'min';
  if (thirdInterval === 3 && fifthInterval === 6) return 'dim';
  if (thirdInterval === 4 && fifthInterval === 8) return 'aug';
  return thirdInterval >= 4 ? 'maj' : 'min';
}

export function formatChordSymbol(noteName, quality, opts) {
  const {
    has7th = false,
    hasSus4 = false,
    has9th = false,
    seventhInterval = 10,
    ninthInterval = 14
  } = opts || {};

  const ninthAddTag = ninthInterval === 13 ? 'addb9' : (ninthInterval === 15 ? 'add#9' : 'add9');
  const ninthAltTag = ninthInterval === 13 ? 'b9' : (ninthInterval === 15 ? '#9' : '9');

  if (hasSus4) {
    const fifthAlter = quality === 'dim' ? 'b5' : (quality === 'aug' ? '#5' : '');
    if (!has7th && !has9th) {
      return `${noteName}sus4${fifthAlter}`;
    }
    if (has7th && !has9th) {
      if (seventhInterval === 11) return `${noteName}maj7sus4${fifthAlter}`;
      if (seventhInterval === 9) return `${noteName}°7sus4${fifthAlter}`;
      return `${noteName}7sus4${fifthAlter}`;
    }
    if (!has7th && has9th) {
      return `${noteName}sus4${ninthAddTag}${fifthAlter}`;
    }
    // has7th && has9th && hasSus4
    if (ninthInterval === 14) {
      if (seventhInterval === 11) return `${noteName}maj9sus4${fifthAlter}`;
      if (seventhInterval === 9) return `${noteName}°7sus4(9)${fifthAlter}`;
      return `${noteName}9sus4${fifthAlter}`;
    }
    const sevBase = seventhInterval === 11
      ? `${noteName}maj7sus4${fifthAlter}`
      : (seventhInterval === 9 ? `${noteName}°7sus4${fifthAlter}` : `${noteName}7sus4${fifthAlter}`);
    return `${sevBase}${ninthAltTag}`;
  }

  // Plain triad
  if (!has7th && !has9th) {
    if (quality === 'min') return `${noteName}m`;
    if (quality === 'dim') return `${noteName}°`;
    if (quality === 'aug') return `${noteName}+`;
    return noteName;
  }

  // Triad + 9TH (no 7TH)
  if (!has7th && has9th) {
    if (quality === 'min') return `${noteName}m${ninthAddTag}`;
    if (quality === 'dim') return `${noteName}°${ninthAddTag}`;
    if (quality === 'aug') return `${noteName}+${ninthAddTag}`;
    return `${noteName}${ninthAddTag}`;
  }

  // Helper for diatonic 7th base symbol
  let seventhSymbol;
  if (quality === 'maj') {
    seventhSymbol = seventhInterval === 11 ? `${noteName}maj7` : `${noteName}7`;
  } else if (quality === 'min') {
    seventhSymbol = seventhInterval === 11 ? `${noteName}m(maj7)` : `${noteName}m7`;
  } else if (quality === 'dim') {
    seventhSymbol = seventhInterval === 9 ? `${noteName}°7` : `${noteName}m7b5`;
  } else {
    // aug
    seventhSymbol = seventhInterval === 11 ? `${noteName}+maj7` : `${noteName}+7`;
  }

  if (has7th && !has9th) {
    return seventhSymbol;
  }

  // 7TH + 9TH combined
  if (ninthInterval === 14) {
    if (quality === 'maj') {
      return seventhInterval === 11 ? `${noteName}maj9` : `${noteName}9`;
    }
    if (quality === 'min') {
      return seventhInterval === 11 ? `${noteName}m(maj9)` : `${noteName}m9`;
    }
    if (quality === 'dim') {
      return seventhInterval === 9 ? `${noteName}°7(9)` : `${noteName}m9b5`;
    }
    return seventhInterval === 11 ? `${noteName}+maj9` : `${noteName}+9`;
  }

  return `${seventhSymbol}${ninthAltTag}`;
}

/**
 * Generates deterministic diatonic chord pitches and labels for a given key, scale,
 * scale degree (0..6), octave, and stackable modifiers.
 *
 * Rules:
 * - Triad (root, diatonic 3rd, diatonic 5th) derived strictly from the selected scale.
 * - SUS4 replaces the 3rd with a perfect fourth (+5 semitones above chord root).
 * - 7TH adds the diatonic 7th from the selected scale.
 * - 9TH adds the diatonic 9th (compound 2nd) from the selected scale.
 * - 7TH + 9TH + SUS4 + STRUM may all stack cleanly; output midiNotes are ascending.
 */
export function getDiatonicChordData(rootIndex, scaleMode, degreeIndex, octave = 4, modifiers = {}) {
  const safeRootIdx = normalizeRootIndex(rootIndex);
  const scale = getScale(scaleMode);
  const deg = Math.max(0, Math.min(6, Math.trunc(Number(degreeIndex) || 0)));
  const rootSemi = CHROMATIC_ROOTS[safeRootIdx].semi;

  const rootOffset = getScaleStepOffset(scale.intervals, deg);
  const thirdInterval = getScaleStepOffset(scale.intervals, deg + 2) - rootOffset;
  const fifthInterval = getScaleStepOffset(scale.intervals, deg + 4) - rootOffset;
  const seventhInterval = getScaleStepOffset(scale.intervals, deg + 6) - rootOffset;
  const ninthInterval = getScaleStepOffset(scale.intervals, deg + 8) - rootOffset;

  const quality = classifyTriadQuality(thirdInterval, fifthInterval);
  const baseMidi = (octave + 1) * 12 + rootSemi + rootOffset;
  const rootNoteName = NOTE_NAMES[(rootSemi + rootOffset) % 12];
  const roman = scale.romans[deg];

  const has7th = Boolean(modifiers['7TH']);
  const hasSus4 = Boolean(modifiers['SUS4']);
  const has9th = Boolean(modifiers['9TH']);
  const hasStrum = Boolean(modifiers['STRUM']);

  const intervals = [0, hasSus4 ? 5 : thirdInterval, fifthInterval];
  if (has7th) intervals.push(seventhInterval);
  if (has9th) intervals.push(ninthInterval);

  const uniqueSorted = [...new Set(intervals)].sort((a, b) => a - b);
  const midiNotes = uniqueSorted.map(iv => baseMidi + iv);

  const symbol = formatChordSymbol(rootNoteName, quality, {
    has7th,
    hasSus4,
    has9th,
    seventhInterval,
    ninthInterval
  });

  const displayName = (!has7th && !hasSus4 && !has9th && quality === 'maj')
    ? `${rootNoteName} MAJ`
    : symbol;

  return {
    rootIndex: safeRootIdx,
    scaleMode: scale.id,
    degreeIndex: deg,
    roman,
    rootNoteName,
    quality,
    baseMidi,
    intervals: uniqueSorted,
    midiNotes,
    symbol,
    displayName,
    modifiers: { has7th, hasSus4, has9th, hasStrum }
  };
}

/**
 * Computes pad labels and absolute MIDI note list for CHORD, NOTE, or DRUM submode.
 */
export function getPadTriggerData({
  rootIndex = 0,
  scaleMode = 'MAJOR',
  degreeIndex = 0,
  octave = 4,
  subMode = 'CHORD',
  modifiers = {}
} = {}) {
  const safeRootIdx = normalizeRootIndex(rootIndex);
  const scale = getScale(scaleMode);
  const deg = Math.max(0, Math.min(6, Math.trunc(Number(degreeIndex) || 0)));
  const rootSemi = CHROMATIC_ROOTS[safeRootIdx].semi;

  if (subMode === 'DRUM') {
    const offset = DRUM_PAD_OFFSETS[deg] ?? 0;
    const midi = SAMPLE_REFERENCE_MIDI + offset;
    const offsetLabel = offset === 0 ? '0st' : (offset > 0 ? `+${offset}st` : `${offset}st`);
    return {
      subMode: 'DRUM',
      degreeIndex: deg,
      roman: `P${deg + 1}`,
      padLabel: offsetLabel,
      calloutLabel: `DRUM P${deg + 1} (${offsetLabel})`,
      midiNotes: [midi],
      isChordGroup: false
    };
  }

  if (subMode === 'NOTE') {
    const rootOffset = getScaleStepOffset(scale.intervals, deg);
    const midi = (octave + 1) * 12 + rootSemi + rootOffset;
    const noteLabel = midiToNoteName(midi);
    return {
      subMode: 'NOTE',
      degreeIndex: deg,
      roman: String(deg + 1),
      padLabel: noteLabel,
      calloutLabel: `NOTE ${noteLabel}`,
      midiNotes: [midi],
      isChordGroup: false
    };
  }

  const chord = getDiatonicChordData(safeRootIdx, scale.id, deg, octave, modifiers);
  return {
    subMode: 'CHORD',
    degreeIndex: deg,
    roman: chord.roman,
    padLabel: chord.symbol,
    calloutLabel: chord.displayName,
    midiNotes: chord.midiNotes,
    isChordGroup: true,
    chord
  };
}

/**
 * Maps Slow-Fast slider position (0 = Slowest 150ms, 100 = Fastest 20ms) to ms.
 */
export function strumSliderToMs(sliderValue) {
  const clamped = Math.max(0, Math.min(100, Number(sliderValue) || 0));
  const ms = STRUM_MAX_MS - (clamped / 100) * (STRUM_MAX_MS - STRUM_MIN_MS);
  return Math.round(ms);
}

/**
 * Inverse mapping: ms (20..150) -> Slow-Fast slider position (0..100).
 */
export function strumMsToSlider(ms) {
  const clamped = Math.max(STRUM_MIN_MS, Math.min(STRUM_MAX_MS, Number(ms) || STRUM_DEFAULT_MS));
  return Math.round(((STRUM_MAX_MS - clamped) / (STRUM_MAX_MS - STRUM_MIN_MS)) * 100);
}

/**
 * BPM-synced 1/8-note duration in seconds for Mono arpeggio.
 */
export function getEighthNoteDurationSec(bpm) {
  const safeBpm = Math.max(20, Math.min(300, Number(bpm) || 120));
  return 30 / safeBpm;
}

/**
 * Hold + Toggle modifier controller:
 * - Short tap (< holdThresholdMs without pad press during hold) toggles latch ON/OFF.
 * - Long hold (>= holdThresholdMs) or holding while pressing a pad acts momentarily
 *   and reverts to the pre-press latch state on release.
 * - pointerCancel / lostpointercapture reliably reverts to the pre-press latch state.
 */
export function createModifierController(options = {}) {
  const holdThresholdMs = Number.isFinite(options.holdThresholdMs)
    ? options.holdThresholdMs
    : MODIFIER_HOLD_THRESHOLD_MS;
  const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
  const setTimer = typeof options.setTimer === 'function' ? options.setTimer : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : (id) => clearTimeout(id);
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};

  const latched = {};
  const holds = new Map(); // mod -> { pointerId, downTime, wasLatched, becameMomentary, usedWithPad, timerId }

  for (const mod of MODIFIER_IDS) {
    latched[mod] = false;
  }

  function clearHoldTimer(entry) {
    if (entry && entry.timerId !== null) {
      clearTimer(entry.timerId);
      entry.timerId = null;
    }
  }

  function isActive(mod) {
    return Boolean(latched[mod] || holds.has(mod));
  }

  function isLatched(mod) {
    return Boolean(latched[mod]);
  }

  function isHeld(mod) {
    return holds.has(mod);
  }

  function getActiveModifiers() {
    const out = {};
    for (const mod of MODIFIER_IDS) {
      out[mod] = isActive(mod);
    }
    return out;
  }

  function getSnapshot() {
    const out = {};
    for (const mod of MODIFIER_IDS) {
      const hold = holds.get(mod);
      out[mod] = {
        active: isActive(mod),
        latched: Boolean(latched[mod]),
        held: Boolean(hold),
        momentary: Boolean(hold && (hold.becameMomentary || hold.usedWithPad))
      };
    }
    return out;
  }

  function pointerDown(mod, pointerId, explicitNow) {
    if (!MODIFIER_IDS.includes(mod)) return false;
    const existing = holds.get(mod);
    if (existing) {
      // Ignore duplicate down for same modifier while already held
      return false;
    }
    const downTime = Number.isFinite(explicitNow) ? explicitNow : nowFn();
    const entry = {
      pointerId,
      downTime,
      wasLatched: Boolean(latched[mod]),
      becameMomentary: false,
      usedWithPad: false,
      timerId: null
    };
    entry.timerId = setTimer(() => {
      entry.timerId = null;
      if (holds.get(mod) === entry) {
        entry.becameMomentary = true;
        onChange(getSnapshot());
      }
    }, holdThresholdMs);
    holds.set(mod, entry);
    onChange(getSnapshot());
    return true;
  }

  function notifyPadTriggered() {
    let changed = false;
    for (const entry of holds.values()) {
      if (!entry.usedWithPad) {
        entry.usedWithPad = true;
        changed = true;
      }
    }
    if (changed) {
      onChange(getSnapshot());
    }
  }

  function pointerUp(mod, pointerId, explicitNow) {
    const entry = holds.get(mod);
    if (!entry) return false;
    if (pointerId !== undefined && entry.pointerId !== pointerId) return false;

    const upTime = Number.isFinite(explicitNow) ? explicitNow : nowFn();
    clearHoldTimer(entry);
    holds.delete(mod);

    const elapsed = upTime - entry.downTime;
    const isLongHold = entry.becameMomentary || elapsed >= holdThresholdMs;

    if (isLongHold || entry.usedWithPad) {
      // Momentary hold reverts to pre-press latch state
      latched[mod] = entry.wasLatched;
    } else {
      // Short tap toggles latch
      latched[mod] = !entry.wasLatched;
    }

    onChange(getSnapshot());
    return true;
  }

  function pointerCancel(mod, pointerId) {
    const entry = holds.get(mod);
    if (!entry) return false;
    if (pointerId !== undefined && entry.pointerId !== pointerId) return false;

    clearHoldTimer(entry);
    holds.delete(mod);
    latched[mod] = entry.wasLatched;
    onChange(getSnapshot());
    return true;
  }

  function setLatched(mod, value) {
    if (!MODIFIER_IDS.includes(mod)) return;
    latched[mod] = Boolean(value);
    onChange(getSnapshot());
  }

  function resetAll() {
    for (const entry of holds.values()) {
      clearHoldTimer(entry);
    }
    holds.clear();
    for (const mod of MODIFIER_IDS) {
      latched[mod] = false;
    }
    onChange(getSnapshot());
  }

  return {
    isActive,
    isLatched,
    isHeld,
    getActiveModifiers,
    getSnapshot,
    pointerDown,
    pointerUp,
    pointerCancel,
    notifyPadTriggered,
    setLatched,
    resetAll
  };
}
