/**
 * The Stolen Years · v2.
 *
 * Architecture:
 *   renderer + bloom  — the luminous-line look
 *   galaxy            — procedurally generated lives in one fat-line draw
 *   camera            — 8-beat scroll-driven keyframe animation
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
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
});
galaxy.material.resolution.set(window.innerWidth, window.innerHeight);
scene.add(galaxy.object);
galaxy.seedLit(2); // scenery, excluded from every counter

// ============================================================
// Camera controller
// ============================================================
const camCtl = makeCameraController(camera);
camCtl.aimStory(galaxy.heroLife);
camCtl.focusOn(galaxy.heroLife.forkPos);

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

let clipPromise = null;
const igniteCtl = setupIgnite({
  galaxy,
  scene,
  onIgniteStart: (life, donation) => {
    clipPromise = clip.supported ? clip.start(donation, 9) : null;
  },
  onIgnite: (life, donation) => {
    share.renderShare(life, donation, { pendingClip: !!clipPromise });
    if (clipPromise) clipPromise.then((res) => share.setClip(res));
    live.publish(donation).then((url) => {
      if (url) share.setShareUrl(url);
      else setCount(count + 1); // offline: still count locally
    });
    showToast("A new timeline begins", "See it", "#share");
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

  camCtl.update(scrollProgress);

  // The screenplay reveal:
  //   beats 0-1  · only the hero's lived line
  //   beat  2    · the fork: the hero's stolen + future branches appear
  //   beat  4    · a few faint neighbors join for the manifesto
  //   beat  7    · the full topology
  const heroBranches = smoothstep(0.16, 0.3, scrollProgress);
  const others =
    0.22 * smoothstep(0.44, 0.6, scrollProgress) +
    0.58 * smoothstep(0.8, 0.97, scrollProgress);
  galaxy.setReveal(others, heroBranches);

  // Milestone: the structure bends and brightens for a breath
  let bloomBoost = 0;
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
  // Ease bloom off for the wide shot so the core doesn't wash out
  bloom.strength = BLOOM_BASE - 0.4 * smoothstep(0.8, 1, scrollProgress) + bloomBoost;

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
  "%cThe Stolen Years · v2 · live",
  "color:#c5e866; font-size:16px; padding:6px 0;"
);
console.log(
  "%cA brighter topology. WE&ME Foundation · weandmecfs.org",
  "color:#9d9890; font-size:11px;"
);
