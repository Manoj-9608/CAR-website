# NOCTIS — Electric Automotive Scrollytelling Experience

A premium, minimal, single-page scrollytelling web experience for **NOCTIS**, a fictional electric vehicle brand.

> **Concept & Mood**: A blackout city at night where the car's light signature is the only light in the world. Quiet, expensive, precise.

---

## Technical Architecture

- **Vanilla Stack**: Plain HTML5, CSS3, and modern JavaScript (ES6+). Zero frameworks, zero build tools, zero npm dependencies.
- **Canvas Scrollytelling**: High-performance `<canvas>` rendering utilizing `requestAnimationFrame` with sub-pixel interpolation (`lerp: 0.15`), device pixel ratio scaling (capped at 2.0), and cover/contain aspect ratio adaptation.
- **Custom Cursor ("The Headlight")**: 6px solid xenon dot inside a 28px 1px stroke ring following the mouse pointer with lerp 0.18; morphs into a 44x2px light bar with contextual mono indicators (`VIEW`, `OPEN`, `CONFIGURE`, `RESERVE`) and a 120ms mousedown flash.
- **Fixed Film-Grain**: Procedurally generated 128x128 offscreen noise tile randomly translated at 8 FPS with 3.5% screen opacity (no vignette, pure flat aesthetic).
- **Strict Visual Rules**: Zero gradients, zero glassmorphism / backdrop-filters, zero drop shadows, zero rounded bubbly cards. Flat solid colors, 1px hairlines, photography, and typography only.

---

## Sections

1. **Hero (Pinned Scrollytelling — ~600vh)**:
   - 718-frame seamless continuous camera drive sequence through the dark city.
   - Real-time telemetry HUD: speed counter (`000 → 118 KM/H`), distance tracking (`0.0 → 4.2 KM`), and active chapter indicator with a taillight-red tick.
   - Smooth canvas fade to pure `#07080A` asphalt over the final 5% of scroll.
2. **Statement (Flow Section — 100vh)**:
   - Word-by-word scroll-scrubbed opacity reveal (15% → 100%) for *"Every part was designed to disappear into one line of light."*
3. **Architecture Dismantle (Pinned Scrollytelling — ~350vh)**:
   - 240-frame mechanical disassembly sequence revealing the chassis and battery architecture.
   - Sequentially revealed callouts past 70% scroll progress (*BODY*, *BATTERY*, *DRIVE*, *LIGHT*) with 1px hairline SVG vectors dynamically anchored to vehicle coordinates.
4. **Lineup Accordion (100vh)**:
   - Horizontal 5-model split carousel (GT-E, S, X, R, ONE) with 80ms debounced hover and keyboard navigation.
   - Closed slides (~12vw) show 25% brightness/grayscale crops; open slides (~52vw) present full color, 6% entry slide-in, specs, and color palette swatches.
5. **Reserve (100vh)**:
   - Minimalist commission portal with a solid xenon button fill interaction on hover.
6. **Footer**:
   - Clean 3-column architecture, lineup, and atelier directories.

---

## Configuration & Tuning

All section heights, chapter thresholds, asset paths, callout anchor coordinates, and model specs are centralized in [`config.js`](config.js) for tuning.

---

## Running Locally

Run any static HTTP server from the project directory:

```bash
# Python
python -m http.server 8080

# VS Code
Right-click index.html -> "Open with Live Server"
```

Open `http://localhost:8080` in any modern web browser.
