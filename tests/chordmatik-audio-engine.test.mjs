import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAMPLE_REFERENCE_MIDI,
  CHROMATIC_ROOTS,
  SCALES,
  SCALE_IDS,
  STRUM_MIN_MS,
  STRUM_MAX_MS,
  MODIFIER_HOLD_THRESHOLD_MS,
  midiToPlaybackRate,
  getDiatonicChordData,
  getPadTriggerData,
  strumSliderToMs,
  strumMsToSlider,
  getEighthNoteDurationSec,
  createModifierController
} from '../js/chordmatik-theory.js';
import {
  MAX_POLY_VOICES_PER_TRACK,
  MAX_MONO_VOICES_PER_TRACK,
  CHORD_CROSSFADE_SEC,
  GATE_RELEASE_SEC,
  STEAL_FADE_SEC,
  createSampleVoiceEngine
} from '../js/sample-voice-engine.js';
import { createInitialState } from '../js/state.js';

/**
 * Deterministic mock Web AudioContext for testing real AudioBufferSourceNode + GainNode
 * scheduling, click-safe ramps, voice budgets, and node disconnect cleanup.
 */
function createMockAudioEnv(initialTime = 1.0, initialState = 'running') {
  const createdSources = [];
  const createdGains = [];
  let oscillatorCalls = 0;

  const ctx = {
    currentTime: initialTime,
    state: initialState,
    destination: { id: 'destination' },
    resumeCalls: 0,
    _resumeResolvers: [],
    resume() {
      this.resumeCalls++;
      return new Promise((resolve) => {
        this._resumeResolvers.push(() => {
          this.state = 'running';
          resolve();
        });
      });
    },
    resolveResume() {
      const list = this._resumeResolvers.splice(0);
      for (const fn of list) fn();
    },
    createOscillator() {
      oscillatorCalls++;
      throw new Error('Forbidden oscillator creation in sample voice engine');
    },
    createBufferSource() {
      const src = {
        buffer: null,
        playbackRate: {
          value: 1,
          events: [],
          setValueAtTime(v, t) {
            this.value = v;
            this.events.push({ type: 'set', v, t });
          }
        },
        connectedTo: [],
        disconnected: false,
        startedAt: null,
        stoppedAt: null,
        onended: null,
        connect(dest) { this.connectedTo.push(dest); },
        disconnect() { this.disconnected = true; },
        start(when = 0) { this.startedAt = when; },
        stop(when = 0) { this.stoppedAt = when; }
      };
      createdSources.push(src);
      return src;
    },
    createGain() {
      const g = {
        gain: {
          value: 1,
          events: [],
          setValueAtTime(v, t) {
            this.value = v;
            this.events.push({ type: 'set', v, t });
          },
          linearRampToValueAtTime(v, t) {
            this.value = v;
            this.events.push({ type: 'linearRamp', v, t });
          },
          cancelScheduledValues(t) {
            this.events.push({ type: 'cancel', t });
          }
        },
        connectedTo: [],
        disconnected: false,
        connect(dest) { this.connectedTo.push(dest); },
        disconnect() { this.disconnected = true; }
      };
      createdGains.push(g);
      return g;
    }
  };

  function advanceTimeTo(newTime) {
    ctx.currentTime = newTime;
    for (const src of createdSources) {
      const naturalEnd = src.startedAt !== null && src.buffer
        ? src.startedAt + src.buffer.duration / (src.playbackRate.value || 1)
        : Infinity;
      const effectiveEnd = src.stoppedAt !== null ? Math.min(src.stoppedAt, naturalEnd) : naturalEnd;
      if (!src._endedFired && effectiveEnd <= newTime) {
        src._endedFired = true;
        if (typeof src.onended === 'function') {
          src.onended();
        }
      }
    }
  }

  function maxSimultaneousSources(sources) {
    // Check simultaneous active count at every boundary timestamp
    const points = new Set();
    for (const s of sources) {
      if (s.startedAt === null) continue;
      const naturalEnd = s.buffer ? s.startedAt + s.buffer.duration / (s.playbackRate.value || 1) : s.startedAt + 1;
      const end = s.stoppedAt !== null ? Math.min(s.stoppedAt, naturalEnd) : naturalEnd;
      if (end <= s.startedAt) continue; // cancelled before starting
      points.add(s.startedAt);
      points.add(s.startedAt + 0.0001);
      points.add(end - 0.0001);
    }
    let peak = 0;
    for (const t of points) {
      let count = 0;
      for (const s of sources) {
        if (s.startedAt === null) continue;
        const naturalEnd = s.buffer ? s.startedAt + s.buffer.duration / (s.playbackRate.value || 1) : s.startedAt + 1;
        const end = s.stoppedAt !== null ? Math.min(s.stoppedAt, naturalEnd) : naturalEnd;
        if (end <= s.startedAt) continue;
        if (s.startedAt <= t && t < end) {
          count++;
        }
      }
      if (count > peak) peak = count;
    }
    return peak;
  }

  const audioCtxManager = {
    isWebAudioSupported: () => true,
    getContext: () => ctx,
    getExistingContext: () => ctx
  };

  return {
    ctx,
    audioCtxManager,
    createdSources,
    createdGains,
    getOscillatorCalls: () => oscillatorCalls,
    advanceTimeTo,
    maxSimultaneousSources
  };
}

function makeFakeBuffer(duration = 1.5, tag = 'user-sample') {
  return Object.freeze({
    duration,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: Math.round(duration * 44100),
    tag
  });
}

// ---------------------------------------------------------------------------
// 1. Acceptance Test 1: Empty / unassigned / muted / disabled produces silence
// ---------------------------------------------------------------------------
test('Acceptance 1: empty bank, unassigned, muted, and disabled tracks produce zero audio and no oscillator fallback', () => {
  const env = createMockAudioEnv();
  let audioEnabled = true;
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    isAudioEnabled: () => audioEnabled,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(1.0);

  // Unassigned (null buffer)
  const r1 = engine.triggerPerformance({ trackIndex: 0, buffer: null, midiNotes: [60, 64, 67], isChordGroup: true });
  assert.equal(r1.triggered, false);
  assert.equal(r1.reason, 'NO_SAMPLE');

  // Muted track
  const r2 = engine.triggerPerformance({ trackIndex: 0, buffer: buf, midiNotes: [60, 64, 67], isChordGroup: true, trackMuted: true });
  assert.equal(r2.triggered, false);
  assert.equal(r2.reason, 'TRACK_MUTED');

  // Audio globally disabled
  audioEnabled = false;
  const r3 = engine.triggerPerformance({ trackIndex: 0, buffer: buf, midiNotes: [60], isChordGroup: false });
  assert.equal(r3.triggered, false);
  assert.equal(r3.reason, 'AUDIO_DISABLED');

  assert.equal(env.createdSources.length, 0);
  assert.equal(env.getOscillatorCalls(), 0);
});

// ---------------------------------------------------------------------------
// 2. Acceptance Test 2: Native & chromatic Tape playback-rate transposition
// ---------------------------------------------------------------------------
test('Acceptance 2: assigned sample plays at native pitch (C4/MIDI 60) and chromatically transposed Tape rates without mutating buffer', () => {
  assert.equal(SAMPLE_REFERENCE_MIDI, 60);
  assert.equal(midiToPlaybackRate(60), 1.0);
  assert.equal(midiToPlaybackRate(72), 2.0);
  assert.equal(midiToPlaybackRate(48), 0.5);
  assert.ok(Math.abs(midiToPlaybackRate(67) - Math.pow(2, 7 / 12)) < 1e-9);

  const env = createMockAudioEnv(2.0);
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(2.0, 'piano-c4');

  const res = engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [60, 64, 67],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  assert.equal(res.triggered, true);
  assert.equal(env.createdSources.length, 3);
  assert.equal(env.createdSources[0].buffer, buf);
  assert.equal(env.createdSources[0].playbackRate.value, 1.0);
  assert.ok(Math.abs(env.createdSources[1].playbackRate.value - Math.pow(2, 4 / 12)) < 1e-9);
  assert.ok(Math.abs(env.createdSources[2].playbackRate.value - Math.pow(2, 7 / 12)) < 1e-9);
  assert.equal(env.getOscillatorCalls(), 0);
});

// ---------------------------------------------------------------------------
// 3. Acceptance Test 3: All 12 chromatic keys × 3 scales + reference fixtures
// ---------------------------------------------------------------------------
test('Acceptance 3: all 12 chromatic keys and 3 scales produce deterministic triads & labels (C Major, A Natural Minor, A Harmonic Minor)', () => {
  assert.equal(CHROMATIC_ROOTS.length, 12);
  assert.deepEqual(SCALE_IDS, ['MAJOR', 'NATURAL_MINOR', 'HARMONIC_MINOR']);

  // Reference Fixture A: C Major (rootIndex 0, oct 4)
  const cMaj = Array.from({ length: 7 }, (_, d) => getDiatonicChordData(0, 'MAJOR', d, 4));
  assert.deepEqual(cMaj.map(c => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(cMaj.map(c => c.symbol), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
  assert.deepEqual(cMaj.map(c => c.quality), ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
  assert.deepEqual(cMaj[0].midiNotes, [60, 64, 67]); // C E G
  assert.deepEqual(cMaj[6].midiNotes, [71, 74, 77]); // B D F (dim)

  // Reference Fixture B: A Natural Minor (rootIndex 9, oct 4)
  const aNatMin = Array.from({ length: 7 }, (_, d) => getDiatonicChordData(9, 'NATURAL_MINOR', d, 4));
  assert.deepEqual(aNatMin.map(c => c.roman), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  assert.deepEqual(aNatMin.map(c => c.symbol), ['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
  assert.deepEqual(aNatMin.map(c => c.quality), ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']);
  assert.deepEqual(aNatMin[0].midiNotes, [69, 72, 76]); // A C E
  assert.deepEqual(aNatMin[1].midiNotes, [71, 74, 77]); // B D F (dim)
  assert.deepEqual(aNatMin[4].midiNotes, [76, 79, 83]); // E G B (minor v)

  // Reference Fixture C: A Harmonic Minor (rootIndex 9, oct 4)
  const aHarmMin = Array.from({ length: 7 }, (_, d) => getDiatonicChordData(9, 'HARMONIC_MINOR', d, 4));
  assert.deepEqual(aHarmMin.map(c => c.roman), ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']);
  assert.deepEqual(aHarmMin.map(c => c.symbol), ['Am', 'B°', 'C+', 'Dm', 'E', 'F', 'G#°']);
  assert.deepEqual(aHarmMin.map(c => c.quality), ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim']);
  assert.deepEqual(aHarmMin[2].midiNotes, [72, 76, 80]); // C E G# (aug!)
  assert.deepEqual(aHarmMin[4].midiNotes, [76, 80, 83]); // E G# B (major V!)
  assert.deepEqual(aHarmMin[6].midiNotes, [80, 83, 86]); // G# B D (dim!)

  // Exhaustive check across all 12 chromatic keys × 3 scales × 7 degrees
  for (let root = 0; root < 12; root++) {
    for (const scaleId of SCALE_IDS) {
      for (let deg = 0; deg < 7; deg++) {
        const chord = getDiatonicChordData(root, scaleId, deg, 4);
        assert.equal(chord.midiNotes.length, 3);
        assert.ok(chord.midiNotes[0] < chord.midiNotes[1] && chord.midiNotes[1] < chord.midiNotes[2]);
        assert.equal(chord.roman, SCALES[scaleId].romans[deg]);
        assert.ok(chord.symbol.length > 0);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Acceptance Test 4: 7TH, SUS4, 9TH, and 7TH+9TH+STRUM deterministic voicings
// ---------------------------------------------------------------------------
test('Acceptance 4: 7TH, SUS4, 9TH, and 7TH+9TH+STRUM produce deterministic diatonic voicings; SUS4 replaces 3rd', () => {
  // C Major I: Cmaj7, Csus4, Cadd9, Cmaj9 (+STRUM)
  const cMaj7 = getDiatonicChordData(0, 'MAJOR', 0, 4, { '7TH': true });
  assert.deepEqual(cMaj7.midiNotes, [60, 64, 67, 71]);
  assert.equal(cMaj7.symbol, 'Cmaj7');

  const cSus4 = getDiatonicChordData(0, 'MAJOR', 0, 4, { 'SUS4': true });
  assert.deepEqual(cSus4.midiNotes, [60, 65, 67]); // 64 (E, major 3rd) removed, replaced by 65 (F, P4)
  assert.equal(cSus4.midiNotes.includes(64), false);
  assert.equal(cSus4.symbol, 'Csus4');

  const cAdd9 = getDiatonicChordData(0, 'MAJOR', 0, 4, { '9TH': true });
  assert.deepEqual(cAdd9.midiNotes, [60, 64, 67, 74]);
  assert.equal(cAdd9.symbol, 'Cadd9');

  const cMaj9Strum = getDiatonicChordData(0, 'MAJOR', 0, 4, { '7TH': true, '9TH': true, 'STRUM': true });
  assert.deepEqual(cMaj9Strum.midiNotes, [60, 64, 67, 71, 74]);
  assert.equal(cMaj9Strum.symbol, 'Cmaj9');
  assert.equal(cMaj9Strum.modifiers.hasStrum, true);

  // Dominant V7 in C Major: G7 (diatonic b7 = F = +10)
  const g7 = getDiatonicChordData(0, 'MAJOR', 4, 4, { '7TH': true });
  assert.deepEqual(g7.midiNotes, [67, 71, 74, 77]);
  assert.equal(g7.symbol, 'G7');

  // Half-diminished vii° in C Major: Bm7b5 (B D F A)
  const bHalfDim = getDiatonicChordData(0, 'MAJOR', 6, 4, { '7TH': true });
  assert.deepEqual(bHalfDim.midiNotes, [71, 74, 77, 81]);
  assert.equal(bHalfDim.symbol, 'Bm7b5');

  // A Harmonic Minor edge cases:
  // i + 7TH = Am(maj7) (A C E G#)
  const amMaj7 = getDiatonicChordData(9, 'HARMONIC_MINOR', 0, 4, { '7TH': true });
  assert.deepEqual(amMaj7.midiNotes, [69, 72, 76, 80]);
  assert.equal(amMaj7.symbol, 'Am(maj7)');

  // III+ + 7TH = C+maj7 (C E G# B)
  const cAugMaj7 = getDiatonicChordData(9, 'HARMONIC_MINOR', 2, 4, { '7TH': true });
  assert.deepEqual(cAugMaj7.midiNotes, [72, 76, 80, 83]);
  assert.equal(cAugMaj7.symbol, 'C+maj7');

  // V + 7TH + 9TH = E7b9 (E G# B D F)
  const e7b9 = getDiatonicChordData(9, 'HARMONIC_MINOR', 4, 4, { '7TH': true, '9TH': true });
  assert.deepEqual(e7b9.midiNotes, [76, 80, 83, 86, 89]);
  assert.equal(e7b9.symbol, 'E7b9');

  // vii° + 7TH = G#°7 (fully diminished 7th: G# B D F)
  const gSharpDim7 = getDiatonicChordData(9, 'HARMONIC_MINOR', 6, 4, { '7TH': true });
  assert.deepEqual(gSharpDim7.midiNotes, [80, 83, 86, 89]);
  assert.equal(gSharpDim7.symbol, 'G#°7');

  // SUS4 + 7TH + 9TH stacked on G in C Major -> G9sus4 (no major 3rd B=71!)
  const g9sus4 = getDiatonicChordData(0, 'MAJOR', 4, 4, { 'SUS4': true, '7TH': true, '9TH': true });
  assert.deepEqual(g9sus4.midiNotes, [67, 72, 74, 77, 81]);
  assert.equal(g9sus4.midiNotes.includes(71), false);
  assert.equal(g9sus4.symbol, 'G9sus4');

  // DRUM submode has no factory drum labels and pad 0 is native pitch MIDI 60
  const drumPad0 = getPadTriggerData({ subMode: 'DRUM', degreeIndex: 0 });
  assert.deepEqual(drumPad0.midiNotes, [60]);
  assert.equal(drumPad0.isChordGroup, false);
  assert.doesNotMatch(drumPad0.calloutLabel, /909|808|KICK|SNARE/i);
});

// ---------------------------------------------------------------------------
// 5. Acceptance Test 5: Modifier short-tap latch, long-hold momentary, cancel
// ---------------------------------------------------------------------------
test('Acceptance 5: modifier Hold+Toggle latches on short tap, acts momentarily on long hold or pad combo, and reverts reliably on cancel', () => {
  let fakeNow = 1000;
  let scheduledTimers = [];
  const ctrl = createModifierController({
    holdThresholdMs: MODIFIER_HOLD_THRESHOLD_MS,
    now: () => fakeNow,
    setTimer: (fn, ms) => {
      const entry = { id: scheduledTimers.length + 1, fn, due: fakeNow + ms, cleared: false };
      scheduledTimers.push(entry);
      return entry.id;
    },
    clearTimer: (id) => {
      const e = scheduledTimers.find(x => x.id === id);
      if (e) e.cleared = true;
    }
  });

  // Short tap latches ON
  ctrl.pointerDown('7TH', 1, 1000);
  assert.equal(ctrl.isActive('7TH'), true);
  fakeNow = 1120; // < 350ms
  ctrl.pointerUp('7TH', 1, 1120);
  assert.equal(ctrl.isLatched('7TH'), true);
  assert.equal(ctrl.isActive('7TH'), true);

  // Stack a second modifier via short tap (9TH + STRUM)
  ctrl.pointerDown('9TH', 2, 1200);
  ctrl.pointerUp('9TH', 2, 1280);
  ctrl.pointerDown('STRUM', 3, 1300);
  ctrl.pointerUp('STRUM', 3, 1360);
  assert.deepEqual(ctrl.getActiveModifiers(), {
    '7TH': true,
    'SUS4': false,
    '9TH': true,
    'STRUM': true
  });

  // Second short tap unlatches 7TH
  ctrl.pointerDown('7TH', 4, 1400);
  ctrl.pointerUp('7TH', 4, 1480);
  assert.equal(ctrl.isLatched('7TH'), false);
  assert.equal(ctrl.isActive('7TH'), false);

  // Long hold (>= 350ms) acts momentarily and reverts to OFF on release
  ctrl.pointerDown('SUS4', 5, 2000);
  assert.equal(ctrl.isActive('SUS4'), true);
  fakeNow = 2400;
  // Fire threshold timer
  scheduledTimers.filter(t => !t.cleared && t.due <= fakeNow).forEach(t => t.fn());
  ctrl.pointerUp('SUS4', 5, 2400);
  assert.equal(ctrl.isLatched('SUS4'), false);
  assert.equal(ctrl.isActive('SUS4'), false);

  // Holding while pressing a chord pad acts momentarily even if < 350ms
  ctrl.pointerDown('7TH', 6, 3000);
  assert.equal(ctrl.isActive('7TH'), true);
  ctrl.notifyPadTriggered();
  ctrl.pointerUp('7TH', 6, 3150);
  assert.equal(ctrl.isActive('7TH'), false);

  // Touch cancellation (pointercancel / lostpointercapture) reverts cleanly
  ctrl.pointerDown('SUS4', 7, 4000);
  assert.equal(ctrl.isActive('SUS4'), true);
  ctrl.pointerCancel('SUS4', 7);
  assert.equal(ctrl.isActive('SUS4'), false);
  assert.equal(ctrl.isHeld('SUS4'), false);
});

// ---------------------------------------------------------------------------
// 6. Acceptance Test 6: STRUM ordering, speed extremes, cancellation; Mono Up 1/8 arp
// ---------------------------------------------------------------------------
test('Acceptance 6: STRUM plays Low-to-High at Slow/Fast extremes and cancels pending notes on switch; Mono Up 1/8 arp takes precedence over STRUM', () => {
  // Slider mapping: 0 = Slow (150ms), 100 = Fast (20ms)
  assert.equal(strumSliderToMs(0), STRUM_MAX_MS);
  assert.equal(strumSliderToMs(100), STRUM_MIN_MS);
  assert.equal(strumMsToSlider(STRUM_MAX_MS), 0);
  assert.equal(strumMsToSlider(STRUM_MIN_MS), 100);
  assert.equal(getEighthNoteDurationSec(120), 0.25);
  assert.equal(getEighthNoteDurationSec(150), 0.2);

  // 6A. STRUM ascending order & pending cancellation
  const env = createMockAudioEnv(1.0);
  let bpm = 120;
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    getBpm: () => bpm,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(2.0);

  // Pass unsorted notes to ensure engine sorts Low -> High
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [71, 60, 67, 64],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY',
    strumEnabled: true,
    strumMs: 150 // Slow extreme
  });

  // Immediately at t=1.0, only lowest note (60) has started; 3 remain pending
  assert.equal(env.createdSources.length, 1);
  assert.equal(env.createdSources[0].startedAt, 1.0);
  assert.equal(env.createdSources[0].playbackRate.value, midiToPlaybackRate(60));
  assert.equal(engine.getTrackDebugState(0).pendingCount, 3);

  // Advance to 1.13 -> within 40ms lookahead of note 1 (due 1.15)
  env.advanceTimeTo(1.13);
  engine.tickScheduler();
  assert.equal(env.createdSources.length, 2);
  assert.ok(Math.abs(env.createdSources[1].startedAt - 1.15) < 1e-6);
  assert.ok(Math.abs(env.createdSources[1].playbackRate.value - midiToPlaybackRate(64)) < 1e-9);

  // Switch to Chord B at t=1.14 BEFORE note 1 (1.15), note 2 (1.30), note 3 (1.45) sound!
  env.advanceTimeTo(1.14);
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [65, 69, 72],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY',
    strumEnabled: true,
    strumMs: 20 // Fast extreme
  });

  // Unstarted lookahead note 1 (1.15) must have been cancelled (stopped/disconnected) & remaining 2 dropped
  assert.equal(env.createdSources[1].disconnected, true);

  // Tick within 15ms scheduler cadence (1.15s) to schedule Chord B's 20ms Fast STRUM (1.16s, 1.18s)
  // then advance past old Chord A's cancelled 1.30s and 1.45s times -> ONLY Chord B's notes (65, 69, 72) exist!
  env.advanceTimeTo(1.15);
  engine.tickScheduler();
  env.advanceTimeTo(1.50);
  engine.tickScheduler();

  const chordBSources = env.createdSources.slice(2);
  assert.equal(chordBSources.length, 3);
  assert.ok(Math.abs(chordBSources[0].startedAt - 1.14) < 1e-6);
  assert.ok(Math.abs(chordBSources[1].startedAt - 1.16) < 1e-6);
  assert.ok(Math.abs(chordBSources[2].startedAt - 1.18) < 1e-6);
  assert.ok(Math.abs(chordBSources[0].playbackRate.value - midiToPlaybackRate(65)) < 1e-9);
  assert.ok(Math.abs(chordBSources[1].playbackRate.value - midiToPlaybackRate(69)) < 1e-9);
  assert.ok(Math.abs(chordBSources[2].playbackRate.value - midiToPlaybackRate(72)) < 1e-9);

  // 6B. Mono Up 1/8 arp (overrides STRUM) + retrigger cancellation + <=1 voice cap
  const monoEnv = createMockAudioEnv(5.0);
  const monoEngine = createSampleVoiceEngine(monoEnv.audioCtxManager, {
    getBpm: () => 120, // 1/8 note = 0.25s
    setInterval: () => 1,
    clearInterval: () => {}
  });

  const monoGroup1 = monoEngine.triggerPerformance({
    trackIndex: 1,
    buffer: buf,
    midiNotes: [60, 64, 67],
    isChordGroup: true,
    playbackMode: 'GATE',
    voiceMode: 'MONO',
    strumEnabled: true, // Mono MUST take precedence over STRUM
    strumMs: 30
  });
  assert.equal(monoEnv.createdSources.length, 1);
  assert.equal(monoEnv.createdSources[0].startedAt, 5.0);

  // Advance to 5.23 -> schedules 2nd arp note at exact 1/8 beat 5.25s (NOT 5.03s STRUM!)
  monoEnv.advanceTimeTo(5.23);
  monoEngine.tickScheduler();
  assert.equal(monoEnv.createdSources.length, 2);
  assert.ok(Math.abs(monoEnv.createdSources[1].startedAt - 5.25) < 1e-6);
  // First voice must stop cleanly at or before 5.25 so Mono NEVER exceeds 1 voice
  assert.ok(monoEnv.createdSources[0].stoppedAt <= 5.25 + 1e-9);

  // Retrigger new chord at 5.30 -> cancels old arp loop and starts new ascending arp
  monoEnv.advanceTimeTo(5.30);
  const monoGroup2 = monoEngine.triggerPerformance({
    trackIndex: 1,
    buffer: buf,
    midiNotes: [62, 65, 69],
    isChordGroup: true,
    playbackMode: 'GATE',
    voiceMode: 'MONO'
  });
  assert.equal(monoEnv.createdSources.length, 3);
  assert.ok(Math.abs(monoEnv.createdSources[2].playbackRate.value - midiToPlaybackRate(62)) < 1e-9);

  // Releasing old group 1 must NOT stop new group 2
  monoEngine.releasePerformance(1, monoGroup1.groupId);
  assert.equal(monoEngine.getTrackDebugState(1).hasArpLoop, true);

  // Releasing group 2 in Gate mode stops arp loop & fades active voice
  monoEnv.advanceTimeTo(5.35);
  monoEngine.releasePerformance(1, monoGroup2.groupId);
  assert.equal(monoEngine.getTrackDebugState(1).hasArpLoop, false);

  // Verify Mono cap NEVER exceeded 1 simultaneously sounding voice across entire timeline!
  assert.ok(
    monoEnv.maxSimultaneousSources(monoEnv.createdSources) <= MAX_MONO_VOICES_PER_TRACK,
    `Mono voice count must never exceed 1 (saw ${monoEnv.maxSimultaneousSources(monoEnv.createdSources)})`
  );
});

// ---------------------------------------------------------------------------
// 7. Acceptance Test 7: Smart Chord Priority (Option A) vs Ordinary One-shot
// ---------------------------------------------------------------------------
test('Acceptance 7: Smart Chord Priority crossfades CHORD A -> CHORD B even in One-shot; ordinary NOTE/DRUM One-shot stays independent', () => {
  const env = createMockAudioEnv(10.0);
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(2.0);

  // Trigger Chord A in One-shot
  const chordA = engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [60, 64, 67],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  assert.equal(env.createdSources.length, 3);

  // Releasing Chord A pad in One-shot MUST NOT stop its voices
  env.advanceTimeTo(10.1);
  const released = engine.releasePerformance(0, chordA.groupId);
  assert.equal(released, false);
  assert.equal(env.createdSources[0].stoppedAt, null);

  // Trigger Chord B in One-shot at t=10.2 -> Chord A crossfades out over CHORD_CROSSFADE_SEC
  env.advanceTimeTo(10.2);
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [65, 69, 72],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  assert.equal(env.createdSources.length, 6);
  for (let i = 0; i < 3; i++) {
    assert.ok(
      Math.abs(env.createdSources[i].stoppedAt - (10.2 + CHORD_CROSSFADE_SEC)) < 1e-6,
      'Outgoing Chord A voices must crossfade out over CHORD_CROSSFADE_SEC'
    );
    // Verify linear ramp down to MIN_GAIN (click-safe!)
    const hasRamp = env.createdGains[i].gain.events.some(e => e.type === 'linearRamp' && e.v <= 0.001);
    assert.equal(hasRamp, true);
  }
  for (let i = 3; i < 6; i++) {
    assert.equal(env.createdSources[i].stoppedAt, null);
  }

  // Ordinary NOTE/DRUM One-shot on Track 2: NOT superseded by another NOTE/DRUM!
  const note1 = engine.triggerPerformance({
    trackIndex: 2,
    buffer: buf,
    midiNotes: [60],
    isChordGroup: false,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  env.advanceTimeTo(10.3);
  engine.releasePerformance(2, note1.groupId); // One-shot release does not stop note1

  const note2 = engine.triggerPerformance({
    trackIndex: 2,
    buffer: buf,
    midiNotes: [67],
    isChordGroup: false,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  env.advanceTimeTo(10.35);
  engine.releasePerformance(2, note2.groupId);

  const track2Sources = env.createdSources.slice(6);
  assert.equal(track2Sources.length, 2);
  assert.equal(track2Sources[0].stoppedAt, null, 'Ordinary One-shot NOTE 1 must continue to natural end');
  assert.equal(track2Sources[1].stoppedAt, null, 'Ordinary One-shot NOTE 2 must continue to natural end');
  assert.equal(engine.getSimultaneousVoiceCount(2, 10.4), 2);
});

// ---------------------------------------------------------------------------
// 8. Acceptance Test 8: Eight-voice cap under dense modifier stacks & retriggers
// ---------------------------------------------------------------------------
test('Acceptance 8: eight-voice per-track cap holds strictly during 5-note retriggers, crossfades, and dense One-shots; oldest steals click-safely', () => {
  const env = createMockAudioEnv(20.0);
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(3.0);

  // Trigger 5-note chord (7TH+9TH), then rapid 5-note retrigger 10ms later, then another 5ms later!
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [60, 64, 67, 71, 74],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });

  env.advanceTimeTo(20.01);
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [65, 69, 72, 76, 79],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });

  env.advanceTimeTo(20.015);
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [67, 71, 74, 77, 81],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });

  // Oldest voices (indices 0, 1) must have been stolen early with STEAL_FADE_SEC
  assert.ok(env.createdSources[0].stoppedAt <= 20.01 + STEAL_FADE_SEC + 1e-6);
  assert.ok(env.createdSources[1].stoppedAt <= 20.01 + STEAL_FADE_SEC + 1e-6);

  const peakTrack0 = env.maxSimultaneousSources(env.createdSources);
  assert.ok(
    peakTrack0 <= MAX_POLY_VOICES_PER_TRACK,
    `Poly voice cap exceeded during dense 5-note retriggers! Peak=${peakTrack0}`
  );

  // Also test 12 rapid independent NOTE One-shots on Track 3
  const env2 = createMockAudioEnv(30.0);
  const engine2 = createSampleVoiceEngine(env2.audioCtxManager, {
    setInterval: () => 1,
    clearInterval: () => {}
  });
  for (let i = 0; i < 12; i++) {
    env2.advanceTimeTo(30.0 + i * 0.002);
    engine2.triggerPerformance({
      trackIndex: 3,
      buffer: buf,
      midiNotes: [60 + i],
      isChordGroup: false,
      playbackMode: 'ONE_SHOT',
      voiceMode: 'POLY'
    });
  }
  const peakTrack3 = env2.maxSimultaneousSources(env2.createdSources);
  assert.ok(
    peakTrack3 <= MAX_POLY_VOICES_PER_TRACK,
    `Poly voice cap exceeded during 12 rapid NOTE One-shots! Peak=${peakTrack3}`
  );
});

// ---------------------------------------------------------------------------
// 9. Acceptance Test 9 & 12: Gate release, suspended AudioContext, mute/clear/stop cleanup
// ---------------------------------------------------------------------------
test('Acceptance 9 & 12: Gate release fades click-safely; suspended AudioContext, mute, clear, mode change, and stop clean up nodes with zero orphans', async () => {
  const env = createMockAudioEnv(40.0, 'suspended');
  const engine = createSampleVoiceEngine(env.audioCtxManager, {
    setInterval: () => 1,
    clearInterval: () => {}
  });
  const buf = makeFakeBuffer(2.0);

  // Trigger while suspended -> calls resume synchronously, schedules after resume
  const res = engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [60, 64, 67],
    isChordGroup: true,
    playbackMode: 'GATE',
    voiceMode: 'POLY'
  });
  assert.equal(res.triggered, true);
  assert.equal(res.reason, 'RESUMING');
  assert.equal(env.ctx.resumeCalls, 1);
  assert.equal(env.createdSources.length, 0);

  env.ctx.resolveResume();
  await Promise.resolve();
  assert.equal(env.createdSources.length, 3);

  // Gate release schedules click-safe fade over GATE_RELEASE_SEC
  env.advanceTimeTo(40.2);
  const rel = engine.releasePerformance(0, res.groupId);
  assert.equal(rel, true);
  for (const s of env.createdSources) {
    assert.ok(Math.abs(s.stoppedAt - (40.2 + GATE_RELEASE_SEC)) < 1e-6);
  }

  // Advance past stop time -> onended fires and disconnects all source & gain nodes
  env.advanceTimeTo(40.3);
  for (let i = 0; i < 3; i++) {
    assert.equal(env.createdSources[i].disconnected, true);
    assert.equal(env.createdGains[i].disconnected, true);
  }
  assert.equal(engine.getSimultaneousVoiceCount(0, 40.3), 0);

  // Test POLY -> MONO mode switch & stopAll cleanup
  engine.triggerPerformance({
    trackIndex: 0,
    buffer: buf,
    midiNotes: [60, 64, 67],
    isChordGroup: true,
    playbackMode: 'ONE_SHOT',
    voiceMode: 'POLY'
  });
  assert.equal(engine.getSimultaneousVoiceCount(0, 40.3), 3);
  engine.enforceVoiceMode(0, 'MONO');
  env.advanceTimeTo(40.3 + STEAL_FADE_SEC + 0.002);
  assert.equal(engine.getSimultaneousVoiceCount(0, 40.3 + STEAL_FADE_SEC + 0.002), 1);

  engine.stopAll();
  env.advanceTimeTo(41.0);
  assert.equal(engine.getSimultaneousVoiceCount(0, 41.0), 0);
});

// ---------------------------------------------------------------------------
// 10. Acceptance Test 10: Live REC stores absolute MIDI notes immutable to KEY/SCALE changes
// ---------------------------------------------------------------------------
test('Acceptance 10: recorded step events store absolute MIDI pitches unaffected by subsequent KEY/SCALE changes', () => {
  const s = createInitialState();
  // Verify defaults: ONE_SHOT / POLY / TAPE
  assert.ok(s.tracks.every(t => t.playbackMode === 'ONE_SHOT' && t.voiceMode === 'POLY' && t.pitchMode === 'TAPE'));

  // Record Cmaj7 in C Major at step 0
  const trigger1 = getPadTriggerData({
    rootIndex: 0,
    scaleMode: 'MAJOR',
    degreeIndex: 0,
    octave: 4,
    subMode: 'CHORD',
    modifiers: { '7TH': true }
  });
  const step0 = s.scenes[0][0][0];
  step0.active = true;
  step0.midiNotes = [...trigger1.midiNotes];
  assert.deepEqual(step0.midiNotes, [60, 64, 67, 71]);

  // Change KEY to F# (6) and SCALE to HARMONIC_MINOR
  s.chordmatik.rootIndex = 6;
  s.chordmatik.scaleMode = 'HARMONIC_MINOR';

  // Previously recorded step 0 MUST remain exact [60, 64, 67, 71]
  assert.deepEqual(s.scenes[0][0][0].midiNotes, [60, 64, 67, 71]);

  // Next trigger uses new key & scale (F# Harmonic Minor i = F#m: [66, 69, 73])
  const trigger2 = getPadTriggerData({
    rootIndex: s.chordmatik.rootIndex,
    scaleMode: s.chordmatik.scaleMode,
    degreeIndex: 0,
    octave: 4,
    subMode: 'CHORD',
    modifiers: {}
  });
  assert.deepEqual(trigger2.midiNotes, [66, 69, 73]);
});
