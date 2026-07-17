/**
 * Scroll-driven camera. 8 keyframes, one per beat of the screenplay:
 *
 *   0  hero      · intimate, a single luminous line
 *   1  life      · tracking alongside, the line in motion
 *   2  fork      · head-on close, the split is the subject
 *   3  past      · low angle, the stolen branch drifting down
 *   4  ideas     · lifted, calm mid-shot (the manifesto)
 *   5  ignite    · close on the hero life
 *   6  future    · following the freshly ignited branch
 *   7  topology  · the grand pull-back, thousands of lines
 */
import * as THREE from "three";
import { smoothstep } from "./util.js";

// Keyframe t values match section centers: i / (sections - 1)
const KEYFRAMES = [
  { t: 0.0,   pos: [0.0, 0.3, 7.0],   look: [0, 0, 0], roll: 0,     fov: 48 },
  { t: 0.143, pos: [2.4, 0.4, 6.0],   look: [0, 0, 0], roll: -0.03, fov: 50 },
  { t: 0.286, pos: [0.0, 0.2, 4.6],   look: [0, 0, 0], roll: 0,     fov: 46 },
  { t: 0.429, pos: [-2.4, -1.3, 7.5], look: [0, -0.4, 0], roll: -0.04, fov: 50 },
  { t: 0.571, pos: [0.0, 3.0, 22.0],  look: [0, 0, 0], roll: 0,     fov: 52 },
  { t: 0.714, pos: [3.0, 0.5, 5.0],   look: [0, 0, 0], roll: 0.02,  fov: 42 },
  { t: 0.857, pos: [0.5, 0.8, 5.5],   look: [0, 0, 0], roll: 0,     fov: 44 },
  { t: 1.0,   pos: [0.0, 26.0, 20.0], look: [0, 7, 0], roll: 0,     fov: 55 },
];

function findKeyframes(progress) {
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (progress <= KEYFRAMES[i + 1].t) {
      return [KEYFRAMES[i], KEYFRAMES[i + 1]];
    }
  }
  return [KEYFRAMES[KEYFRAMES.length - 2], KEYFRAMES[KEYFRAMES.length - 1]];
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

    camera.position.lerp(targetPos, 0.12);
    currentLook.lerp(targetLook, 0.12);
    camera.lookAt(currentLook);

    camera.rotation.z = k.roll;

    if (Math.abs(camera.fov - k.fov) > 0.01) {
      camera.fov += (k.fov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Re-aim the ignite + future beats at a specific world point
   * (the hero life the donor is about to light up).
   */
  function focusOn(point, distance = 5) {
    KEYFRAMES[5].look = [point.x, point.y, point.z];
    KEYFRAMES[6].look = [point.x, point.y, point.z];
    KEYFRAMES[5].pos = [point.x + 3, point.y + 0.5, point.z + distance];
    KEYFRAMES[6].pos = [point.x + 0.5, point.y + 0.8, point.z + distance + 0.5];
  }

  /**
   * Aim the opening beats at the hero life so the single line is
   * actually in frame: hero (line right of the text), life (tracking),
   * fork (head-on), past (down toward the stolen branch).
   */
  function aimStory(hero) {
    const fork = hero.forkPos;
    const mid = hero.livedPath[Math.floor(hero.livedPath.length / 2)];
    const stolenEnd = hero.stolenPath[hero.stolenPath.length - 1];

    KEYFRAMES[0].pos = [fork.x - 1.2, fork.y + 0.5, fork.z + 6.8];
    KEYFRAMES[0].look = [fork.x - 1.6, fork.y, fork.z];

    KEYFRAMES[1].pos = [mid.x + 2.2, mid.y + 0.4, mid.z + 5.2];
    KEYFRAMES[1].look = [mid.x + 1.0, mid.y, mid.z];

    KEYFRAMES[2].pos = [fork.x + 0.4, fork.y + 0.2, fork.z + 4.6];
    KEYFRAMES[2].look = [fork.x + 0.9, fork.y, fork.z];

    KEYFRAMES[3].pos = [stolenEnd.x - 2.2, stolenEnd.y - 1.0, stolenEnd.z + 6.0];
    KEYFRAMES[3].look = [stolenEnd.x - 0.8, stolenEnd.y - 0.2, stolenEnd.z];
  }

  return { update, focusOn, aimStory };
}
