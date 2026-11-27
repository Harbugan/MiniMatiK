/**
 * MiniMatik — Soundbank & Track Assignment State Module (PR02)
 *
 * Pure state helpers for the 19-slot soundbank and 7-track routing model.
 * No factory samples, no preset names, no synthetic fallbacks.
 */
export const SLOT_COUNT = 19;
export const TRACK_COUNT = 7;
const MAX_NAME_LENGTH = 32;
export const SLOT_COLORS = ['#d93829', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0'];

  function createEmptySlot(index) {
    return {
      id: index + 1,
      loaded: false,
      name: null,
      buffer: null,
      duration: 0,
      sampleRate: 0,
      channels: 0,
      sourceType: null, // 'import' | 'record' | null
      mimeType: null,
      fileName: null,
      fileSize: 0,
      createdAt: null,
      color: SLOT_COLORS[index % SLOT_COLORS.length]
    };
  }

  function createEmptySoundbank() {
    return Array.from({ length: SLOT_COUNT }, (_, i) => createEmptySlot(i));
  }

  function createInitialTracks() {
    return Array.from({ length: TRACK_COUNT }, (_, i) => ({
      id: i + 1,
      muted: false,
      assignedSlot: null // 0..18 or null
    }));
  }

  function formatSlotNumber(slotIndex) {
    return String(slotIndex + 1).padStart(2, '0');
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s';
    if (seconds < 10) return `${seconds.toFixed(2)}s`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function sanitizeSampleName(rawName, fallbackName) {
    const fallback = fallbackName || 'Sample';
    if (typeof rawName !== 'string') return fallback;

    // Strip path segments if present, trim whitespace, then strip trailing file extension.
    let base = (rawName.split(/[\\/]/).pop() || '').trim();
    base = base.replace(/\.[a-zA-Z0-9]{1,6}$/, '');
    // Replace control characters and normalize whitespace.
    base = base.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();

    if (!base || /^\.+$/.test(base)) return fallback;
    if (base.length > MAX_NAME_LENGTH) {
      return base.slice(0, MAX_NAME_LENGTH - 1).trimEnd() + '…';
    }
    return base;
  }

  function buildRecordingName(slotIndex, date) {
    const d = date instanceof Date ? date : new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `Mic ${formatSlotNumber(slotIndex)} (${hh}:${mm})`;
  }

  function getLoadedCount(soundbank) {
    return soundbank.filter(slot => slot.loaded && slot.buffer !== null).length;
  }

  function getTracksForSlot(tracks, slotIndex) {
    const indices = [];
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].assignedSlot === slotIndex) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Stores a decoded user-supplied AudioBuffer and metadata into a soundbank slot.
   *
   * Approved hybrid assignment rule:
   * Auto-assign to the active track if and only if that track is currently unassigned.
   * If the active track already has an assignment, preserve it.
   */
  function storeSampleInSlot(soundbank, tracks, activeTrackIndex, slotIndex, payload) {
    if (slotIndex < 0 || slotIndex >= soundbank.length) {
      throw new RangeError(`Invalid slot index: ${slotIndex}`);
    }
    if (!payload || !payload.buffer) {
      throw new Error('Cannot store sample without a decoded AudioBuffer.');
    }

    const slot = soundbank[slotIndex];
    const fallback = payload.sourceType === 'record'
      ? buildRecordingName(slotIndex)
      : `Sample ${formatSlotNumber(slotIndex)}`;

    slot.loaded = true;
    slot.name = sanitizeSampleName(payload.name, fallback);
    slot.buffer = payload.buffer;
    slot.duration = Number.isFinite(payload.duration) ? payload.duration : (payload.buffer.duration || 0);
    slot.sampleRate = payload.sampleRate || payload.buffer.sampleRate || 0;
    slot.channels = payload.channels || payload.buffer.numberOfChannels || 0;
    slot.sourceType = payload.sourceType === 'record' ? 'record' : 'import';
    slot.mimeType = payload.mimeType || null;
    slot.fileName = payload.fileName || null;
    slot.fileSize = payload.fileSize || 0;
    slot.createdAt = payload.createdAt || Date.now();

    const activeTrack = tracks[activeTrackIndex];
    let autoAssigned = false;
    let autoAssignedTrack = null;
    let preservedSlot = null;

    if (activeTrack) {
      if (activeTrack.assignedSlot === null) {
        activeTrack.assignedSlot = slotIndex;
        autoAssigned = true;
        autoAssignedTrack = activeTrackIndex;
      } else {
        preservedSlot = activeTrack.assignedSlot;
      }
    }

    return {
      slot,
      autoAssigned,
      autoAssignedTrack,
      preservedSlot
    };
  }

  /**
   * Explicitly assigns a loaded soundbank slot to destination track T1..T7.
   * Explicit replacement of an existing track assignment is allowed.
   */
  function assignSlotToTrack(soundbank, tracks, slotIndex, trackIndex) {
    if (slotIndex < 0 || slotIndex >= soundbank.length) {
      return { assigned: false, reason: 'INVALID_SLOT' };
    }
    if (trackIndex < 0 || trackIndex >= tracks.length) {
      return { assigned: false, reason: 'INVALID_TRACK' };
    }
    const slot = soundbank[slotIndex];
    if (!slot.loaded || !slot.buffer) {
      return { assigned: false, reason: 'SLOT_EMPTY' };
    }

    const previousSlot = tracks[trackIndex].assignedSlot;
    tracks[trackIndex].assignedSlot = slotIndex;

    return {
      assigned: true,
      slotIndex,
      trackIndex,
      previousSlot,
      replaced: previousSlot !== null && previousSlot !== slotIndex
    };
  }

  /**
   * Clears a single soundbank slot and resets every track referencing it.
   * All unrelated slots and track assignments remain untouched.
   */
  function clearSlot(soundbank, tracks, slotIndex) {
    if (slotIndex < 0 || slotIndex >= soundbank.length) {
      return { cleared: false, clearedSlotName: null, unassignedTracks: [] };
    }

    const existing = soundbank[slotIndex];
    const clearedSlotName = existing.name;
    const wasLoaded = existing.loaded;

    const fresh = createEmptySlot(slotIndex);
    Object.assign(existing, fresh);

    const unassignedTracks = [];
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].assignedSlot === slotIndex) {
        tracks[i].assignedSlot = null;
        unassignedTracks.push(i);
      }
    }

    return {
      cleared: wasLoaded || unassignedTracks.length > 0,
      clearedSlotName,
      unassignedTracks
    };
  }

export {
  createEmptySlot,
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
};
