/**
 * MiniMatik — Web Audio Context & Sample Decode Module (PR02)
 *
 * Manages lazy AudioContext creation/resume (iOS Safari compatible) and
 * decodes user-supplied local audio files and recorded audio blobs into
 * real AudioBuffer instances without synthetic fallbacks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MiniMatikDecoder = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MIN_VALID_DURATION_SEC = 0.02;

  class SampleDecodeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'SampleDecodeError';
      this.code = code;
    }
  }

  function createAudioContextManager() {
    let audioCtx = null;

    function getCtor() {
      if (typeof window === 'undefined') return null;
      return window.AudioContext || window.webkitAudioContext || null;
    }

    function isWebAudioSupported() {
      return typeof getCtor() === 'function';
    }

    function getContext() {
      if (audioCtx) return audioCtx;
      const AC = getCtor();
      if (!AC) {
        throw new SampleDecodeError(
          'UNSUPPORTED_API',
          'Web Audio API is not supported in this browser.'
        );
      }
      audioCtx = new AC();
      return audioCtx;
    }

    function getExistingContext() {
      return audioCtx;
    }

    async function ensureRunning() {
      const ctx = getContext();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        await ctx.resume();
      }
      return ctx;
    }

    return {
      isWebAudioSupported,
      getContext,
      getExistingContext,
      ensureRunning
    };
  }

  function readBlobAsArrayBuffer(blob) {
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new SampleDecodeError('READ_ERROR', 'Could not read audio data.'));
      reader.readAsArrayBuffer(blob);
    });
  }

  function decodeAudioDataCompat(audioCtx, arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return Promise.reject(new SampleDecodeError('EMPTY_DATA', 'Audio data is empty.'));
    }

    // Clone buffer so browser implementations that detach input buffers do not cause side effects.
    const bufferCopy = arrayBuffer.slice(0);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };
      const fail = (err) => {
        if (!settled) {
          settled = true;
          reject(err || new Error('Audio decode failed.'));
        }
      };

      try {
        const maybePromise = audioCtx.decodeAudioData(bufferCopy, finish, fail);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish, fail);
        }
      } catch (err) {
        fail(err);
      }
    });
  }

  async function decodeFile(file, audioContextManager) {
    if (!file) {
      throw new SampleDecodeError('NO_FILE', 'No audio file selected.');
    }
    if (typeof file.size === 'number' && file.size === 0) {
      throw new SampleDecodeError(
        'EMPTY_FILE',
        `"${file.name || 'Selected file'}" is empty (0 bytes).`
      );
    }

    let arrayBuffer;
    try {
      arrayBuffer = await readBlobAsArrayBuffer(file);
    } catch (err) {
      throw new SampleDecodeError(
        'READ_ERROR',
        `Could not read "${file.name || 'file'}". Please try another audio file.`
      );
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new SampleDecodeError(
        'EMPTY_FILE',
        `"${file.name || 'Selected file'}" contains no audio data.`
      );
    }

    const ctx = audioContextManager.getContext();
    let audioBuffer;
    try {
      audioBuffer = await decodeAudioDataCompat(ctx, arrayBuffer);
    } catch (err) {
      throw new SampleDecodeError(
        'DECODE_ERROR',
        `Could not decode "${file.name || 'file'}". Choose a valid audio file (WAV, M4A, MP3, AAC, etc.).`
      );
    }

    if (!audioBuffer || !audioBuffer.length || !audioBuffer.duration || audioBuffer.numberOfChannels <= 0) {
      throw new SampleDecodeError(
        'INVALID_BUFFER',
        `"${file.name || 'Selected file'}" decoded with no playable audio frames.`
      );
    }

    return {
      buffer: audioBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      mimeType: file.type || 'audio/unknown',
      fileName: file.name || null,
      fileSize: file.size || arrayBuffer.byteLength,
      sourceType: 'import',
      createdAt: Date.now()
    };
  }

  async function decodeRecordedBlob(blob, audioContextManager) {
    if (!blob || blob.size === 0) {
      throw new SampleDecodeError(
        'EMPTY_CAPTURE',
        'Recording was empty. Try recording a slightly longer sound.'
      );
    }

    let arrayBuffer;
    try {
      arrayBuffer = await readBlobAsArrayBuffer(blob);
    } catch (err) {
      throw new SampleDecodeError(
        'READ_ERROR',
        'Could not read the recorded audio buffer.'
      );
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new SampleDecodeError(
        'EMPTY_CAPTURE',
        'Recording was empty. Try recording a slightly longer sound.'
      );
    }

    const ctx = audioContextManager.getContext();
    let audioBuffer;
    try {
      audioBuffer = await decodeAudioDataCompat(ctx, arrayBuffer);
    } catch (err) {
      throw new SampleDecodeError(
        'DECODE_ERROR',
        'Recorded audio could not be decoded by this browser.'
      );
    }

    if (
      !audioBuffer ||
      audioBuffer.length === 0 ||
      audioBuffer.numberOfChannels <= 0 ||
      audioBuffer.duration < MIN_VALID_DURATION_SEC
    ) {
      throw new SampleDecodeError(
        'EMPTY_CAPTURE',
        'Recording was too short or empty. Tap Record, capture audio, then tap Stop.'
      );
    }

    return {
      buffer: audioBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      mimeType: blob.type || 'audio/unknown',
      fileName: null,
      fileSize: blob.size || arrayBuffer.byteLength,
      sourceType: 'record',
      createdAt: Date.now()
    };
  }

  return {
    SampleDecodeError,
    MIN_VALID_DURATION_SEC,
    createAudioContextManager,
    readBlobAsArrayBuffer,
    decodeAudioDataCompat,
    decodeFile,
    decodeRecordedBlob
  };
});
