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
PR02 (Real Soundbank Foundation) is merged to `main`. PR03 (Modular Foundation) extracts the monolithic HTML into `index.html`, `styles/*.css`, and native browser ES modules under `js/*.js` with multi-file NordicWay FTPS deployment, awaiting physical iPad Safari QA and product-owner review. The 19-slot soundbank starts genuinely empty (`00/19`) and supports real local audio file import, microphone capture (`Tap Record` / `Tap Stop`), Web Audio sample preview, hybrid/manual track assignment (`ASSIGN → T1–T7`), and confirmed slot clearing. ChordMatiK and SEQ-16 still retain clearly labelled legacy oscillator playback until PR04/PR05; sample editing, real-time DSP automation, and project persistence are not yet implemented.

## Workflow
ChatGPT: product/design direction and documentation. Product owner: decisions and physical iPad QA. Google Antigravity: implementation in scoped PRs. No automatic merges. See AGENTS.md, ROADMAP.md, and DECISIONS.md.

## Running
Serve the repository directory over HTTP/HTTPS (for example, `python3 -m http.server 8000`) and open `index.html` (e.g., `http://localhost:8000/`). Native ES modules (`<script type="module">`) are not guaranteed to load over `file://`. Microphone recording requires a secure context (`HTTPS` or `localhost`). The current prototype loads Tailwind CSS and Google Fonts from CDNs, so the full appearance requires network access.
