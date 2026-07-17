/**
 * Ignite — the donation mechanic.
 *
 * On submit:
 *   1. Validate name + amount
 *   2. Pick a "victim" life to ignite (the hero life, or the next unignited one)
 *   3. Trigger the ignite animation in the galaxy
 *   4. Spawn a point of light that travels along the future branch
 *   5. Show a floating donor name tag in the scene
 *   6. Render the share clip preview
 *   7. Increment the counter, update the milestone bar
 *
 * No real money is moved. The "donation" is a simulation that the team
 * can wire to the real Stripe / donation platform in Phase 2.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SPHERE_GEOM = new THREE.SphereGeometry(0.06, 12, 12);

export function setupIgnite({ galaxy, scene, shareEl, onIgnite }) {
  const form = document.getElementById("igniteForm");
  const nameInput = document.getElementById("igniteName");
  const amountInput = document.getElementById("igniteAmount");
  const dedicateInput = document.getElementById("igniteDedicate");
  const anonInput = document.getElementById("igniteAnon");
  const amountChips = form.querySelectorAll(".chip");

  let selectedAmount = null;
  amountChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      amountChips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedAmount = parseInt(chip.dataset.amount, 10);
      amountInput.value = "";
    });
  });
  amountInput.addEventListener("input", () => {
    amountChips.forEach((c) => c.classList.remove("is-active"));
    selectedAmount = null;
  });

  // The current "traveling light" — moves along the future branch of the
  // currently-igniting life.
  const lightMat = new THREE.MeshBasicMaterial({
    color: 0xbcdcff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const travelingLight = new THREE.Mesh(SPHERE_GEOM, lightMat);
  travelingLight.visible = false;
  scene.add(travelingLight);

  // A larger faint halo around the traveling light
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x5ba3e0,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), haloMat);
  halo.visible = false;
  scene.add(halo);

  // A CSS2D donor tag that follows the light
  const tagEl = document.createElement("div");
  tagEl.className = "donor-tag";
  const css2dTag = new CSS2DObject(tagEl);
  css2dTag.visible = false;
  scene.add(css2dTag);

  let activeLife = null;
  let travelStart = 0;
  let lastDonation = null;
  let resolveTravel = null;

  // Expose the current time as a function so the click handler can use
  // the same clock as the animate loop.
  let _now = () => 0;
  function currentTime() {
    return _now();
  }

  function ignite(life, donation, now) {
    if (life.ignited) {
      // Already lit — pick the next un-ignited one
      const next = galaxy.lives.find((l) => !l.ignited);
      if (!next) return;
      return ignite(next, donation, now);
    }
    activeLife = life;
    travelStart = now;
    lastDonation = donation;
    galaxy.igniteLife(life, now);
    travelingLight.visible = true;
    halo.visible = true;
    css2dTag.visible = true;

    // Build the donor tag content
    const who = donation.anonymous ? "an unnamed light" : donation.name;
    tagEl.innerHTML = `
      <span>${escapeHtml(who)}</span>
      ${
        donation.dedicate
          ? `<span class="dedication">for ${escapeHtml(donation.dedicate)}</span>`
          : ""
      }
    `;

    // Wait for the travel to finish, then resolve
    if (resolveTravel) resolveTravel();
    return new Promise((resolve) => {
      resolveTravel = resolve;
    });
  }

  function update(now) {
    if (!activeLife) return;
    const T = 2.4; // seconds the light takes to traverse the future branch
    const t = (now - travelStart) / T;
    if (t >= 1) {
      travelingLight.visible = false;
      halo.visible = false;
      // Keep the tag visible a moment, then hide
      setTimeout(() => (css2dTag.visible = false), 1400);
      const finished = activeLife;
      const donation = lastDonation;
      activeLife = null;
      if (resolveTravel) {
        resolveTravel();
        resolveTravel = null;
      }
      // Notify the share stage
      if (onIgnite) onIgnite(finished, donation);
      return;
    }
    // Sample position along the future branch curve
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
    // Pulse halo
    const pulse = 1 + Math.sin(now * 6) * 0.18;
    halo.scale.setScalar(pulse);
    css2dTag.position.set(x, y + 0.25, z);

    // Fade in the light at the very start so it doesn't pop in
    const fadeIn = Math.min(1, t * 6);
    lightMat.opacity = 0.95 * fadeIn;
    haloMat.opacity = 0.32 * fadeIn;
  }

  // Form submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (nameInput.value || "").trim();
    const amount = parseInt(amountInput.value, 10) || selectedAmount || 0;
    const dedicate = (dedicateInput.value || "").trim();
    const anonymous = anonInput.checked;

    if (!name) {
      nameInput.focus();
      flash(nameInput);
      return;
    }
    if (!amount || amount < 1) {
      flash(amountInput);
      return;
    }

    const donation = { name, amount, dedicate, anonymous, at: Date.now() };

    // Pick a life to ignite. Prefer the hero life for the first donation;
    // then pick the next unignited life closest to the camera.
    const target = pickTarget(galaxy);

    // Smoothly scroll the camera to the ignite section if we aren't there
    const igniteEl = document.getElementById("ignite");
    igniteEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // Use the same time source the animate loop uses. `currentTime` is
    // set on the module from main.js.
    ignite(target, donation, currentTime());
  });

  return { ignite, update, setNow: (fn) => (_now = fn) };
}

function pickTarget(galaxy) {
  // First donation → hero life
  const ignited = galaxy.lives.filter((l) => l.ignited).length;
  if (ignited === 0) return galaxy.heroLife;
  // Otherwise, the next unignited life
  const next = galaxy.lives.find((l) => !l.ignited);
  return next || galaxy.heroLife;
}

function flash(el) {
  el.animate(
    [
      { boxShadow: "0 0 0 0 rgba(255,122,89,0.0)" },
      { boxShadow: "0 0 0 4px rgba(255,122,89,0.35)" },
      { boxShadow: "0 0 0 0 rgba(255,122,89,0.0)" },
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
