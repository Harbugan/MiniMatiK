# Bugs and QA

## Status
No physical iPad QA has been reported yet. Automated Node unit tests and Chromium E2E tests at iPad 11-inch landscape viewports have been executed for PR02 and PR03, but physical iPad Safari verification remains pending.

## Implemented in PR02 & PR03 (pending physical iPad QA & owner acceptance)
- 19 soundbank slots start genuinely empty (`00/19`) with no demo kit or factory sample names.
- Real local audio file import and microphone capture (`Tap Record` / `Tap Stop`) decode into in-memory `AudioBuffer` assets.
- Explicit `PREVIEW` / `STOP` plays real decoded sample buffers through Web Audio without oscillator fallbacks.
- Hybrid auto-assignment (empty active track only), manual `ASSIGN → T1–T7`, and destructive `CLR` confirmation are wired to header, track bar, and PS1 monitor state.
- PR03 modular refactor splits the monolithic HTML into `index.html`, `styles/*.css`, and native browser ES modules under `js/*.js`, and updates NordicWay FTPS deployment for multi-file assets without behavioral or visual changes.

## Remaining legacy prototype behavior & known gaps
- **Legacy synth playback in ChordMatiK & SEQ-16:** `02.CHORDMATIK` pads, `03.SEQ-16` step triggers, `RND PAT`, and sequencer playback still invoke temporary legacy oscillator audio (`playMutatedVoice`) rather than playing assigned soundbank samples. Real sample playback for ChordMatiK and SEQ-16 is scoped to PR04 and PR05.
- Sequencer uses `setInterval`, which may exhibit timing jitter.
- Automation records at step resolution rather than continuous movement.
- BPM changes restart playback from step 1.
- No project persistence: imported and recorded soundbank samples live in memory only and reset on page reload.
- Physical iPad Safari layout, touch targets, file picker behavior, microphone permissions/codecs, and simultaneous multi-touch remain unverified on hardware.
- ChordMatiK `MIN/INV` currently toggles major/minor quality rather than implementing approved PR04 scale/STRUM decisions.
- Microphone capture requires a secure context (`HTTPS` or `localhost`) in Safari and Chromium.
- Native ES modules require serving `index.html` over HTTP/HTTPS (opening `index.html` directly via `file://` is blocked by browser CORS policies).

## QA protocol
Record device/browser, commit/PR, exact steps, expected/actual behavior, PASS/FAIL, and screenshots when useful. Do not mark a PR DONE until product owner approval.
