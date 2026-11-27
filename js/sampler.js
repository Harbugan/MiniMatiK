/**
 * MiniMatik — Mode 01 Sampler UI & PR02 Real Soundbank Integration
 *
 * Integrates PR02 soundbank-state, sample-decoder, sample-recorder, and
 * sample-preview modules for real file import, microphone capture, Web Audio
 * preview, hybrid/manual track assignment, and confirmed slot clearing.
 */
import { state, getLoadedCount } from './state.js';
import {
  formatSlotNumber,
  formatDuration,
  buildRecordingName,
  getTracksForSlot,
  storeSampleInSlot,
  assignSlotToTrack,
  clearSlot
} from './soundbank-state.js';
import { decodeFile, decodeRecordedBlob } from './sample-decoder.js';
import { checkRecordingSupport, createRecorderController } from './sample-recorder.js';
import { createSamplePreviewPlayer } from './sample-preview.js';
import { audioCtxManager } from './audio.js';
import { updateAllHUD } from './display.js';

let onTracksChangedCallback = () => {};
let importCancelFallbackTimer = null;

function formatRecordTimer(ms) {
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

const samplePreview = createSamplePreviewPlayer(audioCtxManager, {
  onStateChange: ({ playing, slotIndex }) => {
    state.samplerUI.previewSlot = playing ? slotIndex : null;
    renderSoundbankGrid();
    updateAllHUD();
  }
});

const sampleRecorder = createRecorderController({
  onStateChange: (recStatus) => {
    state.samplerUI.recordStatus = recStatus;
    updateRecordingOverlayState();
    updateAllHUD();
  },
  onTick: (elapsedMs) => {
    state.samplerUI.recordElapsedMs = elapsedMs;
    const timerEl = document.getElementById('recordTimerDisplay');
    if (timerEl) {
      timerEl.textContent = formatRecordTimer(elapsedMs);
    }
  }
});

export function isSamplerBusy() {
  return sampleRecorder.isBusy() || state.samplerUI.isDecoding;
}

export function stopSamplePreview() {
  samplePreview.stop();
}

export function cleanupSamplerResources() {
  sampleRecorder.forceCleanup();
  samplePreview.stop();
}

export function setSamplerFeedback(message, tone = 'neutral') {
  state.samplerUI.feedbackText = message;
  state.samplerUI.feedbackTone = tone;
  const el = document.getElementById('samplerFeedbackText');
  if (!el) return;
  el.textContent = message;
  el.title = message;

  const toneClasses = {
    neutral: 'truncate text-zinc-400',
    success: 'truncate text-emerald-400 font-bold',
    warn: 'truncate text-amber-300 font-bold',
    error: 'truncate text-red-400 font-bold'
  };
  el.className = toneClasses[tone] || toneClasses.neutral;
}

export function updateSamplerActionButtons() {
  const sel = state.soundbank[state.selectedSlot];
  const isLoaded = Boolean(sel && sel.loaded && sel.buffer);
  const isPreviewingSel = state.samplerUI.previewSlot === state.selectedSlot;
  const busy = isSamplerBusy();

  const btnAcquire = document.getElementById('btnAcquireSlot');
  const btnPreview = document.getElementById('btnPreviewSample');
  const btnAssign = document.getElementById('btnAssignSlot');
  const btnClear = document.getElementById('btnClearSlot');

  if (isLoaded) {
    btnAcquire.classList.add('hidden');
  } else {
    btnAcquire.classList.remove('hidden');
    btnAcquire.disabled = busy;
  }

  btnPreview.disabled = !isLoaded || busy;
  if (isLoaded && !busy) {
    if (isPreviewingSel) {
      btnPreview.textContent = '■ STOP';
      btnPreview.className = 'hw-btn bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg cursor-pointer';
    } else {
      btnPreview.textContent = '▶ PREVIEW';
      btnPreview.className = 'hw-btn bg-[#27ae60] hover:bg-[#2ecc71] text-white text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg cursor-pointer';
    }
  } else {
    btnPreview.textContent = '▶ PREVIEW';
    btnPreview.className = 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg cursor-not-allowed';
  }

  btnAssign.disabled = !isLoaded || busy;
  btnAssign.className = (isLoaded && !busy)
    ? 'hw-btn bg-[#2f80ed] hover:bg-[#3d8ef8] text-white text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg cursor-pointer'
    : 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg cursor-not-allowed';

  btnClear.disabled = !isLoaded || busy;
  btnClear.className = (isLoaded && !busy)
    ? 'hw-btn bg-zinc-700 hover:bg-[#d93829] text-zinc-100 text-[11px] font-mono-tech font-bold px-2 py-1 rounded-lg cursor-pointer'
    : 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 text-[11px] font-mono-tech font-bold px-2 py-1 rounded-lg cursor-not-allowed';
}

export function renderSoundbankGrid() {
  const grid = document.getElementById('soundbankGrid');
  grid.innerHTML = '';

  const loadedCount = getLoadedCount();
  const sel = state.soundbank[state.selectedSlot];
  document.getElementById('samplerSlotId').textContent = formatSlotNumber(state.selectedSlot);

  const slotStateEl = document.getElementById('samplerSlotState');
  if (sel.loaded && sel.buffer) {
    const durStr = formatDuration(sel.duration);
    const srcTag = sel.sourceType === 'record' ? 'MIC' : 'FILE';
    const assignedTracks = getTracksForSlot(state.tracks, state.selectedSlot);
    const trkSuffix = assignedTracks.length > 0
      ? ` → ${assignedTracks.map(t => `T${t + 1}`).join(',')}`
      : '';
    slotStateEl.textContent = `${sel.name} (${durStr} · ${srcTag}${trkSuffix})`;
    slotStateEl.className = 'text-emerald-400 font-bold truncate';
  } else {
    slotStateEl.textContent = `EMPTY (${String(loadedCount).padStart(2, '0')}/19)`;
    slotStateEl.className = 'text-zinc-400 truncate';
  }

  document.getElementById('ramUsageText').textContent =
    `SOUNDBANK: ${String(loadedCount).padStart(2, '0')}/19`;

  updateSamplerActionButtons();

  state.soundbank.forEach((slot, idx) => {
    const isSel = idx === state.selectedSlot;
    const isPreviewing = state.samplerUI.previewSlot === idx;
    const assignedTracks = getTracksForSlot(state.tracks, idx);
    const slotNum = formatSlotNumber(idx);

    const pad = document.createElement('button');
    pad.type = 'button';
    pad.dataset.slotIndex = String(idx);
    pad.dataset.slotLoaded = slot.loaded ? 'true' : 'false';
    pad.setAttribute('aria-label', slot.loaded
      ? `Slot ${slotNum}: ${slot.name}`
      : `Slot ${slotNum}: Empty`);

    pad.className = `hw-btn p-1.5 rounded-xl font-mono-tech text-left flex flex-col justify-between h-12 sm:h-13 cursor-pointer border ${
      isPreviewing
        ? 'ring-2 ring-emerald-400 border-emerald-300 bg-zinc-700'
        : (isSel
          ? 'ring-2 ring-amber-300 border-white ' + (slot.loaded ? 'bg-zinc-700' : 'bg-zinc-800')
          : (slot.loaded ? 'bg-zinc-800 border-zinc-600 hover:bg-zinc-700' : 'bg-[#16181c] border-zinc-800 hover:border-zinc-600'))
    }`;

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between w-full gap-1';

    const numSpan = document.createElement('span');
    numSpan.className = `text-[10px] font-extrabold ${slot.loaded ? 'text-white' : 'text-zinc-500'}`;
    numSpan.textContent = slotNum;
    topRow.appendChild(numSpan);

    const rightMeta = document.createElement('div');
    rightMeta.className = 'flex items-center gap-1';

    if (slot.loaded && assignedTracks.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'text-[7px] font-extrabold px-1 rounded bg-black/60 text-amber-300 leading-tight';
      badge.textContent = assignedTracks.length === 1
        ? `T${assignedTracks[0] + 1}`
        : `T${assignedTracks[0] + 1}+`;
      rightMeta.appendChild(badge);
    }

    const dot = document.createElement('span');
    if (isPreviewing) {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse';
    } else if (slot.loaded) {
      dot.className = 'w-2 h-2 rounded-full';
      dot.style.background = slot.color;
      dot.style.boxShadow = `0 0 6px ${slot.color}`;
    } else {
      dot.className = 'w-2 h-2 rounded-full border border-zinc-600';
    }
    rightMeta.appendChild(dot);
    topRow.appendChild(rightMeta);

    const nameRow = document.createElement('div');
    nameRow.className = `text-[8px] truncate w-full ${slot.loaded ? 'text-amber-300 font-bold' : 'text-zinc-600'}`;
    nameRow.textContent = slot.loaded ? slot.name : 'EMPTY';

    pad.appendChild(topRow);
    pad.appendChild(nameRow);

    pad.addEventListener('click', () => {
      if (isSamplerBusy()) return;

      state.selectedSlot = idx;
      if (!slot.loaded) {
        renderSoundbankGrid();
        updateAllHUD();
        openSamplerOverlay('acquire', idx);
        return;
      }

      // Selecting a loaded slot does NOT overwrite track routing or play fake oscillator audio.
      setSamplerFeedback(
        `Selected S${slotNum} "${slot.name}" (${formatDuration(slot.duration)}) — tap PREVIEW, ASSIGN, or CLR.`,
        'neutral'
      );
      renderSoundbankGrid();
      updateAllHUD();
    });

    grid.appendChild(pad);
  });
}

export function updateAcquireRoutingHint() {
  const hintEl = document.getElementById('acquireRoutingHint');
  if (!hintEl) return;
  const activeTrk = state.tracks[state.activeTrack];
  if (activeTrk.assignedSlot === null) {
    hintEl.textContent = `Active track T${activeTrk.id} is empty — new sample will auto-assign to T${activeTrk.id}.`;
  } else {
    const existingCode = `S${formatSlotNumber(activeTrk.assignedSlot)}`;
    hintEl.textContent = `Active track T${activeTrk.id} already uses ${existingCode} — routing will be preserved until ASSIGN.`;
  }
}

function updateRecordingOverlayState() {
  const status = state.samplerUI.recordStatus;
  const led = document.getElementById('samplerOverlayLed');
  const statusText = document.getElementById('recordStatusText');
  const statusSub = document.getElementById('recordStatusSub');
  const stopBtn = document.getElementById('btnRecordStop');
  const cancelBtn = document.getElementById('btnRecordCancel');
  const closeBtn = document.getElementById('samplerOverlayCloseBtn');

  if (state.samplerUI.overlayMode !== 'record') return;

  if (status === 'requesting') {
    led.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0';
    statusText.textContent = 'REQUESTING MICROPHONE...';
    statusText.className = 'text-xs font-extrabold text-amber-300 tracking-wider';
    statusSub.textContent = 'Allow microphone access when prompted';
    stopBtn.disabled = true;
    stopBtn.className = 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 py-2.5 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-not-allowed';
    cancelBtn.disabled = false;
    closeBtn.classList.add('hidden');
  } else if (status === 'recording') {
    led.className = 'w-2.5 h-2.5 rounded-full bg-red-500 rec-blink shrink-0';
    statusText.textContent = '● RECORDING LIVE';
    statusText.className = 'text-xs font-extrabold text-red-400 tracking-wider';
    statusSub.textContent = 'Tap Stop to finish and decode capture';
    stopBtn.disabled = false;
    stopBtn.className = 'hw-btn bg-[#27ae60] hover:bg-[#2ecc71] text-white py-2.5 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-pointer';
    cancelBtn.disabled = false;
    closeBtn.classList.add('hidden');
  } else if (status === 'stopping') {
    led.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0';
    statusText.textContent = 'STOPPING CAPTURE...';
    statusText.className = 'text-xs font-extrabold text-cyan-300 tracking-wider';
    statusSub.textContent = 'Releasing microphone and decoding audio';
    stopBtn.disabled = true;
    stopBtn.className = 'hw-btn bg-zinc-800 text-zinc-500 border border-zinc-700 py-2.5 px-3 rounded-xl text-xs font-extrabold tracking-wider cursor-not-allowed';
    cancelBtn.disabled = true;
    closeBtn.classList.add('hidden');
  }
}

export function openSamplerOverlay(mode, slotIdx) {
  state.samplerUI.overlayMode = mode;
  state.samplerUI.targetSlot = slotIdx;

  const overlay = document.getElementById('samplerOverlay');
  const titleEl = document.getElementById('samplerOverlayTitle');
  const ledEl = document.getElementById('samplerOverlayLed');
  const closeBtn = document.getElementById('samplerOverlayCloseBtn');

  const views = ['overlayViewAcquire', 'overlayViewRecord', 'overlayViewAssign', 'overlayViewClear', 'overlayViewDecoding'];
  views.forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.classList.remove('flex');
  });

  const slotNum = formatSlotNumber(slotIdx);
  const slot = state.soundbank[slotIdx];

  overlay.classList.remove('hidden');

  if (mode === 'acquire') {
    titleEl.textContent = `SLOT ${slotNum} // EMPTY`;
    ledEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-300 shrink-0';
    closeBtn.classList.remove('hidden');
    document.getElementById('acquireSubtitle').textContent = `Add a real sample into Slot ${slotNum}:`;
    updateAcquireRoutingHint();
    const v = document.getElementById('overlayViewAcquire');
    v.classList.remove('hidden');
    v.classList.add('flex');
  } else if (mode === 'record') {
    titleEl.textContent = `MIC CAPTURE // SLOT ${slotNum}`;
    closeBtn.classList.add('hidden');
    document.getElementById('recordTimerDisplay').textContent = '00:00.0';
    const v = document.getElementById('overlayViewRecord');
    v.classList.remove('hidden');
    v.classList.add('flex');
    updateRecordingOverlayState();
  } else if (mode === 'assign') {
    titleEl.textContent = `ASSIGN S${slotNum} → TRACK`;
    ledEl.className = 'w-2.5 h-2.5 rounded-full bg-[#2f80ed] shrink-0';
    closeBtn.classList.remove('hidden');
    document.getElementById('assignSubtitle').textContent = `Route "${slot.name}" to track T1–T7:`;

    const trackGrid = document.getElementById('assignTrackGrid');
    trackGrid.innerHTML = '';
    state.tracks.forEach((trk, trkIdx) => {
      const isAlreadyHere = trk.assignedSlot === slotIdx;
      const hasOther = trk.assignedSlot !== null && trk.assignedSlot !== slotIdx;
      const currentCode = trk.assignedSlot !== null
        ? `S${formatSlotNumber(trk.assignedSlot)}`
        : '--';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.assignTrack = String(trkIdx);
      btn.className = `hw-btn py-2 px-1 rounded-xl font-mono-tech flex flex-col items-center justify-center cursor-pointer border ${
        isAlreadyHere
          ? 'bg-[#27ae60] text-white border-emerald-300'
          : (hasOther
            ? 'bg-zinc-800 hover:bg-[#2f80ed] text-white border-amber-400/60'
            : 'bg-zinc-800 hover:bg-[#2f80ed] text-white border-zinc-600')
      } ${trkIdx === state.activeTrack ? 'ring-1 ring-amber-300' : ''}`;

      const tLabel = document.createElement('span');
      tLabel.className = 'text-xs font-extrabold';
      tLabel.textContent = `T${trk.id}`;
      const sLabel = document.createElement('span');
      sLabel.className = `text-[9px] font-bold mt-0.5 ${isAlreadyHere ? 'text-emerald-100' : (hasOther ? 'text-amber-300' : 'text-zinc-400')}`;
      sLabel.textContent = currentCode;

      btn.appendChild(tLabel);
      btn.appendChild(sLabel);

      btn.addEventListener('click', () => {
        const res = assignSlotToTrack(state.soundbank, state.tracks, slotIdx, trkIdx);
        closeSamplerOverlay();
        if (res.assigned) {
          const msg = res.replaced
            ? `Assigned S${slotNum} "${slot.name}" → T${trk.id} (replaced S${formatSlotNumber(res.previousSlot)}).`
            : `Assigned S${slotNum} "${slot.name}" → T${trk.id}.`;
          setSamplerFeedback(msg, 'success');
          renderSoundbankGrid();
          onTracksChangedCallback();
          updateAllHUD();
        }
      });

      trackGrid.appendChild(btn);
    });

    const v = document.getElementById('overlayViewAssign');
    v.classList.remove('hidden');
    v.classList.add('flex');
  } else if (mode === 'clear') {
    titleEl.textContent = `CLEAR SLOT ${slotNum}?`;
    ledEl.className = 'w-2.5 h-2.5 rounded-full bg-[#d93829] shrink-0';
    closeBtn.classList.remove('hidden');

    document.getElementById('clearConfirmSample').textContent =
      `S${slotNum}: "${slot.name}" (${formatDuration(slot.duration)})`;

    const refTracks = getTracksForSlot(state.tracks, slotIdx);
    document.getElementById('clearConfirmTracks').textContent = refTracks.length > 0
      ? `This will remove the sample and unassign: ${refTracks.map(t => `T${t + 1}`).join(', ')}.`
      : 'This will remove the sample from the soundbank. Other slots remain intact.';

    const v = document.getElementById('overlayViewClear');
    v.classList.remove('hidden');
    v.classList.add('flex');
  } else if (mode === 'decoding') {
    titleEl.textContent = `SLOT ${slotNum} // PROCESSING`;
    ledEl.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0';
    closeBtn.classList.add('hidden');
    const v = document.getElementById('overlayViewDecoding');
    v.classList.remove('hidden');
    v.classList.add('flex');
  }
}

export function closeSamplerOverlay() {
  state.samplerUI.overlayMode = null;
  const overlay = document.getElementById('samplerOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function finishSampleAcquisition(slotIdx, decodedPayload, displayName) {
  const result = storeSampleInSlot(
    state.soundbank,
    state.tracks,
    state.activeTrack,
    slotIdx,
    {
      ...decodedPayload,
      name: displayName
    }
  );

  state.selectedSlot = slotIdx;
  state.visualPulse = 0.85;
  closeSamplerOverlay();

  const slotNum = formatSlotNumber(slotIdx);
  const durStr = formatDuration(result.slot.duration);
  const actionVerb = result.slot.sourceType === 'record' ? 'Recorded' : 'Imported';

  let routingNote;
  if (result.autoAssigned) {
    routingNote = `auto-assigned to T${result.autoAssignedTrack + 1}.`;
  } else if (result.preservedSlot !== null) {
    routingNote = `T${state.activeTrack + 1} kept S${formatSlotNumber(result.preservedSlot)} (tap ASSIGN to route).`;
  } else {
    routingNote = 'ready to preview or assign.';
  }

  setSamplerFeedback(
    `${actionVerb} "${result.slot.name}" (${durStr}) in S${slotNum} — ${routingNote}`,
    'success'
  );

  renderSoundbankGrid();
  onTracksChangedCallback();
  updateAllHUD();
}

async function handleSelectedImportFile(file, slotIdx) {
  const slotNum = formatSlotNumber(slotIdx);
  if (!file) {
    closeSamplerOverlay();
    setSamplerFeedback(`Import cancelled — Slot ${slotNum} unchanged.`, 'warn');
    renderSoundbankGrid();
    return;
  }

  samplePreview.stop();
  state.samplerUI.isDecoding = true;
  document.getElementById('decodingStatusText').textContent = `DECODING "${file.name}"...`;
  openSamplerOverlay('decoding', slotIdx);
  updateSamplerActionButtons();

  try {
    const decoded = await decodeFile(file, audioCtxManager);
    state.samplerUI.isDecoding = false;
    finishSampleAcquisition(slotIdx, decoded, file.name);
  } catch (err) {
    state.samplerUI.isDecoding = false;
    closeSamplerOverlay();
    setSamplerFeedback(
      (err && err.message) ? err.message : `Could not decode audio file — Slot ${slotNum} unchanged.`,
      'error'
    );
    renderSoundbankGrid();
    updateAllHUD();
  }
}

async function startMicrophoneCapture(slotIdx) {
  if (isSamplerBusy()) return;

  const slotNum = formatSlotNumber(slotIdx);
  samplePreview.stop();

  const support = checkRecordingSupport();
  if (!support.supported) {
    closeSamplerOverlay();
    setSamplerFeedback(support.message, 'error');
    renderSoundbankGrid();
    updateAllHUD();
    return;
  }

  openSamplerOverlay('record', slotIdx);
  updateSamplerActionButtons();

  try {
    const startResult = await sampleRecorder.start();
    if (startResult && startResult.cancelled) {
      closeSamplerOverlay();
      setSamplerFeedback(`Recording cancelled — Slot ${slotNum} unchanged.`, 'warn');
      renderSoundbankGrid();
      updateAllHUD();
    }
  } catch (err) {
    closeSamplerOverlay();
    setSamplerFeedback(
      (err && err.message) ? err.message : `Microphone recording failed — Slot ${slotNum} unchanged.`,
      'error'
    );
    renderSoundbankGrid();
    updateAllHUD();
  }
}

async function stopMicrophoneCapture() {
  const slotIdx = state.samplerUI.targetSlot;
  const slotNum = formatSlotNumber(slotIdx);

  try {
    const capture = await sampleRecorder.stop();
    if (!capture || capture.cancelled) {
      closeSamplerOverlay();
      setSamplerFeedback(`Recording cancelled — Slot ${slotNum} unchanged.`, 'warn');
      renderSoundbankGrid();
      updateAllHUD();
      return;
    }

    state.samplerUI.isDecoding = true;
    document.getElementById('decodingStatusText').textContent = 'DECODING RECORDING...';
    openSamplerOverlay('decoding', slotIdx);
    updateSamplerActionButtons();

    const decoded = await decodeRecordedBlob(capture.blob, audioCtxManager);
    state.samplerUI.isDecoding = false;
    finishSampleAcquisition(
      slotIdx,
      decoded,
      buildRecordingName(slotIdx)
    );
  } catch (err) {
    state.samplerUI.isDecoding = false;
    closeSamplerOverlay();
    setSamplerFeedback(
      (err && err.message) ? err.message : `Recording failed — Slot ${slotNum} unchanged.`,
      'error'
    );
    renderSoundbankGrid();
    updateAllHUD();
  }
}

function cancelMicrophoneCapture() {
  const slotNum = formatSlotNumber(state.samplerUI.targetSlot);
  sampleRecorder.cancel();
  closeSamplerOverlay();
  setSamplerFeedback(`Recording cancelled — Slot ${slotNum} unchanged.`, 'warn');
  renderSoundbankGrid();
  updateAllHUD();
}

async function toggleSelectedSlotPreview() {
  const slotIdx = state.selectedSlot;
  const slot = state.soundbank[slotIdx];
  const slotNum = formatSlotNumber(slotIdx);

  if (!slot || !slot.loaded || !slot.buffer) return;

  if (samplePreview.isPlaying() && samplePreview.getPlayingSlotIndex() === slotIdx) {
    samplePreview.stop();
    setSamplerFeedback(`Preview stopped (S${slotNum}).`, 'neutral');
    return;
  }

  if (!state.audioEnabled) {
    setSamplerFeedback('Audio is muted — enable AUDIO in the header to preview.', 'warn');
    return;
  }

  try {
    await samplePreview.play(slotIdx, slot.buffer);
    state.visualPulse = 1.0;
    setSamplerFeedback(
      `Previewing S${slotNum} "${slot.name}" (${formatDuration(slot.duration)}).`,
      'neutral'
    );
  } catch (err) {
    setSamplerFeedback(
      (err && err.message) ? `Preview failed: ${err.message}` : 'Unable to preview sample.',
      'error'
    );
  }
}

function clearImportPending() {
  state.samplerUI.pendingImportSlot = null;
  if (importCancelFallbackTimer !== null) {
    clearTimeout(importCancelFallbackTimer);
    importCancelFallbackTimer = null;
  }
}

function handleImportCancelled(slotIdx) {
  clearImportPending();
  const slotNum = formatSlotNumber(slotIdx);
  if (state.samplerUI.overlayMode === 'acquire') {
    closeSamplerOverlay();
  }
  setSamplerFeedback(`Import cancelled — Slot ${slotNum} unchanged.`, 'warn');
  renderSoundbankGrid();
  updateAllHUD();
}

export function initSampler({ onTracksChanged } = {}) {
  if (typeof onTracksChanged === 'function') {
    onTracksChangedCallback = onTracksChanged;
  }

  const sampleFileInput = document.getElementById('sampleFileInput');

  document.getElementById('btnAcquireSlot').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    const slot = state.soundbank[state.selectedSlot];
    if (!slot.loaded) {
      openSamplerOverlay('acquire', state.selectedSlot);
    }
  });

  document.getElementById('btnPreviewSample').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    toggleSelectedSlotPreview();
  });

  document.getElementById('btnAssignSlot').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    const slot = state.soundbank[state.selectedSlot];
    if (slot && slot.loaded && slot.buffer) {
      openSamplerOverlay('assign', state.selectedSlot);
    }
  });

  document.getElementById('btnClearSlot').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    const slot = state.soundbank[state.selectedSlot];
    if (slot && slot.loaded) {
      openSamplerOverlay('clear', state.selectedSlot);
    }
  });

  // Overlay Action Handlers
  document.getElementById('btnOverlayRecord').addEventListener('click', () => {
    const targetSlot = state.samplerUI.targetSlot;
    startMicrophoneCapture(targetSlot);
  });

  document.getElementById('btnOverlayImport').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    const targetSlot = state.samplerUI.targetSlot;

    if (!audioCtxManager.isWebAudioSupported()) {
      closeSamplerOverlay();
      setSamplerFeedback('Web Audio API is unavailable in this browser — cannot decode audio files.', 'error');
      return;
    }

    // Warm up AudioContext synchronously inside user gesture (important on iPad Safari).
    try {
      audioCtxManager.getContext();
    } catch (_) {}

    clearImportPending();
    state.samplerUI.pendingImportSlot = targetSlot;
    sampleFileInput.value = '';

    // Focus fallback for browsers that do not emit the HTMLInputElement "cancel" event.
    const onWindowFocusAfterPicker = () => {
      window.removeEventListener('focus', onWindowFocusAfterPicker);
      importCancelFallbackTimer = setTimeout(() => {
        importCancelFallbackTimer = null;
        if (
          state.samplerUI.pendingImportSlot === targetSlot &&
          (!sampleFileInput.files || sampleFileInput.files.length === 0)
        ) {
          handleImportCancelled(targetSlot);
        }
      }, 550);
    };
    window.addEventListener('focus', onWindowFocusAfterPicker, { once: true });

    sampleFileInput.click();
  });

  sampleFileInput.addEventListener('change', () => {
    const slotIdx = state.samplerUI.pendingImportSlot !== null
      ? state.samplerUI.pendingImportSlot
      : state.selectedSlot;
    const file = sampleFileInput.files && sampleFileInput.files[0] ? sampleFileInput.files[0] : null;
    clearImportPending();
    sampleFileInput.value = '';
    handleSelectedImportFile(file, slotIdx);
  });

  sampleFileInput.addEventListener('cancel', () => {
    const slotIdx = state.samplerUI.pendingImportSlot !== null
      ? state.samplerUI.pendingImportSlot
      : state.selectedSlot;
    handleImportCancelled(slotIdx);
  });

  document.getElementById('btnRecordStop').addEventListener('click', () => {
    stopMicrophoneCapture();
  });

  document.getElementById('btnRecordCancel').addEventListener('click', () => {
    cancelMicrophoneCapture();
  });

  document.getElementById('btnAssignCancel').addEventListener('click', () => {
    closeSamplerOverlay();
  });

  document.getElementById('btnClearConfirm').addEventListener('click', () => {
    const slotIdx = state.samplerUI.targetSlot;
    const slotNum = formatSlotNumber(slotIdx);
    if (samplePreview.getPlayingSlotIndex() === slotIdx) {
      samplePreview.stop();
    }
    const res = clearSlot(state.soundbank, state.tracks, slotIdx);
    closeSamplerOverlay();
    if (res.cleared) {
      const trackMsg = res.unassignedTracks.length > 0
        ? ` (unassigned ${res.unassignedTracks.map(t => `T${t + 1}`).join(', ')})`
        : '';
      setSamplerFeedback(`Cleared Slot ${slotNum}${trackMsg}.`, 'neutral');
    }
    renderSoundbankGrid();
    onTracksChangedCallback();
    updateAllHUD();
  });

  document.getElementById('btnClearCancel').addEventListener('click', () => {
    closeSamplerOverlay();
  });

  document.getElementById('samplerOverlayCloseBtn').addEventListener('click', () => {
    if (isSamplerBusy()) return;
    closeSamplerOverlay();
  });

  document.getElementById('samplerOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'samplerOverlay' && !isSamplerBusy()) {
      closeSamplerOverlay();
    }
  });
}
