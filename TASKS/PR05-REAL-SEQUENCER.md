# PR05 — Real Sample Sequencer

**Status:** DESIGN APPROVED — TASK CONTRACT READY FOR REVIEW; NOT IMPLEMENTED
**Base:** main, after merged PR04
**Owner approval:** Product decisions approved 2026-11-28. Separate authorization required before Antigravity implements.

## Objective
Replace legacy SEQ-16 oscillator and setInterval playback with accurate Web Audio-clock scheduling of real user-supplied track samples. Enable expressive live recording with optional quantization, multiple note events per step, duration-aware playback, continuous overdub and next-bar scene switching. Preserve iPad 11-inch landscape simplicity.

## Read first
AGENTS.md, ROADMAP.md, DECISIONS.md, PRODUCT-SPEC.md, ARCHITECTURE.md, DESIGN-SYSTEM.md, BUGS.md, README.md, current js/sequencer.js, js/chordmatik.js, js/sample-voice-engine.js, js/state.js and existing tests. Validate the actual main implementation before changing code.

## Approved product behavior
1. **Playback:** 7 tracks per scene, 16 steps per track, up to 64 scenes. Each unmuted track uses only its assigned decoded user sample. Empty/unassigned tracks stay silent; no SEQ-16 oscillator fallback, including step audition and RND PAT.
2. **Clock:** Web Audio currentTime-based lookahead scheduling, independent of DOM rendering; precise BPM and stable 16-step looping. At 4/4, steps are 16th notes. Transport PLAY/STOP/REC controls remain visible.
3. **Q ON/OFF:** Q ON snaps live note onsets to the nearest 16th step; Q OFF stores the actual musical timing offset within the 16-step loop. Do not collapse unquantized events onto the grid. Q is a recording setting, not destructive re-quantization of prior events.
4. **Multiple events:** A step may hold multiple independently triggered note/chord events, each with absolute MIDI pitch list, onset time within the loop, and recorded note duration. Preserve repeated same-pitch hits; do not deduplicate overdubs silently.
5. **Overdub:** Recording continues across the step 16 → 1 boundary. New events are added without erasing existing notes. Do not replace an existing event unless the user explicitly edits/deletes it.
6. **Note duration:** Capture note-on and note-off times. During playback, Gate respects recorded hold duration with click-safe release; One-shot follows the sample's natural end (subject to the approved voice cap / chord-priority rules). Handle notes crossing the bar boundary without cutting or duplicating them.
7. **Step editing:** Tap a step to activate/deactivate its default event; Note Detail lets the user inspect/edit individual pitches, note onset offsets and duration, and delete individual events. A step with multiple events must not be flattened. Avoid ambiguous toggling that silently destroys recorded multi-event content.
8. **Scene switch:** While playing, scene selection queues a change for the next bar boundary; show both currently playing scene and queued destination clearly. While stopped, selection can be immediate. On switch, cancel future scheduled events from the outgoing scene without cancelling already sounding One-shots; Gate and chord voice ownership must follow approved release behavior.
9. **Scene copy:** Copy the entire source scene (all seven tracks, all note events and existing step-level X/Y automation) into a user-selected destination, preserving original source; warn before replacing a non-empty destination. Keep scene selection, track and copy destination visible.
10. **Existing ChordMatiK:** Record the actual triggered MIDI pitches; KEY/SCALE changes never re-harmonize already recorded events. Preserve PR04 Smart Chord Priority, STRUM, modifiers and Mono/Poly. Avoid recording both a chord's group and its scheduled internal notes as duplicates.
11. **Voice lifecycle:** Reuse or extend PR04's sample voice engine rather than adding a second competing voice manager. Enforce eight sounding voices per track (one in Mono), including overlapping release tails; oldest-voice stealing remains click-safe.
12. **UI:** Keep 16-step grid and seven-track navigation primary; show Q state, REC state, current scene, queued scene and Note Detail only when needed. No page scroll or visual redesign.

## Deterministic engineering guidance (implementation details, not additional product features)
- Prefer normalized per-event onset as an offset within a 16-step bar and note duration in beats or seconds with explicit tempo semantics; avoid relying on Date.now for playback scheduling. Events can be grouped by step for UI without losing individual timing.
- Represent long notes crossing the bar boundary using note-on and note-off lifecycle ownership. A recorded onset just before bar end must survive the loop boundary with a single release.
- At a scene boundary, unschedule future outgoing note-ons and transfer future scheduler cursor to the new scene exactly once. Do not replay step 1 twice.
- Define clear migration for existing scene step objects {active,midiNotes,autoX,autoY}. Preserve existing manually entered notes and step automation; no data loss on in-memory migration.
- Quantize ties, near-boundary recording, overlapping note-on/off, repeated taps, track mute, BPM changes and scene changes need deterministic tests. Document exact handling of edge cases in PR notes; do not invent a song arrangement mode.
- For Q OFF, UI remains step-centric while event onset offsets are stored precisely. A visible step represents the event's owning 16th subdivision; microtiming is inspectable in Note Detail.
- Existing PR04 fixed sample reference C4/MIDI60 and Tape playback remain unchanged; no new Stretch DSP.
- The existing X/Y step automation prototype must remain functional without expanding PR06 continuous automation scope.

## Explicit non-goals
Song arrangement/chaining, per-step probability, swing, new effects, Mutate DSP rewrite, sample editing (TRIM/PITCH/VOLUME/REVERSE), persistence/export, new factory sounds, new synth fallback, new visual assets, sample looping, and redesign of ChordMatiK.

## Acceptance / test matrix
1. Fresh bank / empty or muted track is silent in SEQ-16, RND PAT and step audition; no oscillator sound.
2. Import and assign distinct samples to multiple tracks; simultaneous playback uses each correct sample.
3. 16-step loop timing stable at slow/medium/fast BPM under active display rendering; no doubled or skipped step 1.
4. Q ON records nearest 16th onset; Q OFF preserves early/late timing, including near step 16→1.
5. Two different chords and repeated identical notes on one step remain separate events and play back independently.
6. Continuous overdub survives multiple loops without replacing earlier events.
7. Gate note duration and release match recording, including held notes across loop boundary; One-shot completes naturally.
8. Step Detail edits one event without altering others; deleting one event preserves the remaining step events.
9. Queued scene switch occurs exactly at next bar; current/queued indicators correct; no accidental outgoing future triggers.
10. Copy entire scene to chosen destination, including 7 tracks, event timing/duration and X/Y automation; source untouched and overwrite protected.
11. Recorded pitches remain absolute after KEY/SCALE changes; chord and STRUM do not generate duplicate recorded events.
12. Mute, STOP, audio disable, sample clear and pagehide do not leave stuck voices; voice caps maintained.
13. PR02 sample acquisition/preview, PR04 chords and multi-touch, existing scene/track navigation and NordicWay preview regression pass.
14. Physical iPad Safari 11-inch landscape: no scroll/clipping, responsive 16-step controls, audible timing and clean scene changes.

## Delivery
One scoped Antigravity implementation PR from main with file map, migration notes, automated unit/E2E test evidence, timing measurements, known limitations and physical iPad QA checklist. Deploy through the established per-PR NordicWay preview workflow. No merge without owner QA and explicit approval.
