# PR04 — ChordMatiK Audio Engine

**Status:** READY FOR ANTIGRAVITY HANDOFF — IMPLEMENTATION NOT STARTED
**Base:** `main` (PR02 and PR03 merged)
**Approval:** Product owner approved Smart Chord Priority (Option A), 2026-11-27.
**Type:** Focused ChordMatiK performance/audio implementation. No code implementation is authorized by this documentation commit alone.

## Objective
Make ChordMatiK a playable user-sample-based instrument. Replace ChordMatiK oscillator notes with pitched `AudioBuffer` voices from the active track's assigned soundbank slot; preserve existing PR02 acquisition/preview/routing, PR03 modular boundaries, and iPad landscape identity.

## Read first
`AGENTS.md`, `ROADMAP.md`, `DECISIONS.md`, `PRODUCT-SPEC.md`, `ARCHITECTURE.md`, `DESIGN-SYSTEM.md`, `BUGS.md`, `README.md`, and current `index.html` / `js/*.js`. Check current main before editing.

## Approved behavior — source of truth
1. **Source:** Use only decoded user-imported/recorded sample assigned to the active track. Empty/unassigned/muted tracks are silent for musical performance. No oscillator fallback or factory audio.
2. **Defaults:** One-shot, Tape, Poly. Track playback mode and voice mode are per-track. Pitch samples in Tape using playback-rate transposition. Preserve the original decoded buffer.
3. **Chord mapping:** Seven pads, upper `ii / iii / vi`, lower `I / IV / V / vii°`; Roman numeral qualities update with selected scale. KEY supports chromatic roots, not just the existing seven natural keys. SCALE: Major, Natural Minor, Harmonic Minor; Natural Minor is the minor default. Apply key/scale changes to subsequent triggers, never retune already sounding voices.
4. **Modifiers:** `7TH`, `SUS4`, `9TH`, `STRUM` above pads. Short tap latches; long hold is momentary. Modifiers can stack, including `7TH + 9TH + STRUM`; SUS4 replaces the third. Generate pitches from the chosen scale (including diatonic seventh/ninth) rather than applying a fixed major/minor interval blindly. Document deterministic voicing and labels; test major, natural minor, harmonic minor and diminished/augmented cases.
5. **STRUM:** Poly only, Low-to-High note starts, adjustable Slow–Fast spacing approximately 20–150 ms. Mono takes precedence over STRUM.
6. **Mono:** One sounding sample voice per track; chords become ascending, BPM-synced 1/8-note arpeggios. Retriggering a new chord replaces the prior arpeggio and cancels future notes from it.
7. **Smart Chord Priority (Option A):** A newly pressed CHORD pad supersedes the previous CHORD performance on that track. Crossfade outgoing active chord voices briefly and start incoming chord voices click-safely. This applies even in One-shot mode: a chord is a managed performance group. Cancel pending outgoing STRUM/arp attacks so old notes cannot start after switching. A CHORD pad release in One-shot does not stop its currently active chord unless another chord supersedes it, voice stealing occurs, or a global stop applies.
8. **Ordinary One-shot:** Independent NOTE/DRUM triggers are *not* part of Smart Chord Priority; they continue to natural sample end after pad release, except voice-cap stealing or explicit global stop. In Gate mode, pointer release stops the corresponding held performance with click-safe release; an audio sample still cannot outlast its natural buffer duration without a separately approved looping feature.
9. **Voice budget:** Maximum eight simultaneously sounding voices *per track*, including voices in crossfade release. On overflow, steal oldest active voice using a short click-safe fade; prioritize incoming chord attacks while never exceeding the cap. In Mono, enforce one sounding voice per track, including transition tails (use a fade-to-zero then new attack if necessary). Ensure ended voices are removed and nodes disconnected. Never count only newly triggered voices while ignoring outgoing tails.
10. **Recording:** Existing live REC step events retain the actual absolute MIDI pitches that were triggered. KEY/SCALE changes do not rewrite previously recorded pitches. Do not rewrite the sequencer clock or claim PR05 playback is sample-based.
11. **Input:** Support pointerdown, pointerup, pointercancel, and lost pointer capture for pads/modifiers; maintain simultaneous touch with the persistent X/Y joystick. Avoid duplicate mouse/click activation after pointer input. Modifiers held momentarily must revert reliably on cancellation.
12. **Audio lifecycle:** Reuse shared AudioContext and user-supplied `AudioBuffer` objects. Use Web Audio time for note scheduling; release and disconnect nodes after stop/end. Handle suspended context, unassigned track, clearing assigned slot, switching tracks, mute, and global audio stop without orphaned voices.

## PR04-specific implementation guidance (tunable, not new product approvals)
- Use a dedicated sample-voice/performance module rather than expanding the legacy oscillator helper. Keep dependency graph acyclic.
- Aim for a short, click-free chord transition (initial tuning target around 20–40 ms). Cap and Mono constraints take priority over full overlap; never temporarily allocate >8 sounding voices/track.
- Initial modifier long-press threshold may be tuned around 350 ms; preserve the approved tap-versus-hold semantics.
- The source sample's pitch reference is not yet user-configurable. If an initial fixed reference (e.g. MIDI 60 / C4) is needed, make it explicit in UI/help and PR notes, and flag sample root-key calibration as follow-up rather than inventing auto-detection.
- Preserve the existing NOTE/DRUM submodes without inventing seven factory drum instruments. If a seven-way DRUM mapping cannot be made musically meaningful from a single assigned sample, retain simple sample triggering and document the limitation.
- Prefer deterministic pure helpers for scale/chord generation, and independent audio-voice lifecycle helpers for testing.
- If true Stretch is not implemented, do not label Tape playback as Stretch or present a broken Stretch selector. Keep Stretch DSP as a separately approved future task.

## Boundaries / non-goals
- PR05: replace `setInterval` sequencer clock, migrate SEQ-16 step/RND PAT/playback away from `playMutatedVoice`, implement sample-based sequencer scheduling and full event semantics.
- PR06: Mutate DSP and continuous automation.
- Time-stretch algorithm, non-destructive sample editor, persistence, sample looping, full song mode, mascot, oscilloscope, large UI redesign, new dependencies.
- Do not delete the legacy sequencer oscillator path in PR04 unless PR05 has replaced its callers; clearly isolate and label it as legacy prototype behavior.
- No changes to deployment workflow unless strictly required and approved.

## Acceptance tests (automated where practical)
1. Empty bank and unassigned/muted active track produce no musical audio, with no oscillator fallback.
2. Imported/recorded assigned sample plays at native pitch and at chromatically transposed pitches (Tape).
3. All 12 keys and all three scales produce correct diatonic triads and labels; verify C Major, A Natural Minor and A Harmonic Minor as reference fixtures.
4. 7TH, SUS4, 9TH and 7TH+9TH+STRUM produce deterministic, correct pitch lists; SUS4 removes the third.
5. Short tap latch, long hold momentary, touch cancellation and multi-touch work reliably.
6. STRUM ascending order, speed extremes, pending-note cancellation; Mono Up 1/8 arp timing and retrigger cancellation.
7. CHORD A → CHORD B in One-shot and Gate: no audible clicks; old group fades and cannot re-trigger pending attacks. Ordinary NOTE/DRUM One-shot remains independent and plays out.
8. Eight-voice cap holds during dense modifier stacks, retriggers and crossfades; oldest voice steals cleanly. Mono stays at one voice.
9. Gate release follows pointerup/cancel; One-shot release does not truncate ordinary notes.
10. Live REC stores absolute MIDI notes; subsequent KEY/SCALE change does not modify stored pitches.
11. Sample preview, import, mic capture, assignment, clearing, transport, scene navigation, PS1 display, and joystick regressions pass.
12. iPad 11-inch landscape Safari: no page scroll, clipped controls, touch conflicts, audio unlock failures, or stuck notes. Test with actual user samples.

## Delivery
One focused implementation PR. Include file map, changed audio/state interfaces, deterministic musical test fixtures, automated results, known limitations, iPad Safari physical QA checklist, and any doc updates needed to reflect **verified** implementation. Wait for owner QA and explicit merge approval. Do not merge or deploy from this documentation branch.
