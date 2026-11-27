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

## Open — requires explicit decision
- Explicit manual sample-to-track assignment interaction; whether a loaded sample selected for preview changes the active track.
- Record/import UX details, microphone monitoring, supported file formats, sample limits and preview.
- Non-destructive editing ranges and controls, pitch/time relationship, and sample playback modes.
- Exact ChordMatiK modifier semantics and polyphony.
- Scene transition, chaining, song mode, and scene copy rules.
- X/Y parameter mappings, per-track vs global effect scope, automation granularity and overwrite rules.
- Local project format, storage quota, export/import behavior.
- Whether SPRING/HOLD remains a user-facing feature.

## Prototype discrepancies (not decisions)
The supplied HTML fills empty slots with predefined labels and plays oscillators. Its demo-kit button is prototype behavior and must not be mistaken for approval of factory sounds.
