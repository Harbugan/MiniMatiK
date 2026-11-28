# MiniMatik — Agent Instructions

## Roles and language
Product owner makes decisions and performs acceptance testing. ChatGPT leads product design, specifications, and repository documentation. Google Antigravity writes implementation code. All app UI, code comments, commits, PR descriptions, contracts, and docs in English. Product-owner conversations may be in Danish.

## Non-negotiables
- Do not implement an unapproved design decision.
- Keep the existing visual baseline unless a task explicitly authorizes changes.
- Start with an empty 19-slot bank; no factory samples, hidden synthesizers or preset content in the intended product.
- Maintain seven tracks, 16 steps, 64 scenes, ChordMatiK, and persistent X/Y Mutate control.
- Target iPad 11-inch landscape with no page scrolling.
- Do not auto-merge. Do not silently expand PR scope.

## Before implementation
Read README.md, PRODUCT-SPEC.md, DESIGN-SYSTEM.md, DECISIONS.md, ARCHITECTURE.md, ROADMAP.md, BUGS.md. Follow the approved Task Contract. Flag ambiguities rather than inventing behavior.

## PR04-specific handoff
- Approved Smart Chord Priority (Option A) is specified in `DECISIONS.md` and `TASKS/PR04-CHORDMATIK-AUDIO-ENGINE.md`; follow both. A new CHORD group supersedes the previous group with a short crossfade even in One-shot, while independent NOTE/DRUM One-shots play out subject to voice limits.
- The contract is prepared documentation, not authorization to implement. Wait for explicit owner instruction before writing code. PR04 does not include PR05 sequencer audio migration.

## Delivery contract
One focused PR at a time. Provide changes, tests performed, known limitations, physical iPad QA checklist, and any required documentation updates. Wait for product-owner acceptance before merging. Keep documentation aligned with verified implementation, not aspirations.

## PR05-specific handoff
- Approved PR05 decisions and technical boundaries are documented in `DECISIONS.md`, `PRODUCT-SPEC.md`, `ARCHITECTURE.md`, and `TASKS/PR05-REAL-SEQUENCER.md`. Treat the contract as ready for review, not implementation authorization.
- PR05 replaces SEQ-16 legacy oscillator/setInterval playback with sample-based Web Audio-clock scheduling, while preserving PR04 ChordMatiK and existing sample routing. Do not expand into song arrangement, sample editing, Mutate DSP or persistence.
- Wait for explicit owner instruction before implementing; preserve owner physical iPad QA and no-auto-merge gates.
