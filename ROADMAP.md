# MiniMatik Roadmap

Status legend: PLANNED / IN PROGRESS / QA / DONE. No implementation is approved by this document alone.

## Phase 1 — Baseline and design validation
- **PR01 — Baseline:** Commit the handed-over single-file HTML unchanged, create product documentation, and test iPad 11-inch landscape layout and touch ergonomics. **DONE — baseline committed; superseded by merged PR02/PR03 implementation.**
- Product design review: sampler, ChordMatiK, scene navigation, Mutate ergonomics. **PLANNED**

## Phase 2 — Modular foundation and real sample engine
- **PR03 — Modular Foundation:** Extract HTML/CSS/JS into maintainable modules and update NordicWay FTPS deployment for multi-file assets. **DONE — merged to main; user reports physical QA passed.** Contract: `TASKS/PR03-MODULAR-FOUNDATION.md`.
- **PR02 — Soundbank:** Import audio files and record microphone input into 19 initially empty slots; preview, clear, and assign samples to seven tracks. **DONE — merged to main (PR #1); user reports testing completed.**
- **PR04 — ChordMatiK Audio Engine:** Real assigned-sample performance, diatonic chords/modifiers, Smart Chord Priority, Gate/One-shot and 8-voice management. **QA — IMPLEMENTED ON FEATURE BRANCH; PENDING PHYSICAL IPAD QA & OWNER APPROVAL.** Contract: `TASKS/PR04-CHORDMATIK-AUDIO-ENGINE.md`.
- **PR05 — Sequencer:** Audio-clock-backed 16-step sample playback, Q ON/OFF live recording, multiple events, overdub, duration-aware notes, next-bar scenes and whole-scene copy. **PLANNED — DESIGN APPROVED; CONTRACT READY; NOT IMPLEMENTED.** Contract: `TASKS/PR05-REAL-SEQUENCER.md`.

## Phase 3 — Mutate
- **PR06 — DSP and automation:** Map X/Y to real-time effects; record and replay movement; clear automation per track/scene. **PLANNED**

## Phase 4 — Finish
- **PR07 — Persistence and polish:** Local project save/load, portable sample data, touch and audio QA, low-poly visuals. **PLANNED**

## Implementation readiness — 2026-11-27
- **PR01:** Baseline committed; superseded by subsequent merged PRs.
- **PR02:** Real Soundbank Foundation merged as GitHub PR #1; user reports QA passed. Historical contract: `TASKS/PR02-REAL-SOUNDBANK.md`.
- **PR03:** Modular Foundation merged as GitHub PR #2; user reports QA passed. `index.html`, split CSS/JS and multi-file NordicWay deployment are present on main. Contract: `TASKS/PR03-MODULAR-FOUNDATION.md`.
- **PR04:** Dependencies PR02 and PR03 merged. Smart Chord Priority (Option A) approved; One-shot/crossfade conflict resolved. Focused Antigravity contract prepared on documentation branch; implementation has not begun.
- **Visual discovery:** PS1 display expression, oscilloscope and optional low-poly cat are separate design tasks, not PR02 requirements.

## Verified repository checkpoint — 2026-11-27
- Main contains `index.html`, `styles/`, native `js/` modules and a multi-file NordicWay FTPS workflow.
- PR03 merged per user confirmation; physical iPad test result is user-reported, not independently reproduced here.
- Next planned implementation: **PR04 ChordMatiK Audio Engine**. Smart Chord Priority approved; implementation requires separate owner go-ahead.

## Release gates
Every PR: narrow scope, implementation summary, test notes, known limitations, owner approval, physical iPad QA when applicable, and explicit merge approval.

## Open design questions
See DECISIONS.md. PR numbering is provisional and may be refined before each contract.


## ChordMatiK design checkpoint — 2026-11-27
**Product decisions substantially complete.** Approved: 3+4 layout and mapping, compact KEY + SCALE, Major/Natural Minor/Harmonic Minor, four modifiers above pads, limited modifier combinations, adjustable Low-to-High STRUM, Mono Up 1/8 arp, Smart switching, 8 voices/track, and next-trigger key/scale updates. **PR04 contract prepared:** outgoing chord behavior approved as Smart Chord Priority (Option A); absolute MIDI note recording, modifier stacking and oldest-voice stealing approved. Musical voicing and envelope timing require implementation tests and tuning. ChordMatiK implementation (now planned PR04) depends on PR02 real sample playback and PR03 modular foundation.

## Display/visual feedback discovery
**PLANNED — design only:** Explore mode-reactive PS1 low-poly visuals, chord/parameter feedback, oscilloscope-style audio visualization, and optional low-poly cat mascot. Decide visual scope separately before adding any of these to implementation contracts; preserve readability and iPad performance.

## PR04 handoff checkpoint — 2026-11-27
- **Design:** APPROVED — Smart Chord Priority Option A; chord groups crossfade even in One-shot, ordinary NOTE/DRUM One-shots play out, Gate follows release, eight voices maximum per track.
- **Documentation:** Contract ready at `TASKS/PR04-CHORDMATIK-AUDIO-ENGINE.md`; docs branch only, no application code changed.
- **Implementation:** NOT STARTED. Antigravity must receive explicit owner authorization before coding; owner QA and merge approval remain separate gates.
- **PR05 boundary:** Sequencer oscillator playback and `setInterval` scheduling remain PR05 work; do not claim they are resolved by PR04.

## Roadmap sequencing decision — 2026-11-28
- **PR05 stays Sequencer (PLANNED).** Implement audio-clock-backed playback of user-assigned samples, seven tracks, 16 steps and up to 64 scenes; detailed scope and acceptance criteria require a separate PR05 design/Task Contract before implementation.
- **Sample Editing — dedicated follow-up after PR05 (PLANNED; PR number TBD).** Non-destructive **TRIM, PITCH, VOLUME, REVERSE** for user-imported/recorded samples. Preserve original audio; editing parameters remain reversible and adjustable. Design an iPad-friendly waveform and trim-handle interaction before assigning a PR number or preparing an implementation contract.
- **Dependencies and ordering:** Do not delay PR05 for Sample Editing. Plan Sample Editing after PR05 and before final persistence/polish; adjust later PR numbering only through a separate explicit decision, preserving existing PR06 Mutate and PR07 Persistence labels until then.
- **Out of scope now:** No sample-editor implementation, sequencer implementation, automatic PR renumbering or merges authorized by this documentation change.
- **PR04 physical QA:** Owner reports five PASS results for Smart Switching, Modifiers/STRUM, Mono Arpeggio, One-shot/Gate and Multi-touch. PR04 is already merged; this records reported musical QA without claiming every regression check was performed.

## PR05 Real Sequencer design checkpoint — 2026-11-28
- **Design approved; implementation not started.** Q ON/OFF; Tap + Note Detail; next-bar scene switching; continuous overdub; multiple note events per step; recorded note duration; entire-scene copy to chosen destination.
- **Contract ready for review:** `TASKS/PR05-REAL-SEQUENCER.md`. The implementation must replace SEQ-16 legacy oscillator and setInterval timing with user-sample playback and a Web Audio-clock scheduler while retaining PR04 behavior and existing step automation.
- **Explicit exclusions:** Song arrangement/chaining, sample editing (planned after PR05), Mutate DSP and project persistence. Do not renumber PR06/PR07.
- **Release gate:** Separate owner authorization before Antigravity implementation, physical iPad QA and explicit merge approval.
