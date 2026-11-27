# Bugs and QA

## Status
No physical iPad QA has been reported yet. Automated Node unit tests and Chromium E2E tests at iPad 11-inch landscape viewports have been executed for PR02 and PR03, but physical iPad Safari verification remains pending.

## Implemented in PR02 & PR03 (pending physical iPad QA & owner acceptance)
- 19 soundbank slots start genuinely empty (`00/19`) with no demo kit or factory sample names.
- Real local audio file import and microphone capture (`Tap Record` / `Tap Stop`) decode into in-memory `AudioBuffer` assets.
- Explicit `PREVIEW` / `STOP` plays real decoded sample buffers through Web Audio without oscillator fallbacks.
- Hybrid auto-assignment (empty active track only), manual `ASSIGN → T1–T7`, and destructive `CLR` confirmation are wired to header, track bar, and PS1 monitor state.
- PR03 modular refactor splits the monolithic HTML into `index.html`, `styles/*.css`, and native browser ES modules under `js/*.js`, and updates NordicWay FTPS deployment for multi-file assets without behavioral or visual changes.

## Implemented in PR04 (pending physical iPad QA & owner acceptance)
- `02.CHORDMATIK` plays real decoded user `AudioBuffer` voices from the active track's assigned soundbank slot via `js/sample-voice-engine.js` with zero oscillator fallback (empty/unassigned/muted tracks are silent).
- Supports all 12 chromatic keys, Major / Natural Minor (default minor) / Harmonic Minor scales, stackable Hold+Toggle modifiers (`7TH`, `SUS4`, `9TH`, `STRUM`) above the staggered 3+4 pads, adjustable Low-to-High STRUM (`20–150 ms`), Mono Up 1/8-note arpeggio, per-track `1-SHOT`/`GATE` and `POLY`/`MONO`, Smart Chord Priority (Option A) crossfades, 8-voice per-track cap (1 in Mono), and absolute MIDI pitch storage during live REC.
- Fixed sample pitch reference is currently `C4` (`MIDI 60`, Tape playback-rate transposition); user-configurable sample root-key calibration and true time-preserving Stretch DSP remain separate future tasks.
- `DRUM` submode triggers the active track's single assigned sample at fixed semitone offsets around native pitch (`0st` on pad 1) rather than synthesizing seven factory drums.

## Remaining legacy prototype behavior & known gaps
- **Legacy synth playback in SEQ-16:** `03.SEQ-16` step triggers, `RND PAT`, and sequencer playback still invoke temporary legacy oscillator audio (`playMutatedVoice`) rather than playing assigned soundbank samples. Sample-based sequencer scheduling is scoped to PR05.
- Sequencer uses `setInterval`, which may exhibit timing jitter (PR05).
- Automation records at step resolution rather than continuous movement (PR06).
- BPM changes restart sequencer playback from step 1 (PR05).
- No project persistence: imported and recorded soundbank samples live in memory only and reset on page reload (PR07).
- Physical iPad Safari layout, touch targets, file picker behavior, microphone permissions/codecs, audio crossfade/voice-stealing feel, and simultaneous multi-touch for PR04 remain to be verified on hardware.
- Microphone capture requires a secure context (`HTTPS` or `localhost`) in Safari and Chromium.
- Native ES modules require serving `index.html` over HTTP/HTTPS (opening `index.html` directly via `file://` is blocked by browser CORS policies).

## QA protocol
Record device/browser, commit/PR, exact steps, expected/actual behavior, PASS/FAIL, and screenshots when useful. Do not mark a PR DONE until product owner approval.
