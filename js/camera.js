/**
 * Scroll-driven camera. We define 6 keyframes (one per narrative section)
 * and lerp the camera position/lookAt between them based on scroll progress.
 *
 * Each keyframe names:
 *   pos   — the camera's world position
 *   look  — the lookAt target
 *   roll  — a small roll offset (for cinematic micro-tilt)
 *   focus — a "subject" the camera is paying attention to (e.g. heroLife)
 */
import * as THREE from "three";
import { smoothstep } from "./util.js";

// Each keyframe sits at a normalized scroll position 0..1.
const KEYFRAMES = [
  // 0 — Hero: zoomed in on a single luminous line, slightly off-center
  { t: 0.0, pos: [0.0, 0.3, 7.0], look: [0.0, 0.0, 0.0], roll: 0, fov: 48 },
  // 1 — The idea: same line, but pulled a touch wider
  { t: 0.16, pos: [1.6, 0.0, 8.0], look: [0.0, 0.0, 0.0], roll: -0.05, fov: 52 },
  // 2 — The fork: a single life, centered, the split is the subject
  { t: 0.32, pos: [0.0, 0.2, 5.0], look: [0.0, 0.0, 0.0], roll: 0, fov: 46 },
  // 3 — The galaxy: pulled back, slow rotation, the whole population
  { t: 0.5, pos: [0.0, 2.0, 28.0], look: [0.0, 0.0, 0.0], roll: 0, fov: 60 },
  // 4 — Ignite: focused on a single life (the hero life)
  { t: 0.68, pos: [3.0, 0.5, 5.0], look: [0.0, 0.0, 0.0], roll: 0.02, fov: 42 },
  // 5 — Share: flat-ish view of the ignited branch
  { t: 0.84, pos: [0.0, 0.0, 6.0], look: [0.0, 0.0, 0.0], roll: 0, fov: 44 },
  // 6 — Close: pulled back, see the full constellation
  { t: 1.0, pos: [0.0, 1.2, 22.0], look: [0.0, 0.0, 0.0], roll: 0, fov: 55 },
];

function findKeyframes(progress) {
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (progress <= KEYFRAMES[i + 1].t) {
      return [KEYFRAMES[i], KEYFRAMES[i + 1], i];
    }
  }
  return [KEYFRAMES[KEYFRAMES.length - 2], KEYFRAMES[KEYFRAMES.length - 1], KEYFRAMES.length - 2];
}

function lerpKeyframe(a, b, t) {
  const ease = smoothstep(0, 1, t);
  return {
    pos: [
      a.pos[0] + (b.pos[0] - a.pos[0]) * ease,
      a.pos[1] + (b.pos[1] - a.pos[1]) * ease,
      a.pos[2] + (b.pos[2] - a.pos[2]) * ease,
    ],
    look: [
      a.look[0] + (b.look[0] - a.look[0]) * ease,
      a.look[1] + (b.look[1] - a.look[1]) * ease,
      a.look[2] + (b.look[2] - a.look[2]) * ease,
    ],
    roll: a.roll + (b.roll - a.roll) * ease,
    fov: a.fov + (b.fov - a.fov) * ease,
  };
}

export function makeCameraController(camera) {
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const currentLook = new THREE.Vector3();

  function update(progress) {
    const [a, b] = findKeyframes(progress);
    const segT = b.t === a.t ? 0 : (progress - a.t) / (b.t - a.t);
    const k = lerpKeyframe(a, b, segT);

    targetPos.set(k.pos[0], k.pos[1], k.pos[2]);
    targetLook.set(k.look[0], k.look[1], k.look[2]);

    // Smooth toward target (this gives a tiny damping on top of the keyframe lerp)
    camera.position.lerp(targetPos, 0.12);
    currentLook.lerp(targetLook, 0.12);
    camera.lookAt(currentLook);

    // Apply roll
    camera.rotation.z = k.roll;

    // FOV
    if (Math.abs(camera.fov - k.fov) > 0.01) {
      camera.fov += (k.fov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Re-aim the camera at a specific world point (used by the ignite section
   * to focus on the hero life).
   */
  function focusOn(point, distance = 5) {
    // Snap the relevant keyframe target so the next scroll update uses this focus
    KEYFRAMES[4].look = [point.x, point.y, point.z];
    KEYFRAMES[5].look = [point.x, point.y, point.z];
    KEYFRAMES[4].pos = [point.x + 3, point.y + 0.5, point.z + distance];
    KEYFRAMES[5].pos = [point.x, point.y, point.z + distance + 1];
  }

  return { update, focusOn };
}
