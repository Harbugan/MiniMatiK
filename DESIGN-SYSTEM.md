# Design System — Baseline

## Visual direction
1990s Japanese industrial software, Teenage Engineering OP-1/PO-33 influence, PlayStation 1 low-poly visuals, restrained katakana details. This is an on-screen app, not a hardware mock enclosure.

## Existing prototype tokens
Cream #e8e3d5; light cream #f5f2e9; charcoal #222428; deep charcoal #141518; vermilion #d93829; blue #2f80ed; green #27ae60; orange #f2994a; amber #f2c94c.

## Existing typography
Chakra Petch, Inter, JetBrains Mono, Noto Sans JP. These are currently fetched from Google Fonts.

## Layout principles
11-inch iPad landscape, 100vw x 100vh, no page scroll. Left context display, right mode-specific workspace, persistent bottom bar for X/Y joystick, seven tracks, and transport. Touch targets, simultaneous multi-touch, and responsive fit require physical iPad verification.

## ChordMatiK layout — approved
Keep the staggered **3 upper + 4 lower** chord pads. Place a compact row of four modifier controls **above** the chord pads: **7TH / SUS4 / 9TH / STRUM**. The former MIN/INV modifier is superseded. Preserve the persistent bottom-left X/Y joystick for left-hand performance while the right hand operates the chord area. Verify modifier reach and multi-touch ergonomics on a physical iPad.

## Change control
Treat the handed-over HTML as the visual baseline. No cosmetic redesign without an approved design decision. Preserve identity and functional hierarchy over decorative additions.


## ChordMatiK interaction refinements — approved
- Upper chord row: ii / iii / vi; lower row: I / IV / V / vii°. Degree labels and chord names reflect the selected key/scale.
- Compact KEY + SCALE controls; four modifiers remain above the chord pads.
- STRUM uses a small Slow–Fast slider; keep it out of the primary seven-pad performance area.
- Prioritize simultaneous right-hand chords/modifiers and left-hand X/Y joystick. Validate multi-touch and minimum comfortable targets on the actual iPad.

## PS1 display — creative direction, not a finalized visual specification
The left display is a living instrument feedback surface, not just decoration. It should react to selected mode, key/scale, chord name, modifier state, active track/scene, transport, and Mutate movement. Explore distinct graphics for Sampler, ChordMatiK, Sequencer and Mutate; optional oscilloscope/waveform visualization and a playful low-poly 3D cat mascot may be explored as concepts. Preserve readable status overlays, PS1-era low-poly aesthetics, and performance on iPad. No specific cat appearance, animation or scope has been approved.
