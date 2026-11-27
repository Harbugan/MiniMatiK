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

## Open — requires explicit decision
- Explicit manual sample-to-track assignment interaction; whether a loaded sample selected for preview changes the active track.
- Record/import UX details, microphone monitoring, supported file formats, sample limits and preview.
- Non-destructive editing ranges and controls; default One-shot/Gate and Tape/Stretch modes, Gate note-off and looping behavior, time-stretch quality, and performance constraints.
- ChordMatiK seven-button degree-to-pad mapping; scale-selector UX, chord voicing, STRUM timing/direction, modifier combinations and Mono arpeggio interaction, Poly voice limits and voice stealing.
- Scene transition, chaining, song mode, and scene copy rules.
- X/Y parameter mappings, per-track vs global effect scope, automation granularity and overwrite rules.
- Local project format, storage quota, export/import behavior.
- Whether SPRING/HOLD remains a user-facing feature.

## Prototype discrepancies (not decisions)
The supplied HTML fills empty slots with predefined labels and plays oscillators. Its demo-kit button is prototype behavior and must not be mistaken for approval of factory sounds.
