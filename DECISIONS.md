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
- Track assignment follows a **hybrid** model: the first sample is assigned automatically to the active track; subsequent assignments are manual.
- These are product requirements, not statements that the existing HTML prototype implements them.

## Open — requires explicit decision
- Precise hybrid assignment behavior: what counts as the first sample, how to handle an already assigned active track, and reassignment interaction.
- Record/import UX details, microphone monitoring, supported file formats, sample limits and preview.
- Trim/pitch/volume/reverse interaction details, destructive vs non-destructive edits, and whether pitch changes duration.
- Exact ChordMatiK modifier semantics and polyphony.
- Scene transition, chaining, song mode, and scene copy rules.
- X/Y parameter mappings, per-track vs global effect scope, automation granularity and overwrite rules.
- Local project format, storage quota, export/import behavior.
- Whether SPRING/HOLD remains a user-facing feature.

## Prototype discrepancies (not decisions)
The supplied HTML fills empty slots with predefined labels and plays oscillators. Its demo-kit button is prototype behavior and must not be mistaken for approval of factory sounds.
