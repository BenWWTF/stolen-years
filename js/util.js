/**
 * Deterministic RNG (mulberry32). Same seed → same galaxy every reload,
 * which keeps the cinematic take reproducible across page refreshes.
 */
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, a, b) {
  return a + (b - a) * rng();
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation between two THREE.Vector3s.
 */
export function lerpV3(a, b, t, out = null) {
  out = out || { x: 0, y: 0, z: 0 };
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/**
 * Smooth Catmull-Rom-ish curve sampling between two endpoints with
 * a couple of jittered control points so the lines feel like lives
 * rather than straight rays.
 */
export function sampleCurve(start, end, n, rng, wobble = 0.4) {
  const points = [];
  // Two jittered control points in between
  const c1 = {
    x: (start.x + end.x) / 2 + (rng() - 0.5) * wobble,
    y: (start.y + end.y) / 2 + (rng() - 0.5) * wobble,
    z: (start.z + end.z) / 2 + (rng() - 0.5) * wobble,
  };
  const c2 = {
    x: (start.x + end.x) * 0.75 + (rng() - 0.5) * wobble * 0.6,
    y: (start.y + end.y) * 0.75 + (rng() - 0.5) * wobble * 0.6,
    z: (start.z + end.z) * 0.75 + (rng() - 0.5) * wobble * 0.6,
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Cubic Bezier through 4 control points
    const u = 1 - t;
    const x =
      u * u * u * start.x +
      3 * u * u * t * c1.x +
      3 * u * t * t * c2.x +
      t * t * t * end.x;
    const y =
      u * u * u * start.y +
      3 * u * u * t * c1.y +
      3 * u * t * t * c2.y +
      t * t * t * end.y;
    const z =
      u * u * u * start.z +
      3 * u * u * t * c1.z +
      3 * u * t * t * c2.z +
      t * t * t * end.z;
    points.push({ x, y, z });
  }
  return points;
}
