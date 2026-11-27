# Architecture — Baseline and Target

## Current implementation (observed)
Modular browser workspace anchored at `index.html` with Tailwind CDN, four responsibility-split stylesheets (`styles/tokens.css`, `styles/layout.css`, `styles/components.css`, `styles/views.css`), and 12 native browser ES modules under `js/` rooted at `js/app.js` with an acyclic dependency graph: PR02 soundbank primitives (`js/soundbank-state.js`, `js/sample-decoder.js`, `js/sample-recorder.js`, `js/sample-preview.js`), shared state (`js/state.js`), shared audio/legacy synth boundary (`js/audio.js`), PS1 display & HUD (`js/display.js`), Mutate & X/Y joystick (`js/mutate.js`), SEQ-16 & transport (`js/sequencer.js`), ChordMatiK (`js/chordmatik.js`), Mode 01 Sampler UI (`js/sampler.js`), and bootstrap/chrome (`js/app.js`). In-memory state: 19 initially empty soundbank slots holding real decoded `AudioBuffer` assets and metadata, seven tracks with hybrid auto-assignment and explicit `ASSIGN → T1–T7` routing, and 64 scenes x seven tracks x 16 steps. Real Web Audio `AudioBufferSourceNode` playback powers sample preview with click-safe stop. Canvas 2D renders the PS1 low-poly animation. ChordMatiK and SEQ-16 still use legacy Web Audio oscillators (`playMutatedVoice`) and `setInterval` ticks pending PR04/PR05. Joystick stores X/Y values at step resolution. Deployed to NordicWay (`/Projects/MiniMatik/`) via FTPS on merge to `main` preserving `index.html`, `styles/**`, and `js/**`.

## Target architecture (proposal, not approved implementation)
1. User sample acquisition: file import / microphone capture.
2. Sample bank: 19 decoded audio assets with metadata and track assignments.
3. Performance: ChordMatiK triggers assigned sample voices.
4. Sequencer: deterministic scheduling on the Web Audio clock.
5. Mutate: per-track or global DSP routing to be decided, with replayable automation.
6. Persistence: portable project representation with samples, scene data and automation.

## Final audio decisions — 2026-11-27
- Default One-shot/Tape/Poly; support Gate note-off and non-destructive editing.
- Smart Chord Priority (Option A) approved for PR04: CHORD groups crossfade on replacement even in One-shot; independent NOTE/DRUM One-shots play out subject to voice cap.
- Enforce eight voices per track; steal oldest with a short click-safe fade.
- Record absolute triggered MIDI pitches in live chord events. Key/scale changes apply only to subsequent live triggers.
- STRUM note-on spacing approximately 20–150 ms, Low → High, with a compact slider; Mono uses BPM-synced Up 1/8 arp.
- Scope these features to later audio-engine PRs; PR02 only establishes sample acquisition, preview and routing.

## Engineering boundaries
Keep UI and audio concerns separable when implementation begins. Avoid blocking audio on visual rendering. Respect iOS audio unlock and microphone permissions. Do not introduce silent fallbacks to factory oscillators. Specify migrations and test strategy before refactoring the baseline.


## ChordMatiK implementation constraints (approved requirements, technical design pending)
- Derive chords from selected key and Major/Natural Minor/Harmonic Minor scale; keep the 3+4 physical mapping stable.
- Schedule Mono Up arpeggio on an audio clock at 1/8-note resolution; STRUM applies to Poly only and uses adjustable Low-to-High note offsets.
- Enforce eight simultaneous voices per track in Poly including outgoing tails, stealing the oldest; outgoing CHORD groups crossfade on replacement (Smart Chord Priority Option A), while independent One-shots finish naturally. Gate releases on pad-up.
- Key/scale changes affect future chord triggers without retuning active voices. Live REC retains absolute MIDI pitches; PR05 defines playback/editing semantics.
- Treat the PS1 canvas as non-blocking visualization; audio processing must not depend on its frame rate. Mode-reactive visuals, oscilloscope and mascot are discovery items, not implementation requirements.

## PR04 planned module boundary — approved design, not implemented
- ChordMatiK UI and musical note calculation belong in `js/chordmatik.js` or small pure helper modules. Assigned user-sample voice creation, gain envelopes, track budgets, and group lifecycle belong in a dedicated performance/audio module using the existing shared AudioContext and decoded `AudioBuffer` references.
- Model each CHORD press as a cancellable performance group. On replacement, cancel pending note starts, release active group voices with click-safe fades, and start incoming voices subject to the eight-sounding-voice cap. A releasing voice still counts until it has stopped; Mono allows no overlap.
- Track voice ownership by track, group and pointer so Gate release, track mute, sample clear, mode change and global stop do not leave stuck notes. Use `AudioContext.currentTime` for scheduling, never DOM frame cadence.
- Retain legacy `playMutatedVoice` only for still-unmigrated SEQ-16 prototype calls until PR05; never use it as a ChordMatiK fallback. Avoid circular module dependencies.
- PR04 must not claim true time-preserving Stretch, sample root-key detection, sample editing or sequencer audio-clock migration. Treat tuning constants as QA parameters and document limitations.
