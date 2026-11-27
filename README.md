# MiniMatik (ミニマティック)
**Created by H∆RBUGΛП**

MiniMatik is a sample-first, playful music workstation designed for an 11-inch iPad in landscape. Its identity combines 1990s Japanese industrial design, early PlayStation low-poly graphics, and compact performance-focused musical interaction.

## Product principles
- The soundbank starts empty: 00/19. No factory sounds or instruments are part of the intended product.
- Users record or import samples, assign them to seven tracks, and perform through ChordMatiK or a 16-step sequencer.
- Up to 64 scenes; an always-visible X/Y Mutate stick for live performance and automation.
- Full-screen app interface, not a rendered hardware enclosure.
- Product UI and repository documentation are in English; product discussions and approvals happen in Danish.

## Status
PR02 (Real Soundbank Foundation) and PR03 (Modular Foundation) are merged to `main`. PR04 (ChordMatiK Audio Engine) replaces ChordMatiK oscillator playback with real assigned user-sample `AudioBuffer` voices (Tape playback-rate transposition anchored at C4 / MIDI 60, 12 chromatic keys, Major / Natural Minor / Harmonic Minor scales, stackable Hold+Toggle `7TH / SUS4 / 9TH / STRUM` modifiers, adjustable Low-to-High STRUM, Mono Up 1/8-note arpeggio, Smart Chord Priority Option A crossfades, per-track One-shot/Gate & Poly/Mono, and 8-voice per-track management), awaiting physical iPad Safari QA and product-owner merge approval. SEQ-16 step triggers, `RND PAT`, and `setInterval` playback still retain clearly labelled legacy oscillator playback until PR05; Stretch DSP, non-destructive sample editing, real-time Mutate DSP automation, and project persistence are not yet implemented.

## Workflow
ChatGPT: product/design direction and documentation. Product owner: decisions and physical iPad QA. Google Antigravity: implementation in scoped PRs. No automatic merges. See AGENTS.md, ROADMAP.md, and DECISIONS.md.

## Running
Serve the repository directory over HTTP/HTTPS (for example, `python3 -m http.server 8000`) and open `index.html` (e.g., `http://localhost:8000/`). Native ES modules (`<script type="module">`) are not guaranteed to load over `file://`. Microphone recording requires a secure context (`HTTPS` or `localhost`). The current prototype loads Tailwind CSS and Google Fonts from CDNs, so the full appearance requires network access.
