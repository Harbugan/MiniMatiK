# PR02 — Real Soundbank Foundation

**Status:** READY FOR IMPLEMENTATION HANDOFF — NOT STARTED
**Owner:** Google Antigravity (implementation)
**Product/UX:** ChatGPT and product owner
**Target:** iPad 11-inch landscape, browser-based prototype

## Objective
Replace the mock soundbank-loading behavior with real user-supplied audio acquisition and preview, while preserving the MiniMatik UI and existing 19-slot/7-track structure. This PR establishes a real sample foundation, not the complete audio engine.

## Read first
README.md, AGENTS.md, DECISIONS.md, PRODUCT-SPEC.md, DESIGN-SYSTEM.md, ARCHITECTURE.md, ROADMAP.md, BUGS.md and minimatik.html. Respect approved decisions and report ambiguity rather than inventing new product behavior.

## In scope
1. Keep all 19 soundbank slots genuinely empty on fresh load (00/19). No demo kit, factory samples, auto-filled names, oscillator-based fake sample preview or hidden synthetic fallback.
2. Tapping an empty slot opens a compact **Record / Import** choice.
3. **Import:** Select a local audio file via the platform picker, decode it, store its audio buffer and useful metadata in the in-memory bank, and show a human-readable slot name. Handle cancel, invalid/unreadable file and decode failure without changing the slot.
4. **Record:** Tap Record to start microphone capture; tap Stop to finish. Request permission only on user action. Show clear recording state and handle permission denial, unavailable microphone, cancellation and empty capture. Release microphone tracks after stopping. Use actual recorded audio.
5. **Preview:** Tapping an explicitly labelled Preview control on a loaded slot plays the recorded/imported sample through Web Audio. Preview must stop cleanly and not trigger fake oscillator audio. Avoid clicks at preview stop.
6. **Assignment:** When a new sample is successfully acquired, auto-assign it to the active track only if that track is unassigned. If already assigned, preserve the assignment. For manual assignment select a loaded slot, tap **ASSIGN**, then choose T1–T7; explicit replacement is allowed. Selecting/previewing a slot alone must not overwrite track routing.
7. **Clear:** Clearing a slot removes its sample and resets all track references to that slot, without damaging unrelated slots. Provide a confirmation before destructive clearing.
8. Keep the existing header, bank count, track badges, active-track context and PS1 monitor consistent with actual bank/assignment state. Preserve full-viewport iPad landscape layout and persistent X/Y joystick.
9. Provide simple, readable code boundaries for sample capture, decode, preview, and bank state; avoid unnecessary dependencies.

## Out of scope
- ChordMatiK sample-pitched playback, chord modifiers, STRUM and Mono arpeggio.
- Sequencer sample playback, audio-clock scheduling, live-note recording and Mutate DSP/automation.
- Non-destructive Trim/Pitch/Volume/Reverse editor; Tape/Stretch engine; advanced One-shot/Gate behavior; Poly voice management.
- Project persistence, export/import project format, offline caching and new graphics/mascot/oscilloscope.
- Rewriting unrelated prototype behavior. Existing oscillator-based ChordMatiK/SEQ sound may remain temporarily as **clearly identified legacy prototype behavior**, but must not masquerade as assigned-sample playback. Remove the demo kit and fake slot-load paths.

## Acceptance criteria
- Fresh launch: exactly 00/19 loaded; all 7 tracks unassigned.
- Import one valid audio file into slot 01: 01/19; Preview audibly plays the imported file, not an oscillator.
- Cancel import / deny microphone permission: bank and track assignments unchanged; actionable UI feedback.
- Record a short microphone sample using Tap Record / Tap Stop; preview plays the actual capture.
- New sample auto-assigns only to an empty active track. With an already assigned active track, routing is preserved until **ASSIGN → T1–T7**.
- Clear a slot: count decreases and all references to that slot are removed. Other slots remain intact.
- Multiple sequential imports and recordings work; recording resources are released.
- Existing four modes, seven tracks, 64-scene state, 16-step UI, transport and persistent joystick remain accessible.
- No unintended vertical page scrolling or clipped controls at iPad 11-inch landscape size.
- No runtime errors during normal operations. Report unsupported browser/device APIs clearly rather than silently faking success.

## Testing and delivery
- Test import success, cancellation, unsupported/corrupt audio, microphone success/denial, recording stop, preview/stop, clearing, assignment and replacement.
- Provide browser test results and a **physical iPad Safari QA checklist**; do not claim physical testing unless actually performed.
- Document remaining legacy prototype behavior in BUGS.md, and update relevant docs only for behavior actually implemented.
- Open **one focused PR** with summary, files changed, tests, known limitations and any necessary follow-up decisions.
- **Do not merge automatically.** Await product-owner review and approval.
