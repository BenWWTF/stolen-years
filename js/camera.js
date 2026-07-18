/**
 * Scroll-driven camera. 9 keyframes, one per beat of the screenplay:
 *
 *   0  life      · intimate, a single luminous line, wide open
 *   1  fork      · head-on close, the split is the subject
 *   2  stolen    · low angle, the stolen branch drifting down
 *   3  past      · pulled back, the stolen branch out of reach
 *   4  branching · inside the stream, timelines filling the frame
 *   5  ideas     · calm mid-shot (the manifesto)
 *   6  ignite    · close on the hero life
 *   7  future    · following the freshly ignited branch
 *   8  topology  · the grand pull-back, thousands of lines
 */
import * as THREE from "three";
import { smoothstep } from "./util.js";

// Keyframe t values match section centers: i / (sections - 1)
const KEYFRAMES = [
  { t: 0.0,   pos: [0.0, 0.3, 7.0],   look: [0, 0, 0], roll: 0,     fov: 48 },
  { t: 0.125, pos: [0.0, 0.2, 4.6],   look: [0, 0, 0], roll: 0,     fov: 46 },
  { t: 0.25,  pos: [-2.4, -1.3, 7.5], look: [0, -0.4, 0], roll: -0.04, fov: 50 },
  { t: 0.375, pos: [-1.8, -0.6, 9.5], look: [0, -0.6, 0], roll: -0.02, fov: 50 },
  { t: 0.5,   pos: [0.0, 1.7, 13.5],  look: [0, 1.0, -2], roll: 0,  fov: 58 },
  { t: 0.625, pos: [0.0, 2.2, 16.0],  look: [0, 1.2, 0], roll: 0,   fov: 50 },
  { t: 0.75,  pos: [3.0, 0.5, 5.0],   look: [0, 0, 0], roll: 0.02,  fov: 42 },
  { t: 0.875, pos: [0.5, 0.8, 5.5],   look: [0, 0, 0], roll: 0,     fov: 44 },
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

  function update(progress, parallax = null) {
    const [a, b] = findKeyframes(progress);
    const segT = b.t === a.t ? 0 : (progress - a.t) / (b.t - a.t);
    const k = lerpKeyframe(a, b, segT);

    targetPos.set(k.pos[0], k.pos[1], k.pos[2]);
    targetLook.set(k.look[0], k.look[1], k.look[2]);

    if (parallax) {
      targetPos.x += parallax.x * 0.35;
      targetPos.y -= parallax.y * 0.22;
      targetLook.x += parallax.x * 0.12;
    }

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
   * Cinematic override: track a moving point directly, ignoring the
   * scroll keyframes. Shares the same lerp state as update(), so
   * handing control back and forth never snaps.
   */
  function follow(pos, look) {
    targetPos.copy(pos);
    targetLook.copy(look);
    camera.position.lerp(targetPos, 0.07);
    currentLook.lerp(targetLook, 0.09);
    camera.lookAt(currentLook);
  }

  /**
   * Re-aim the ignite + future beats at a specific world point
   * (the hero life the donor is about to light up).
   */
  function focusOn(point, distance = 5) {
    KEYFRAMES[6].look = [point.x, point.y, point.z];
    KEYFRAMES[7].look = [point.x, point.y, point.z];
    KEYFRAMES[6].pos = [point.x + 3, point.y + 0.5, point.z + distance];
    KEYFRAMES[7].pos = [point.x + 0.5, point.y + 0.8, point.z + distance + 0.5];
  }

  /**
   * Aim the opening beats at the hero life so the single line is
   * actually in frame: life (line right of the text), fork (head-on),
   * stolen (down toward the stolen branch), past (pulled back from it).
   *
   * `lift` shifts the camera down so the subject rides the upper part
   * of the frame — used in portrait, where the narrow horizontal FOV
   * would otherwise drop the line straight through the text.
   *
   * `xs` scales the horizontal offsets: a portrait frame is only about
   * a fifth as wide in world units, so desktop-tuned x offsets push
   * the subject out of frame entirely.
   */
  function aimStory(hero, lift = 0, xs = 1) {
    const fork = hero.forkPos;

    // The hero line is long and horizontal, so beat 0 keeps its full
    // offsets: shifting only changes which part of the line you see
    KEYFRAMES[0].pos = [fork.x - 1.0, fork.y + 0.6 - lift, fork.z + 7.0];
    KEYFRAMES[0].look = [fork.x - 2.9, fork.y + 0.55 - lift, fork.z];

    // Closer beats get proportionally less lift or the subject
    // leaves the frame entirely
    const l1 = lift * 0.3;
    KEYFRAMES[1].pos = [fork.x + 0.4 * xs, fork.y + 0.2 - l1, fork.z + 4.6];
    KEYFRAMES[1].look = [fork.x + 0.9 * xs, fork.y - l1, fork.z];

    const l2 = lift * 0.25;
    const stolenMid = hero.stolenPath[13];
    KEYFRAMES[2].pos = [stolenMid.x + 0.3 * xs, stolenMid.y + 0.4 - l2, stolenMid.z + 5.6];
    KEYFRAMES[2].look = [stolenMid.x + 1.0 * xs, stolenMid.y - 0.35 - l2, stolenMid.z];

    // Past: same subject, pulled back — the stolen branch out of reach
    const l3 = lift * 0.2;
    KEYFRAMES[3].pos = [stolenMid.x - 0.3 * xs, stolenMid.y + 0.8 - l3, stolenMid.z + 8.2];
    KEYFRAMES[3].look = [stolenMid.x + 1.1 * xs, stolenMid.y - 0.5 - l3, stolenMid.z];
  }

  return { update, follow, focusOn, aimStory };
}
