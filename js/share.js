/**
 * Share clip rendering.
 *
 * When a donation lands, we populate the phone screen with a stylized
 * "Instagram story" preview. The prototype renders this as DOM/CSS;
 * a Phase 2 build would rasterize the actual WebGL frame of the
 * ignited branch.
 */
export function setupShare() {
  const phoneScreen = document.getElementById("phoneScreen");
  const phoneCaption = document.getElementById("phoneCaption");
  const downloadBtn = document.getElementById("downloadClip");
  const copyLinkBtn = document.getElementById("copyLink");
  const shareMeta = document.getElementById("shareMeta");

  downloadBtn.addEventListener("click", () => {
    if (!lastDonation) return;
    // For the prototype: trigger a download of a tiny SVG placeholder
    // so the team can verify the flow end-to-end.
    const svg = buildShareSvg(lastDonation);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stolen-years-${slug(lastDonation.name)}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  copyLinkBtn.addEventListener("click", async () => {
    if (!lastDonation) return;
    const url = `https://weandmecfs.org/ignited/${slug(lastDonation.name)}-${lastDonation.at}`;
    try {
      await navigator.clipboard.writeText(url);
      flashMeta(shareMeta, "Copied", ` ${url}`);
    } catch {
      flashMeta(shareMeta, "Copy", ` ${url}`);
    }
  });

  let lastDonation = null;

  return function renderShare(life, donation) {
    lastDonation = donation;
    const who = donation.anonymous ? "an unnamed light" : donation.name;
    const dedication = donation.dedicate
      ? `<p class="share-render__dedication">for ${escapeHtml(donation.dedicate)}</p>`
      : "";

    phoneScreen.innerHTML = `
      <div class="share-render">
        <div class="share-render__brand">@weandmecfs · The Stolen Years</div>
        <h3 class="share-render__title">I ignited a <em>future</em> branch.</h3>
        <p class="share-render__name">${escapeHtml(who)} · $${donation.amount}</p>
        ${dedication}
        <div class="share-render__cta">Donate · weandmecfs.org</div>
      </div>
    `;
    phoneCaption.textContent = donation.anonymous
      ? "@weandmecfs"
      : `@weandmecfs · via ${donation.name}`;

    downloadBtn.disabled = false;
    copyLinkBtn.disabled = false;
    flashMeta(
      shareMeta,
      "Status",
      " · share unit generated, ready to download"
    );
  };
}

function flashMeta(el, label, suffix) {
  el.innerHTML = `<span class="dim">${label}</span>${suffix}`;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "friend";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildShareSvg(donation) {
  const w = 540;
  const h = 960;
  const who = donation.anonymous ? "an unnamed light" : donation.name;
  const dedication = donation.dedicate
    ? `for ${escapeHtml(donation.dedicate)}`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#0e1322"/>
      <stop offset="100%" stop-color="#02020a"/>
    </radialGradient>
    <linearGradient id="line" x1="0" x2="1" y1="1" y2="0">
      <stop offset="0%" stop-color="#5ba3e0"/>
      <stop offset="100%" stop-color="#bcdcff"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <g filter="url(#glow)">
    <path d="M 60 ${h * 0.7} C ${w * 0.3} ${h * 0.4}, ${w * 0.4} ${h * 0.85}, ${w * 0.5} ${h * 0.55} S ${w * 0.85} ${h * 0.25}, ${w - 60} ${h * 0.45}" stroke="url(#line)" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
  <text x="40" y="80" fill="#a8a39a" font-family="monospace" font-size="14" letter-spacing="3">@weandmecfs · The Stolen Years</text>
  <text x="40" y="${h * 0.78}" fill="#f6f3ec" font-family="serif" font-size="42" font-style="italic">I ignited a <tspan fill="#c5e866">future</tspan> branch.</text>
  <text x="40" y="${h * 0.83}" fill="#bcdcff" font-family="monospace" font-size="18">${who} · $${donation.amount}</text>
  ${
    dedication
      ? `<text x="40" y="${h * 0.87}" fill="#d4b896" font-family="serif" font-style="italic" font-size="20">${dedication}</text>`
      : ""
  }
  <text x="40" y="${h - 60}" fill="#f6f3ec" font-family="monospace" font-size="14" letter-spacing="3">DONATE · WEANDMECFS.ORG</text>
</svg>`;
}
