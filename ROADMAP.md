# MiniMatik Roadmap

Status legend: PLANNED / IN PROGRESS / QA / DONE. No implementation is approved by this document alone.

## Phase 1 — Baseline and design validation
- **PR01 — Baseline:** Commit the handed-over single-file HTML unchanged, create product documentation, and test iPad 11-inch landscape layout and touch ergonomics. **IN PROGRESS: repository setup; physical QA pending.**
- Product design review: sampler, ChordMatiK, scene navigation, Mutate ergonomics. **PLANNED**

## Phase 2 — Real sample engine
- **PR02 — Soundbank:** Import audio files and record microphone input into 19 initially empty slots; preview, clear, and assign samples to seven tracks. **PLANNED**
- **PR03 — ChordMatiK:** Perform pitched samples, chords and modifiers on the selected track. **PLANNED**
- **PR04 — Sequencer:** Audio-clock-backed 16-step playback, live recording, seven tracks, and 64 scenes. **PLANNED**

## Phase 3 — Mutate
- **PR05 — DSP and automation:** Map X/Y to real-time effects; record and replay movement; clear automation per track/scene. **PLANNED**

## Phase 4 — Finish
- **PR06 — Persistence and polish:** Local project save/load, portable sample data, touch and audio QA, low-poly visuals. **PLANNED**

## Release gates
Every PR: narrow scope, implementation summary, test notes, known limitations, owner approval, physical iPad QA when applicable, and explicit merge approval.

## Open design questions
See DECISIONS.md. PR numbering is provisional and may be refined before each contract.


## ChordMatiK design checkpoint — 2026-11-27
**Product decisions substantially complete.** Approved: 3+4 layout and mapping, compact KEY + SCALE, Major/Natural Minor/Harmonic Minor, four modifiers above pads, limited modifier combinations, adjustable Low-to-High STRUM, Mono Up 1/8 arp, Smart switching, 8 voices/track, and next-trigger key/scale updates. **Not yet implementation-ready as a standalone PR:** finalize outgoing-voice behavior vs One-shot/Gate, note/voicing rules, recorded-event representation, modifier stacking and voice stealing. PR03 also depends on PR02 real sample playback.

## Display/visual feedback discovery
**PLANNED — design only:** Explore mode-reactive PS1 low-poly visuals, chord/parameter feedback, oscilloscope-style audio visualization, and optional low-poly cat mascot. Decide visual scope separately before adding any of these to implementation contracts; preserve readability and iPad performance.
