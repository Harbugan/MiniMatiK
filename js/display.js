/**
 * MiniMatik — Global HUD Synchronization & PS1 Low-Poly 3D Software Renderer
 *
 * Updates monitor/header HUD readouts and drives the non-blocking Canvas 2D
 * GTE-style polyhedron display.
 */
import {
  state,
  DECK_MODES,
  JP_MODE_TITLES,
  MODE_DISPLAY_LABELS,
  ROOT_NOTES,
  getLoadedCount,
  countTrackAutoSteps
} from './state.js';
import { formatSlotNumber } from './soundbank-state.js';

const POLY_VERTS = [
  [0, 1.4, 0],
  [1.15, 0.25, 0],
  [0, 0.25, 1.15],
  [-1.15, 0.25, 0],
  [0, 0.25, -1.15],
  [0.85, -0.55, 0.85],
  [-0.85, -0.55, 0.85],
  [-0.85, -0.55, -0.85],
  [0.85, -0.55, -0.85],
  [0, -1.4, 0]
];

const POLY_FACES = [
  { v: [0, 1, 2], rgb: [217, 56, 41] },   // Vermilion
  { v: [0, 2, 3], rgb: [47, 128, 237] },  // Blue
  { v: [0, 3, 4], rgb: [232, 227, 213] }, // Cream
  { v: [0, 4, 1], rgb: [39, 174, 96] },   // Green
  { v: [1, 5, 2], rgb: [242, 153, 74] },  // Orange
  { v: [2, 5, 6], rgb: [56, 189, 248] },
  { v: [2, 6, 3], rgb: [217, 56, 41] },
  { v: [3, 6, 7], rgb: [168, 85, 247] },
  { v: [3, 7, 4], rgb: [39, 174, 96] },
  { v: [4, 7, 8], rgb: [250, 204, 21] },
  { v: [4, 8, 1], rgb: [47, 128, 237] },
  { v: [1, 8, 5], rgb: [232, 227, 213] },
  { v: [9, 6, 5], rgb: [217, 56, 41] },
  { v: [9, 7, 6], rgb: [47, 128, 237] },
  { v: [9, 8, 7], rgb: [39, 174, 96] },
  { v: [9, 5, 8], rgb: [242, 153, 74] }
];

let rotY = 0;
let ps1Canvas = null;
let ps1Ctx = null;
let rafRunning = false;

export function updateAllHUD() {
  const modeName = DECK_MODES[state.modeIndex];
  const loaded = getLoadedCount();
  const loadedStr = String(loaded).padStart(2, '0');
  const sceneStr = String(state.currentScene + 1).padStart(2, '0');
  const trk = state.tracks[state.activeTrack];
  const autoCount = countTrackAutoSteps(state.currentScene, state.activeTrack);

  document.getElementById('hudModeJp').textContent = JP_MODE_TITLES[modeName];
  document.getElementById('hudModeLabel').textContent = MODE_DISPLAY_LABELS[modeName];
  document.getElementById('deckJpTag').textContent = JP_MODE_TITLES[modeName];

  if (modeName === 'SAMPLER') {
    document.getElementById('deckSubTag').textContent = loaded === 0 ? '00/19 EMPTY' : `${loadedStr}/19 SLOTS`;
  } else if (modeName === 'CHORDMATIK') {
    document.getElementById('deckSubTag').textContent = `${state.chordmatik.subMode} // KEY ${ROOT_NOTES[state.chordmatik.rootIndex].name}`;
  } else if (modeName === 'SEQ') {
    document.getElementById('deckSubTag').textContent = `SCN ${sceneStr}/64`;
  } else {
    document.getElementById('deckSubTag').textContent = `AUTO ${autoCount}/16`;
  }

  document.getElementById('headerSceneDisplay').textContent = `${sceneStr}/64`;
  document.getElementById('hudSceneLabel').textContent = `SCN ${sceneStr}/64`;
  document.getElementById('headerBpmDisplay').textContent = state.bpm;
  document.getElementById('headerBankPill').textContent = `BANK ${loadedStr}/19`;

  const assignedSlotObj = trk.assignedSlot !== null ? state.soundbank[trk.assignedSlot] : null;
  const slotTag = assignedSlotObj && assignedSlotObj.loaded
    ? `S${formatSlotNumber(trk.assignedSlot)} ${assignedSlotObj.name}`
    : 'EMPTY';

  document.getElementById('hudTrackLabel').textContent = `TRK ${trk.id} [${trk.muted ? 'MUTE' : slotTag}]`;
  document.getElementById('hudTrackLabel').className = trk.muted
    ? 'text-[10px] font-bold text-red-400'
    : 'text-[10px] font-bold text-emerald-300';

  document.getElementById('routingSummaryText').textContent =
    `BANK[${loadedStr}/19] → TRK ${trk.id} [${slotTag}]`;

  document.getElementById('seqContextLabel').textContent = `SCN ${sceneStr} // TRK ${trk.id}`;
  document.getElementById('autoStepCountLabel').textContent = `AUTO STEPS: ${autoCount}/16`;

  // Automation status badge on PS1 screen + Joystick ring
  const hudAuto = document.getElementById('hudAutoStatus');
  const joyRing = document.getElementById('joystickRing');
  const joyAutoBadge = document.getElementById('joyAutoBadge');

  if (state.isPlaying && state.isRecording) {
    hudAuto.textContent = 'AUTO: REC ●';
    hudAuto.className = 'px-2 py-0.5 rounded bg-red-950 border border-red-500 text-[9px] font-bold text-red-300 animate-pulse';
    joyRing.className = 'p-1 rounded-full border-2 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]';
    joyAutoBadge.textContent = 'REC MOTION ●';
    joyAutoBadge.className = 'inline-block mt-1 px-1.5 py-0.5 rounded bg-red-600 text-[8px] font-bold text-white';
  } else if (state.isPlaying && autoCount > 0) {
    hudAuto.textContent = `AUTO: PLAY (${autoCount})`;
    hudAuto.className = 'px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500 text-[9px] font-bold text-emerald-300';
    joyRing.className = 'p-1 rounded-full border-2 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]';
    joyAutoBadge.textContent = 'AUTO PLAYING';
    joyAutoBadge.className = 'inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-600 text-[8px] font-bold text-white';
  } else if (autoCount > 0) {
    hudAuto.textContent = `AUTO: ARMED (${autoCount})`;
    hudAuto.className = 'px-2 py-0.5 rounded bg-zinc-900 border border-emerald-500/50 text-[9px] font-bold text-emerald-400';
    joyRing.className = 'p-1 rounded-full border-2 border-emerald-500/60';
    joyAutoBadge.textContent = `STORED (${autoCount}/16)`;
    joyAutoBadge.className = 'inline-block mt-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-bold text-emerald-300';
  } else {
    hudAuto.textContent = 'AUTO: OFF';
    hudAuto.className = 'px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[9px] font-bold text-zinc-400';
    joyRing.className = 'p-1 rounded-full border-2 border-zinc-600';
    joyAutoBadge.textContent = 'MANUAL LIVE';
    joyAutoBadge.className = 'inline-block mt-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-bold text-zinc-400';
  }

  // Transport / Mic Capture / Sample Preview badge on PS1 screen
  const stateBadge = document.getElementById('hudStateBadge');
  if (state.samplerUI.recordStatus === 'recording') {
    stateBadge.textContent = `● MIC REC // S${formatSlotNumber(state.samplerUI.targetSlot)}`;
    stateBadge.className = 'bg-red-600 text-white px-2 py-0.5 rounded font-bold tracking-wide animate-pulse';
  } else if (state.samplerUI.recordStatus === 'requesting') {
    stateBadge.textContent = 'MIC PERMISSION...';
    stateBadge.className = 'bg-amber-500 text-black px-2 py-0.5 rounded font-bold tracking-wide';
  } else if (state.samplerUI.previewSlot !== null) {
    stateBadge.textContent = `▶ PREVIEW // S${formatSlotNumber(state.samplerUI.previewSlot)}`;
    stateBadge.className = 'bg-[#2f80ed] text-white px-2 py-0.5 rounded font-bold tracking-wide';
  } else if (state.isRecording) {
    stateBadge.textContent = `● LIVE REC // STEP ${String(state.currentStep + 1).padStart(2, '0')}`;
    stateBadge.className = 'bg-red-600 text-white px-2 py-0.5 rounded font-bold tracking-wide animate-pulse';
  } else if (state.isPlaying) {
    stateBadge.textContent = `▶ STEP ${String(state.currentStep + 1).padStart(2, '0')}/16 // ${state.bpm}`;
    stateBadge.className = 'bg-emerald-600 text-white px-2 py-0.5 rounded font-bold tracking-wide';
  } else {
    stateBadge.textContent = `READY // ${state.bpm} BPM`;
    stateBadge.className = 'bg-[#d93829] text-white px-2 py-0.5 rounded font-bold tracking-wide';
  }
}

export function showChordCallout(label) {
  const banner = document.getElementById('hudCenterCallout');
  document.getElementById('hudChordBigText').textContent = label;
  banner.classList.remove('hidden');
  clearTimeout(state.chordCalloutTimer);
  state.chordCalloutTimer = setTimeout(() => banner.classList.add('hidden'), 1000);
}

function animatePS1Display(nowMs) {
  if (!ps1Canvas || !ps1Ctx) return;

  const w = ps1Canvas.width;
  const h = ps1Canvas.height;
  const t = nowMs * 0.001;

  state.visualPulse *= 0.89;
  const jx = state.joystick.x;
  const jy = state.joystick.y;
  const joyMag = Math.min(1, Math.hypot(jx, jy));

  // 1. 90s Japanese PS1 Horizon Gradient
  const sky = ps1Ctx.createLinearGradient(0, 0, 0, h);
  if (state.isRecording || joyMag > 0.72) {
    sky.addColorStop(0, '#290808');
    sky.addColorStop(0.55, '#471010');
    sky.addColorStop(1, '#08090c');
  } else {
    sky.addColorStop(0, '#070f1f');
    sky.addColorStop(0.55, '#122747');
    sky.addColorStop(1, '#070a12');
  }
  ps1Ctx.fillStyle = sky;
  ps1Ctx.fillRect(0, 0, w, h);

  // 2. Retro Perspective Floor Grid
  ps1Ctx.strokeStyle = state.isPlaying ? 'rgba(56, 189, 248, 0.36)' : 'rgba(120, 155, 200, 0.22)';
  ps1Ctx.lineWidth = 1;
  const horizon = h * 0.56;
  const zScroll = (t * (state.isPlaying ? state.bpm / 45 : 0.35)) % 1;

  for (let i = -6; i <= 6; i++) {
    ps1Ctx.beginPath();
    ps1Ctx.moveTo(w / 2 + i * 11, horizon);
    ps1Ctx.lineTo(w / 2 + i * 52, h);
    ps1Ctx.stroke();
  }
  for (let r = 0; r < 6; r++) {
    const p = (r + zScroll) / 6;
    const y = Math.round(horizon + Math.pow(p, 1.7) * (h - horizon));
    ps1Ctx.beginPath();
    ps1Ctx.moveTo(0, y);
    ps1Ctx.lineTo(w, y);
    ps1Ctx.stroke();
  }

  // 3. 19-Slot Soundbank Orbit Ring (Wireframe for 0/19 empty, solid for loaded)
  const loadedCount = getLoadedCount();
  for (let i = 0; i < 19; i++) {
    const theta = (i / 19) * Math.PI * 2 + t * 0.6;
    const ox = Math.round(w / 2 + Math.cos(theta) * 85);
    const oy = Math.round(h / 2 + Math.sin(theta) * 28);
    const slot = state.soundbank[i];

    if (slot.loaded) {
      ps1Ctx.fillStyle = slot.color;
      ps1Ctx.fillRect(ox - 3, oy - 3, 6, 6);
      ps1Ctx.strokeStyle = '#ffffff';
      ps1Ctx.strokeRect(ox - 3, oy - 3, 6, 6);
    } else {
      ps1Ctx.strokeStyle = 'rgba(148, 163, 184, 0.36)';
      ps1Ctx.strokeRect(ox - 2, oy - 2, 4, 4);
    }
  }

  // 4. Low-Poly 3D Polyhedron warped in real time by X/Y Joystick & Automation
  rotY += 0.018 * (state.isPlaying ? 1.8 : 0.75) + jx * 0.045;
  const rotX = 0.35 + Math.sin(t * 1.2) * 0.16 + jy * 0.65;
  const meshScale = 37 + state.visualPulse * 12 + loadedCount * 0.35;

  const projected = POLY_VERTS.map((v, idx) => {
    let [x, y, z] = v;

    if (joyMag > 0.04) {
      x += Math.sin(t * 7 + idx * 1.7) * jx * 0.52;
      y += Math.cos(t * 6 + idx * 1.3) * jy * 0.48;
      z += Math.sin(t * 5 + idx) * joyMag * 0.32;
    }

    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = x * cosY - z * sinY;
    const z1 = z * cosY + x * sinY;

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = z1 * cosX + y * sinX;

    const fov = 4.2;
    const persp = fov / (fov + z2 + 2.2);
    const snap = joyMag > 0.6 ? 2.5 : 1.5;

    return {
      x: Math.round((w / 2 + x1 * meshScale * persp) / snap) * snap,
      y: Math.round((h / 2 - y2 * meshScale * persp) / snap) * snap,
      z: z2
    };
  });

  const sortedFaces = POLY_FACES.map(f => {
    const v0 = projected[f.v[0]];
    const v1 = projected[f.v[1]];
    const v2 = projected[f.v[2]];
    return { f, v0, v1, v2, z: (v0.z + v1.z + v2.z) / 3 };
  }).sort((a, b) => b.z - a.z);

  sortedFaces.forEach(({ f, v0, v1, v2, z }) => {
    const cross = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    if (cross < 0) return;

    const shade = Math.max(0.35, Math.min(1.25, 0.95 - z * 0.25 + state.visualPulse * 0.3));
    const r = Math.min(255, Math.round(f.rgb[0] * shade));
    const g = Math.min(255, Math.round(f.rgb[1] * shade));
    const b = Math.min(255, Math.round(f.rgb[2] * shade));

    ps1Ctx.beginPath();
    ps1Ctx.moveTo(v0.x, v0.y);
    ps1Ctx.lineTo(v1.x, v1.y);
    ps1Ctx.lineTo(v2.x, v2.y);
    ps1Ctx.closePath();

    if (loadedCount === 0 && DECK_MODES[state.modeIndex] === 'SAMPLER') {
      ps1Ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
      ps1Ctx.fill();
      ps1Ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ps1Ctx.lineWidth = 1;
      ps1Ctx.stroke();
    } else {
      ps1Ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ps1Ctx.fill();
      ps1Ctx.strokeStyle = 'rgba(10, 15, 28, 0.65)';
      ps1Ctx.lineWidth = 1;
      ps1Ctx.stroke();
    }
  });

  requestAnimationFrame(animatePS1Display);
}

export function startPS1Display() {
  ps1Canvas = document.getElementById('ps1Canvas');
  if (!ps1Canvas) return;
  ps1Ctx = ps1Canvas.getContext('2d');
  if (!ps1Ctx || rafRunning) return;
  rafRunning = true;
  requestAnimationFrame(animatePS1Display);
}
