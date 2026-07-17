# The Stolen Years — Phase 1 prototype

A scroll-driven, single-page prototype for the **weandmecfs.org** donation
campaign. The brief calls it "a live, many-worlds donation experience" —
this prototype delivers the cinematic Phase 1: a single luminous line that
splits, a galaxy of lives, and the ignite-a-branch mechanic.

> The page is never the same twice. — §06 milestone

## What this is

- **Phase 1 (this prototype):** a cinematic, scroll-driven, non-interactive
  version of the donation experience, plus a working **ignite** mechanic
  (donor name → branch ignites → share clip renders).
- **Phase 2 (next):** the live donation feed ignites branches in real time,
  with AI-generated milestone posts and actual share clips.

## How to run

```bash
cd prototype/
python3 -m http.server 8765
# open http://localhost:8765
```

No build step. Three.js loads from unpkg via an import map.

## File map

```
prototype/
├── index.html          ← 7 narrative sections + boot screen + toast
├── css/
│   └── styles.css      ← brand palette, typography, components
├── js/
│   ├── main.js         ← entry, scroll handler, animate loop, ignite counter
│   ├── scene.js        ← (folded into main.js — see below)
│   ├── galaxy.js       ← 220 procedurally generated "lives" as a single
│   │                     LineSegments geometry with per-vertex ignite state
│   ├── camera.js       ← 7-keyframe scroll-driven camera animation
│   ├── ignite.js       ← donation form handler + traveling light + donor tag
│   ├── share.js        ← share-clip preview renderer
│   └── util.js         ← seeded RNG, curve sampling, easing
└── assets/             ← screenshot proofs of each section
```

## What it does

### 1. The scene

A single `THREE.LineSegments` holds **220 lives** packed into one geometry:

- **lived branch** — the life that was, drawn in white
- **stolen branch** — the world that was taken, in empathy beige
- **future branch** — the world that can be ignited, dim blue → bright blue

Each life is a 3D cubic-Bezier curve sampled at 22 segments per branch,
with two control points jittered by a seeded RNG so the galaxy is
reproducible on every reload.

A second pass renders the same geometry at scale 1.02 with lower opacity —
a cheap "halo" that gives the lines their glow under `UnrealBloomPass`.

### 2. Scroll-driven camera

7 keyframes (`§0` hero → `§6` close) interpolate the camera's position,
lookAt, FOV and roll based on `window.scrollY / maxScroll`. The
`makeCameraController` in `js/camera.js` smooths both the keyframe
interpolation (per-section ease) and a per-frame lerp on the camera
position itself — so the camera feels weighted, not snapped.

### 3. The ignite mechanic

On form submit:

1. Pick a target life (the hero life for the first donation, then the next
   un-ignited one).
2. The future branch transitions from dim blue to bright blue over 1.4s
   (`smoothstep` ease) — animated by re-blending per-vertex colors
   between a pre-baked "dim" array and a "lit" array.
3. A point of light travels along the future branch over 2.4s, with a
   pulsing halo.
4. The donor's name (and optional dedication) floats above the light as a
   `CSS2DObject` HTML tag.
5. When the light arrives, the share-clip preview populates the phone
   mockup, the counter ticks up, and a toast prompts the donor to scroll
   to the share section.

The "donation" is a simulation. There is no real money. The form submit
is just `e.preventDefault()` + an internal ignite.

### 4. The share clip

`js/share.js` renders an Instagram-story-aspect (9:16) preview in the
phone mockup, including the donor's name, dedication, and a stylized
donate CTA. A real implementation would rasterize the actual WebGL frame
of the branch igniting — that's a Phase 2 task.

Two export buttons:

- **Download clip** — generates an SVG placeholder and downloads it
  (proof the flow works end-to-end)
- **Copy share link** — copies a `weandmecfs.org/ignited/…` URL to the
  clipboard

### 5. The counter

The close section shows the number of branches ignited in this session.
Two branches are pre-ignited on first load (`seedLitBranches`) so the
close view always has company.

A milestone bar fills as the count grows, with a lime→blue gradient. At
count = 4 the bar is full — the next ignite would push it into a new
"milestone" state (Phase 2).

## Design notes for Roland (productionisation)

Things you'll likely want to change for the real build:

1. **WebGL line widths.** Three.js `LineBasicMaterial.linewidth` is
   ignored on most platforms. The prototype leans on UnrealBloomPass for
   the glow. If you need true thick lines, swap in `Line2` /
   `LineMaterial` from `three/addons/lines/`.
2. **Number of lives.** 220 is a good prototype density. For mobile, drop
   to 100–140 in `buildGalaxy({ numLives: 120 })`. The `galaxyRadius` of
   18 also scales down nicely.
3. **Performance.** On low-end mobile, disable the halo pass
   (`scene.remove(halo)`) and the bloom pass. The scene still looks
   good with just additive lines.
4. **Donation webhook.** The form's submit handler in
   `js/ignite.js` is currently a simulation. Wire it to your payment
   provider and only call `ignite(life, donation, now)` on a confirmed
   response. The scene doesn't care which life is which — pick the
   hero life or any un-ignited one based on whatever logic you want.
5. **Share clip rasterisation.** The SVG export in `js/share.js` is a
   placeholder. For real Phase 2, capture the WebGL canvas via
   `renderer.domElement.toDataURL()` after the light arrives, composite
   it into a 9:16 canvas with the donor name overlay, and upload.
6. **Lovable handoff.** The HTML is sectioned to match Lovable's
   component model: each `<section class="section">` is one component,
   and the boot screen, top bar, form, share stage, and counter are
   separate components. The CSS is tokenised in `:root` so the palette
   can be swapped without touching component styles.
7. **Accessibility.** The boot mask is `aria-hidden`, the form is
   keyboard-navigable, all interactive elements have hover states, and
   the toast uses `aria-live="polite"`. Phase 2 should add a
   prefers-reduced-motion path that skips the bloom and the
   traveling-light animation.

## Console signature

Open the dev tools and you should see:

```
The Stolen Years · prototype
Phase 1 — cinematic. Phase 2 — live donation feed.
```

That's the build signature the team can grep for in staging.
