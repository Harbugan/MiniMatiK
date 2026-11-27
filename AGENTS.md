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

## Delivery contract
One focused PR at a time. Provide changes, tests performed, known limitations, physical iPad QA checklist, and any required documentation updates. Wait for product-owner acceptance before merging. Keep documentation aligned with verified implementation, not aspirations.
