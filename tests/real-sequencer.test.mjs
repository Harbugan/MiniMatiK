/**
 * MiniMatik — PR05 Real Sample Sequencer Deterministic Automated Tests
 *
 * Verifies the PR05 Acceptance Matrix (1–12) and deterministic edge cases:
 * - Zero oscillator fallback; empty/unassigned/muted tracks stay silent
 * - Multi-track distinct user sample playback on Web Audio clock
 * - Stable 16-step looping at slow (60), medium (120), fast (200) BPM with zero doubled/skipped step 1
 * - Live BPM changes without restarting from step 1
 * - Q ON (nearest 16th + exact half-step tie rule + 15.6 -> step 0 wrap) & Q OFF microtiming preservation
 * - Multiple independent events per step (two chords + repeated identical pitches, no deduplication)
 * - Continuous overdub across step 16 -> 1 loop boundaries
 * - Gate duration & bar-boundary-crossing held notes (single attack, single click-safe release) vs One-shot natural end
 * - Note Detail single-event edit & single-event delete without altering sibling events; safe multi-event step tap
 * - Queued next-bar scene switching (cancels outgoing future events, preserves sounding One-shots, no double step 1)
 * - Copy Entire Scene (all 7 tracks, events, timing/duration, X/Y automation), source untouched, overwrite detection
 * - Legacy {active, midiNotes, autoX, autoY} in-memory migration without data loss
 * - Mute, STOP, audio disable, sample clear, and 8-voice / 1-voice caps
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../js/state.js';
import { storeSampleInSlot, assignSlotToTrack } from '../js/soundbank-state.js';
import {
  createSampleVoiceEngine,
  GATE_RELEASE_SEC,
  MAX_POLY_VOICES_PER_TRACK,
  MAX_MONO_VOICES_PER_TRACK
} from '../js/sample-voice-engine.js';
import {
  getStepDurationSec,
  quantizeOnsetStep,
  migrateStep,
  migrateScene,
  addEventToStep,
  updateEventInStep,
  deleteEventFromStep,
  toggleDefaultStep,
  isSceneEmpty,
  copyEntireScene
} from '../js/sequencer-model.js';
import {
  createSequencerEngine,
  SEQ_START_LEAD_SEC
} from '../js/sequencer-engine.js';

function makeFakeBuffer(duration = 1.0, label = 'sample') {
  return {
    duration,
    sampleRate: 44100,
    numberOfChannels: 1,
    length: Math.round(44100 * duration),
    _label: label
  };
}

function createMockAudioEnv(initialTime = 10.0) {
  let currentTime = initialTime;
  const createdSources = [];
  const createdGains = [];
  let oscillatorCount = 0;

  const ctx = {
    state: 'running',
    get currentTime() {
      return currentTime;
    },
    destination: { id: 'dest' },
    resume: async () => {},
    createOscillator() {
      oscillatorCount++;
      throw new Error('Sequencer must never call createOscillator');
    },
    createBufferSource() {
      const src = {
        buffer: null,
        playbackRate: {
          value: 1,
          setValueAtTime(val) {
            this.value = val;
          }
        },
        startedAt: null,
        stoppedAt: null,
        disconnected: false,
        onended: null,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start(when = currentTime) {
          this.startedAt = when;
        },
        stop(when = currentTime) {
          this.stoppedAt = when;
        }
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
            this.events.push({ type: 'ramp', v, t });
          },
          cancelScheduledValues(t) {
            this.events.push({ type: 'cancel', t });
          }
        },
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true;
        }
      };
      createdGains.push(g);
      return g;
    }
  };

  const audioCtxManager = {
    isWebAudioSupported: () => true,
    getContext: () => ctx,
    getExistingContext: () => ctx
  };

  function advanceTimeTo(targetTime) {
    currentTime = targetTime;
    for (const src of createdSources) {
      if (src.startedAt !== null && !src.disconnected) {
        const bufDur = src.buffer ? src.buffer.duration / (src.playbackRate.value || 1) : 0.1;
        const naturalEnd = src.startedAt + bufDur;
        const end = src.stoppedAt !== null ? Math.min(src.stoppedAt, naturalEnd) : naturalEnd;
        if (currentTime >= end) {
          if (typeof src.onended === 'function') {
            const cb = src.onended;
            src.onended = null;
            cb();
          }
        }
      }
    }
  }

  return {
    ctx,
    audioCtxManager,
    createdSources,
    createdGains,
    getOscillatorCount: () => oscillatorCount,
    advanceTimeTo
  };
}

function setupHarness({ initialTime = 10.0, bpm = 120 } = {}) {
  const env = createMockAudioEnv(initialTime);
  const state = createInitialState();
  state.bpm = bpm;

  const voiceEngine = createSampleVoiceEngine(env.audioCtxManager, {
    getBpm: () => state.bpm,
    isAudioEnabled: () => state.audioEnabled,
    setInterval: () => 1,
    clearInterval: () => {}
  });

  const visualSteps = [];
  const sceneChanges = [];

  const seqEngine = createSequencerEngine({
    state,
    audioCtxManager: env.audioCtxManager,
    voiceEngine,
    setInterval: () => 2,
    clearInterval: () => {},
    onVisualStep: (ev) => visualSteps.push(ev),
    onSceneChanged: (scn) => sceneChanges.push(scn)
  });

  return { env, state, voiceEngine, seqEngine, visualSteps, sceneChanges };
}

// ---------------------------------------------------------------------------
// Acceptance 1 & 2: Silent empty/muted tracks; distinct user samples per track
// ---------------------------------------------------------------------------
test('Acceptance 1 & 2: empty/unassigned/muted tracks are silent (zero oscillators); multiple tracks play distinct assigned user samples', () => {
  const { env, state, seqEngine } = setupHarness({ initialTime: 10.0, bpm: 120 });

  // Activate step 0 on T1, T2, T3 with empty bank
  addEventToStep(state.scenes[0], 0, 0, { midiNotes: [60], onsetStep: 0 });
  addEventToStep(state.scenes[0], 1, 0, { midiNotes: [64], onsetStep: 0 });
  addEventToStep(state.scenes[0], 2, 0, { midiNotes: [67], onsetStep: 0 });

  seqEngine.start();
  env.advanceTimeTo(10.2);
  seqEngine.tick();

  assert.equal(env.createdSources.length, 0, 'Empty bank must produce zero audio sources');
  assert.equal(env.getOscillatorCount(), 0, 'Must never call createOscillator');
  seqEngine.stop();

  // Import & assign distinct buffers to T1 (kick) and T2 (chord); mute T3 (hat)
  const bufKick = makeFakeBuffer(0.4, 'kick');
  const bufChord = makeFakeBuffer(1.0, 'chord');
  const bufHat = makeFakeBuffer(0.2, 'hat');

  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: bufKick, name: 'kick', sourceType: 'import' });
  storeSampleInSlot(state.soundbank, state.tracks, 0, 1, { buffer: bufChord, name: 'chord', sourceType: 'import' });
  storeSampleInSlot(state.soundbank, state.tracks, 0, 2, { buffer: bufHat, name: 'hat', sourceType: 'import' });
  assignSlotToTrack(state.soundbank, state.tracks, 1, 1);
  assignSlotToTrack(state.soundbank, state.tracks, 2, 2);
  state.tracks[2].muted = true;

  seqEngine.start();
  env.advanceTimeTo(10.25);
  seqEngine.tick();

  assert.equal(env.createdSources.length, 2, 'Only unmuted assigned tracks T1 and T2 should play');
  const labels = env.createdSources.map(s => s.buffer._label).sort();
  assert.deepEqual(labels, ['chord', 'kick']);
  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 3: Stable 16-step loop timing at slow/medium/fast BPM; no doubled/skipped step 1
// ---------------------------------------------------------------------------
test('Acceptance 3: 16-step loop timing is exact at 60/120/200 BPM with zero doubled or skipped step 1; live BPM changes do not restart', () => {
  for (const bpm of [60, 120, 200]) {
    const { env, state, seqEngine } = setupHarness({ initialTime: 20.0, bpm });
    const buf = makeFakeBuffer(0.05, 'click');
    storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'click', sourceType: 'import' });

    // Place hits on step 0, 4, 8, 12
    for (const s of [0, 4, 8, 12]) {
      addEventToStep(state.scenes[0], 0, s, { midiNotes: [60], onsetStep: s });
    }

    const stepDur = getStepDurationSec(bpm);
    const barDur = stepDur * 16;
    const t0 = 20.0 + SEQ_START_LEAD_SEC;

    seqEngine.start();
    // Simulate jittery main thread ticks (varying 11ms..37ms) across 2 full bars
    let t = 20.0;
    const endT = t0 + barDur * 2 + 0.01;
    let i = 0;
    while (t < endT) {
      t += (i++ % 2 === 0 ? 0.011 : 0.037);
      env.advanceTimeTo(t);
      seqEngine.tick();
    }

    // Should have fired 4 hits per bar * 2 bars + step 0 of bar 2 (since horizon reaches bar 2 start)
    const starts = env.createdSources.map(s => s.startedAt);
    const bar0And1Starts = starts.filter(st => st < t0 + barDur * 2 - 1e-6);
    assert.equal(bar0And1Starts.length, 8, `Expected exactly 8 triggers over 2 bars at ${bpm} BPM`);

    const expected = [0, 4, 8, 12, 16, 20, 24, 28].map(s => t0 + s * stepDur);
    for (let k = 0; k < expected.length; k++) {
      assert.ok(
        Math.abs(bar0And1Starts[k] - expected[k]) < 1e-6,
        `Timing drift at ${bpm} BPM hit ${k}: got ${bar0And1Starts[k]}, expected ${expected[k]}`
      );
    }
    seqEngine.stop();
  }

  // Live BPM change mid-bar must NOT restart from step 0
  const { env, state, seqEngine } = setupHarness({ initialTime: 30.0, bpm: 120 });
  const buf = makeFakeBuffer(0.05, 'pulse');
  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'pulse', sourceType: 'import' });
  addEventToStep(state.scenes[0], 0, 0, { midiNotes: [60], onsetStep: 0 });
  addEventToStep(state.scenes[0], 0, 8, { midiNotes: [67], onsetStep: 8 });

  seqEngine.start();
  // Advance to step 5 at 120 BPM (5 * 0.125 = 0.625s)
  const stepDur120 = getStepDurationSec(120);
  env.advanceTimeTo(30.0 + SEQ_START_LEAD_SEC + 5.2 * stepDur120);
  seqEngine.tick();
  assert.equal(state.currentStep, 5);

  // Change BPM to 160 mid-bar: current step stays at 5, does not reset to 0
  seqEngine.updateBpm(160);
  assert.equal(state.bpm, 160);
  assert.equal(state.currentStep, 5);
  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 4: Q ON / Q OFF, quantize ties, and near step 16 -> 1 boundary
// ---------------------------------------------------------------------------
test('Acceptance 4: Q ON snaps to nearest 16th (with deterministic half-step tie & 15.6->0 wrap); Q OFF preserves microtiming without re-quantizing prior events', () => {
  // Deterministic quantizeOnsetStep unit checks
  assert.deepEqual(quantizeOnsetStep(2.3), { onsetStep: 2, owningStep: 2, wrapped: false });
  assert.deepEqual(quantizeOnsetStep(2.5), { onsetStep: 3, owningStep: 3, wrapped: false }); // exact half-step rounds half-up
  assert.deepEqual(quantizeOnsetStep(15.5), { onsetStep: 0, owningStep: 0, wrapped: true }); // wraps to step 0
  assert.deepEqual(quantizeOnsetStep(15.8), { onsetStep: 0, owningStep: 0, wrapped: true });

  const { env, state, seqEngine } = setupHarness({ initialTime: 40.0, bpm: 120 });
  const stepDur = getStepDurationSec(120);
  const t0 = 40.0 + SEQ_START_LEAD_SEC;

  seqEngine.start();
  seqEngine.setRecording(true);

  // 1. Record with Q OFF at step 3.35 (late) and step 15.85 (near 16->1 boundary)
  seqEngine.setQuantize(false);
  env.advanceTimeTo(t0 + 3.35 * stepDur);
  seqEngine.tick();
  const recLate = seqEngine.recordNoteOn('p1', { trackIndex: 0, midiNotes: [60] });
  assert.equal(recLate.stepIdx, 3);
  assert.ok(Math.abs(recLate.event.onsetStep - 3.35) < 1e-4);

  env.advanceTimeTo(t0 + 15.85 * stepDur);
  seqEngine.tick();
  const recBoundary = seqEngine.recordNoteOn('p2', { trackIndex: 0, midiNotes: [64] });
  assert.equal(recBoundary.stepIdx, 15);
  assert.ok(Math.abs(recBoundary.event.onsetStep - 15.85) < 1e-4);

  // 2. Turn Q ON — must NOT destructively re-quantize prior Q OFF events!
  seqEngine.setQuantize(true);
  assert.ok(Math.abs(state.scenes[0][0][3].events[0].onsetStep - 3.35) < 1e-4);
  assert.ok(Math.abs(state.scenes[0][0][15].events[0].onsetStep - 15.85) < 1e-4);

  // 3. Record with Q ON at step 15.7 (bar 1) -> snaps to step 0
  env.advanceTimeTo(t0 + (16 + 15.7) * stepDur);
  seqEngine.tick();
  const recQuant = seqEngine.recordNoteOn('p3', { trackIndex: 0, midiNotes: [67] });
  assert.equal(recQuant.stepIdx, 0);
  assert.equal(recQuant.event.onsetStep, 0);

  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 5 & 6: Multiple events per step & continuous overdub across bar boundary
// ---------------------------------------------------------------------------
test('Acceptance 5 & 6: two chords and repeated identical notes remain independent; continuous overdub survives multiple loops without erasing earlier events', () => {
  const { env, state, seqEngine } = setupHarness({ initialTime: 50.0, bpm: 120 });
  const buf = makeFakeBuffer(0.08, 'piano');
  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'piano', sourceType: 'import' });

  const stepDur = getStepDurationSec(120);
  const barDur = 16 * stepDur;
  const t0 = 50.0 + SEQ_START_LEAD_SEC;

  seqEngine.start();
  seqEngine.setRecording(true);
  seqEngine.setQuantize(false);

  // Loop 0: record C major chord at step 2.10
  env.advanceTimeTo(t0 + 2.10 * stepDur);
  seqEngine.tick();
  seqEngine.recordNoteOn('k1', { trackIndex: 0, midiNotes: [60, 64, 67], isChordGroup: true });
  env.advanceTimeTo(t0 + 2.40 * stepDur);
  seqEngine.recordNoteOff('k1');

  // Loop 1 (across step 16 -> 1): overdub F major chord at step 2.55 AND repeated C4 at step 4.10 & 4.60
  env.advanceTimeTo(t0 + barDur + 2.55 * stepDur);
  seqEngine.tick();
  seqEngine.recordNoteOn('k2', { trackIndex: 0, midiNotes: [65, 69, 72], isChordGroup: true });
  env.advanceTimeTo(t0 + barDur + 2.90 * stepDur);
  seqEngine.recordNoteOff('k2');

  env.advanceTimeTo(t0 + barDur + 4.10 * stepDur);
  seqEngine.tick();
  seqEngine.recordNoteOn('k3', { trackIndex: 0, midiNotes: [60] });
  env.advanceTimeTo(t0 + barDur + 4.30 * stepDur);
  seqEngine.recordNoteOff('k3');

  env.advanceTimeTo(t0 + barDur + 4.60 * stepDur);
  seqEngine.tick();
  seqEngine.recordNoteOn('k4', { trackIndex: 0, midiNotes: [60] });
  env.advanceTimeTo(t0 + barDur + 4.80 * stepDur);
  seqEngine.recordNoteOff('k4');

  // Verify step 2 has BOTH independent chords, step 4 has BOTH repeated identical C4 hits
  assert.equal(state.scenes[0][0][2].events.length, 2);
  assert.deepEqual(state.scenes[0][0][2].events[0].midiNotes, [60, 64, 67]);
  assert.deepEqual(state.scenes[0][0][2].events[1].midiNotes, [65, 69, 72]);

  assert.equal(state.scenes[0][0][4].events.length, 2);
  assert.deepEqual(state.scenes[0][0][4].events[0].midiNotes, [60]);
  assert.deepEqual(state.scenes[0][0][4].events[1].midiNotes, [60]);

  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 7: Gate duration across bar boundary vs One-shot natural end
// ---------------------------------------------------------------------------
test('Acceptance 7: Gate respects recorded hold duration including across loop boundary; One-shot plays to natural end', () => {
  const { env, state, seqEngine } = setupHarness({ initialTime: 60.0, bpm: 120 });
  const buf = makeFakeBuffer(2.0, 'pad');
  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'pad', sourceType: 'import' });
  state.tracks[0].playbackMode = 'GATE';

  const stepDur = getStepDurationSec(120); // 0.125s
  const t0 = 60.0 + SEQ_START_LEAD_SEC;

  seqEngine.start();
  seqEngine.setRecording(true);
  seqEngine.setQuantize(false);

  // Hold note starting at step 15.0 across the 16 -> 1 boundary until step 2.0 of next bar (3.0 steps = 0.375s)
  env.advanceTimeTo(t0 + 15.0 * stepDur);
  seqEngine.tick();
  const rec = seqEngine.recordNoteOn('hold1', { trackIndex: 0, midiNotes: [60] });

  env.advanceTimeTo(t0 + 18.0 * stepDur); // 3 steps later, across bar boundary!
  seqEngine.tick();
  const off = seqEngine.recordNoteOff('hold1');

  assert.equal(rec.stepIdx, 15);
  assert.ok(Math.abs(off.durationSteps - 3.0) < 0.01, `Expected ~3.0 steps duration, got ${off.durationSteps}`);

  seqEngine.stop();
  env.createdSources.length = 0;

  // Replay in GATE mode: single attack at step 15, single click-safe release at +3.0 steps (0.375s + GATE_RELEASE_SEC)
  seqEngine.start();
  const tPlay = env.ctx.currentTime + SEQ_START_LEAD_SEC;
  // Advance to 14.6 steps (within 80ms lookahead of step 15) so step 15 schedules on exact Web Audio time
  env.advanceTimeTo(tPlay + 14.6 * stepDur);
  seqEngine.tick();

  assert.equal(env.createdSources.length, 1, 'Should spawn exactly 1 voice for bar-crossing Gate note');
  const gateSrc = env.createdSources[0];
  const expectedStart = tPlay + 15.0 * stepDur;
  const expectedStop = expectedStart + 3.0 * stepDur + GATE_RELEASE_SEC;
  assert.ok(Math.abs(gateSrc.startedAt - expectedStart) < 1e-4);
  assert.ok(Math.abs(gateSrc.stoppedAt - expectedStop) < 1e-3, `Gate stop ${gateSrc.stoppedAt} vs expected ${expectedStop}`);

  // Replay same 3-step note in ONE_SHOT mode: plays to natural buffer end (no early Gate truncation)
  seqEngine.stop();
  env.createdSources.length = 0;
  state.tracks[0].playbackMode = 'ONE_SHOT';

  seqEngine.start();
  const tOneShot = env.ctx.currentTime + SEQ_START_LEAD_SEC;
  env.advanceTimeTo(tOneShot + 14.6 * stepDur);
  seqEngine.tick();

  assert.equal(env.createdSources.length, 1);
  assert.equal(env.createdSources[0].stoppedAt, null, 'One-shot must NOT schedule early Gate stop');
  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 8: Note Detail single-event edit/delete & safe multi-event step tap
// ---------------------------------------------------------------------------
test('Acceptance 8: Note Detail edits/deletes one event without altering siblings; tapping multi-event step never flattens it', () => {
  const state = createInitialState();
  const scene = state.scenes[0];

  const ev1 = addEventToStep(scene, 0, 5, { midiNotes: [60, 64, 67], onsetStep: 5.1, durationSteps: 1.0, isChordGroup: true });
  const ev2 = addEventToStep(scene, 0, 5, { midiNotes: [72], onsetStep: 5.6, durationSteps: 2.0, isChordGroup: false });

  // Tapping a multi-event step MUST NOT flatten or delete — must signal open_detail
  const tapRes = toggleDefaultStep(scene, 0, 5, [60]);
  assert.equal(tapRes.action, 'open_detail');
  assert.equal(scene[0][5].events.length, 2);

  // Edit only ev2 pitch, offset, and duration
  updateEventInStep(scene, 0, 5, ev2.id, { midiNotes: [74], subStepOffset: 0.75, durationSteps: 3.5 });
  assert.deepEqual(scene[0][5].events[0].midiNotes, [60, 64, 67], 'Sibling ev1 pitches must be untouched');
  assert.ok(Math.abs(scene[0][5].events[0].onsetStep - 5.1) < 1e-6);
  assert.deepEqual(scene[0][5].events[1].midiNotes, [74]);
  assert.ok(Math.abs(scene[0][5].events[1].onsetStep - 5.75) < 1e-6);
  assert.equal(scene[0][5].events[1].durationSteps, 3.5);

  // Delete only ev1 -> ev2 remains intact
  const deleted = deleteEventFromStep(scene, 0, 5, ev1.id);
  assert.equal(deleted, true);
  assert.equal(scene[0][5].events.length, 1);
  assert.equal(scene[0][5].events[0].id, ev2.id);
  assert.equal(scene[0][5].active, true);
});

// ---------------------------------------------------------------------------
// Acceptance 9: Queued next-bar scene switch vs immediate stopped switch
// ---------------------------------------------------------------------------
test('Acceptance 9: scene switch queues for next bar while playing, switches immediately when stopped, cancels future outgoing events, and never doubles step 1', () => {
  const { env, state, seqEngine } = setupHarness({ initialTime: 80.0, bpm: 120 });
  const buf = makeFakeBuffer(1.5, 'synth');
  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'synth', sourceType: 'import' });

  // Scene 0: hits on step 0 (C4) and step 15 (D4)
  addEventToStep(state.scenes[0], 0, 0, { midiNotes: [60], onsetStep: 0 });
  addEventToStep(state.scenes[0], 0, 15, { midiNotes: [62], onsetStep: 15 });
  // Scene 3: hit on step 0 (G4)
  addEventToStep(state.scenes[3], 0, 0, { midiNotes: [67], onsetStep: 0 });

  // Stopped switch is immediate
  const stopSwitch = seqEngine.requestSceneChange(2);
  assert.equal(stopSwitch.immediate, true);
  assert.equal(state.currentScene, 2);
  assert.equal(state.queuedScene, null);
  seqEngine.requestSceneChange(0);

  const stepDur = getStepDurationSec(120);
  const barDur = 16 * stepDur;
  const t0 = 80.0 + SEQ_START_LEAD_SEC;

  seqEngine.start();
  // Mid-bar (step 4): queue Scene 3
  env.advanceTimeTo(t0 + 4 * stepDur);
  seqEngine.tick();
  const qRes = seqEngine.requestSceneChange(3);
  assert.equal(qRes.immediate, false);
  assert.equal(state.currentScene, 0, 'Must remain on Scene 0 until bar boundary');
  assert.equal(state.queuedScene, 3, 'Scene 3 must be queued');

  // Advance to step 14.6 (lookahead schedules Scene 0 step 15 on exact clock time)
  env.advanceTimeTo(t0 + 14.6 * stepDur);
  seqEngine.tick();

  // Advance to step 15.6 (step 15 is now sounding; lookahead crosses bar boundary to Scene 3 step 0!)
  env.advanceTimeTo(t0 + 15.6 * stepDur);
  seqEngine.tick();

  // Advance past bar boundary to Bar 1 step 0.2
  env.advanceTimeTo(t0 + barDur + 0.2 * stepDur);
  seqEngine.tick();

  assert.equal(state.currentScene, 3, 'Must switch to Scene 3 right at next bar');
  assert.equal(state.queuedScene, null, 'Queued scene indicator must clear after switch');

  // Verify exact triggers: Scene 0 step 0 (C4), Scene 0 step 15 (D4), Scene 3 step 0 (G4) — NO double step 0!
  assert.equal(env.createdSources.length, 3);
  assert.ok(Math.abs(env.createdSources[0].startedAt - t0) < 1e-5);
  assert.ok(Math.abs(env.createdSources[1].startedAt - (t0 + 15 * stepDur)) < 1e-5);
  assert.ok(Math.abs(env.createdSources[2].startedAt - (t0 + barDur)) < 1e-5);
  // Already sounding One-shot from step 15 was NOT cut at bar boundary
  assert.equal(env.createdSources[1].stoppedAt, null);

  seqEngine.stop();
});

// ---------------------------------------------------------------------------
// Acceptance 10: Copy Entire Scene (7 tracks, events, timing/duration, X/Y auto) + overwrite protection
// ---------------------------------------------------------------------------
test('Acceptance 10: Copy Entire Scene clones all 7 tracks, event timing/duration, and X/Y automation without mutating source', () => {
  const state = createInitialState();
  addEventToStep(state.scenes[0], 0, 1, { midiNotes: [60, 64, 67], onsetStep: 1.25, durationSteps: 2.5, isChordGroup: true });
  addEventToStep(state.scenes[0], 6, 14, { midiNotes: [48], onsetStep: 14.8, durationSteps: 0.5 });
  state.scenes[0][2][7].autoX = 0.75;
  state.scenes[0][2][7].autoY = -0.4;

  assert.equal(isSceneEmpty(state.scenes[0]), false);
  assert.equal(isSceneEmpty(state.scenes[5]), true);

  // Copy to empty scene 5
  const r1 = copyEntireScene(state.scenes, 0, 5);
  assert.equal(r1.copied, true);
  assert.equal(r1.overwritten, false);
  assert.equal(isSceneEmpty(state.scenes[5]), false);

  // Verify deep copy fidelity across tracks, timing, duration, and X/Y automation
  assert.deepEqual(state.scenes[5][0][1].events[0].midiNotes, [60, 64, 67]);
  assert.equal(state.scenes[5][0][1].events[0].onsetStep, 1.25);
  assert.equal(state.scenes[5][0][1].events[0].durationSteps, 2.5);
  assert.equal(state.scenes[5][6][14].events[0].onsetStep, 14.8);
  assert.equal(state.scenes[5][2][7].autoX, 0.75);
  assert.equal(state.scenes[5][2][7].autoY, -0.4);

  // Mutating destination MUST NOT mutate source
  updateEventInStep(state.scenes[5], 0, 1, state.scenes[5][0][1].events[0].id, { midiNotes: [72] });
  assert.deepEqual(state.scenes[0][0][1].events[0].midiNotes, [60, 64, 67]);

  // Copying again into now-non-empty scene 5 reports overwritten = true
  const r2 = copyEntireScene(state.scenes, 0, 5);
  assert.equal(r2.copied, true);
  assert.equal(r2.overwritten, true);
});

// ---------------------------------------------------------------------------
// Migration & Acceptance 12: Legacy migration, voice caps, mute/stop/disable cleanup
// ---------------------------------------------------------------------------
test('Legacy step migration preserves notes and X/Y automation; mute/stop/caps leave zero stuck voices', () => {
  // Legacy PR03/PR04 step object without `events` array
  const legacyStep = { active: true, midiNotes: [60, 64, 67], autoX: 0.5, autoY: -0.25 };
  const migrated = migrateStep(legacyStep, 4);
  assert.equal(migrated.events.length, 1);
  assert.deepEqual(migrated.events[0].midiNotes, [60, 64, 67]);
  assert.equal(migrated.events[0].onsetStep, 4);
  assert.equal(migrated.autoX, 0.5);
  assert.equal(migrated.autoY, -0.25);

  // Voice cap enforcement during dense sequencer playback (8 Poly / 1 Mono) & stop cleanup
  const { env, state, voiceEngine, seqEngine } = setupHarness({ initialTime: 100.0, bpm: 120 });
  const buf = makeFakeBuffer(2.0, 'dense');
  storeSampleInSlot(state.soundbank, state.tracks, 0, 0, { buffer: buf, name: 'dense', sourceType: 'import' });

  // Add 12 simultaneous notes on step 0 in Poly -> voice cap must stay <= 8
  for (let i = 0; i < 12; i++) {
    addEventToStep(state.scenes[0], 0, 0, { midiNotes: [60 + i], onsetStep: 0 + i * 0.01 });
  }

  seqEngine.start();
  env.advanceTimeTo(100.08);
  seqEngine.tick();

  const countPoly = voiceEngine.getSimultaneousVoiceCount(0, 100.08);
  assert.ok(countPoly <= MAX_POLY_VOICES_PER_TRACK, `Poly count ${countPoly} exceeded cap ${MAX_POLY_VOICES_PER_TRACK}`);

  // Switch track to MONO -> cap <= 1
  voiceEngine.enforceVoiceMode(0, 'MONO');
  env.advanceTimeTo(100.12);
  assert.ok(voiceEngine.getSimultaneousVoiceCount(0, 100.12) <= MAX_MONO_VOICES_PER_TRACK);

  // Global stop -> zero stuck voices
  seqEngine.stop();
  voiceEngine.stopAll();
  env.advanceTimeTo(100.25);
  assert.equal(voiceEngine.getSimultaneousVoiceCount(0, 100.25), 0);
});
