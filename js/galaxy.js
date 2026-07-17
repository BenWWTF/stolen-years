/**
 * The galaxy — a population of "lives", drawn as timelines.
 *
 * Visual grammar (matches the Branching concept diagram):
 *   time flows left to right (+x)
 *   lived line    — a comet trail: dark in the far past, brightening
 *                   white toward the fork (the present)
 *   stolen branch — empathy beige, droops downward and fades to black
 *                   at its tip (dims and drifts)
 *   future fan    — three dormant blue strands rising ahead of the
 *                   fork; a donation ignites the middle one
 *
 * All lives are packed into a single LineSegments geometry (one draw
 * call). With additive blending, color * 0 = invisible, which drives
 * both the per-vertex gradients and the staged scroll reveal.
 */
import * as THREE from "three";
import { range } from "./util.js";

const COL_LIVED = new THREE.Color(0xffffff);
const COL_STOLEN = new THREE.Color(0xd4b896); // empathy beige
const COL_FUTURE = new THREE.Color(0x5ba3e0); // futures blue
const COL_FUTURE_BRIGHT = new THREE.Color(0xbcdcff);

const POINTS_PER_BRANCH = 22;
const FUTURE_STRANDS = 3; // the fan of dormant futures
const BRANCHES_PER_LIFE = 2 + FUTURE_STRANDS;

/** Sample a mostly-straight path with a vertical/lateral shape offset. */
function buildPath(start, dir, len, steps, shape) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = start.clone().add(dir.clone().multiplyScalar(len * t));
    const o = shape(t);
    p.y += o.y;
    p.z += o.z;
    pts.push(p);
  }
  return pts;
}

class Life {
  constructor(index, rng, galaxyRadius) {
    this.index = index;
    this.ignited = false;
    this.ignitionStart = -1;

    // Place the fork somewhere in a flattened volume
    const phi = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * galaxyRadius;
    const fork = new THREE.Vector3(
      Math.cos(phi) * r,
      (rng() - 0.5) * galaxyRadius * 0.35,
      Math.sin(phi) * r * 0.8
    );

    // Every life flows the same general direction: left to right
    const dir = new THREE.Vector3(
      1,
      (rng() - 0.5) * 0.1,
      (rng() - 0.5) * 0.3
    ).normalize();

    this.length = range(rng, 7, 12);
    this.forkT = range(rng, 0.5, 0.68);

    const livedLen = this.length * this.forkT;
    const start = fork.clone().sub(dir.clone().multiplyScalar(livedLen));

    // Lived: one gentle arc, flat at both ends so the fork connects cleanly
    const amp = range(rng, 0.15, 0.45) * (rng() < 0.5 ? -1 : 1);
    const zAmp = range(rng, 0.05, 0.25) * (rng() < 0.5 ? -1 : 1);
    this.livedPath = buildPath(start, dir, livedLen, POINTS_PER_BRANCH, (t) => ({
      y: Math.sin(Math.PI * t) * amp,
      z: Math.sin(Math.PI * t) * zAmp,
    }));

    const restLen = this.length * (1 - this.forkT);

    // Stolen: keeps flowing, but droops down and drifts sideways
    const droop = range(rng, 1.2, 2.4);
    const zDrift = (rng() - 0.5) * 1.2;
    this.stolenPath = buildPath(fork, dir, restLen * 0.9, POINTS_PER_BRANCH, (t) => ({
      y: -droop * t * t,
      z: zDrift * t,
    }));

    // Future fan: strand 0 is the middle one (the one that ignites)
    const rises = [range(rng, 0.9, 1.3), range(rng, 0.4, 0.6), range(rng, 1.7, 2.1)];
    const spreads = [0, -range(rng, 0.4, 0.7), range(rng, 0.4, 0.7)];
    this.futurePaths = [];
    for (let k = 0; k < FUTURE_STRANDS; k++) {
      this.futurePaths.push(
        buildPath(fork, dir, restLen * (1 - k * 0.08), POINTS_PER_BRANCH, (t) => ({
          y: rises[k] * Math.pow(t, 1.7),
          z: spreads[k] * t,
        }))
      );
    }
    this.futurePath = this.futurePaths[0]; // the traveling light rides this one

    this.forkPos = fork.clone();
    this.futureEnd = this.futurePaths[0][POINTS_PER_BRANCH].clone();

    this.vertexStart = -1;
    this.vertexCount = 0;
    this.futureStart = -1;
  }

  ignite(now) {
    if (this.ignited) return;
    this.ignited = true;
    this.ignitionStart = now;
  }
}

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

  const segsPerBranch = POINTS_PER_BRANCH;
  const vertsPerBranch = segsPerBranch * 2;
  const vertsPerLife = vertsPerBranch * BRANCHES_PER_LIFE;
  const totalVerts = vertsPerLife * numLives;

  const positions = new Float32Array(totalVerts * 3);
  const colorDim = new Float32Array(totalVerts * 3);
  const colorLit = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  let cursor = 0;

  /**
   * Emit one branch. dimFn/litFn map t (0..1 along the branch) to a
   * THREE.Color-like {r,g,b} multiplied brightness.
   */
  function emitBranch(path, dimFn, litFn) {
    for (let i = 0; i < segsPerBranch; i++) {
      const a = path[i];
      const b = path[i + 1];
      const ta = i / segsPerBranch;
      const tb = (i + 1) / segsPerBranch;
      positions[cursor * 3 + 0] = a.x;
      positions[cursor * 3 + 1] = a.y;
      positions[cursor * 3 + 2] = a.z;
      positions[(cursor + 1) * 3 + 0] = b.x;
      positions[(cursor + 1) * 3 + 1] = b.y;
      positions[(cursor + 1) * 3 + 2] = b.z;
      const da = dimFn(ta);
      const db = dimFn(tb);
      colorDim[cursor * 3 + 0] = da.r;
      colorDim[cursor * 3 + 1] = da.g;
      colorDim[cursor * 3 + 2] = da.b;
      colorDim[(cursor + 1) * 3 + 0] = db.r;
      colorDim[(cursor + 1) * 3 + 1] = db.g;
      colorDim[(cursor + 1) * 3 + 2] = db.b;
      const la = litFn(ta);
      const lb = litFn(tb);
      colorLit[cursor * 3 + 0] = la.r;
      colorLit[cursor * 3 + 1] = la.g;
      colorLit[cursor * 3 + 2] = la.b;
      colorLit[(cursor + 1) * 3 + 0] = lb.r;
      colorLit[(cursor + 1) * 3 + 1] = lb.g;
      colorLit[(cursor + 1) * 3 + 2] = lb.b;
      cursor += 2;
    }
  }

  const scaled = (col, f) => ({ r: col.r * f, g: col.g * f, b: col.b * f });
  const smooth = (a, b, t) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };

  for (const life of lives) {
    life.vertexStart = cursor;

    // 1. LIVED — comet trail: dark far past, bright at the fork
    emitBranch(
      life.livedPath,
      (t) => scaled(COL_LIVED, 0.85 * smooth(0, 0.45, t)),
      (t) => scaled(COL_LIVED, smooth(0, 0.45, t))
    );

    // 2. STOLEN — beige, fading to black at the tip
    emitBranch(
      life.stolenPath,
      (t) => scaled(COL_STOLEN, 0.55 * Math.pow(1 - t, 1.6)),
      (t) => scaled(COL_STOLEN, 0.55 * Math.pow(1 - t, 1.6))
    );

    // 3. FUTURE FAN — strand 0 ignites; the outer strands stay dormant
    life.futureStart = cursor;
    emitBranch(
      life.futurePaths[0],
      (t) => scaled(COL_FUTURE, 0.2 * (0.85 + 0.15 * t)),
      (t) => scaled(COL_FUTURE_BRIGHT, 0.7 + 0.3 * t)
    );
    for (let k = 1; k < FUTURE_STRANDS; k++) {
      const dimK = (t) => scaled(COL_FUTURE, 0.09 * (1 - 0.25 * t));
      emitBranch(life.futurePaths[k], dimK, dimK);
    }

    life.vertexCount = cursor - life.vertexStart;
  }

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
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;

  // Glow halo — the same geometry at a slight scale, low opacity
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

  // Drift data — slow per-life breathing so the field never freezes
  const driftData = lives.map(() => ({
    seed: rng() * 1000,
    speed: 0.05 + rng() * 0.1,
    amp: 0.04 + rng() * 0.07,
  }));

  // ----------------------------------------------------------------
  // Color state + staged reveal
  // ----------------------------------------------------------------
  const colorAttr = geometry.getAttribute("color");
  const haloColorAttr = haloGeom.getAttribute("color");
  const posAttr = geometry.getAttribute("position");
  const haloPosAttr = haloGeom.getAttribute("position");
  const origPositions = new Float32Array(positions);

  const baseColors = new Float32Array(colorDim);
  const haloBaseColors = new Float32Array(colorDim);

  let revealOthers = 0;
  let revealHeroBranches = 0;
  let appliedOthers = -1;
  let appliedHero = -1;

  function setReveal(others, heroBranches) {
    revealOthers = others;
    revealHeroBranches = heroBranches;
  }

  function applyBranchFactor(out, haloOut, from, to, f) {
    const fh = f * f; // halo fades faster, keeps the wide shot from washing out
    for (let i = from; i < to; i++) {
      const i3 = i * 3;
      out[i3 + 0] = baseColors[i3 + 0] * f;
      out[i3 + 1] = baseColors[i3 + 1] * f;
      out[i3 + 2] = baseColors[i3 + 2] * f;
      haloOut[i3 + 0] = haloBaseColors[i3 + 0] * fh;
      haloOut[i3 + 1] = haloBaseColors[i3 + 1] * fh;
      haloOut[i3 + 2] = haloBaseColors[i3 + 2] * fh;
    }
  }

  function updateColors(now) {
    let igniteDirty = false;
    for (const life of lives) {
      if (!life.ignited || life.igniteSettled) continue;
      igniteDirty = true;
      const elapsed = now - life.ignitionStart;
      const t = Math.min(1, elapsed / 1.4);
      const eased = t * t * (3 - 2 * t);
      const start = life.futureStart;
      const end = start + vertsPerBranch; // strand 0 only
      for (let i = start; i < end; i++) {
        const i3 = i * 3;
        const d0 = colorDim[i3 + 0];
        const d1 = colorDim[i3 + 1];
        const d2 = colorDim[i3 + 2];
        baseColors[i3 + 0] = d0 + (colorLit[i3 + 0] - d0) * eased;
        baseColors[i3 + 1] = d1 + (colorLit[i3 + 1] - d1) * eased;
        baseColors[i3 + 2] = d2 + (colorLit[i3 + 2] - d2) * eased;
        haloBaseColors[i3 + 0] = colorLit[i3 + 0] * 1.4 * eased;
        haloBaseColors[i3 + 1] = colorLit[i3 + 1] * 1.4 * eased;
        haloBaseColors[i3 + 2] = colorLit[i3 + 2] * 1.4 * eased;
      }
      if (t >= 1) life.igniteSettled = true;
    }

    const revealDirty =
      Math.abs(revealOthers - appliedOthers) > 0.002 ||
      Math.abs(revealHeroBranches - appliedHero) > 0.002;
    if (!igniteDirty && !revealDirty) return;
    appliedOthers = revealOthers;
    appliedHero = revealHeroBranches;

    const out = colorAttr.array;
    const haloOut = haloColorAttr.array;
    for (const life of lives) {
      const v0 = life.vertexStart;
      if (life === heroLife) {
        // Lived line always visible; the fork's branches appear on cue
        applyBranchFactor(out, haloOut, v0, v0 + vertsPerBranch, 1);
        applyBranchFactor(out, haloOut, v0 + vertsPerBranch, v0 + life.vertexCount, revealHeroBranches);
      } else {
        applyBranchFactor(out, haloOut, v0, v0 + life.vertexCount, revealOthers);
      }
    }
    colorAttr.needsUpdate = true;
    haloColorAttr.needsUpdate = true;
  }

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
        arr[idx + 2] = origPositions[idx + 2] + offset;
        haloArr[idx + 2] = origPositions[idx + 2] + offset;
      }
    }
    posAttr.needsUpdate = true;
    haloPosAttr.needsUpdate = true;
  }

  function igniteLife(life, now) {
    life.ignite(now);
  }

  /**
   * Pre-ignite a few settled lives so the topology beat has company.
   */
  function seedLit(count) {
    let picked = 0;
    for (const life of lives) {
      if (picked >= count) break;
      if (life === heroLife) continue;
      if (life.forkPos.distanceTo(heroLife.forkPos) < 4) continue;
      life.ignite(-100);
      life.igniteSettled = true;
      const start = life.futureStart;
      const end = start + vertsPerBranch;
      for (let i = start; i < end; i++) {
        const i3 = i * 3;
        baseColors[i3 + 0] = colorLit[i3 + 0];
        baseColors[i3 + 1] = colorLit[i3 + 1];
        baseColors[i3 + 2] = colorLit[i3 + 2];
        haloBaseColors[i3 + 0] = colorLit[i3 + 0] * 1.4;
        haloBaseColors[i3 + 1] = colorLit[i3 + 1] * 1.4;
        haloBaseColors[i3 + 2] = colorLit[i3 + 2] * 1.4;
      }
      picked++;
    }
    appliedOthers = -1; // force a rewrite on the next frame
  }

  // The hero life — the one the story and the first donation focus on
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
    setReveal,
    seedLit,
    ignitedCount: () => lives.filter((l) => l.ignited).length,
  };
}
