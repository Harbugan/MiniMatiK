# Architecture — Baseline and Target

## Current implementation (observed)
Single HTML document with inline CSS/JavaScript and Tailwind CDN. In-memory state: 19 slots, seven tracks, 64 scenes x seven tracks x 16 steps. Canvas 2D low-poly animation. Web Audio oscillators synthesize notes. JavaScript setInterval drives sequencer ticks. Joystick stores X/Y values at step resolution.

## Target architecture (proposal, not approved implementation)
1. User sample acquisition: file import / microphone capture.
2. Sample bank: 19 decoded audio assets with metadata and track assignments.
3. Performance: ChordMatiK triggers assigned sample voices.
4. Sequencer: deterministic scheduling on the Web Audio clock.
5. Mutate: per-track or global DSP routing to be decided, with replayable automation.
6. Persistence: portable project representation with samples, scene data and automation.

## Engineering boundaries
Keep UI and audio concerns separable when implementation begins. Avoid blocking audio on visual rendering. Respect iOS audio unlock and microphone permissions. Do not introduce silent fallbacks to factory oscillators. Specify migrations and test strategy before refactoring the baseline.
