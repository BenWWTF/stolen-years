/**
 * The galaxy — a population of "lives".
 *
 * A life is a luminous line through dark space. At a marked point, an
 * infection — the line splits into a stolen branch (empathy beige) and a
 * future branch (futures blue). When a donor gives, the future branch
 * ignites: it transitions from dim to bright, and a point of light with
 * the donor's name travels along it.
 *
 * We pack all lives into a single BufferGeometry as LineSegments so the
 * GPU only has one draw call to render the whole galaxy.
 *
 * The "ignite" animation updates vertex colors over a ~1.2s ease —
 * bright futures mix in over the dim base color.
 */
import * as THREE from "three";
import { sampleCurve, range } from "./util.js";

const COL_LIVED = new THREE.Color(0xffffff);
const COL_STOLEN = new THREE.Color(0xd4b896); // empathy beige
const COL_STOLEN_DIM = new THREE.Color(0x8a7a5e);
const COL_FUTURE = new THREE.Color(0x5ba3e0); // futures blue
const COL_FUTURE_BRIGHT = new THREE.Color(0xbcdcff);
const COL_MILESTONE = new THREE.Color(0xc5e866);

const POINTS_PER_BRANCH = 22; // sampling resolution for each segment

/**
 * One life, with its three branches, and a flag for whether the future
 * branch has been ignited.
 */
class Life {
  constructor(index, rng, galaxyRadius) {
    this.index = index;
    this.ignited = false;
    this.ignitionStart = -1; // seconds (set on ignite)
    this.milestone = false; // does this life mark a research milestone?

    // Place somewhere in a thick disk-ish volume
    const phi = rng() * Math.PI * 2;
    const r = Math.cbrt(rng()) * galaxyRadius;
    const yJitter = (rng() - 0.5) * galaxyRadius * 0.5;
    this.center = new THREE.Vector3(
      Math.cos(phi) * r,
      yJitter,
      Math.sin(phi) * r
    );

    // Direction the life "moves" through space
    this.direction = new THREE.Vector3(
      rng() - 0.5,
      (rng() - 0.5) * 0.4,
      rng() - 0.5
    ).normalize();

    this.length = range(rng, 2.4, 5.2);
    // Where along the life the infection happens
    this.forkT = range(rng, 0.55, 0.78);

    // Build the three branches
    const start = this.center.clone();
    const fork = start
      .clone()
      .add(this.direction.clone().multiplyScalar(this.length * this.forkT));

    // Lived: from start to fork
    this.livedPath = sampleCurve(start, fork, POINTS_PER_BRANCH, rng, 0.35);

    // Stolen: from fork, drifts in a slightly off direction
    const stolenDir = this.direction
      .clone()
      .add(new THREE.Vector3((rng() - 0.5) * 0.6, -0.3, (rng() - 0.5) * 0.6))
      .normalize();
    const stolenEnd = fork
      .clone()
      .add(stolenDir.multiplyScalar(this.length * (1 - this.forkT) * 0.9));
    this.stolenPath = sampleCurve(fork, stolenEnd, POINTS_PER_BRANCH, rng, 0.5);

    // Future: from fork, drifts in another direction
    const futureDir = this.direction
      .clone()
      .add(new THREE.Vector3((rng() - 0.5) * 0.6, 0.3, (rng() - 0.5) * 0.6))
      .normalize();
    const futureEnd = fork
      .clone()
      .add(futureDir.multiplyScalar(this.length * (1 - this.forkT) * 1.0));
    this.futurePath = sampleCurve(fork, futureEnd, POINTS_PER_BRANCH, rng, 0.5);

    this.forkPos = fork.clone();
    this.futureEnd = futureEnd.clone();

    // Bookkeeping for vertex color updates
    this.vertexStart = -1; // index into the geometry's color buffer
    this.vertexCount = 0;
  }

  ignite(now) {
    if (this.ignited) return;
    this.ignited = true;
    this.ignitionStart = now;
  }
}

/**
 * Pack all lives into one LineSegments geometry.
 * The geometry has three "layers" of color per vertex:
 *   colorDim     — the unignited look
 *   colorLit     — the ignited look (only relevant for future branch)
 *   igniteFlag   — 1 if this vertex is on a future branch, 0 otherwise
 * We blend colorDim with colorLit using igniteFlag * lifeProgress.
 */
export function buildGalaxy({ numLives = 220, galaxyRadius = 16, seed = 20260717 } = {}) {
  // Seeded RNG so the scene is reproducible
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const lives = [];
  for (let i = 0; i < numLives; i++) {
    lives.push(new Life(i, rng, galaxyRadius));
  }

  // Each life contributes 3 branches, each branch is POINTS_PER_BRANCH+1 points.
  // As LineSegments we need 2 vertices per segment.
  // segments_per_branch = POINTS_PER_BRANCH
  // vertices_per_branch = 2 * POINTS_PER_BRANCH
  // total vertices per life = 3 * 2 * POINTS_PER_BRANCH = 132
  const segsPerBranch = POINTS_PER_BRANCH;
  const vertsPerBranch = segsPerBranch * 2;
  const vertsPerLife = vertsPerBranch * 3;
  const totalVerts = vertsPerLife * numLives;

  const positions = new Float32Array(totalVerts * 3);
  const colorDim = new Float32Array(totalVerts * 3);
  const colorLit = new Float32Array(totalVerts * 3);
  const igniteFlag = new Float32Array(totalVerts);

  // Output color buffer — what the material reads. Starts equal to colorDim.
  const colors = new Float32Array(totalVerts * 3);

  let cursor = 0;

  function emitBranch(path, isFuture) {
    const startIdx = cursor;
    for (let i = 0; i < segsPerBranch; i++) {
      const a = path[i];
      const b = path[i + 1];
      positions[cursor * 3 + 0] = a.x;
      positions[cursor * 3 + 1] = a.y;
      positions[cursor * 3 + 2] = a.z;
      positions[(cursor + 1) * 3 + 0] = b.x;
      positions[(cursor + 1) * 3 + 1] = b.y;
      positions[(cursor + 1) * 3 + 2] = b.z;

      // Dim/lit base colors depend on branch type
      let dimA, dimB, litA, litB;
      if (isFuture) {
        // Future branch: dim blue → bright blue
        dimA = dimB = COL_FUTURE;
        litA = litB = COL_FUTURE_BRIGHT;
      } else if (path === path /* lived vs stolen handled below */ && path[0] === path[0]) {
        // We'll handle lived vs stolen via the explicit branch argument
      }

      // We need to distinguish lived and stolen. Use a sentinel approach:
      // pass the role via the closure below.
      cursor += 2;
    }
    return startIdx;
  }

  // The above generic branch helper is awkward — let's just inline all 3.
  cursor = 0;
  for (const life of lives) {
    life.vertexStart = cursor;

    // 1. LIVED branch — always bright white, no ignite animation
    for (let i = 0; i < segsPerBranch; i++) {
      const a = life.livedPath[i];
      const b = life.livedPath[i + 1];
      positions[cursor * 3 + 0] = a.x;
      positions[cursor * 3 + 1] = a.y;
      positions[cursor * 3 + 2] = a.z;
      positions[(cursor + 1) * 3 + 0] = b.x;
      positions[(cursor + 1) * 3 + 1] = b.y;
      positions[(cursor + 1) * 3 + 2] = b.z;
      colorDim[cursor * 3 + 0] = COL_LIVED.r * 0.85;
      colorDim[cursor * 3 + 1] = COL_LIVED.g * 0.85;
      colorDim[cursor * 3 + 2] = COL_LIVED.b * 0.85;
      colorDim[(cursor + 1) * 3 + 0] = COL_LIVED.r * 0.85;
      colorDim[(cursor + 1) * 3 + 1] = COL_LIVED.g * 0.85;
      colorDim[(cursor + 1) * 3 + 2] = COL_LIVED.b * 0.85;
      colorLit[cursor * 3 + 0] = COL_LIVED.r;
      colorLit[cursor * 3 + 1] = COL_LIVED.g;
      colorLit[cursor * 3 + 2] = COL_LIVED.b;
      colorLit[(cursor + 1) * 3 + 0] = COL_LIVED.r;
      colorLit[(cursor + 1) * 3 + 1] = COL_LIVED.g;
      colorLit[(cursor + 1) * 3 + 2] = COL_LIVED.b;
      igniteFlag[cursor] = 0;
      igniteFlag[cursor + 1] = 0;
      cursor += 2;
    }

    // 2. STOLEN branch — beige, dim, never ignites
    for (let i = 0; i < segsPerBranch; i++) {
      const a = life.stolenPath[i];
      const b = life.stolenPath[i + 1];
      positions[cursor * 3 + 0] = a.x;
      positions[cursor * 3 + 1] = a.y;
      positions[cursor * 3 + 2] = a.z;
      positions[(cursor + 1) * 3 + 0] = b.x;
      positions[(cursor + 1) * 3 + 1] = b.y;
      positions[(cursor + 1) * 3 + 2] = b.z;
      colorDim[cursor * 3 + 0] = COL_STOLEN_DIM.r;
      colorDim[cursor * 3 + 1] = COL_STOLEN_DIM.g;
      colorDim[cursor * 3 + 2] = COL_STOLEN_DIM.b;
      colorDim[(cursor + 1) * 3 + 0] = COL_STOLEN_DIM.r;
      colorDim[(cursor + 1) * 3 + 1] = COL_STOLEN_DIM.g;
      colorDim[(cursor + 1) * 3 + 2] = COL_STOLEN_DIM.b;
      colorLit[cursor * 3 + 0] = COL_STOLEN.r;
      colorLit[cursor * 3 + 1] = COL_STOLEN.g;
      colorLit[cursor * 3 + 2] = COL_STOLEN.b;
      colorLit[(cursor + 1) * 3 + 0] = COL_STOLEN.r;
      colorLit[(cursor + 1) * 3 + 1] = COL_STOLEN.g;
      colorLit[(cursor + 1) * 3 + 2] = COL_STOLEN.b;
      igniteFlag[cursor] = 0;
      igniteFlag[cursor + 1] = 0;
      cursor += 2;
    }

    // 3. FUTURE branch — blue, dim until ignited
    for (let i = 0; i < segsPerBranch; i++) {
      const a = life.futurePath[i];
      const b = life.futurePath[i + 1];
      positions[cursor * 3 + 0] = a.x;
      positions[cursor * 3 + 1] = a.y;
      positions[cursor * 3 + 2] = a.z;
      positions[(cursor + 1) * 3 + 0] = b.x;
      positions[(cursor + 1) * 3 + 1] = b.y;
      positions[(cursor + 1) * 3 + 2] = b.z;
      colorDim[cursor * 3 + 0] = COL_FUTURE.r * 0.18;
      colorDim[cursor * 3 + 1] = COL_FUTURE.g * 0.18;
      colorDim[cursor * 3 + 2] = COL_FUTURE.b * 0.18;
      colorDim[(cursor + 1) * 3 + 0] = COL_FUTURE.r * 0.18;
      colorDim[(cursor + 1) * 3 + 1] = COL_FUTURE.g * 0.18;
      colorDim[(cursor + 1) * 3 + 2] = COL_FUTURE.b * 0.18;
      colorLit[cursor * 3 + 0] = COL_FUTURE_BRIGHT.r;
      colorLit[cursor * 3 + 1] = COL_FUTURE_BRIGHT.g;
      colorLit[cursor * 3 + 2] = COL_FUTURE_BRIGHT.b;
      colorLit[(cursor + 1) * 3 + 0] = COL_FUTURE_BRIGHT.r;
      colorLit[(cursor + 1) * 3 + 1] = COL_FUTURE_BRIGHT.g;
      colorLit[(cursor + 1) * 3 + 2] = COL_FUTURE_BRIGHT.b;
      igniteFlag[cursor] = 1;
      igniteFlag[cursor + 1] = 1;
      cursor += 2;
    }

    life.vertexCount = cursor - life.vertexStart;
    life.futureStart = life.vertexStart + vertsPerBranch * 2; // future branch starts here
  }

  // Initial output colors = dim
  colors.set(colorDim);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    linewidth: 1, // ignored on most platforms, see note below
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false; // galaxy always visible at some camera position

  // ----------------------------------------------------------------
  // Glow halo — render a second pass with a darker, wider look
  // by drawing slightly enlarged line geometry with lower opacity.
  // For the prototype we keep it simple: a second LineSegments mesh
  // at a slight scale with additive blending and a different color
  // mix. This avoids needing fat-line shaders / Line2.
  // ----------------------------------------------------------------
  const haloGeom = geometry.clone();
  const haloMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.LineSegments(haloGeom, haloMat);
  halo.scale.set(1.02, 1.02, 1.02);
  halo.frustumCulled = false;
  lines.add(halo);

  // ----------------------------------------------------------------
  // Drift data — per-life slow noise so the galaxy feels alive
  // ----------------------------------------------------------------
  const driftData = lives.map((life) => ({
    seed: rng() * 1000,
    speed: 0.05 + rng() * 0.1,
    amp: 0.05 + rng() * 0.08,
  }));

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  const colorAttr = geometry.getAttribute("color");
  const haloColorAttr = haloGeom.getAttribute("color");
  const posAttr = geometry.getAttribute("position");
  const haloPosAttr = haloGeom.getAttribute("position");
  const origPositions = new Float32Array(positions);

  /**
   * Re-blend output colors based on each life.ignited + igniteProgress.
   * Called per frame, but only does the math for lives that are
   * currently animating. Settled lives are left alone.
   */
  function updateColors(now) {
    const out = colorAttr.array;
    const haloOut = haloColorAttr.array;
    for (const life of lives) {
      if (!life.ignited) continue;
      if (life.igniteSettled) continue;
      const elapsed = now - life.ignitionStart;
      // Ease the ignite over ~1.4s
      const t = Math.min(1, elapsed / 1.4);
      const eased = t * t * (3 - 2 * t); // smoothstep
      // Future branch lives at life.futureStart .. + vertsPerBranch
      const start = life.futureStart;
      const end = start + vertsPerBranch;
      for (let i = start; i < end; i++) {
        const i3 = i * 3;
        const d0 = colorDim[i3 + 0];
        const d1 = colorDim[i3 + 1];
        const d2 = colorDim[i3 + 2];
        const l0 = colorLit[i3 + 0];
        const l1 = colorLit[i3 + 1];
        const l2 = colorLit[i3 + 2];
        out[i3 + 0] = d0 + (l0 - d0) * eased;
        out[i3 + 1] = d1 + (l1 - d1) * eased;
        out[i3 + 2] = d2 + (l2 - d2) * eased;
        // Halo: a brighter, slightly more saturated version
        haloOut[i3 + 0] = l0 * 1.4 * eased;
        haloOut[i3 + 1] = l1 * 1.4 * eased;
        haloOut[i3 + 2] = l2 * 1.4 * eased;
      }
      if (t >= 1) {
        life.igniteSettled = true;
      }
    }
    colorAttr.needsUpdate = true;
    haloColorAttr.needsUpdate = true;
  }

  /**
   * Subtle drift of the whole galaxy — a slow breathing motion so the
   * scene never feels frozen.
   */
  function updateDrift(t) {
    const arr = posAttr.array;
    const haloArr = haloPosAttr.array;
    for (let li = 0; li < lives.length; li++) {
      const life = lives[li];
      const d = driftData[li];
      const offset = Math.sin(t * d.speed + d.seed) * d.amp;
      const vStart = life.vertexStart * 3;
      for (let i = 0; i < life.vertexCount; i++) {
        const idx = vStart + i * 3;
        const op = origPositions[idx + 0];
        // Only apply a gentle z-drift (avoids breaking the "luminous line" reading)
        arr[idx + 2] = op + offset;
        haloArr[idx + 2] = op + offset;
      }
    }
    posAttr.needsUpdate = true;
    haloPosAttr.needsUpdate = true;
  }

  function igniteLife(life, now) {
    life.ignite(now);
  }

  // Pre-pick a "hero" life — the one that the ignite section focuses on
  // and the one that the donor's name travels along.
  // Choose a life near the origin for a clear focal point.
  const heroLife = lives.reduce((best, life) => {
    const d = life.forkPos.length();
    return d < best.forkPos.length() ? life : best;
  }, lives[0]);

  return {
    object: lines,
    lives,
    heroLife,
    igniteLife,
    updateColors,
    updateDrift,
    /** Total branches ignited in this session. */
    ignitedCount: () => lives.filter((l) => l.ignited).length,
  };
}
