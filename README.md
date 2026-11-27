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
Baseline prototype. The HTML currently simulates loading samples and generates audio with oscillators; real sample import, microphone capture, sample playback, persistence, and production-grade automation are not yet implemented. Do not confuse prototype affordances with shipped functionality.

## Workflow
ChatGPT: product/design direction and documentation. Product owner: decisions and physical iPad QA. Google Antigravity: implementation in scoped PRs. No automatic merges. See AGENTS.md, ROADMAP.md, and DECISIONS.md.

## Running
Open `minimatik.html` in a browser. The current prototype loads Tailwind CSS and Google Fonts from CDNs, so the full appearance requires network access.
