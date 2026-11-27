/**
 * MiniMatik — Real Web Audio Sample Preview Module (PR02)
 *
 * Plays loaded AudioBuffer samples directly through AudioBufferSourceNode + GainNode.
 * Click-safe fade-in and fade-out on early stop. Never synthesizes fallback oscillator tones.
 */
export const FADE_IN_SEC = 0.004;
export const FADE_OUT_SEC = 0.015;
const STOP_SAFETY_PAD_SEC = 0.004;

  function createSamplePreviewPlayer(audioContextManager, callbacks) {
    const onStateChange = (callbacks && callbacks.onStateChange) || function () {};
    let active = null; // { source, gain, ctx, slotIndex, stopping }

    function isPlaying() {
      return active !== null;
    }

    function getPlayingSlotIndex() {
      return active ? active.slotIndex : null;
    }

    function notify(playing, slotIndex) {
      onStateChange({ playing, slotIndex });
    }

    function disconnectNodes(source, gain) {
      try { source.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    }

    function stop() {
      if (!active) return false;

      const current = active;
      active = null;
      current.stopping = true;

      const { source, gain, ctx } = current;
      try {
        const now = ctx.currentTime;
        const currentGain = Math.max(0.0001, gain.gain.value || 1.0);
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(currentGain, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_SEC);
        source.stop(now + FADE_OUT_SEC + STOP_SAFETY_PAD_SEC);
      } catch (_) {
        try { source.stop(); } catch (_) {}
        disconnectNodes(source, gain);
      }

      notify(false, null);
      return true;
    }

    async function play(slotIndex, audioBuffer) {
      if (!audioBuffer) {
        throw new Error('Cannot preview an empty slot.');
      }

      // Stop any currently playing preview cleanly first.
      if (active) {
        stop();
      }

      const ctx = await audioContextManager.ensureRunning();
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = audioBuffer;

      const now = ctx.currentTime;
      const fadeIn = Math.min(FADE_IN_SEC, audioBuffer.duration * 0.25);
      if (fadeIn > 0.0005) {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(1.0, now + fadeIn);
      } else {
        gain.gain.setValueAtTime(1.0, now);
      }

      source.connect(gain);
      gain.connect(ctx.destination);

      const entry = {
        source,
        gain,
        ctx,
        slotIndex,
        stopping: false
      };
      active = entry;

      source.onended = () => {
        disconnectNodes(source, gain);
        if (active === entry) {
          active = null;
          notify(false, null);
        }
      };

      source.start(now);
      notify(true, slotIndex);
      return true;
    }

    return {
      isPlaying,
      getPlayingSlotIndex,
      play,
      stop
    };
  }

export {
  createSamplePreviewPlayer
};
