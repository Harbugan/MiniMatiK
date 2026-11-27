import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SLOT_COUNT,
  TRACK_COUNT,
  createEmptySoundbank,
  createInitialTracks,
  formatSlotNumber,
  formatDuration,
  sanitizeSampleName,
  buildRecordingName,
  getLoadedCount,
  getTracksForSlot,
  storeSampleInSlot,
  assignSlotToTrack,
  clearSlot
} from '../js/soundbank-state.js';
import {
  SampleDecodeError,
  decodeFile,
  decodeRecordedBlob
} from '../js/sample-decoder.js';
import {
  SampleRecordError,
  checkRecordingSupport,
  mapMicrophoneError,
  stopStreamTracks
} from '../js/sample-recorder.js';
import { createSamplePreviewPlayer } from '../js/sample-preview.js';
import {
  DECK_MODES,
  createInitialState,
  hasTrackAutomation,
  countTrackAutoSteps
} from '../js/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function listFiles(dir, ext) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => path.join(dir, f));
}

function parseStaticImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const regex = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

test('entry point moved to index.html and all local CSS/JS references exist', () => {
  const indexPath = path.join(REPO_ROOT, 'index.html');
  assert.equal(fs.existsSync(indexPath), true, 'index.html must exist');
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'minimatik.html')),
    false,
    'legacy monolithic minimatik.html must be removed'
  );

  const html = fs.readFileSync(indexPath, 'utf8');
  const cssRefs = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);
  const jsRefs = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map((m) => m[1]);

  assert.deepEqual(cssRefs, [
    './styles/tokens.css',
    './styles/layout.css',
    './styles/components.css',
    './styles/views.css'
  ]);
  assert.deepEqual(jsRefs, ['./js/app.js']);

  for (const ref of [...cssRefs, ...jsRefs]) {
    assert.ok(ref.startsWith('./'), `Asset URL must be relative for /Projects/MiniMatik/: ${ref}`);
    const full = path.resolve(REPO_ROOT, ref);
    assert.equal(fs.existsSync(full), true, `Referenced asset missing on disk: ${ref}`);
  }
});

test('ES module dependency graph under js/ has valid imports and zero circular dependencies', () => {
  const jsDir = path.join(REPO_ROOT, 'js');
  const jsFiles = listFiles(jsDir, '.js');
  assert.equal(jsFiles.length, 12, 'Expected 12 ES modules under js/');

  const graph = new Map();
  for (const file of jsFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const deps = parseStaticImports(file).map((spec) => {
      assert.ok(spec.startsWith('./'), `${rel} must use relative ESM import: ${spec}`);
      const resolved = path.resolve(path.dirname(file), spec);
      assert.equal(fs.existsSync(resolved), true, `${rel} imports missing file: ${spec}`);
      return path.relative(REPO_ROOT, resolved);
    });
    graph.set(rel, deps);
  }

  // DFS cycle detection
  const state = new Map(); // 0/undefined=unvisited, 1=visiting, 2=visited
  function dfs(node, trail) {
    state.set(node, 1);
    for (const dep of graph.get(node) || []) {
      if (state.get(dep) === 1) {
        assert.fail(`Circular dependency detected: ${[...trail, dep].join(' -> ')}`);
      }
      if (!state.get(dep)) {
        dfs(dep, [...trail, dep]);
      }
    }
    state.set(node, 2);
  }

  for (const node of graph.keys()) {
    if (!state.get(node)) {
      dfs(node, [node]);
    }
  }
});

test('NordicWay workflow deploys multi-file runtime assets only on main push / manual dispatch', () => {
  const wfPath = path.join(REPO_ROOT, '.github/workflows/deploy-nordicway.yml');
  const wf = fs.readFileSync(wfPath, 'utf8');

  assert.doesNotMatch(wf, /^\s*pull_request:/m, 'Must not deploy on pull_request');
  assert.match(wf, /branches:\s*\n\s*-\s*main/, 'Must target main branch');
  assert.match(wf, /workflow_dispatch:/, 'Must retain manual dispatch');
  assert.match(wf, /'index\.html'/, 'Trigger paths must include index.html');
  assert.match(wf, /'styles\/\*\*'/, 'Trigger paths must include styles/**');
  assert.match(wf, /'js\/\*\*'/, 'Trigger paths must include js/**');
  assert.match(wf, /NORDICWAY_FTP_USER/, 'Must use existing NORDICWAY_FTP_USER secret');
  assert.match(wf, /NORDICWAY_FTP_PASSWORD/, 'Must use existing NORDICWAY_FTP_PASSWORD secret');
  assert.match(wf, /--ssl-reqd --ftp-pasv --ftp-create-dirs/, 'Must use FTPS and create dirs');
  assert.doesNotMatch(wf, /--delete|DELE\b|RMD\b/, 'Must not delete remote files');
  assert.doesNotMatch(wf, /minimatik\.html/, 'Must not reference removed minimatik.html');
});

test('PR02 soundbank-state preserves 00/19 startup, hybrid assignment, manual replace, and safe clear', () => {
  const bank = createEmptySoundbank();
  const tracks = createInitialTracks();

  assert.equal(bank.length, SLOT_COUNT);
  assert.equal(tracks.length, TRACK_COUNT);
  assert.equal(getLoadedCount(bank), 0);
  assert.ok(bank.every((s) => !s.loaded && s.buffer === null && s.name === null));
  assert.ok(tracks.every((t) => t.assignedSlot === null && t.muted === false));

  const fakeBuf1 = { duration: 1.25, sampleRate: 44100, numberOfChannels: 2, length: 55125 };
  const fakeBuf2 = { duration: 0.75, sampleRate: 48000, numberOfChannels: 1, length: 36000 };

  // First import on empty active track T1 auto-assigns to T1
  const r1 = storeSampleInSlot(bank, tracks, 0, 0, {
    buffer: fakeBuf1,
    name: 'kick_909.wav',
    sourceType: 'import'
  });
  assert.equal(r1.autoAssigned, true);
  assert.equal(r1.autoAssignedTrack, 0);
  assert.equal(tracks[0].assignedSlot, 0);
  assert.equal(bank[0].name, 'kick_909');
  assert.equal(getLoadedCount(bank), 1);

  // Second import while T1 is already assigned preserves T1
  const r2 = storeSampleInSlot(bank, tracks, 0, 1, {
    buffer: fakeBuf2,
    name: 'snare_take.m4a',
    sourceType: 'import'
  });
  assert.equal(r2.autoAssigned, false);
  assert.equal(r2.preservedSlot, 0);
  assert.equal(tracks[0].assignedSlot, 0);
  assert.equal(getLoadedCount(bank), 2);

  // Explicit manual assignment to empty T2 and replacement on T1
  const a1 = assignSlotToTrack(bank, tracks, 1, 1);
  assert.equal(a1.assigned, true);
  assert.equal(a1.replaced, false);
  const a2 = assignSlotToTrack(bank, tracks, 1, 0);
  assert.equal(a2.assigned, true);
  assert.equal(a2.replaced, true);
  assert.equal(a2.previousSlot, 0);
  assert.deepEqual(getTracksForSlot(tracks, 1), [0, 1]);

  // Clear slot 1 removes both track references without touching slot 0
  const clr = clearSlot(bank, tracks, 1);
  assert.equal(clr.cleared, true);
  assert.deepEqual(clr.unassignedTracks, [0, 1]);
  assert.equal(bank[1].loaded, false);
  assert.equal(bank[0].loaded, true);
  assert.equal(tracks[0].assignedSlot, null);
  assert.equal(tracks[1].assignedSlot, null);
  assert.equal(getLoadedCount(bank), 1);

  // Formatting helpers
  assert.equal(formatSlotNumber(0), '01');
  assert.equal(formatSlotNumber(18), '19');
  assert.equal(formatDuration(0.45), '0.45s');
  assert.equal(formatDuration(12.34), '12.3s');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(sanitizeSampleName('  /path/to/My   Beat.WAV  ', 'Fallback'), 'My Beat');
  assert.match(buildRecordingName(2, new Date(2026, 0, 1, 9, 5)), /^Mic 03 \(09:05\)$/);
});

test('PR02 sample-decoder, sample-recorder, and sample-preview error/stop semantics remain intact', async () => {
  // Decoder rejects empty file without modifying anything
  await assert.rejects(
    () => decodeFile({ name: 'empty.wav', size: 0 }, { getContext: () => ({}) }),
    (err) => err instanceof SampleDecodeError && err.code === 'EMPTY_FILE'
  );

  // Decoder rejects empty recorded blob
  await assert.rejects(
    () => decodeRecordedBlob({ size: 0 }, { getContext: () => ({}) }),
    (err) => err instanceof SampleDecodeError && err.code === 'EMPTY_CAPTURE'
  );

  // Recorder maps NotAllowedError cleanly and stops MediaStream tracks
  const mapped = mapMicrophoneError({ name: 'NotAllowedError' });
  assert.ok(mapped instanceof SampleRecordError);
  assert.equal(mapped.code, 'PERMISSION_DENIED');

  let stoppedTracks = 0;
  stopStreamTracks({ getTracks: () => [{ stop: () => { stoppedTracks++; } }, { stop: () => { stoppedTracks++; } }] });
  assert.equal(stoppedTracks, 2);

  // In Node without navigator.mediaDevices, checkRecordingSupport reports unsupported gracefully
  const support = checkRecordingSupport();
  assert.equal(support.supported, false);

  // Preview refuses empty buffer and performs click-safe stop
  const events = [];
  let sourceStoppedAt = null;
  const fakeCtx = {
    currentTime: 10,
    destination: {},
    createBufferSource: () => ({
      buffer: null,
      connect() {},
      disconnect() {},
      start() {},
      stop(when) { sourceStoppedAt = when; }
    }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {}
      },
      connect() {},
      disconnect() {}
    })
  };
  const preview = createSamplePreviewPlayer(
    { ensureRunning: async () => fakeCtx },
    { onStateChange: (ev) => events.push(ev) }
  );

  await assert.rejects(() => preview.play(0, null), /empty slot/i);
  await preview.play(3, { duration: 1.0 });
  assert.equal(preview.isPlaying(), true);
  assert.equal(preview.getPlayingSlotIndex(), 3);

  assert.equal(preview.stop(), true);
  assert.equal(preview.isPlaying(), false);
  assert.ok(sourceStoppedAt > 10, 'Preview stop should schedule click-safe fade-out');
  assert.deepEqual(events, [
    { playing: true, slotIndex: 3 },
    { playing: false, slotIndex: null }
  ]);
});

test('PR03 state factory preserves 4 modes, 64 scenes x 7 tracks x 16 steps, and automation helpers', () => {
  assert.deepEqual(DECK_MODES, ['SAMPLER', 'CHORDMATIK', 'SEQ', 'MUTATE']);
  const s = createInitialState();
  assert.equal(s.scenes.length, 64);
  assert.equal(s.scenes[0].length, 7);
  assert.equal(s.scenes[0][0].length, 16);
  assert.equal(hasTrackAutomation(0, 0, s), false);
  assert.equal(countTrackAutoSteps(0, 0, s), 0);

  s.scenes[0][0][4].autoX = 0.5;
  s.scenes[0][0][4].autoY = -0.25;
  assert.equal(hasTrackAutomation(0, 0, s), true);
  assert.equal(countTrackAutoSteps(0, 0, s), 1);
});
