# Bugs and QA

## Status
No physical iPad QA has been reported for this repository baseline. The items below are code-review observations, not verified device failures.

## Known prototype gaps
- Sample slots populate with hard-coded labels rather than imported audio.
- Demo kit injects seven synthetic placeholder sounds.
- Oscillator playback is not routed from assigned samples.
- Sequencer uses setInterval, which may exhibit timing jitter.
- Automation records at step resolution rather than continuous movement.
- BPM changes restart playback from step 1.
- No project persistence.
- iPad layout and simultaneous multi-touch unverified.
- ChordMatiK INV currently changes major/minor quality rather than implementing conventional inversion.

## QA protocol
Record device/browser, commit/PR, exact steps, expected/actual behavior, PASS/FAIL, and screenshots when useful. Do not mark a PR DONE until product owner approval.
