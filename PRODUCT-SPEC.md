# Product Specification

## Identity
MiniMatik (ミニマティック), Created by H∆RBUGΛП. English interface; 11-inch iPad landscape; full viewport.

## Soundbank
19 slots, all empty at startup (00/19). Intended input: user-imported audio and microphone recording. No factory samples or built-in sound generators in the target product. The existing prototype's demo kit and oscillator tones are placeholders, not approved product behavior.

### Slot acquisition — approved
Tapping an empty slot presents **Record / Import**. A slot becomes populated only when the user records or imports an actual sample.

**Record flow:** Tap **Record** to start microphone capture, then tap **Stop** to finish. Capture UX, permissions, monitoring, sample limits and error handling remain to be designed.

### Sample editing — approved
Each loaded sample supports **Trim**, **Pitch**, **Volume**, and **Reverse**. Editing is **non-destructive**: retain the original audio and represent edits as adjustable settings rather than irreversibly overwriting the source. Editing controls, ranges, and pitch/time semantics remain to be designed.

### Track assignment — approved
Seven tracks can reference soundbank samples. **Hybrid assignment:** when a new sample is acquired, automatically assign it to the active track **if and only if that track is unassigned**. If the active track already has a sample, preserve that assignment and require an explicit manual assignment action. This rule supersedes the earlier "first sample only" wording. Manual assignment is implemented as `ASSIGN → T1–T7` in PR02.

### Sample playback — approved
- **One-shot / Gate:** Selectable sample playback modes. One-shot triggers playback of the sample without requiring a sustained press; Gate follows the held input, subject to the sample's available duration. Exact note-off and looping behavior are open.
- **Tape / Stretch:** Selectable pitch/time behavior. Tape changes playback rate and pitch together; Stretch changes pitch while preserving sample duration. The stretch algorithm and quality/performance requirements are open.
- **Mono / Poly:** Both voice modes are supported, selectable **per track**. Poly allows overlapping sample voices; Mono constrains playback to one active voice for that track. Voice limits, retrigger and voice-stealing rules remain open.
- These are intended capabilities, not implemented audio behavior in the baseline HTML.

## Performance
Seven selectable tracks, with mute. ChordMatiK is a compact seven-pad chord/note/drum performance surface, with root, octave, and modifiers. Exact chord behavior, voicing and modifier semantics require review; Mono/Poly capability is approved, but voice limits and interactions remain open.

### ChordMatiK key and scale — approved
The seven chord pads are diatonic to a selected root key and selectable **Major / Minor** scale mode. Switching scale mode updates the available chord qualities while keeping the compact seven-pad performance surface. Minor offers **Natural Minor (default)** and **Harmonic Minor**. Both derive the seven diatonic chord pads from the selected root and scale. The scale-selector UX, pad arrangement, and handling of key/scale changes during playback remain open.

### ChordMatiK physical layout — approved
Retain the existing **3 upper + 4 lower** staggered seven-pad layout (Layout A). Optimize for right-hand playing while the left hand operates the persistent X/Y joystick. The four modifier controls sit above the chord pads. Physical iPad ergonomics and touch target sizing require validation; pad-to-degree mapping remains open.

### ChordMatiK modifier set and placement — approved
Four modifier controls: **7TH**, **SUS4**, **9TH**, and **STRUM**, arranged **above** the staggered 3+4 chord pads. STRUM replaces the prototype's MIN/INV control; inversion is not a dedicated performance modifier. STRUM offsets chord-note attacks to create a strummed articulation. **Updated decision:** STRUM has an adjustable **Slow–Fast** speed setting, superseding the earlier fixed-speed requirement. The setting must not add another chord performance pad. Exact range, default and control presentation remain to be designed. Direction, modifier combinations and behavior with Mono arpeggio remain open.

### ChordMatiK interaction — approved in part
- **Modifiers:** Short tap toggles/latches a modifier; long press activates it temporarily for the duration of the hold. The exact threshold and interaction conflicts require further design.
- **Mono chord behavior:** Chord notes are arpeggiated sequentially on Mono tracks. The arp pattern, rate, note-off and retrigger behavior are not yet defined.
- **Seven-pad mapping:** Seven key/scale-relative diatonic chord pads are approved; the 3+4 physical arrangement is approved, while degree-to-pad mapping and chord-label presentation remain to be finalized. Do not treat the current prototype layout as a final decision.


### ChordMatiK consolidated behavior — approved
- **Seven-pad mapping:** Upper row ii / iii / vi; lower row I / IV / V / vii°. Roman numerals and chord names adapt to the selected Major, Natural Minor or Harmonic Minor scale.
- **Key and scale:** Compact KEY + SCALE controls within ChordMatiK. Natural Minor is the default Minor variant.
- **Smart switching:** A new chord takes priority over the previous chord; this does not disable Poly playback of multiple notes within a chord. Outgoing-voice policy is resolved under PR04 Smart Chord Priority (see below).
- **Modifier combinations:** 7TH + 9TH is allowed; SUS4 replaces the chord third. Exact voicing conventions remain subject to musical QA. Modifier interactions retain approved short-tap latch / long-hold momentary behavior.
- **STRUM:** Adjustable Slow–Fast slider; play chord tones Low → High. On Mono tracks, the Up 1/8-note arpeggio takes precedence; STRUM affects Poly chord articulation.
- **Mono arpeggio:** Ascending, BPM-synced eighth notes.
- **Poly voice cap:** Up to eight simultaneously sounding voices per track. Oldest-voice stealing is approved; total cross-track performance budget remains to be measured.
- **Live key/scale changes:** Apply to the next triggered chord; already sounding voices are not retuned. Sequencer event representation and re-harmonization behavior remain open.
- **Implementation status:** These are approved requirements, not features already present in minimatik.html.

### Final approved sampler and ChordMatiK behavior — 2026-11-27
- Default sound playback configuration: **One-shot / Tape / Poly**.
- One-shot plays through to the sample end; Gate ends on note release with click-safe treatment.
- Manual routing: **ASSIGN → T1–T7** after selecting a sample. Auto-assignment applies only when the active track is empty.
- Chord changes use a **short crossfade** under approved Smart Chord Priority (Option A): new CHORD performance replaces the old chord group even in One-shot. Ordinary NOTE/DRUM One-shot triggers play to natural end except voice stealing or global stop.
- Maximum eight concurrent voices per track; on overflow the **oldest voice is replaced** with click-safe release.
- 7TH, 9TH and STRUM can stack; SUS4 replaces the third. Chord spelling and modifier interactions require musical QA.
- Live chord recording stores **actual note pitches**; future changes to KEY/SCALE do not retroactively transpose recorded notes.
- STRUM uses a **Slow–Fast slider**, approximately **20–150 ms between notes**, ascending Low → High; Mono Up 1/8 arp takes precedence over STRUM.
- These are future requirements, not features delivered by the baseline prototype.

### PR04 Smart Chord Priority — approved
- A CHORD pad starts a managed performance group. A new chord takes priority over the previous group on that track with a short click-safe crossfade, **even when One-shot is selected**. Old pending STRUM and Mono arp attacks are cancelled.
- Independent NOTE/DRUM One-shot triggers are not chord groups and continue to sample end after finger release, subject to the eight-voice limit and explicit stop.
- Gate stops its held performance on pad release with a short click-safe release; no sample looping is implied.
- Maximum eight sounding voices per track, including crossfade tails; replace oldest on overflow. Mono allows only one sounding voice, including transitions.
- Existing live REC events store absolute triggered MIDI pitches, unaffected by subsequent KEY/SCALE changes. PR05 owns sequencer playback migration.
- PR04 uses real assigned user samples for ChordMatiK only. Do not imply that SEQ-16 is sample-based until PR05. Stretch DSP and sample editing remain separate future work.
- Contract: `TASKS/PR04-CHORDMATIK-AUDIO-ENGINE.md`.

## Sequencing
16 steps per track, 7 tracks per scene, up to 64 scenes. Manual step plotting and live recording via PLAY + REC. Scene and track context must remain obvious. Song arrangement behavior is not yet decided.

## Mutate
Always-visible round X/Y analog stick; spring-return/hold options appear in the prototype. A dedicated MUTATE mode configures axis targets. Live movement should alter audio, and movement under REC should be stored and replayed with the sequence. CLR AUTO clears automation for the selected track and scene. Automation resolution and parameter mapping remain open.

## Display
Context-sensitive PS1-style low-poly display showing active mode, track, scene, playback/record state, chords, and soundbank information.

## Non-goals for baseline
No feature expansion, audio architecture rewrite, or redesign until explicitly approved.

### Sample Editing delivery placement — approved 2026-11-28
Sample Editing is a **dedicated planned work item after PR05 Sequencer**, not part of PR05. Keep all four approved non-destructive operations (TRIM, PITCH, VOLUME, REVERSE) and retain original sample data. Specific waveform UI, touch editing behavior, parameter ranges, and preview integration remain design decisions to be made before implementation. See ROADMAP.md; no editor has been implemented by this documentation update.

### PR05 Real Sequencer — approved design (2026-11-28)
- Seven tracks x 16 steps x up to 64 scenes, sample-only playback using each track's assigned user sound; audio-clock timing, no legacy oscillator fallback.
- Live REC: **Q ON/OFF** (nearest 16th-step onset vs preserved performed timing), **continuous Overdub** across loop boundaries, multiple note events per step with absolute pitches, individual timing offsets and recorded note durations.
- Step UX: **Tap + Note Detail**; edit individual events without flattening a multi-event step. Preserve a simple 16-step overview on iPad.
- Scenes: queue changes at the **next bar** during playback; stopped selection is immediate. **Copy Entire Scene** to a selected destination, preserving all seven tracks, notes and existing automation with overwrite protection.
- Gate uses recorded duration and One-shot plays to sample end subject to existing voice limits; preserve PR04 chord behavior and existing X/Y step automation.
- No song arrangement, scene chaining, new Mutate DSP, sample editor, or persistence in PR05. See `TASKS/PR05-REAL-SEQUENCER.md`.
