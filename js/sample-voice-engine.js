/**
 * MiniMatik — User-Sample Performance & Voice Management Engine (PR04)
 *
 * Powers ChordMatiK with real decoded AudioBuffer voices from the active track's
 * assigned soundbank slot. Never synthesizes fallback oscillator tones.
 *
 * Key guarantees:
 * - Tape playback-rate transposition without mutating shared AudioBuffer data.
 * - Smart Chord Priority (Option A): new CHORD group supersedes prior CHORD group
 *   on that track with a short click-safe crossfade (even in One-shot) and cancels
 *   pending STRUM / Mono arpeggio attacks.
 * - Ordinary One-shot (NOTE / DRUM): independent voices continue to natural buffer end
 *   unless stolen for voice budget or stopped explicitly.
 * - Gate mode: pointer/key release cancels pending attacks and fades held voices cleanly.
 * - Voice budget: max 8 simultaneously sounding voices per track in Poly (including
 *   crossfade/release tails), stealing oldest click-safely; max 1 sounding voice per
 *   track in Mono (including transition tails).
 */

import {
  SAMPLE_REFERENCE_MIDI,
  STRUM_MIN_MS,
  STRUM_MAX_MS,
  STRUM_DEFAULT_MS,
  midiToPlaybackRate,
  getEighthNoteDurationSec
} from './chordmatik-theory.js';

export const TRACK_COUNT = 7;
export const MAX_POLY_VOICES_PER_TRACK = 8;
export const MAX_MONO_VOICES_PER_TRACK = 1;

// Tunable click-safety & transition timing constants (QA parameters)
export const ATTACK_FADE_SEC = 0.005;
export const CHORD_CROSSFADE_SEC = 0.028;
export const GATE_RELEASE_SEC = 0.018;
export const STEAL_FADE_SEC = 0.006;

// Lookahead Web Audio scheduler constants for STRUM and Mono 1/8 arpeggio
export const SCHEDULER_INTERVAL_MS = 15;
export const SCHEDULER_LOOKAHEAD_SEC = 0.04;

const MIN_GAIN = 0.0001;

function createTrackPool() {
  return {
    voices: [],
    activeChordGroupId: null,
    groups: new Map()
  };
}

function disconnectVoiceNodes(voice) {
  if (!voice) return;
  try { voice.source.disconnect(); } catch (_) {}
  try { voice.gain.disconnect(); } catch (_) {}
}

function estimateGainAt(voice, time) {
  if (time <= voice.startTime) return MIN_GAIN;
  if (voice.releaseStartTime !== null && time >= voice.releaseStartTime) {
    const dur = Math.max(0.0001, voice.endTime - voice.releaseStartTime);
    const frac = Math.max(0, Math.min(1, (time - voice.releaseStartTime) / dur));
    return Math.max(MIN_GAIN, voice.releaseStartGain * (1 - frac));
  }
  if (voice.fadeInEndTime > voice.startTime && time < voice.fadeInEndTime) {
    const frac = (time - voice.startTime) / (voice.fadeInEndTime - voice.startTime);
    return Math.max(MIN_GAIN, voice.targetGain * frac);
  }
  return Math.max(MIN_GAIN, voice.targetGain);
}

function safeStopSource(source, when) {
  try {
    source.stop(when);
  } catch (_) {
    try { source.stop(); } catch (_) {}
  }
}

export function createSampleVoiceEngine(audioContextManager, options = {}) {
  const getBpm = typeof options.getBpm === 'function' ? options.getBpm : () => 120;
  const isAudioEnabled = typeof options.isAudioEnabled === 'function' ? options.isAudioEnabled : () => true;
  const setIntervalFn = typeof options.setInterval === 'function' ? options.setInterval : (fn, ms) => setInterval(fn, ms);
  const clearIntervalFn = typeof options.clearInterval === 'function' ? options.clearInterval : (id) => clearInterval(id);
  const onAudioActivity = typeof options.onAudioActivity === 'function' ? options.onAudioActivity : () => {};

  const trackPools = Array.from({ length: TRACK_COUNT }, () => createTrackPool());
  let nextVoiceId = 1;
  let nextGroupId = 1;
  let schedulerTimerId = null;

  function isValidTrack(trackIndex) {
    return Number.isInteger(trackIndex) && trackIndex >= 0 && trackIndex < TRACK_COUNT;
  }

  function getExistingContext() {
    if (!audioContextManager) return null;
    if (typeof audioContextManager.getExistingContext === 'function') {
      return audioContextManager.getExistingContext();
    }
    try {
      return audioContextManager.getContext();
    } catch (_) {
      return null;
    }
  }

  function pruneTrackVoices(pool, now) {
    if (!pool.voices.length) return;
    const remaining = [];
    for (const v of pool.voices) {
      if (v.ended || v.endTime <= now) {
        v.ended = true;
        disconnectVoiceNodes(v);
      } else {
        remaining.push(v);
      }
    }
    pool.voices = remaining;
    pruneFinishedGroups(pool);
  }

  function pruneFinishedGroups(pool) {
    for (const [gid, group] of pool.groups.entries()) {
      if (group.starting || group.awaitingResume) continue;
      const hasPending = group.pendingEvents.length > 0 || group.arpLoop;
      const hasVoices = pool.voices.some(v => !v.ended && v.groupId === gid);
      if (!hasPending && !hasVoices) {
        pool.groups.delete(gid);
        if (pool.activeChordGroupId === gid) {
          pool.activeChordGroupId = null;
        }
      }
    }
  }

  function cancelUnstartedVoice(pool, voice, now) {
    voice.ended = true;
    voice.releasing = true;
    voice.endTime = now;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0, now);
    } catch (_) {}
    safeStopSource(voice.source, Math.max(now, voice.startTime));
    disconnectVoiceNodes(voice);
    pool.voices = pool.voices.filter(v => v !== voice);
  }

  function fadeAndStopVoice(voice, fadeStart, fadeEnd) {
    if (voice.ended) return;
    const safeStart = Math.max(voice.startTime, fadeStart);
    const safeEnd = Math.max(safeStart + 0.001, Math.min(voice.naturalEndTime, fadeEnd));

    // Do not lengthen a voice that is already stopping earlier
    if (voice.releasing && voice.endTime <= safeEnd) {
      return;
    }

    const startGain = estimateGainAt(voice, safeStart);
    voice.releasing = true;
    voice.releaseStartTime = safeStart;
    voice.releaseStartGain = startGain;
    voice.endTime = safeEnd;

    try {
      const g = voice.gain.gain;
      g.cancelScheduledValues(safeStart);
      g.setValueAtTime(startGain, safeStart);
      g.linearRampToValueAtTime(MIN_GAIN, safeEnd);
      g.setValueAtTime(0, safeEnd);
    } catch (_) {}

    safeStopSource(voice.source, safeEnd);
  }

  function cancelGroupPending(pool, group, now) {
    group.pendingEvents.length = 0;
    group.arpLoop = false;
    group.awaitingResume = false;

    // Cancel any lookahead voices belonging to this group that have not started yet
    const unstarted = pool.voices.filter(v => !v.ended && v.groupId === group.id && v.startTime > now);
    for (const v of unstarted) {
      cancelUnstartedVoice(pool, v, now);
    }
  }

  function fadeOutGroup(pool, group, now, fadeSec) {
    cancelGroupPending(pool, group, now);
    const active = pool.voices.filter(v => !v.ended && v.groupId === group.id);
    for (const v of active) {
      if (v.startTime > now) {
        cancelUnstartedVoice(pool, v, now);
      } else {
        fadeAndStopVoice(v, now, now + fadeSec);
      }
    }
    pruneFinishedGroups(pool);
  }

  /**
   * Spawns a single AudioBufferSourceNode + GainNode voice while strictly enforcing
   * the per-track simultaneous voice cap (8 in Poly, 1 in Mono), including tails.
   */
  function spawnVoice(ctx, pool, {
    trackIndex,
    groupId,
    isChordGroup,
    buffer,
    midi,
    desiredStartTime,
    targetGain,
    voiceMode
  }) {
    const now = ctx.currentTime;
    pruneTrackVoices(pool, now);

    const cap = voiceMode === 'MONO' ? MAX_MONO_VOICES_PER_TRACK : MAX_POLY_VOICES_PER_TRACK;
    let startTime = Math.max(now, desiredStartTime);

    // Enforce cap across all voices that will still be active at or after startTime
    let guard = 0;
    while (guard++ < 64) {
      const overlapping = pool.voices
        .filter(v => !v.ended && v.endTime > startTime)
        .sort((a, b) => a.id - b.id); // oldest first

      if (overlapping.length < cap) {
        break;
      }

      const victim = overlapping[0];
      if (victim.startTime > now) {
        cancelUnstartedVoice(pool, victim, now);
        continue;
      }

      const maxQuickCut = Math.max(now + STEAL_FADE_SEC, startTime);
      if (victim.endTime <= maxQuickCut) {
        // Victim is already stopping within a few ms — wait until its exact stop time
        startTime = Math.max(startTime, victim.endTime);
      } else {
        const fadeStart = Math.max(now, startTime - STEAL_FADE_SEC);
        const fadeEnd = fadeStart + STEAL_FADE_SEC;
        fadeAndStopVoice(victim, fadeStart, fadeEnd);
        startTime = Math.max(startTime, fadeEnd);
      }
    }

    const playbackRate = midiToPlaybackRate(midi, SAMPLE_REFERENCE_MIDI);
    const bufferDuration = Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : 0.05;
    const effectiveDuration = Math.max(0.005, bufferDuration / playbackRate);
    const naturalEndTime = startTime + effectiveDuration;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    if (source.playbackRate && typeof source.playbackRate.setValueAtTime === 'function') {
      source.playbackRate.setValueAtTime(playbackRate, startTime);
    } else if (source.playbackRate) {
      source.playbackRate.value = playbackRate;
    }

    const fadeIn = Math.min(ATTACK_FADE_SEC, effectiveDuration * 0.25);
    const fadeInEndTime = startTime + fadeIn;
    if (fadeIn > 0.0005) {
      gain.gain.setValueAtTime(MIN_GAIN, startTime);
      gain.gain.linearRampToValueAtTime(targetGain, fadeInEndTime);
    } else {
      gain.gain.setValueAtTime(targetGain, startTime);
    }

    source.connect(gain);
    gain.connect(ctx.destination);

    const voice = {
      id: nextVoiceId++,
      trackIndex,
      groupId,
      isChordGroup,
      midi,
      playbackRate,
      source,
      gain,
      targetGain,
      startTime,
      fadeInEndTime,
      naturalEndTime,
      endTime: naturalEndTime,
      releasing: false,
      releaseStartTime: null,
      releaseStartGain: targetGain,
      ended: false
    };

    pool.voices.push(voice);

    source.onended = () => {
      voice.ended = true;
      disconnectVoiceNodes(voice);
      pool.voices = pool.voices.filter(v => v !== voice);
      pruneFinishedGroups(pool);
    };

    source.start(startTime);
    onAudioActivity({ trackIndex, midi, startTime, playbackRate });
    return voice;
  }

  function hasScheduledWork() {
    for (const pool of trackPools) {
      for (const group of pool.groups.values()) {
        if (!group.cancelled && (group.pendingEvents.length > 0 || group.arpLoop)) {
          return true;
        }
      }
    }
    return false;
  }

  function ensureSchedulerRunning() {
    if (schedulerTimerId !== null) return;
    if (!hasScheduledWork()) return;
    schedulerTimerId = setIntervalFn(() => {
      tickScheduler();
    }, SCHEDULER_INTERVAL_MS);
  }

  function stopSchedulerIfIdle() {
    if (schedulerTimerId !== null && !hasScheduledWork()) {
      clearIntervalFn(schedulerTimerId);
      schedulerTimerId = null;
    }
  }

  function tickScheduler() {
    const ctx = getExistingContext();
    if (!ctx || !isAudioEnabled()) {
      stopSchedulerIfIdle();
      return;
    }

    const now = ctx.currentTime;
    const horizon = now + SCHEDULER_LOOKAHEAD_SEC;

    for (let t = 0; t < TRACK_COUNT; t++) {
      const pool = trackPools[t];
      pruneTrackVoices(pool, now);

      for (const group of Array.from(pool.groups.values())) {
        if (group.cancelled) continue;

        // 1. Drain fixed pending events (STRUM notes & One-shot Mono arp steps)
        while (group.pendingEvents.length > 0 && group.pendingEvents[0].dueTime <= horizon) {
          const ev = group.pendingEvents.shift();
          spawnVoice(ctx, pool, {
            trackIndex: group.trackIndex,
            groupId: group.id,
            isChordGroup: group.isChordGroup,
            buffer: group.buffer,
            midi: ev.midi,
            desiredStartTime: Math.max(now, ev.dueTime),
            targetGain: group.noteGain,
            voiceMode: group.voiceMode
          });
        }

        // 2. Advance sustained Gate + Mono ascending 1/8-note arpeggio loop
        if (group.arpLoop && group.midiNotes.length > 0) {
          let safety = 0;
          while (group.arpNextTime <= horizon && safety++ < 8) {
            const midi = group.midiNotes[group.arpNextIndex];
            const stepSec = getEighthNoteDurationSec(getBpm());
            const scheduledTime = Math.max(now, group.arpNextTime);
            const spawned = spawnVoice(ctx, pool, {
              trackIndex: group.trackIndex,
              groupId: group.id,
              isChordGroup: group.isChordGroup,
              buffer: group.buffer,
              midi,
              desiredStartTime: scheduledTime,
              targetGain: group.noteGain,
              voiceMode: 'MONO'
            });
            group.arpNextIndex = (group.arpNextIndex + 1) % group.midiNotes.length;
            group.arpNextTime = spawned.startTime + stepSec;
          }
        }
      }

      pruneFinishedGroups(pool);
    }

    stopSchedulerIfIdle();
  }

  function startGroupAudio(ctx, pool, group) {
    if (group.cancelled || group.superseded || !isAudioEnabled()) {
      group.awaitingResume = false;
      group.starting = false;
      pruneFinishedGroups(pool);
      return null;
    }
    if (group.playbackMode === 'GATE' && group.released) {
      group.awaitingResume = false;
      group.starting = false;
      pruneFinishedGroups(pool);
      return null;
    }

    group.awaitingResume = false;
    group.starting = true;
    try {
      const now = ctx.currentTime;
      const notes = group.midiNotes;
      const isMonoChord = group.isChordGroup && group.voiceMode === 'MONO';
      const isPolyStrum = group.isChordGroup && group.voiceMode === 'POLY' && group.strumEnabled && notes.length > 1;

      if (isMonoChord) {
        // Mono takes precedence over STRUM: ascending BPM-synced 1/8-note arpeggio
        const stepSec = getEighthNoteDurationSec(getBpm());
        const firstVoice = spawnVoice(ctx, pool, {
          trackIndex: group.trackIndex,
          groupId: group.id,
          isChordGroup: true,
          buffer: group.buffer,
          midi: notes[0],
          desiredStartTime: now,
          targetGain: group.noteGain,
          voiceMode: 'MONO'
        });

        if (group.playbackMode === 'GATE') {
          group.arpLoop = true;
          group.arpNextIndex = notes.length > 1 ? 1 : 0;
          group.arpNextTime = firstVoice.startTime + stepSec;
        } else {
          // One-shot Mono arp plays one complete ascending pass through the chord tones
          for (let i = 1; i < notes.length; i++) {
            group.pendingEvents.push({
              dueTime: firstVoice.startTime + i * stepSec,
              midi: notes[i],
              noteIndex: i
            });
          }
        }
        ensureSchedulerRunning();
        return firstVoice;
      }

      if (isPolyStrum) {
        const clampedStrumMs = Math.max(STRUM_MIN_MS, Math.min(STRUM_MAX_MS, Number(group.strumMs) || STRUM_DEFAULT_MS));
        const spacingSec = clampedStrumMs / 1000;

        // Trigger lowest note immediately, schedule remaining ascending notes on Web Audio clock
        const firstVoice = spawnVoice(ctx, pool, {
          trackIndex: group.trackIndex,
          groupId: group.id,
          isChordGroup: true,
          buffer: group.buffer,
          midi: notes[0],
          desiredStartTime: now,
          targetGain: group.noteGain,
          voiceMode: 'POLY'
        });

        for (let i = 1; i < notes.length; i++) {
          group.pendingEvents.push({
            dueTime: firstVoice.startTime + i * spacingSec,
            midi: notes[i],
            noteIndex: i
          });
        }
        ensureSchedulerRunning();
        return firstVoice;
      }

      // Simultaneous Poly chord or single NOTE/DRUM trigger
      let firstSpawned = null;
      for (let i = 0; i < notes.length; i++) {
        const v = spawnVoice(ctx, pool, {
          trackIndex: group.trackIndex,
          groupId: group.id,
          isChordGroup: group.isChordGroup,
          buffer: group.buffer,
          midi: notes[i],
          desiredStartTime: now,
          targetGain: group.noteGain,
          voiceMode: group.voiceMode
        });
        if (!firstSpawned) firstSpawned = v;
      }
      return firstSpawned;
    } finally {
      group.starting = false;
    }
  }

  /**
   * Triggers a ChordMatiK pad performance using a real user AudioBuffer.
   * Returns { triggered, groupId, reason }.
   */
  function triggerPerformance({
    trackIndex,
    buffer,
    midiNotes,
    isChordGroup = false,
    playbackMode = 'ONE_SHOT',
    voiceMode = 'POLY',
    strumEnabled = false,
    strumMs = STRUM_DEFAULT_MS,
    trackMuted = false
  } = {}) {
    if (!isAudioEnabled()) {
      return { triggered: false, groupId: null, reason: 'AUDIO_DISABLED' };
    }
    if (!isValidTrack(trackIndex)) {
      return { triggered: false, groupId: null, reason: 'INVALID_TRACK' };
    }
    if (trackMuted) {
      return { triggered: false, groupId: null, reason: 'TRACK_MUTED' };
    }
    if (!buffer) {
      return { triggered: false, groupId: null, reason: 'NO_SAMPLE' };
    }
    if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
      return { triggered: false, groupId: null, reason: 'NO_NOTES' };
    }
    if (!audioContextManager || (typeof audioContextManager.isWebAudioSupported === 'function' && !audioContextManager.isWebAudioSupported())) {
      return { triggered: false, groupId: null, reason: 'NO_WEBAUDIO' };
    }

    let ctx;
    try {
      ctx = audioContextManager.getContext();
    } catch (_) {
      return { triggered: false, groupId: null, reason: 'AUDIO_CTX_ERROR' };
    }
    if (!ctx) {
      return { triggered: false, groupId: null, reason: 'AUDIO_CTX_ERROR' };
    }

    const pool = trackPools[trackIndex];
    const now = ctx.currentTime || 0;
    pruneTrackVoices(pool, now);

    // Sort ascending Low -> High for deterministic voicing, STRUM, and Mono arp order
    const sortedNotes = [...midiNotes].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (sortedNotes.length === 0) {
      return { triggered: false, groupId: null, reason: 'NO_NOTES' };
    }

    const normalizedPlayback = playbackMode === 'GATE' ? 'GATE' : 'ONE_SHOT';
    const normalizedVoice = voiceMode === 'MONO' ? 'MONO' : 'POLY';

    // Smart Chord Priority (Option A):
    // A newly pressed CHORD group supersedes the previous CHORD group on this track
    // with a short click-safe crossfade, even in One-shot mode, and cancels pending
    // outgoing STRUM or Mono arpeggio attacks.
    if (isChordGroup && pool.activeChordGroupId !== null) {
      const prevGroup = pool.groups.get(pool.activeChordGroupId);
      if (prevGroup) {
        prevGroup.superseded = true;
        prevGroup.cancelled = true;
        if (normalizedVoice === 'MONO') {
          // Cancel pending attacks; Mono 1-voice spawn handles fade-to-zero before new attack
          cancelGroupPending(pool, prevGroup, now);
        } else {
          fadeOutGroup(pool, prevGroup, now, CHORD_CROSSFADE_SEC);
        }
      }
      pool.activeChordGroupId = null;
    } else if (normalizedVoice === 'MONO') {
      // In Mono mode, even NOTE/DRUM triggers cancel any active pending arp on this track
      for (const existing of pool.groups.values()) {
        if (!existing.cancelled && (existing.pendingEvents.length > 0 || existing.arpLoop)) {
          existing.cancelled = true;
          cancelGroupPending(pool, existing, now);
        }
      }
    }

    const simultaneousScale = (normalizedVoice === 'MONO' || !isChordGroup) ? 1 : sortedNotes.length;
    const noteGain = 0.85 / Math.sqrt(Math.max(1, simultaneousScale));

    const group = {
      id: nextGroupId++,
      trackIndex,
      isChordGroup: Boolean(isChordGroup),
      playbackMode: normalizedPlayback,
      voiceMode: normalizedVoice,
      strumEnabled: Boolean(strumEnabled),
      strumMs,
      buffer,
      midiNotes: sortedNotes,
      noteGain,
      pendingEvents: [],
      arpLoop: false,
      arpNextIndex: 0,
      arpNextTime: 0,
      cancelled: false,
      released: false,
      superseded: false,
      awaitingResume: false
    };

    pool.groups.set(group.id, group);
    if (group.isChordGroup) {
      pool.activeChordGroupId = group.id;
    }

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      group.awaitingResume = true;
      ctx.resume().then(() => {
        startGroupAudio(ctx, pool, group);
      }).catch(() => {
        group.cancelled = true;
        group.awaitingResume = false;
        pruneFinishedGroups(pool);
      });
      return { triggered: true, groupId: group.id, reason: 'RESUMING' };
    }

    startGroupAudio(ctx, pool, group);
    return { triggered: true, groupId: group.id, reason: 'PLAYING' };
  }

  /**
   * Releases a performance group on pointerup / pointercancel / keyup.
   * - In Gate mode: cancels pending STRUM/arp attacks and fades out active voices click-safely.
   * - In One-shot mode: does NOT truncate active voices (both CHORD and ordinary NOTE/DRUM).
   */
  function releasePerformance(trackIndex, groupId) {
    if (!isValidTrack(trackIndex) || groupId == null) return false;
    const pool = trackPools[trackIndex];
    const group = pool.groups.get(groupId);
    if (!group) return false;

    group.released = true;

    if (group.playbackMode !== 'GATE') {
      // One-shot release never truncates active performance
      return false;
    }

    group.cancelled = true;
    const ctx = getExistingContext();
    const now = ctx ? (ctx.currentTime || 0) : 0;
    fadeOutGroup(pool, group, now, GATE_RELEASE_SEC);
    if (pool.activeChordGroupId === groupId) {
      pool.activeChordGroupId = null;
    }
    stopSchedulerIfIdle();
    return true;
  }

  /**
   * Stops all active voices and pending attacks on a single track (mute, clear slot, reassign).
   */
  function stopTrack(trackIndex, fadeSec = GATE_RELEASE_SEC) {
    if (!isValidTrack(trackIndex)) return false;
    const pool = trackPools[trackIndex];
    const ctx = getExistingContext();
    const now = ctx ? (ctx.currentTime || 0) : 0;

    for (const group of pool.groups.values()) {
      group.cancelled = true;
      group.pendingEvents.length = 0;
      group.arpLoop = false;
      group.awaitingResume = false;
    }
    pool.activeChordGroupId = null;

    const voicesCopy = [...pool.voices];
    for (const v of voicesCopy) {
      if (v.ended) continue;
      if (v.startTime > now) {
        cancelUnstartedVoice(pool, v, now);
      } else {
        fadeAndStopVoice(v, now, now + fadeSec);
      }
    }

    pruneFinishedGroups(pool);
    stopSchedulerIfIdle();
    return true;
  }

  /**
   * Enforces voice mode change on a track (e.g. switching POLY -> MONO while notes are ringing).
   */
  function enforceVoiceMode(trackIndex, voiceMode) {
    if (!isValidTrack(trackIndex)) return;
    if (voiceMode !== 'MONO') return;

    const pool = trackPools[trackIndex];
    const ctx = getExistingContext();
    const now = ctx ? (ctx.currentTime || 0) : 0;
    pruneTrackVoices(pool, now);

    // Cancel any pending Poly STRUM events so they cannot fire after switching to Mono
    for (const group of pool.groups.values()) {
      if (group.voiceMode !== 'MONO') {
        group.cancelled = true;
        cancelGroupPending(pool, group, now);
      }
    }

    // Keep at most the newest 1 active voice; fade older voices immediately
    const active = pool.voices
      .filter(v => !v.ended && v.endTime > now)
      .sort((a, b) => a.id - b.id);

    while (active.length > MAX_MONO_VOICES_PER_TRACK) {
      const victim = active.shift();
      if (victim.startTime > now) {
        cancelUnstartedVoice(pool, victim, now);
      } else {
        fadeAndStopVoice(victim, now, now + STEAL_FADE_SEC);
      }
    }
    stopSchedulerIfIdle();
  }

  /**
   * Stops all active voices and pending attacks across all 7 tracks (global stop / audio off / unload).
   */
  function stopAll(fadeSec = GATE_RELEASE_SEC) {
    for (let t = 0; t < TRACK_COUNT; t++) {
      stopTrack(t, fadeSec);
    }
    stopSchedulerIfIdle();
  }

  /**
   * Counts voices simultaneously sounding on `trackIndex` at Web Audio time `atTime`.
   * Includes voices in crossfade / gate / steal release until their exact stop time.
   */
  function getSimultaneousVoiceCount(trackIndex, atTime) {
    if (!isValidTrack(trackIndex)) return 0;
    const ctx = getExistingContext();
    const t = Number.isFinite(atTime) ? atTime : (ctx ? (ctx.currentTime || 0) : 0);
    const pool = trackPools[trackIndex];
    return pool.voices.filter(v => !v.ended && v.startTime <= t && v.endTime > t).length;
  }

  /**
   * Diagnostic snapshot for automated verification & debugging.
   */
  function getTrackDebugState(trackIndex) {
    if (!isValidTrack(trackIndex)) return null;
    const pool = trackPools[trackIndex];
    const ctx = getExistingContext();
    const now = ctx ? (ctx.currentTime || 0) : 0;
    return {
      activeChordGroupId: pool.activeChordGroupId,
      soundingCountNow: getSimultaneousVoiceCount(trackIndex, now),
      voices: pool.voices.map(v => ({
        id: v.id,
        groupId: v.groupId,
        isChordGroup: v.isChordGroup,
        midi: v.midi,
        playbackRate: v.playbackRate,
        startTime: v.startTime,
        endTime: v.endTime,
        naturalEndTime: v.naturalEndTime,
        releasing: v.releasing,
        ended: v.ended
      })),
      pendingCount: Array.from(pool.groups.values()).reduce((sum, g) => sum + g.pendingEvents.length, 0),
      hasArpLoop: Array.from(pool.groups.values()).some(g => !g.cancelled && g.arpLoop)
    };
  }

  function dispose() {
    stopAll(STEAL_FADE_SEC);
    if (schedulerTimerId !== null) {
      clearIntervalFn(schedulerTimerId);
      schedulerTimerId = null;
    }
  }

  return {
    triggerPerformance,
    releasePerformance,
    stopTrack,
    stopAll,
    enforceVoiceMode,
    tickScheduler,
    getSimultaneousVoiceCount,
    getTrackDebugState,
    dispose
  };
}
