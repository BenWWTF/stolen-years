/**
 * The Unwritten Years · v2.
 *
 * Architecture:
 *   renderer + bloom  — the luminous-line look
 *   galaxy            — procedurally generated lives in one fat-line draw
 *   camera            — 9-beat scroll-driven keyframe animation
 *   ignite            — gift (blue) and action (lime) ignitions
 *   clip              — records the real 9s share video while a branch ignites
 *   live              — Supabase-backed shared galaxy: ignitions persist
 *                       and appear in real time for every visitor
 *   share             — clip preview + download + personal light link
 *
 * No tracking, no analytics. The gift path still simulates payment —
 * wiring a real payment provider is the last open Phase 2 item.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { buildGalaxy } from "./galaxy.js";
import { makeCameraController } from "./camera.js";
import { setupIgnite } from "./ignite.js";
import { setupShare } from "./share.js";
import { makeClipRecorder } from "./clip.js";
import { setupLive } from "./live.js";
import { smoothstep } from "./util.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.innerWidth < 768;

// ============================================================
// Renderer
// ============================================================
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
// Phones are DPR 3 — capping at 2 rendered at 2/3 native and read as
// blurry. The mobile scene is already lighter (fewer lives, softer
// bloom), so it can afford native resolution.
const DPR_CAP = isMobile ? 3 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04040a, 0.016);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 0.3, 7);
camera.lookAt(0, 0, 0);

const css2dRenderer = new CSS2DRenderer();
css2dRenderer.setSize(window.innerWidth, window.innerHeight);
css2dRenderer.domElement.style.position = "fixed";
css2dRenderer.domElement.style.top = "0";
css2dRenderer.domElement.style.left = "0";
css2dRenderer.domElement.style.pointerEvents = "none";
css2dRenderer.domElement.style.zIndex = "3";
document.body.appendChild(css2dRenderer.domElement);

// ============================================================
// Post-processing — bloom gives the lines their glow
// ============================================================
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
composer.addPass(new RenderPass(scene, camera));
const BLOOM_BASE = isMobile ? 0.65 : 0.85;
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  BLOOM_BASE,
  isMobile ? 0.6 : 0.85,
  0.15
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ============================================================
// Galaxy — fewer lives on mobile for framerate
// ============================================================
const galaxy = buildGalaxy({
  numLives: isMobile ? 140 : 260,
  galaxyRadius: isMobile ? 15 : 18,
  seed: 20260717,
  lineWidth: isMobile ? 1.7 : 2.2,
  // The small frame needs more life: faster, brighter pulse and a
  // visibly breathing field
  pulseSpeed: isMobile ? 0.32 : 0.22,
  pulseStrength: isMobile ? 2.4 : 1.6,
  driftScale: isMobile ? 1.8 : 1,
});
galaxy.material.resolution.set(window.innerWidth, window.innerHeight);
scene.add(galaxy.object);
galaxy.seedLit(2); // scenery, excluded from every counter

// ============================================================
// Camera controller
// ============================================================
const camCtl = makeCameraController(camera);
const isPortrait = () => window.innerHeight > window.innerWidth;
// Landscape also gets a small lift so the hero line rides above the
// text block instead of cutting through it
const aimForViewport = () =>
  camCtl.aimStory(galaxy.heroLife, isPortrait() ? 2.4 : 0.55, isPortrait() ? 0.3 : 1);
aimForViewport();
// The ignite beats frame the point on the sick branch where the
// light will rise, not the fork
camCtl.focusOn(galaxy.heroLife.lightAnchor);

// ============================================================
// Toast
// ============================================================
const toast = document.getElementById("toast");
const toastText = toast.querySelector(".toast__text");
const toastLink = toast.querySelector(".toast__link");
function showToast(text, linkText, href, ms = 9000) {
  toastText.textContent = text;
  toastLink.textContent = linkText;
  toastLink.href = href;
  toast.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("is-visible"), ms);
}

// ============================================================
// Counter + milestone pulse — the count is the global campaign total
// ============================================================
const counterNum = document.getElementById("counterNum");
const counterEl = document.getElementById("counter");
const COUNTER_MILESTONE = 10; // the counter earns its place at 10 ignitions
let count = 0;
let milestoneAt = -1;

function setCount(n) {
  const crossed = n > count && n % 10 === 0;
  count = n;
  counterEl.hidden = n < COUNTER_MILESTONE;
  counterNum.textContent = String(n);
  counterNum.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.12)" },
      { transform: "scale(1)" },
    ],
    { duration: 600, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  );
  // Every 10th ignition bends the whole structure for a moment
  if (crossed && !reducedMotion) milestoneAt = clock.getElapsedTime();
}

// ============================================================
// Clip recorder + share + live feed + ignite
// ============================================================
const clip = makeClipRecorder(renderer.domElement);
const share = setupShare();

const live = setupLive(galaxy, {
  onCountChange: (n) => setCount(n),
});

// ============================================================
// The ignition cinematic. The form's job is done, so it steps
// aside: the camera leaves scroll control, chases the light up
// the branch, holds on the newly lit timeline while the clip
// finishes recording, then delivers the visitor to the share
// beat. Skipped under prefers-reduced-motion.
// ============================================================
const igniteInner = document.querySelector("#ignite .beat__inner");
let cine = null; // { life, start, dur, startScrollY }
const cinePos = new THREE.Vector3();
const cineLook = new THREE.Vector3();
const CINE_TRAVEL = { land: new THREE.Vector3(1.4, 0.6, 4.6), port: new THREE.Vector3(0.15, 0.4, 6.2) };
const CINE_HOLD = { land: new THREE.Vector3(1.2, 0.9, 5.8), port: new THREE.Vector3(0, 1.0, 7.5) };

function endCinematic() {
  const stayed = Math.abs(window.scrollY - cine.startScrollY) < 150;
  igniteInner.classList.remove("is-ignited");
  cine = null;
  if (stayed) document.getElementById("share").scrollIntoView({ behavior: "smooth" });
  else showToast("A new timeline begins", "See it", "#share");
}

let clipPromise = null;
const igniteCtl = setupIgnite({
  galaxy,
  scene,
  onIgniteStart: (life, donation) => {
    clipPromise = clip.supported ? clip.start(donation, 9) : null;
    if (!reducedMotion) {
      cine = {
        life,
        start: clock.getElapsedTime(),
        dur: clipPromise ? 9.4 : 4.5, // hold until the clip is in the can
        startScrollY: window.scrollY,
      };
      igniteInner.classList.add("is-ignited");
    }
  },
  onIgnite: (life, donation) => {
    share.renderShare(life, donation, { pendingClip: !!clipPromise });
    if (clipPromise) clipPromise.then((res) => share.setClip(res));
    live.publish(donation).then((url) => {
      if (url) share.setShareUrl(url);
      else setCount(count + 1); // offline: still count locally
    });
    if (reducedMotion) showToast("A new timeline begins", "See it", "#share");
  },
});
igniteCtl.setNow(() => clock.getElapsedTime());

// Load the shared galaxy, then listen for other people's ignitions
live.load().then(async () => {
  live.subscribe(() => clock.getElapsedTime());
  const light = await live.resolveSharedLight();
  if (light) {
    const who = light.name || "An unnamed light";
    showToast(`${who}'s light is part of this galaxy`, "See it", "#topology", 12000);
  }
});

// ============================================================
// Scroll progress — read inside the animate loop, no scroll listener
// ============================================================
const topbar = document.querySelector(".topbar");
let scrollProgress = 0;

// Pointer parallax — the whole scene leans gently toward the cursor
// (desktop only; the camera controller lerps, so this stays smooth)
const parallax = { x: 0, y: 0 };
if (!isMobile && !reducedMotion) {
  window.addEventListener("pointermove", (e) => {
    parallax.x = (e.clientX / window.innerWidth - 0.5) * 2;
    parallax.y = (e.clientY / window.innerHeight - 0.5) * 2;
  });
}

// ============================================================
// The fork gate — the timeline doesn't break until you touch it.
// Destruction is a tap: instant, casual, almost accidental.
// Scrolling past the beat breaks it anyway (the story never stalls),
// and reduced-motion keeps the old scroll-driven reveal.
// ============================================================
const FORK_GATE = { min: 0.04, max: 0.19 };
let forkBrokenAt = -1; // clock time of the break; < 0 = still intact
const forkPayoff = document.getElementById("forkPayoff");
if (reducedMotion) forkPayoff.classList.add("is-shown");

const promptEl = document.createElement("div");
promptEl.className = "fork-prompt";
promptEl.innerHTML =
  '<span class="fork-prompt__ring"></span><span class="fork-prompt__text">Touch the line</span>';
const forkPrompt = new CSS2DObject(promptEl);
forkPrompt.visible = false;
galaxy.object.add(forkPrompt); // inherits the field's scroll rotation

// Ahead of the line's tip, in the empty space where the break will
// happen — clear of the beat text in both orientations
function placeForkPrompt() {
  const p = galaxy.heroLife.forkPos;
  if (isPortrait()) forkPrompt.position.set(p.x + 0.55, p.y + 0.4, p.z);
  else forkPrompt.position.set(p.x + 1.5, p.y + 0.35, p.z);
}
placeForkPrompt();

function breakFork() {
  if (forkBrokenAt >= 0) return;
  forkBrokenAt = clock.getElapsedTime();
  forkPayoff.classList.add("is-shown");
}

window.addEventListener("pointerdown", (e) => {
  if (forkBrokenAt >= 0 || reducedMotion) return;
  if (scrollProgress < FORK_GATE.min || scrollProgress > FORK_GATE.max) return;
  if (e.target.closest("a, button, input, label")) return;
  breakFork();
});

function targetProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

// ============================================================
// Resize
// ============================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  css2dRenderer.setSize(w, h);
  galaxy.material.resolution.set(w, h);
  aimForViewport(); // rotation flips the framing
  placeForkPrompt();
}
window.addEventListener("resize", onResize);

// ============================================================
// Animate
// ============================================================
const clock = new THREE.Clock();
let firstFrame = true;
const boot = document.getElementById("boot");
let stuck = false;

function frame() {
  const t = clock.getElapsedTime();

  scrollProgress += (targetProgress() - scrollProgress) * 0.12;

  const shouldStick = window.scrollY > 8;
  if (shouldStick !== stuck) {
    stuck = shouldStick;
    topbar.classList.toggle("is-stuck", stuck);
  }

  if (cine) {
    const ct = t - cine.start;
    if (ct >= cine.dur) {
      endCinematic();
      camCtl.update(scrollProgress, parallax);
    } else {
      const off = isPortrait() ? "port" : "land";
      const lp = igniteCtl.lightWorldPos();
      if (lp) {
        // Travel: chase the light up the branch
        cineLook.copy(lp);
        cinePos.copy(lp).add(CINE_TRAVEL[off]);
      } else {
        // Hold: rest on the lit timeline, drifting slowly back
        const path = cine.life.futurePath;
        const mid = path[Math.floor(path.length * 0.6)];
        const end = path[path.length - 1];
        cineLook.set(mid.x, mid.y, mid.z);
        galaxy.object.localToWorld(cineLook);
        cinePos.set(end.x, end.y, end.z);
        galaxy.object.localToWorld(cinePos);
        cinePos.add(CINE_HOLD[off]);
        cinePos.z += Math.max(0, ct - 2.6) * 0.25;
      }
      camCtl.follow(cinePos, cineLook);
    }
  } else {
    camCtl.update(scrollProgress, parallax);
  }

  // The screenplay reveal:
  //   beat  0    · only the hero's lived line
  //   beat  1    · the fork: intact until the visitor touches it
  //   beat  4    · the stream: timelines surge to fill the frame,
  //                then settle back for the manifesto + form
  //   beat  8    · the full topology
  if (forkBrokenAt < 0 && !reducedMotion && scrollProgress > FORK_GATE.max) breakFork();
  forkPrompt.visible =
    !reducedMotion &&
    forkBrokenAt < 0 &&
    scrollProgress >= FORK_GATE.min &&
    scrollProgress <= FORK_GATE.max;
  // Windowed by scroll so a broken fork doesn't leak into the hero
  // beat when the visitor scrolls back to the top
  const heroBranches =
    smoothstep(0.03, 0.08, scrollProgress) *
    (reducedMotion
      ? smoothstep(0.06, 0.14, scrollProgress)
      : forkBrokenAt < 0
        ? 0
        : smoothstep(0, 1.6, t - forkBrokenAt));
  const streamSurge = smoothstep(0.4, 0.5, scrollProgress) - 0.5 * smoothstep(0.56, 0.66, scrollProgress);
  const others =
    0.36 * streamSurge +
    0.62 * smoothstep(0.84, 0.98, scrollProgress);
  galaxy.setReveal(others, heroBranches);

  // Milestone: the structure bends and brightens for a breath
  let bloomBoost = 0;
  // The break itself flashes — one bright surge as the timeline snaps
  if (forkBrokenAt >= 0) {
    const k = (t - forkBrokenAt) / 0.9;
    if (k < 1) bloomBoost += 0.45 * Math.sin(Math.PI * k);
  }
  if (milestoneAt >= 0) {
    const k = (t - milestoneAt) / 1.8;
    if (k >= 1) {
      milestoneAt = -1;
      galaxy.object.scale.y = 1;
    } else {
      const w = Math.sin(Math.PI * k);
      galaxy.object.scale.y = 1 + 0.05 * w;
      bloomBoost = 0.5 * w;
    }
  }
  // Ease bloom off when the field is dense — inside the beat-4 stream
  // and in the finale — so individual lines stay distinct instead of
  // washing out to fog
  bloom.strength =
    BLOOM_BASE -
    0.3 * (streamSurge > 0.5 ? 2 * (streamSurge - 0.5) : 0) -
    0.4 * smoothstep(0.84, 1, scrollProgress) +
    bloomBoost;

  galaxy.updateColors(t, !reducedMotion);
  if (!reducedMotion) galaxy.updateDrift(t);

  igniteCtl.update(t);

  // Whole-galaxy rotation tied to scroll — gentle, so the field of
  // timelines keeps reading left-to-right
  const rotY = scrollProgress * Math.PI * 0.12 - 0.06;
  galaxy.object.rotation.y += (rotY - galaxy.object.rotation.y) * 0.08;
  const rotX = Math.sin(scrollProgress * Math.PI) * 0.05;
  galaxy.object.rotation.x += (rotX - galaxy.object.rotation.x) * 0.08;

  composer.render();
  css2dRenderer.render(scene, camera);
  clip.captureFrame();

  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => boot.classList.add("is-hidden"));
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

console.log(
  "%cThe Unwritten Years · v2 · live",
  "color:#c5e866; font-size:16px; padding:6px 0;"
);
console.log(
  "%cA brighter topology. WE&ME Foundation · weandmecfs.org",
  "color:#9d9890; font-size:11px;"
);
