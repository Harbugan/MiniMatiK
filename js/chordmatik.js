/**
 * MiniMatik — Mode 02 ChordMatiK (7-Button HiChord-Style Performance Surface)
 *
 * Preserves existing legacy ChordMatiK behavior, submodes (CHORD/NOTE/DRUM),
 * key/octave controls, modifier pad, and live recording into SEQ-16 steps.
 */
import { state, ROOT_NOTES, DIATONIC_DEGREES, NOTE_NAMES } from './state.js';
import { playClick, playMutatedVoice } from './audio.js';
import { updateAllHUD, showChordCallout } from './display.js';
import { renderSequencerGrid } from './sequencer.js';

export function renderChordMatiKUI() {
  const rootWrap = document.getElementById('keyRootButtons');
  rootWrap.innerHTML = '';
  ROOT_NOTES.forEach((r, idx) => {
    const b = document.createElement('button');
    const active = idx === state.chordmatik.rootIndex;
    b.className = `px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
      active ? 'bg-[#d93829] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
    }`;
    b.textContent = r.name;
    b.addEventListener('click', () => {
      state.chordmatik.rootIndex = idx;
      playClick(850);
      renderChordMatiKUI();
      updateAllHUD();
    });
    rootWrap.appendChild(b);
  });

  document.querySelectorAll('.cm-submode-btn').forEach(btn => {
    const active = btn.dataset.cmMode === state.chordmatik.subMode;
    btn.className = active
      ? 'cm-submode-btn px-2 py-1 rounded font-bold cursor-pointer bg-amber-300 text-black'
      : 'cm-submode-btn px-2 py-1 rounded font-bold cursor-pointer text-zinc-400 hover:text-white';
  });

  const rootSemi = ROOT_NOTES[state.chordmatik.rootIndex].semi;
  DIATONIC_DEGREES.forEach((deg, idx) => {
    const lbl = document.getElementById(`degLabel-${idx}`);
    if (!lbl) return;
    const noteName = NOTE_NAMES[(rootSemi + deg.offset) % 12];
    if (state.chordmatik.subMode === 'DRUM') {
      const drums = ['KICK', 'SNARE', 'HAT', 'CLAP', 'TOM', 'RIM', 'CRASH'];
      lbl.textContent = drums[idx];
    } else if (state.chordmatik.subMode === 'NOTE') {
      lbl.textContent = `${noteName}${state.chordmatik.octave}`;
    } else {
      let suffix = deg.suffix;
      if (state.chordmatik.activeMod === 'INV') suffix = deg.quality === 'maj' ? 'm' : '';
      if (state.chordmatik.activeMod === '7TH') suffix += '7';
      if (state.chordmatik.activeMod === 'SUS4') suffix = 'sus4';
      if (state.chordmatik.activeMod === '9TH') suffix += '9';
      lbl.textContent = `${noteName}${suffix}`;
    }
  });

  document.querySelectorAll('.cm-mod-btn').forEach(btn => {
    const active = btn.dataset.mod === state.chordmatik.activeMod;
    btn.classList.toggle('ring-2', active);
    btn.classList.toggle('ring-amber-300', active);
    btn.classList.toggle('bg-zinc-700', active);
  });

  document.getElementById('cmOctLabel').textContent = `OCT ${state.chordmatik.octave}`;
  updateAllHUD();
}

export function triggerChordMatiKPad(degreeIdx, el = null) {
  const rootSemi = ROOT_NOTES[state.chordmatik.rootIndex].semi;
  const deg = DIATONIC_DEGREES[degreeIdx];
  const baseMidi = (state.chordmatik.octave + 1) * 12 + rootSemi + deg.offset;
  const noteName = NOTE_NAMES[(rootSemi + deg.offset) % 12];

  let midiList = [];
  let label = '';

  if (state.chordmatik.subMode === 'DRUM') {
    const drumNames = ['909 KICK', '808 SNARE', 'CLOSED HAT', 'SYN CLAP', 'LOW TOM', 'RIMSHOT', 'CYMBAL'];
    midiList = [36 + degreeIdx * 4];
    label = drumNames[degreeIdx];
    playMutatedVoice(midiList, 0.16, degreeIdx % 2 === 0 ? 'sine' : 'sawtooth');
  } else if (state.chordmatik.subMode === 'NOTE') {
    midiList = [baseMidi];
    label = `NOTE ${noteName}${state.chordmatik.octave}`;
    playMutatedVoice(midiList, 0.34);
  } else {
    let quality = deg.quality;
    if (state.chordmatik.activeMod === 'INV') {
      quality = quality === 'maj' ? 'min' : 'maj';
    }
    let third = quality === 'maj' ? 4 : 3;
    let fifth = quality === 'dim' ? 6 : 7;
    label = `${noteName}${quality === 'min' ? 'm' : (quality === 'dim' ? '°' : ' MAJ')}`;

    if (state.chordmatik.activeMod === 'SUS4') {
      third = 5;
      label = `${noteName}sus4`;
    }

    midiList = [baseMidi, baseMidi + third, baseMidi + fifth];

    if (state.chordmatik.activeMod === '7TH') {
      midiList.push(baseMidi + (quality === 'maj' ? 11 : 10));
      label = `${noteName}${quality === 'maj' ? 'maj7' : 'm7'}`;
    } else if (state.chordmatik.activeMod === '9TH') {
      midiList.push(baseMidi + 14);
      label = `${noteName}${quality === 'min' ? 'm9' : 'add9'}`;
    }

    playMutatedVoice(midiList, 0.45);
  }

  state.chordmatik.lastVoicingName = label;
  document.getElementById('cmVoicingReadout').textContent = `VOICING: ${label}`;

  // Show crisp callout on PS1 display
  showChordCallout(label);

  // Live Record into current step of active Track & Scene
  if (state.isRecording) {
    const stepObj = state.scenes[state.currentScene][state.activeTrack][state.currentStep];
    stepObj.active = true;
    stepObj.midiNotes = [...midiList];
    renderSequencerGrid();
  }

  if (el) {
    el.classList.add('key-fired');
    setTimeout(() => el.classList.remove('key-fired'), 140);
  }
}

export function initChordMatiK() {
  document.querySelectorAll('[data-degree]').forEach(pad => {
    pad.addEventListener('pointerdown', () => {
      triggerChordMatiKPad(Number(pad.dataset.degree), pad);
    });
  });

  document.querySelectorAll('.cm-submode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.chordmatik.subMode = btn.dataset.cmMode;
      playClick(900);
      renderChordMatiKUI();
    });
  });

  document.querySelectorAll('.cm-mod-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = btn.dataset.mod;
      state.chordmatik.activeMod = state.chordmatik.activeMod === mod ? null : mod;
      playClick(980);
      renderChordMatiKUI();
    });
  });

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
}
