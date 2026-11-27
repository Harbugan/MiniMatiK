# Product Specification

## Identity
MiniMatik (ミニマティック), Created by H∆RBUGΛП. English interface; 11-inch iPad landscape; full viewport.

## Soundbank
19 slots, all empty at startup (00/19). Intended input: user-imported audio and microphone recording. No factory samples or built-in sound generators in the target product. The existing prototype's demo kit and oscillator tones are placeholders, not approved product behavior.

### Slot acquisition — approved
Tapping an empty slot presents **Record / Import**. A slot becomes populated only when the user records or imports an actual sample. Exact recording and import controls remain to be designed.

### Sample editing — approved
Each loaded sample supports **Trim**, **Pitch**, **Volume**, and **Reverse**. Editing semantics, ranges, playback behavior, and persistence are not yet specified.

### Track assignment — approved
Seven tracks can reference soundbank samples. **Hybrid assignment:** the first sample is automatically assigned to the active track; subsequent sample assignments are manual. Edge cases and the explicit reassignment UI require design approval before implementation.

## Performance
Seven selectable tracks, with mute. ChordMatiK is a compact seven-pad chord/note/drum performance surface, with root, octave, and modifiers. Exact chord behavior, sample pitching, polyphony, and modifier semantics require review.

## Sequencing
16 steps per track, 7 tracks per scene, up to 64 scenes. Manual step plotting and live recording via PLAY + REC. Scene and track context must remain obvious. Song arrangement behavior is not yet decided.

## Mutate
Always-visible round X/Y analog stick; spring-return/hold options appear in the prototype. A dedicated MUTATE mode configures axis targets. Live movement should alter audio, and movement under REC should be stored and replayed with the sequence. CLR AUTO clears automation for the selected track and scene. Automation resolution and parameter mapping remain open.

## Display
Context-sensitive PS1-style low-poly display showing active mode, track, scene, playback/record state, chords, and soundbank information.

## Non-goals for baseline
No feature expansion, audio architecture rewrite, or redesign until explicitly approved.
