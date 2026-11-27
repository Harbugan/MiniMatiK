# Product Decisions

## Approved from handover — 2026-11-27
- Product name: MiniMatik (ミニマティック); signature: Created by H∆RBUGΛП.
- Conversation and product decisions in Danish; app UI, documentation, and Antigravity contracts in English.
- Target: iPad 11-inch landscape, full-viewport software UI.
- Visual direction: 1990s Japan, Teenage Engineering, PS1 low-poly, katakana details.
- 19 initially empty soundbank slots; user-provided samples only.
- Seven tracks, ChordMatiK, 16-step sequencer, up to 64 scenes.
- Always-visible X/Y Mutate stick; record and replay movement; CLR AUTO.
- ChatGPT owns product/design documentation; Antigravity implements scoped tasks; product owner approves and tests. No auto-merge.

## Approved — Sampler design round 1 (2026-11-27)
- Tapping an empty soundbank slot offers two actions: **Record** or **Import**.
- Sample editing provides **Trim**, **Pitch**, **Volume**, and **Reverse**.
- Track assignment uses a **hybrid** model. The round-1 "first sample only" interpretation is superseded by round 2 below.
- These are product requirements, not statements that the existing HTML prototype implements them.

## Approved — Sampler design round 2 (2026-11-27)
- **Microphone recording:** Tap **Record** to start; tap **Stop** to finish. No hold-to-record requirement.
- **Editing:** Non-destructive. Preserve the original audio while Trim, Pitch, Volume, and Reverse are adjusted; changes must remain revisable.
- **Hybrid track assignment (supersedes round 1 wording):** A newly acquired sample is automatically assigned to the currently active track **only if that track has no sample assignment**. If the active track already has an assignment, do not replace it automatically; the user must assign manually.
- These decisions specify target behavior, not existing implementation.

## Approved — Sampler design round 3 (2026-11-27)
- **Playback modes:** Each sample supports selectable **One-shot** and **Gate** playback.
- **Pitch/time modes:** Both **Tape** (pitch and playback speed change together) and **Stretch** (pitch changes while sample duration is preserved) are available.
- **Voice modes:** Support both **Mono** and **Poly** playback, selectable per track.
- These are target product requirements, not current prototype capabilities. Exact switching UI, gate note-off behavior, stretching algorithm, voice limits and voice stealing remain open.

## Approved — ChordMatiK design round 1 (partial, 2026-11-27)
- **Modifier interaction:** Hold + Toggle. Short tap latches a modifier; long press applies it temporarily while held. Exact long-press threshold and conflict behavior remain open.
- **Mono chord performance:** Arpeggio. When a chord is triggered on a Mono track, its notes are played sequentially rather than simultaneously. Arpeggio pattern/rate/retrigger rules remain open.
- **Seven-button mapping:** NOT YET DECIDED. Review the real HiChord behavior before choosing MiniMatik's mapping. Do not assume the prototype's seven diatonic chords have been approved as final.

## Approved — ChordMatiK scales (2026-11-27)
- The seven chord pads follow the selected key and **selected scale mode: Major or Minor**.
- Changing between Major and Minor changes the diatonic chord qualities available on the seven pads, without adding more performance pads.
- Minor-scale selection is resolved below; pad labels, chord inversions and key-change behavior during playback remain open.
- This is a MiniMatik design decision, not a claim about HiChord's exact implementation.

## Approved — ChordMatiK minor variants (2026-11-27)
- ChordMatiK offers both **Natural Minor** and **Harmonic Minor**.
- **Natural Minor is the default** when Minor is selected.
- Harmonic Minor is an explicit alternative; selecting it changes the scale-derived chord qualities.
- The exact scale-selector UX and behavior for changing scale while notes or sequences are playing remain open.

## Approved — ChordMatiK physical pad layout (2026-11-27)
- **Layout A approved:** retain the prototype's staggered **3 upper + 4 lower** chord-pad arrangement.
- This approves the physical arrangement, not final pad-to-degree mapping or touch target dimensions; modifier placement is approved below.
- Design for right-hand chord performance while the left hand operates the always-visible X/Y joystick; validate on a physical 11-inch iPad.

## Approved — ChordMatiK modifier set and placement (2026-11-27)
- The four performance modifiers are **7TH, SUS4, 9TH, STRUM**.
- **STRUM replaces INVERSION** as the fourth dedicated modifier. Inversion is not a dedicated modifier in this design.
- Position the four modifier controls **above** the seven chord pads, not to their right.
- Preserve the approved 3-upper / 4-lower chord-pad layout and previously approved Hold + Toggle modifier interaction.
- STRUM means chord notes are triggered sequentially with a short offset, creating a strummed feel; precise timing, direction, and interaction with Mono arpeggio remain open.
- These are product-design decisions; the current HTML has not yet been updated.

## Approved — ChordMatiK STRUM behavior (2026-11-27)
- **Historical decision (superseded):** STRUM option A used one fixed musical speed.
- This fixed-speed behavior is superseded by the adjustable STRUM decision below.
- The earlier fixed interval is no longer the active requirement.
- STRUM direction, overlap with 7TH/SUS4/9TH, and interaction with Mono arpeggio are not yet approved.

## Revised decision — ChordMatiK STRUM (2026-11-27)
- **Supersedes the fixed-speed STRUM decision:** STRUM is **adjustable**, with a simple **Slow–Fast** speed control.
- The seven-pad layout and four modifiers remain unchanged. Speed adjustment should not require an additional performance pad.
- Exact speed range, default, direction, and how the control is exposed remain open for the consolidated ChordMatiK design review.


## Approved — ChordMatiK consolidated design (2026-11-27)
- **Chord switching:** Smart switching; a newly triggered chord takes priority over the previous chord. This is separate from per-track Poly voice mode. Exact release/cut behavior remains to be tuned.
- **Pad mapping:** Keep the current mapping: upper row **ii / iii / vi**; lower row **I / IV / V / vii°**. Degree labels adapt to selected scale (e.g. minor i, ii°, III, iv, v/V, VI, VII/vii°).
- **Key/scale UI:** Compact **KEY + SCALE** controls in the ChordMatiK workspace. Scale options: Major, Natural Minor (default minor), Harmonic Minor.
- **Modifier combinations:** Limited combinations; 7TH and 9TH may combine, SUS4 replaces the third. Exact seventh/ninth chord-voicing rules need musical QA.
- **STRUM:** Slow–Fast slider, ascending **Low → High** note order. Speed range/default are implementation tuning items; the slider does not add a performance pad.
- **Mono arp:** Ascending **Up**, tempo-synced **1/8 notes**. On Mono tracks the arpeggio takes priority over STRUM; STRUM is a Poly articulation.
- **Poly voice cap:** Maximum **8 simultaneous voices per track**. Voice-stealing strategy and cross-track budget need implementation/QA definition.
- **Key/scale change while playing:** Existing sounding voices continue unchanged; the next chord trigger uses the newly selected key/scale. Recorded events and sequence behavior require separate definition.
- **Left display direction:** The PS1-style screen should visibly reflect modes, parameter choices, live playing, and musical expression; explore mode-specific graphics, an oscilloscope-style visualization, and an optional low-poly 3D cat mascot. These are creative directions, **not** approval of a specific mascot design, animation, or visualization implementation.

## Pending ChordMatiK implementation details / acceptance clarifications
- Smart switching must not silently contradict One-shot playback: define whether outgoing voices are released, faded, or allowed to finish, and how this differs in Gate mode.
- Specify whether the STRUM slider modifies a latched STRUM modifier and whether modifiers may stack with STRUM.
- Resolve exact chord spellings across Major, Natural Minor, Harmonic Minor (especially 7TH/9TH/SUS4), touch hold threshold, arpeggio note length/retrigger, and 8-voice stealing.
- Define recorded note representation (absolute MIDI notes vs degree/key/scale metadata) and response to key changes during sequencer playback.
- Display concepts require separate UX direction, performance budgets and physical iPad validation; do not add mascot or scope-heavy visual effects without approval.

## Approved — Final sampler and ChordMatiK technical decisions (2026-11-27)
- **Smart chord switching:** Short crossfade between chord performances.
- **One-shot / Gate:** One-shot plays the sample to its natural end; Gate stops on note release (with click-safe release treatment).
- **Voice stealing:** When the eight-voice-per-track cap is reached, replace the oldest active voice.
- **Modifier combinations:** 7TH + 9TH + STRUM may be combined. SUS4 replaces the third; exact combined voicing rules require validation.
- **Live chord recording:** Store the actual triggered notes (absolute pitches), not scale-relative chord degrees.
- **Defaults:** One-shot / Tape / Poly.
- **Manual assignment:** Select a sample, choose **ASSIGN**, then select destination track T1–T7. An existing assignment is never overwritten automatically; an explicit assignment may replace it.
- **STRUM speed:** Slow–Fast slider, approximately **20–150 ms between notes**. Final default and precise range are tuning parameters.

## Reconciliation — documented, not silently approved
- **Crossfade vs One-shot:** The two rules can conflict if chord switching stops a One-shot voice before completion. Proposed resolution for later PR03: crossfade applies to active chord-performance voices; ordinary One-shot triggers are allowed to finish. This exception requires product-owner approval before PR03 implementation.
- **Mono arp vs default Poly:** No conflict: Poly is the default; selecting Mono enables the previously approved Up 1/8-note arpeggio.
- **Eight voices vs STRUM and stacked modifiers:** Enforce eight voices per track using oldest-voice stealing, with click-safe fade. Verify dense chords and retriggers in QA.
- **Absolute notes vs key changes:** Recorded pitches remain fixed; key/scale changes affect future live chord triggers. Exact sequencer editing semantics remain to be designed.
- **Scope:** Real-time stretch quality, Gate release envelope, microphone permissions, persistence, and visual mascot remain outside the first implementation contract.

## Open — requires explicit decision
- Explicit manual sample-to-track assignment interaction; whether a loaded sample selected for preview changes the active track.
- Record/import UX details, microphone monitoring, supported file formats, sample limits and preview.
- Non-destructive editing ranges and controls; default One-shot/Gate and Tape/Stretch modes, Gate note-off and looping behavior, time-stretch quality, and performance constraints.
- ChordMatiK remaining acceptance details: One-shot/crossfade reconciliation, exact voicing and Gate release envelope; core defaults, voice stealing, recorded pitches and STRUM range are approved.
- Scene transition, chaining, song mode, and scene copy rules.
- X/Y parameter mappings, per-track vs global effect scope, automation granularity and overwrite rules.
- Local project format, storage quota, export/import behavior.
- Whether SPRING/HOLD remains a user-facing feature.

## Prototype discrepancies (not decisions)
The supplied HTML fills empty slots with predefined labels and plays oscillators. Its demo-kit button is prototype behavior and must not be mistaken for approval of factory sounds.
