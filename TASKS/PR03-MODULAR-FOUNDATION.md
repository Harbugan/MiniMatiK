# PR03 — Modular Foundation (Behavior-Preserving Refactor)

**Status:** READY FOR ANTIGRAVITY HANDOFF — NOT IMPLEMENTED
**Dependency:** PR02 Real Soundbank Foundation must be merged and verified on main before implementation starts.
**Type:** Architecture refactor only. No feature or visual changes.

## Objective
Split MiniMatik's monolithic HTML into maintainable HTML, CSS and JavaScript modules, preserving the current post-PR02 behavior and enabling future audio-engine work. Do not treat the original pre-PR02 prototype as the source of truth.

## Read first
AGENTS.md, ROADMAP.md, ARCHITECTURE.md, PRODUCT-SPEC.md, DESIGN-SYSTEM.md, DECISIONS.md, BUGS.md, current main source and existing PR02 modules. Verify the PR02 merge state before editing.

## Target structure (guideline, not a mandatory file count)
- `index.html` — the production entry point, semantic app markup and ordered asset imports.
- `styles/tokens.css`, `styles/layout.css`, `styles/components.css`, `styles/views.css` — existing visual styles split by responsibility.
- `js/state.js`, `js/audio.js`, `js/sampler.js`, `js/chordmatik.js`, `js/sequencer.js`, `js/mutate.js`, `js/display.js`, `js/app.js` — clear functional boundaries.
- Preserve and integrate existing `js/soundbank-state.js`, `js/sample-decoder.js`, `js/sample-recorder.js`, `js/sample-preview.js`; do not duplicate or regress their functionality.
- Prefer native browser ES modules with explicit imports/exports where practical. Avoid circular dependencies and duplicated state. Keep the actual structure as small as maintainability allows.

## Scope
1. Extract the current CSS and JavaScript while preserving the rendered DOM, state semantics, visual identity and touch interactions.
2. Keep real sample import, microphone recording, preview, manual/automatic assignment, and clear behavior introduced in PR02.
3. Preserve four modes, 19 slots, seven tracks, 16 steps, 64 scenes, ChordMatiK legacy behavior, joystick and automation prototype, transport, and PS1 display.
4. Move the production entry point to `index.html`. Ensure all relative asset URLs work from `/Projects/MiniMatik/` on NordicWay.
5. Update `.github/workflows/deploy-nordicway.yml` to deploy `index.html`, required `styles/**`, `js/**` and other runtime assets; maintain directory structure, use FTPS with existing secrets, trigger on changes to all deployed assets, and retain manual dispatch. Do not upload docs/tests/secrets, do not delete unrelated remote files.
6. Ensure GitHub Actions deploys only after merging to `main`; no PR preview deployment.
7. Update architecture and README to reflect verified changes. Keep BUGS.md accurate.

## Non-goals
No new audio engine, ChordMatiK redesign, feature changes, Tailwind removal, dependency/bundler framework migration, new visual assets, persistence, sample editing, sequencer rewrite, or mascot/oscilloscope work.

## Acceptance criteria
- Production app loads at `/Projects/MiniMatik/` using `index.html` and all local JS/CSS files without 404s or MIME errors.
- No visible layout, copy, animation, interaction, or audio regression versus post-PR02 main.
- All PR02 sample acquisition/preview/routing flows continue to work; no factory samples or fake sample preview.
- Four modes, track/scene navigation, step editing, transport, ChordMatiK, joystick and PS1 rendering remain operational.
- iPad 11-inch landscape: no unintended page scroll, clipping or multi-touch regression.
- No console errors or circular import failures; verify on a local HTTP(S) server (ES modules are not guaranteed to work from file://).
- GitHub Actions workflow passes with a controlled deployment and preserves directory structure.
- All relevant documentation updated; existing PR02 contract and historical PR references remain intact.

## Delivery
One focused PR with file map, dependency summary, before/after regression evidence, automated test results, physical iPad Safari QA checklist, NordicWay deployment validation steps, and known limitations. Do not merge automatically; product owner approves after QA.
