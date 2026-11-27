/**
 * MiniMatik — Mode 03 SEQ-16 Grid, Sequencer Clock & Transport Controls
 *
 * Preserves 64 scenes x 7 tracks x 16 steps editing, random pattern generation,
 * scene copy, transport PLAY/STOP/LIVE REC, and step-resolution X/Y automation replay.
 */
import { state, ROOT_NOTES } from './state.js';
import { playClick, playMutatedVoice } from './audio.js';
import { updateAllHUD } from './display.js';
import { setJoystickPosition } from './mutate.js';

export function renderSequencerGrid() {
  const grid = document.getElementById('sequencerStepGrid');
  grid.innerHTML = '';

  const steps = state.scenes[state.currentScene][state.activeTrack];

  steps.forEach((stepData, i) => {
    const isPlayhead = state.isPlaying && state.currentStep === i;
    const isQuarter = i % 4 === 0;
    const hasAuto = stepData.autoX !== null || stepData.autoY !== null;

    const btn = document.createElement('button');
    btn.className = `hw-btn h-12 sm:h-14 rounded-xl font-mono-tech text-xs font-extrabold flex flex-col items-center justify-between p-1.5 cursor-pointer border ${
      stepData.active
        ? 'bg-[#d93829] text-white border-amber-300'
        : (isQuarter ? 'bg-zinc-700 text-zinc-200 border-zinc-600' : 'bg-zinc-800 text-zinc-400 border-zinc-700')
    } ${isPlayhead ? 'ring-2 ring-cyan-300 scale-[1.03]' : ''}`;

    const topLed = isPlayhead
      ? 'bg-cyan-300 shadow-[0_0_8px_#67e8f9]'
      : (stepData.active ? 'bg-amber-300' : 'bg-zinc-950');

    const autoDot = hasAuto
      ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" title="Recorded X/Y Automation"></span>`
      : `<span class="w-1.5 h-1.5"></span>`;

    btn.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <span class="w-2 h-2 rounded-full ${topLed}"></span>
        ${autoDot}
      </div>
      <span>${String(i + 1).padStart(2, '0')}</span>
    `;

    btn.addEventListener('click', () => {
      stepData.active = !stepData.active;
      if (stepData.active) {
        const defaultMidi = [48 + ROOT_NOTES[state.chordmatik.rootIndex].semi + (state.activeTrack * 3)];
        stepData.midiNotes = defaultMidi;
        playMutatedVoice(defaultMidi, 0.2);
      } else {
        stepData.midiNotes = null;
        playClick(480);
      }
      renderSequencerGrid();
    });

    grid.appendChild(btn);
  });
}

export function updateTransportIndicators() {
  const led = document.getElementById('transportLed');
  const lbl = document.getElementById('transportStatusLabel');

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
}

export function executeStepTick() {
  const sceneTracks = state.scenes[state.currentScene];
  const activeTrackStep = sceneTracks[state.activeTrack][state.currentStep];

  // 1. Handle X/Y Automation Record or Playback on Active Track
  if (state.isRecording && state.joystick.isDragging) {
    activeTrackStep.autoX = state.joystick.x;
    activeTrackStep.autoY = state.joystick.y;
  } else if (!state.joystick.isDragging && activeTrackStep.autoX !== null && activeTrackStep.autoY !== null) {
    // Playback stored X/Y automation visually and sonically!
    setJoystickPosition(activeTrackStep.autoX, activeTrackStep.autoY);
  }

  // 2. Trigger audio for all unmuted tracks with active steps
  let anyHit = false;
  sceneTracks.forEach((trackSteps, trkIdx) => {
    const stepObj = trackSteps[state.currentStep];
    if (stepObj.active && !state.tracks[trkIdx].muted) {
      anyHit = true;
      const notes = stepObj.midiNotes || [48 + ROOT_NOTES[state.chordmatik.rootIndex].semi + trkIdx * 4];
      playMutatedVoice(notes, 0.18, trkIdx % 2 === 0 ? 'triangle' : 'square');
    }
  });

  if (anyHit) state.visualPulse = 1.0;

  renderSequencerGrid();
  updateAllHUD();
  state.currentStep = (state.currentStep + 1) % 16;
}

export function startTransport() {
  stopTransport(false);
  state.isPlaying = true;
  state.currentStep = 0;
  executeStepTick();
  const stepMs = (60 / state.bpm / 4) * 1000;
  state.stepTimer = setInterval(executeStepTick, stepMs);
  updateTransportIndicators();
}

export function stopTransport(resetStep = true) {
  if (state.stepTimer) {
    clearInterval(state.stepTimer);
    state.stepTimer = null;
  }
  state.isPlaying = false;
  state.isRecording = false;
  if (resetStep) state.currentStep = 0;
  if (!state.joystick.isDragging && state.joystick.springReturn) {
    setJoystickPosition(0, 0);
  }
  updateTransportIndicators();
  renderSequencerGrid();
  updateAllHUD();
}

export function initSequencer() {
  // Sequencer Buttons
  document.getElementById('btnRndSteps').addEventListener('click', () => {
    const steps = state.scenes[state.currentScene][state.activeTrack];
    const rootSemi = ROOT_NOTES[state.chordmatik.rootIndex].semi;
    steps.forEach((st, i) => {
      st.active = Math.random() > (i % 4 === 0 ? 0.25 : 0.72);
      st.midiNotes = st.active ? [48 + rootSemi + (i % 7) * 2] : null;
    });
    playMutatedVoice([60, 67], 0.18);
    renderSequencerGrid();
  });

  document.getElementById('btnCopySceneNext').addEventListener('click', () => {
    const nextScene = (state.currentScene + 1) % 64;
    state.scenes[nextScene] = state.scenes[state.currentScene].map(trk =>
      trk.map(st => ({
        active: st.active,
        midiNotes: st.midiNotes ? [...st.midiNotes] : null,
        autoX: st.autoX,
        autoY: st.autoY
      }))
    );
    state.currentScene = nextScene;
    playClick(1100);
    renderSequencerGrid();
    updateAllHUD();
  });

  document.getElementById('btnClearSteps').addEventListener('click', () => {
    state.scenes[state.currentScene][state.activeTrack].forEach(st => {
      st.active = false;
      st.midiNotes = null;
    });
    playClick(380);
    renderSequencerGrid();
  });

  // Transport Controls
  document.getElementById('btnPlay').addEventListener('click', () => {
    if (!state.isPlaying) startTransport();
  });

  document.getElementById('btnStop').addEventListener('click', () => {
    stopTransport(true);
    playClick(400);
  });

  document.getElementById('btnLiveRec').addEventListener('click', () => {
    state.isRecording = !state.isRecording;
    if (state.isRecording && !state.isPlaying) {
      startTransport();
      state.isRecording = true;
    }
    playClick(state.isRecording ? 1280 : 520);
    updateTransportIndicators();
    updateAllHUD();
  });
}
