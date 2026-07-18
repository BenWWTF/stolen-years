/**
 * Ignite — the mechanic. Two ways to light a branch:
 *
 *   gift    · a donation in EUR — the light travels in futures blue
 *   action  · a non-monetary ignition (join a demo, visit a patient,
 *             tell one person) — the light travels in milestone lime
 *
 * Both are simulations in this prototype. Phase 2 wires the gift path
 * to the real donation webhook and the action path to a signup flow.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SPHERE_GEOM = new THREE.SphereGeometry(0.06, 12, 12);
const COL_GIFT = 0xbcdcff;
const COL_GIFT_HALO = 0x2d6be4;
const COL_ACT = 0xd9f37a;
const COL_ACT_HALO = 0xc5e866;

export function setupIgnite({ galaxy, scene, onIgnite, onIgniteStart }) {
  const form = document.getElementById("igniteForm");
  const nameInput = document.getElementById("igniteName");
  const amountInput = document.getElementById("igniteAmount");
  const dedicateInput = document.getElementById("igniteDedicate");
  const anonInput = document.getElementById("igniteAnon");
  const amountChips = form.querySelectorAll(".chip[data-amount]");
  const actionChips = form.querySelectorAll(".chip[data-action]");

  let selectedAmount = null;
  let selectedAction = null;

  amountChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      amountChips.forEach((c) => c.classList.remove("is-active"));
      actionChips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedAmount = parseInt(chip.dataset.amount, 10);
      selectedAction = null;
      amountInput.value = "";
    });
  });
  actionChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      actionChips.forEach((c) => c.classList.remove("is-active"));
      amountChips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedAction = chip.dataset.action;
      selectedAmount = null;
      amountInput.value = "";
    });
  });
  amountInput.addEventListener("input", () => {
    amountChips.forEach((c) => c.classList.remove("is-active"));
    actionChips.forEach((c) => c.classList.remove("is-active"));
    selectedAmount = null;
    selectedAction = null;
  });

  // Traveling light + halo
  const lightMat = new THREE.MeshBasicMaterial({
    color: COL_GIFT,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // Parented to the galaxy, not the scene: the galaxy rotates with
  // scroll, and path coordinates are galaxy-local — a scene-level
  // light drifts visibly off its branch
  const travelingLight = new THREE.Mesh(SPHERE_GEOM, lightMat);
  travelingLight.visible = false;
  galaxy.object.add(travelingLight);

  const haloMat = new THREE.MeshBasicMaterial({
    color: COL_GIFT_HALO,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), haloMat);
  halo.visible = false;
  galaxy.object.add(halo);

  // Donor tag that follows the light
  const tagEl = document.createElement("div");
  tagEl.className = "donor-tag";
  const css2dTag = new CSS2DObject(tagEl);
  css2dTag.visible = false;
  galaxy.object.add(css2dTag);

  let activeLife = null;
  let travelStart = 0;
  let lastDonation = null;

  let _now = () => 0;

  function ignite(life, donation, now) {
    if (life.ignited) {
      const next = galaxy.lives.find((l) => !l.ignited);
      if (!next) return;
      return ignite(next, donation, now);
    }
    activeLife = life;
    travelStart = now;
    lastDonation = donation;
    galaxy.igniteLife(life, now);
    if (onIgniteStart) onIgniteStart(life, donation);

    // Color the light by kind
    const isAct = donation.kind === "action";
    lightMat.color.setHex(isAct ? COL_ACT : COL_GIFT);
    haloMat.color.setHex(isAct ? COL_ACT_HALO : COL_GIFT_HALO);
    tagEl.classList.toggle("donor-tag--act", isAct);

    travelingLight.visible = true;
    halo.visible = true;
    css2dTag.visible = true;
    tagEl.classList.add("is-visible");

    const who = donation.anonymous ? "an unnamed light" : donation.name;
    const sub = isAct
      ? `<span class="dedication">${escapeHtml(donation.action)}</span>`
      : donation.dedicate
        ? `<span class="dedication">for ${escapeHtml(donation.dedicate)}</span>`
        : "";
    tagEl.innerHTML = `<span>${escapeHtml(who)}</span>${sub}`;
  }

  function update(now) {
    if (!activeLife) return;
    const T = 2.4; // seconds to traverse the future branch
    const t = (now - travelStart) / T;
    if (t >= 1) {
      travelingLight.visible = false;
      halo.visible = false;
      setTimeout(() => {
        css2dTag.visible = false;
        tagEl.classList.remove("is-visible");
      }, 1400);
      const finished = activeLife;
      const donation = lastDonation;
      activeLife = null;
      if (onIgnite) onIgnite(finished, donation);
      return;
    }
    const path = activeLife.futurePath;
    const fIdx = t * (path.length - 1);
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const frac = fIdx - i0;
    const a = path[i0];
    const b = path[i1];
    const x = a.x + (b.x - a.x) * frac;
    const y = a.y + (b.y - a.y) * frac;
    const z = a.z + (b.z - a.z) * frac;
    travelingLight.position.set(x, y, z);
    halo.position.set(x, y, z);
    const pulse = 1 + Math.sin(now * 6) * 0.18;
    halo.scale.setScalar(pulse);
    css2dTag.position.set(x, y + 0.25, z);

    const fadeIn = Math.min(1, t * 6);
    lightMat.opacity = 0.95 * fadeIn;
    haloMat.opacity = 0.32 * fadeIn;
  }

  /** Validate + read the form. Flashes the offending field on failure. */
  function readForm() {
    const name = (nameInput.value || "").trim();
    const amount = parseInt(amountInput.value, 10) || selectedAmount || 0;
    const dedicate = (dedicateInput.value || "").trim();
    const anonymous = anonInput.checked;

    if (!name) {
      flash(nameInput);
      return null;
    }
    if (!selectedAction && (!amount || amount < 1)) {
      flash(amountInput);
      return null;
    }

    return selectedAction
      ? { kind: "action", name, action: selectedAction, dedicate, anonymous, at: Date.now() }
      : { kind: "gift", name, amount, dedicate, anonymous, at: Date.now() };
  }

  function trySubmit() {
    const donation = readForm();
    if (!donation) return;
    const target = pickTarget(galaxy);
    ignite(target, donation, _now());
  }

  // Enter in a field still submits instantly — the accessible path
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    trySubmit();
  });

  // ------------------------------------------------------------
  // Hold-to-light. Breaking a timeline was a tap; lighting one
  // takes two seconds of not letting go. Release early and the
  // charge drains back.
  // ------------------------------------------------------------
  const submitBtn = document.getElementById("igniteSubmit");
  const holdHint = document.getElementById("holdHint");
  const HOLD_MS = 2000; // must match the .is-charging transition
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let holdTimer = null;

  submitBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (prefersReduced) {
      trySubmit();
      return;
    }
    if (!readForm()) return; // invalid — flash now, don't charge
    try {
      submitBtn.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    submitBtn.classList.add("is-charging");
    holdTimer = setTimeout(() => {
      holdTimer = null;
      submitBtn.classList.remove("is-charging");
      submitBtn.classList.add("is-lit");
      setTimeout(() => submitBtn.classList.remove("is-lit"), 700);
      trySubmit();
    }, HOLD_MS);
  });

  function cancelHold() {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = null;
    submitBtn.classList.remove("is-charging");
    holdHint.hidden = false; // teach the gesture after a too-short press
  }
  submitBtn.addEventListener("pointerup", cancelHold);
  submitBtn.addEventListener("pointercancel", cancelHold);

  // Keyboard users light instantly — a hold gesture has no keyboard analog
  submitBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trySubmit();
    }
  });

  // World-space position of the traveling light, for the camera to follow
  const _worldPos = new THREE.Vector3();
  function lightWorldPos() {
    if (!activeLife || !travelingLight.visible) return null;
    return travelingLight.getWorldPosition(_worldPos);
  }

  return { ignite, update, setNow: (fn) => (_now = fn), lightWorldPos };
}

function pickTarget(galaxy) {
  // The hero life first (pre-lit seeds are scenery, they don't count)
  if (!galaxy.heroLife.ignited) return galaxy.heroLife;
  const next = galaxy.lives.find((l) => !l.ignited);
  return next || galaxy.heroLife;
}

function flash(el) {
  el.animate(
    [
      { boxShadow: "0 0 0 0 rgba(45,107,228,0)" },
      { boxShadow: "0 0 0 4px rgba(45,107,228,0.4)" },
      { boxShadow: "0 0 0 0 rgba(45,107,228,0)" },
    ],
    { duration: 500, easing: "ease-out" }
  );
  el.focus();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
