/**
 * The Stolen Years — Phase 1 prototype.
 *
 * This is the working scene that backs the scroll storyboard.
 *
 * Architecture:
 *   scene       — Three.js renderer + camera + post-processing
 *   galaxy      — 220 procedurally generated lives, packed into one
 *                 LineSegments geometry
 *   camera      — scroll-driven keyframe animation through 7 positions
 *   ignite      — donation form handler; triggers the ignite animation
 *   share       — populates the share clip preview after each donation
 *   counter     — tracks the number of ignited branches in this session
 *
 * No tracking, no analytics, no real payment processing. Phase 2 wires
 * the donate button to the real donation webhook.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { buildGalaxy } from "./galaxy.js";
import { makeCameraController } from "./camera.js";
import { setupIgnite } from "./ignite.js";
import { setupShare } from "./share.js";
import { clamp } from "./util.js";

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
scene.fog = new THREE.FogExp2(0x04040a, 0.022);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 0.3, 7);
camera.lookAt(0, 0, 0);

// CSS2D renderer for the floating donor name tag
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.setSize(window.innerWidth, window.innerHeight);
css2dRenderer.domElement.style.position = "fixed";
css2dRenderer.domElement.style.top = "0";
css2dRenderer.domElement.style.left = "0";
css2dRenderer.domElement.style.pointerEvents = "none";
css2dRenderer.domElement.style.zIndex = "3";
document.body.appendChild(css2dRenderer.domElement);

// ============================================================
// Post-processing — gentle bloom for the "luminous line" feel
// ============================================================
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.85, // strength
  0.85, // radius
  0.15 // threshold (low so dim lines still bloom a bit)
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ============================================================
// Galaxy
// ============================================================
const galaxy = buildGalaxy({
  numLives: 220,
  galaxyRadius: 18,
  seed: 20260717,
});
scene.add(galaxy.object);

// ============================================================
// Camera controller (scroll-driven)
// ============================================================
const camCtl = makeCameraController(camera);

// ============================================================
// Share + Ignite
// ============================================================
const renderShare = setupShare();
const igniteCtl = setupIgnite({
  galaxy,
  scene,
  onIgnite: (life, donation) => {
    renderShare(life, donation);
    updateCounter();
    pulseMilestone();
    // Show the toast — the donor's share is ready in the share section
    const toast = document.getElementById("toast");
    toast.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("is-visible"), 9000);
  },
});
// Share the animate loop's clock time with the ignite module
igniteCtl.setNow(() => clock.getElapsedTime());

// ============================================================
// Counter
// ============================================================
const counterNum = document.getElementById("counterNum");
const counterBar = document.getElementById("counterBar");
function updateCounter() {
  const n = galaxy.ignitedCount();
  counterNum.textContent = String(n);
  const pct = clamp((n / 4) * 100, 0, 100);
  counterBar.style.width = pct + "%";
}
function pulseMilestone() {
  counterNum.animate(
    [
      { color: "#f6f3ec", transform: "scale(1)" },
      { color: "#c5e866", transform: "scale(1.12)" },
      { color: "#f6f3ec", transform: "scale(1)" },
    ],
    { duration: 700, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  );
}

// ============================================================
// Scroll handling
// ============================================================
const sections = Array.from(document.querySelectorAll(".section"));
const topnavLinks = Array.from(document.querySelectorAll(".topnav a"));
const topbar = document.querySelector(".topbar");

let scrollProgress = 0;
let targetProgress = 0;

function recomputeProgress() {
  const max =
    document.documentElement.scrollHeight - window.innerHeight;
  targetProgress = max > 0 ? window.scrollY / max : 0;
}

function activeSection() {
  const vh = window.innerHeight;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    const center = r.top + r.height / 2;
    const d = Math.abs(center - vh / 2);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

window.addEventListener("scroll", () => {
  recomputeProgress();
  if (window.scrollY > 8) topbar.classList.add("is-stuck");
  else topbar.classList.remove("is-stuck");
  const idx = activeSection();
  // The nav has 5 items (idea, fork, galaxy, ignite, share). The hero
  // is index 0 (no nav link) and the close is the last section. We
  // map idx → navIdx by clamping into the 5-link range.
  const navIdx = Math.max(0, Math.min(topnavLinks.length - 1, idx - 1));
  topnavLinks.forEach((a, i) => {
    a.classList.toggle("is-active", i === navIdx);
  });
}, { passive: true });

recomputeProgress();

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
}
window.addEventListener("resize", onResize);

// ============================================================
// Animate
// ============================================================
const clock = new THREE.Clock();
let firstFrame = true;
const boot = document.getElementById("boot");

function frame() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Smooth scroll progress
  scrollProgress += (targetProgress - scrollProgress) * 0.12;

  // Camera
  camCtl.update(scrollProgress);

  // Galaxy
  galaxy.updateColors(t);
  galaxy.updateDrift(t);

  // Ignite travel
  igniteCtl.update(t);

  // Subtle whole-galaxy rotation tied to scroll (cinematic micro-parallax)
  const rotY = scrollProgress * Math.PI * 0.4 - 0.2;
  galaxy.object.rotation.y += (rotY - galaxy.object.rotation.y) * 0.08;
  // Slight tilt based on scroll
  const rotX = Math.sin(scrollProgress * Math.PI) * 0.05;
  galaxy.object.rotation.x += (rotX - galaxy.object.rotation.x) * 0.08;

  composer.render();
  css2dRenderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      boot.classList.add("is-hidden");
    });
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ============================================================
// Optional: pre-ignite a few "lives" on first load so the galaxy
// is already partly lit — a hint that the mechanic is live.
// ============================================================
function seedLitBranches() {
  // Pre-ignite 2-3 lives, settled, so the close section has company.
  const seedCount = 2;
  let picked = 0;
  for (const life of galaxy.lives) {
    if (picked >= seedCount) break;
    if (life === galaxy.heroLife) continue; // leave the hero alone for the donor
    // Skip if too close to hero (so we don't pile up)
    if (life.forkPos.distanceTo(galaxy.heroLife.forkPos) < 4) continue;
    galaxy.igniteLife(life, -100); // long ago
    // Mark as settled so updateColors doesn't re-blend per frame
    life.igniteSettled = true;
    // Bake the lit colors directly so they're correct on the first frame
    const start = life.futureStart;
    const vertsPerBranch = 22 * 2; // POINTS_PER_BRANCH * 2
    const end = start + vertsPerBranch;
    const colorAttr = galaxy.object.geometry.getAttribute("color");
    const haloGeom = galaxy.object.children[0].geometry;
    const haloColorAttr = haloGeom.getAttribute("color");
    const out = colorAttr.array;
    const haloOut = haloColorAttr.array;
    for (let i = start; i < end; i++) {
      const i3 = i * 3;
      // We don't have access to colorLit from here, so we approximate with a bright blue
      out[i3 + 0] = 0.74; // 0xbcdcff.r
      out[i3 + 1] = 0.86;
      out[i3 + 2] = 1.0;
      haloOut[i3 + 0] = 0.74 * 1.4;
      haloOut[i3 + 1] = 0.86 * 1.4;
      haloOut[i3 + 2] = 1.0 * 1.4;
    }
    colorAttr.needsUpdate = true;
    haloColorAttr.needsUpdate = true;
    picked++;
  }
}
seedLitBranches();
updateCounter(); // sync the counter with seeded branches

// ============================================================
// Console signature — so the team can confirm which build is loaded
// ============================================================
console.log(
  "%cThe Stolen Years · prototype",
  "color:#c5e866; font-family:serif; font-size:18px; font-style:italic; padding:6px 0;"
);
console.log(
  "%cPhase 1 — cinematic. Phase 2 — live donation feed.",
  "color:#a8a39a; font-family:monospace; font-size:11px;"
);
