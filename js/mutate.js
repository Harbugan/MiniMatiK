/**
 * MiniMatik — Mode 04 Mutate & Persistent Analog X/Y Joystick
 *
 * Handles X/Y axis target configuration, joystick pointer interaction,
 * spring/hold toggle, live motion automation capture, and CLR AUTO.
 */
import { state } from './state.js';
import { playClick } from './audio.js';
import { updateAllHUD } from './display.js';

let joystickWell = null;
let joystickCap = null;
let activeJoystickPointerId = null;

export function setJoystickPosition(nx, ny) {
  // Clamp within unit circle
  const len = Math.hypot(nx, ny);
  if (len > 1) {
    nx /= len;
    ny /= len;
  }
  state.joystick.x = nx;
  state.joystick.y = ny;

  const cap = joystickCap || document.getElementById('joystickCap');
  if (cap) {
    const maxTravelPx = 18;
    cap.style.transform = `translate(${nx * maxTravelPx}px, ${-ny * maxTravelPx}px)`;
  }

  const xStr = (nx >= 0 ? '+' : '') + nx.toFixed(2);
  const yStr = (ny >= 0 ? '+' : '') + ny.toFixed(2);
  document.getElementById('joyCoordsLabel').textContent = `X:${xStr} Y:${yStr}`;
  document.getElementById('hudXyReadout').textContent = `${xStr} / ${yStr}`;
}

export function renderMutateConfigUI() {
  document.querySelectorAll('.x-target-btn').forEach(btn => {
    const active = btn.dataset.xTarget === state.joystick.xTarget;
    btn.className = active
      ? 'x-target-btn hw-btn text-left px-2.5 py-1.5 rounded-lg font-mono-tech text-xs font-bold cursor-pointer bg-cyan-500 text-black'
      : 'x-target-btn hw-btn text-left px-2.5 py-1.5 rounded-lg font-mono-tech text-xs font-bold cursor-pointer bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
  });

  document.querySelectorAll('.y-target-btn').forEach(btn => {
    const active = btn.dataset.yTarget === state.joystick.yTarget;
    btn.className = active
      ? 'y-target-btn hw-btn text-left px-2.5 py-1.5 rounded-lg font-mono-tech text-xs font-bold cursor-pointer bg-amber-400 text-black'
      : 'y-target-btn hw-btn text-left px-2.5 py-1.5 rounded-lg font-mono-tech text-xs font-bold cursor-pointer bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
  });

  const shortX = state.joystick.xTarget.split(' ')[0];
  const shortY = state.joystick.yTarget.split(' ')[0];
  document.getElementById('joyTargetSummary').textContent = `X:${shortX} / Y:${shortY}`;
}

function handleJoystickPointer(clientX, clientY) {
  if (!joystickWell) return;
  const rect = joystickWell.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width / 2;
  const nx = (clientX - cx) / radius;
  const ny = -(clientY - cy) / radius;
  setJoystickPosition(nx, ny);

  // If Playing + Recording, record live X/Y motion onto current step immediately
  if (state.isPlaying && state.isRecording) {
    const stepObj = state.scenes[state.currentScene][state.activeTrack][state.currentStep];
    stepObj.autoX = state.joystick.x;
    stepObj.autoY = state.joystick.y;
    updateAllHUD();
  }
}

export function clearTrackAutomation(onAfterClear) {
  state.scenes[state.currentScene][state.activeTrack].forEach(st => {
    st.autoX = null;
    st.autoY = null;
  });
  if (!state.joystick.isDragging) {
    setJoystickPosition(0, 0);
  }
  playClick(380);
  if (typeof onAfterClear === 'function') {
    onAfterClear();
  }
  updateAllHUD();
}

export function initMutate({ onAutomationCleared } = {}) {
  joystickWell = document.getElementById('joystickWell');
  joystickCap = document.getElementById('joystickCap');

  if (joystickWell) {
    joystickWell.addEventListener('pointerdown', (e) => {
      if (activeJoystickPointerId !== null) return;
      e.preventDefault();
      activeJoystickPointerId = e.pointerId;
      state.joystick.isDragging = true;
      if (typeof joystickWell.setPointerCapture === 'function') {
        try { joystickWell.setPointerCapture(e.pointerId); } catch (_) {}
      }
      handleJoystickPointer(e.clientX, e.clientY);
    });

    joystickWell.addEventListener('pointermove', (e) => {
      if (!state.joystick.isDragging || e.pointerId !== activeJoystickPointerId) return;
      handleJoystickPointer(e.clientX, e.clientY);
    });

    const releaseJoystick = (e) => {
      if (e.pointerId !== activeJoystickPointerId) return;
      activeJoystickPointerId = null;
      state.joystick.isDragging = false;
      if (state.joystick.springReturn) {
        setJoystickPosition(0, 0);
      }
    };

    joystickWell.addEventListener('pointerup', releaseJoystick);
    joystickWell.addEventListener('pointercancel', releaseJoystick);
    joystickWell.addEventListener('lostpointercapture', releaseJoystick);
  }

  document.querySelectorAll('.x-target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.joystick.xTarget = btn.dataset.xTarget;
      playClick(950);
      renderMutateConfigUI();
    });
  });

  document.querySelectorAll('.y-target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.joystick.yTarget = btn.dataset.yTarget;
      playClick(950);
      renderMutateConfigUI();
    });
  });

  const handleClearAuto = () => clearTrackAutomation(onAutomationCleared);
  document.getElementById('btnMutateClearAuto').addEventListener('click', handleClearAuto);
  document.getElementById('btnFooterClrAuto').addEventListener('click', handleClearAuto);

  // Joystick Spring/Hold Toggle
  const joyHoldBtn = document.getElementById('btnJoyHoldToggle');
  joyHoldBtn.addEventListener('click', () => {
    state.joystick.springReturn = !state.joystick.springReturn;
    joyHoldBtn.textContent = state.joystick.springReturn ? 'SPRING' : 'HOLD';
    joyHoldBtn.classList.toggle('text-amber-300', !state.joystick.springReturn);
    if (state.joystick.springReturn && !state.joystick.isDragging) {
      setJoystickPosition(0, 0);
    }
    playClick(820);
  });
}
