/**
 * MiniMatik ミニマティック — CREATED BY H∆RBUGΛП
 * Application Bootstrap & Global Chrome Orchestrator
 *
 * Wires the 4-position rotary mode selector, 7-track selector bar, header
 * scene/BPM/audio controls, keyboard shortcuts, lifecycle cleanup, and
 * boots all feature modules.
 */
import { state, DECK_MODES } from './state.js';
import { formatSlotNumber } from './soundbank-state.js';
import { playClick } from './audio.js';
import { updateAllHUD, startPS1Display } from './display.js';
import { initMutate, renderMutateConfigUI, setJoystickPosition } from './mutate.js';
import { initSequencer, renderSequencerGrid, startTransport, stopTransport } from './sequencer.js';
import { initChordMatiK, renderChordMatiKUI, triggerChordMatiKPad } from './chordmatik.js';
import {
  initSampler,
  renderSoundbankGrid,
  updateAcquireRoutingHint,
  closeSamplerOverlay,
  isSamplerBusy,
  stopSamplePreview,
  cleanupSamplerResources
} from './sampler.js';

export function switchDeckMode(idx) {
  state.modeIndex = (idx + DECK_MODES.length) % DECK_MODES.length;
  const modeName = DECK_MODES[state.modeIndex];

  // Close non-recording overlays cleanly when navigating away from SAMPLER
  if (modeName !== 'SAMPLER' && state.samplerUI.overlayMode && !isSamplerBusy()) {
    closeSamplerOverlay();
  }

  // 4-position rotary pointer angles
  const angles = [-54, -18, 18, 54];
  document.getElementById('modeRotaryDial').style.transform = `rotate(${angles[state.modeIndex]}deg)`;

  document.querySelectorAll('.mode-tab').forEach(btn => {
    const active = btn.dataset.mode === modeName;
    btn.className = active
      ? 'mode-tab px-2 py-1 rounded-lg text-[11px] font-mono-tech font-bold cursor-pointer bg-[#d93829] text-white shadow'
      : 'mode-tab px-2 py-1 rounded-lg text-[11px] font-mono-tech font-bold cursor-pointer bg-zinc-800 text-zinc-400 hover:text-white';
  });

  document.querySelectorAll('.deck-panel').forEach(panel => {
    panel.classList.add('hidden');
    panel.classList.remove('flex');
  });
  const activePanel = document.getElementById(`deck-${modeName}`);
  activePanel.classList.remove('hidden');
  activePanel.classList.add('flex');

  updateAllHUD();
}

export function renderTrackBar() {
  const bar = document.getElementById('trackSelectorBar');
  bar.innerHTML = '';

  state.tracks.forEach((trk, idx) => {
    const isSel = idx === state.activeTrack;
    const slotObj = trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
    const slotCode = slotObj && slotObj.loaded ? `S${formatSlotNumber(trk.assignedSlot)}` : '--';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.trackIndex = String(idx);
    btn.className = `hw-btn py-1 px-0.5 rounded-lg font-mono-tech flex flex-col items-center justify-center cursor-pointer border ${
      isSel
        ? 'bg-[#222428] text-white border-black ring-2 ring-[#d93829]'
        : 'bg-[#ebe5d5] text-[#222428] border-[#b5ad96] hover:bg-white'
    }`;

    const led = trk.muted
      ? 'bg-red-500'
      : (slotObj && slotObj.loaded ? 'bg-emerald-400 shadow-[0_0_5px_#34d399]' : 'bg-zinc-400');

    btn.innerHTML = `
      <div class="flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full ${led}"></span>
        <span class="text-[10px] font-extrabold">T${trk.id}</span>
      </div>
      <span class="text-[8px] font-bold ${isSel ? 'text-amber-300' : 'text-zinc-600'}">${trk.muted ? 'MUTE' : slotCode}</span>
    `;

    btn.addEventListener('click', () => {
      if (state.activeTrack === idx) {
        trk.muted = !trk.muted;
        playClick(trk.muted ? 430 : 780);
      } else {
        state.activeTrack = idx;
        playClick(880);
      }
      renderTrackBar();
      renderSequencerGrid();
      if (state.samplerUI.overlayMode === 'acquire') {
        updateAcquireRoutingHint();
      }
      updateAllHUD();
    });

    bar.appendChild(btn);
  });
}

function bindGlobalControls() {
  const rotaryDial = document.getElementById('modeRotaryDial');
  rotaryDial.addEventListener('click', () => {
    playClick(1050, 0.03);
    switchDeckMode(state.modeIndex + 1);
  });
  rotaryDial.addEventListener('wheel', (e) => {
    e.preventDefault();
    playClick(1050, 0.02);
    switchDeckMode(state.modeIndex + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick(1000);
      switchDeckMode(DECK_MODES.indexOf(btn.dataset.mode));
    });
  });

  // Audio Toggle
  document.getElementById('audioToggleBtn').addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    document.getElementById('audioLed').className = state.audioEnabled
      ? 'w-2 h-2 rounded-full bg-emerald-400'
      : 'w-2 h-2 rounded-full bg-zinc-600';
    if (!state.audioEnabled) {
      stopSamplePreview();
    } else {
      playClick(1150);
    }
  });

  // Scene & BPM Controls
  document.getElementById('scenePrevBtn').addEventListener('click', () => {
    state.currentScene = (state.currentScene - 1 + 64) % 64;
    playClick(740);
    renderSequencerGrid();
    updateAllHUD();
  });
  document.getElementById('sceneNextBtn').addEventListener('click', () => {
    state.currentScene = (state.currentScene + 1) % 64;
    playClick(840);
    renderSequencerGrid();
    updateAllHUD();
  });
  document.getElementById('sceneJumpBtn').addEventListener('click', () => {
    state.currentScene = (state.currentScene + 8) % 64;
    playClick(940);
    renderSequencerGrid();
    updateAllHUD();
  });
  document.getElementById('bpmDownBtn').addEventListener('click', () => {
    state.bpm = Math.max(60, state.bpm - 5);
    if (state.isPlaying) startTransport();
    updateAllHUD();
  });
  document.getElementById('bpmUpBtn').addEventListener('click', () => {
    state.bpm = Math.min(200, state.bpm + 5);
    if (state.isPlaying) startTransport();
    updateAllHUD();
  });

  // Keyboard shortcuts (Escape closes non-recording overlay; 1..7 & Space guarded while overlay/recording active)
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape' && state.samplerUI.overlayMode && !isSamplerBusy()) {
      closeSamplerOverlay();
      return;
    }
    if (state.samplerUI.overlayMode || isSamplerBusy()) {
      return;
    }
    if (e.key >= '1' && e.key <= '7') {
      const deg = Number(e.key) - 1;
      const el = document.querySelector(`[data-degree="${deg}"]`);
      triggerChordMatiKPad(deg, el);
    } else if (e.code === 'Space') {
      e.preventDefault();
      state.isPlaying ? stopTransport() : startTransport();
    }
  });

  // Ensure microphone tracks and audio preview are always released on page leave
  window.addEventListener('pagehide', () => {
    cleanupSamplerResources();
  });
  window.addEventListener('beforeunload', () => {
    cleanupSamplerResources();
  });
}

function bootApp() {
  bindGlobalControls();
  initSampler({ onTracksChanged: renderTrackBar });
  initChordMatiK();
  initSequencer();
  initMutate({ onAutomationCleared: renderSequencerGrid });

  renderTrackBar();
  renderSoundbankGrid();
  renderChordMatiKUI();
  renderSequencerGrid();
  renderMutateConfigUI();
  switchDeckMode(0);
  setJoystickPosition(0, 0);
  startPS1Display();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp, { once: true });
} else {
  bootApp();
}
