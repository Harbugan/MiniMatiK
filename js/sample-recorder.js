/**
 * MiniMatik — Microphone Sample Capture Module (PR02)
 *
 * Handles on-demand microphone permission, Tap Record / Tap Stop capture,
 * cancellation, empty-capture detection, and guaranteed MediaStream track cleanup.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MiniMatikRecorder = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PREFERRED_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac'
  ];

  class SampleRecordError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'SampleRecordError';
      this.code = code;
    }
  }

  function checkRecordingSupport() {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return {
        supported: false,
        code: 'INSECURE_CONTEXT',
        message: 'Microphone recording requires HTTPS (or localhost) in this browser.'
      };
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      return {
        supported: false,
        code: 'UNSUPPORTED_MIC_API',
        message: 'Microphone recording API (getUserMedia) is unavailable in this browser.'
      };
    }
    if (typeof MediaRecorder === 'undefined') {
      return {
        supported: false,
        code: 'UNSUPPORTED_RECORDER_API',
        message: 'Audio recording (MediaRecorder) is not supported in this browser.'
      };
    }
    return { supported: true, code: null, message: null };
  }

  function pickSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    for (let i = 0; i < PREFERRED_MIME_TYPES.length; i++) {
      const candidate = PREFERRED_MIME_TYPES[i];
      try {
        if (MediaRecorder.isTypeSupported(candidate)) {
          return candidate;
        }
      } catch (_) {
        // Continue checking fallback candidates.
      }
    }
    return '';
  }

  function mapMicrophoneError(err) {
    if (err instanceof SampleRecordError) return err;
    const name = err && err.name ? err.name : '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return new SampleRecordError(
        'PERMISSION_DENIED',
        'Microphone permission denied. Allow microphone access in browser settings to record.'
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return new SampleRecordError(
        'NO_MICROPHONE',
        'No microphone was found on this device.'
      );
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return new SampleRecordError(
        'MIC_UNAVAILABLE',
        'Microphone is busy or unavailable. Close other apps using the mic and try again.'
      );
    }
    if (name === 'SecurityError') {
      return new SampleRecordError(
        'SECURITY_ERROR',
        'Microphone access was blocked by browser security policy (HTTPS required).'
      );
    }
    if (name === 'AbortError') {
      return new SampleRecordError(
        'ABORTED',
        'Microphone capture was interrupted before starting.'
      );
    }

    return new SampleRecordError(
      'MIC_ERROR',
      (err && err.message) ? `Microphone error: ${err.message}` : 'Unable to access microphone.'
    );
  }

  function stopStreamTracks(stream) {
    if (!stream || typeof stream.getTracks !== 'function') return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_) {
        // Ignore track teardown errors.
      }
    });
  }

  function createRecorderController(callbacks) {
    const onStateChange = (callbacks && callbacks.onStateChange) || function () {};
    const onTick = (callbacks && callbacks.onTick) || function () {};

    let status = 'idle'; // 'idle' | 'requesting' | 'recording' | 'stopping'
    let sessionCounter = 0;
    let stream = null;
    let mediaRecorder = null;
    let chunks = [];
    let startTimeMs = 0;
    let tickTimer = null;
    let cancelRequested = false;
    let stopPromise = null;
    let resolveStop = null;
    let rejectStop = null;
    let chosenMimeType = '';

    function setStatus(nextStatus) {
      status = nextStatus;
      onStateChange(status);
    }

    function clearTickTimer() {
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    }

    function releaseResources() {
      clearTickTimer();
      stopStreamTracks(stream);
      stream = null;
      mediaRecorder = null;
      chunks = [];
    }

    function getStatus() {
      return status;
    }

    function isBusy() {
      return status !== 'idle';
    }

    async function start() {
      if (status !== 'idle') {
        throw new SampleRecordError('BUSY', 'A recording session is already in progress.');
      }

      const support = checkRecordingSupport();
      if (!support.supported) {
        throw new SampleRecordError(support.code, support.message);
      }

      const token = ++sessionCounter;
      cancelRequested = false;
      chunks = [];
      setStatus('requesting');

      let acquiredStream;
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        if (token === sessionCounter) {
          setStatus('idle');
        }
        throw mapMicrophoneError(err);
      }

      // If user tapped Cancel while permission dialog was open, release immediately.
      if (cancelRequested || token !== sessionCounter) {
        stopStreamTracks(acquiredStream);
        if (token === sessionCounter) {
          setStatus('idle');
        }
        return { started: false, cancelled: true };
      }

      stream = acquiredStream;
      chosenMimeType = pickSupportedMimeType();

      try {
        mediaRecorder = chosenMimeType
          ? new MediaRecorder(stream, { mimeType: chosenMimeType })
          : new MediaRecorder(stream);
      } catch (_) {
        // Retry without explicit options if browser rejects selected MIME string.
        try {
          chosenMimeType = '';
          mediaRecorder = new MediaRecorder(stream);
        } catch (err) {
          releaseResources();
          setStatus('idle');
          throw mapMicrophoneError(err);
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event && event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        const err = mapMicrophoneError(event && event.error ? event.error : new Error('Recording failed.'));
        releaseResources();
        setStatus('idle');
        if (rejectStop) {
          const rej = rejectStop;
          resolveStop = null;
          rejectStop = null;
          stopPromise = null;
          rej(err);
        }
      };

      mediaRecorder.onstop = () => {
        const elapsedMs = startTimeMs ? Math.max(0, Date.now() - startTimeMs) : 0;
        const mime = (mediaRecorder && mediaRecorder.mimeType) || chosenMimeType || 'audio/webm';
        const recordedChunks = chunks.slice();
        const wasCancelled = cancelRequested;

        releaseResources();
        setStatus('idle');

        const res = resolveStop;
        const rej = rejectStop;
        resolveStop = null;
        rejectStop = null;
        stopPromise = null;

        if (!res) return;

        if (wasCancelled) {
          res({ cancelled: true, blob: null, mimeType: mime, elapsedMs });
          return;
        }

        const blob = new Blob(recordedChunks, { type: mime });
        if (!blob || blob.size === 0) {
          if (rej) {
            rej(new SampleRecordError(
              'EMPTY_CAPTURE',
              'Recording was empty. Try recording a slightly longer sound.'
            ));
          }
          return;
        }

        res({ cancelled: false, blob, mimeType: blob.type || mime, elapsedMs });
      };

      try {
        mediaRecorder.start();
      } catch (err) {
        releaseResources();
        setStatus('idle');
        throw mapMicrophoneError(err);
      }

      startTimeMs = Date.now();
      setStatus('recording');
      onTick(0);
      tickTimer = setInterval(() => {
        onTick(Date.now() - startTimeMs);
      }, 100);

      return { started: true, cancelled: false, mimeType: mediaRecorder.mimeType || chosenMimeType };
    }

    function stop() {
      if (status === 'stopping' && stopPromise) {
        return stopPromise;
      }
      if (status !== 'recording' || !mediaRecorder) {
        return Promise.resolve({ cancelled: true, blob: null, mimeType: '', elapsedMs: 0 });
      }

      clearTickTimer();
      setStatus('stopping');

      stopPromise = new Promise((resolve, reject) => {
        resolveStop = resolve;
        rejectStop = reject;
      });

      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        } else {
          releaseResources();
          setStatus('idle');
          const rej = rejectStop;
          resolveStop = null;
          rejectStop = null;
          stopPromise = null;
          if (rej) {
            rej(new SampleRecordError('EMPTY_CAPTURE', 'Recording stopped before audio was captured.'));
          }
        }
      } catch (err) {
        releaseResources();
        setStatus('idle');
        const rej = rejectStop;
        resolveStop = null;
        rejectStop = null;
        stopPromise = null;
        if (rej) rej(mapMicrophoneError(err));
      }

      return stopPromise;
    }

    function cancel() {
      cancelRequested = true;
      clearTickTimer();

      if (status === 'requesting') {
        setStatus('idle');
        return;
      }

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch (_) {
          releaseResources();
          setStatus('idle');
        }
      } else {
        releaseResources();
        setStatus('idle');
      }
    }

    function forceCleanup() {
      cancelRequested = true;
      releaseResources();
      if (status !== 'idle') {
        setStatus('idle');
      }
    }

    return {
      getStatus,
      isBusy,
      start,
      stop,
      cancel,
      forceCleanup
    };
  }

  return {
    PREFERRED_MIME_TYPES,
    SampleRecordError,
    checkRecordingSupport,
    pickSupportedMimeType,
    mapMicrophoneError,
    stopStreamTracks,
    createRecorderController
  };
});
