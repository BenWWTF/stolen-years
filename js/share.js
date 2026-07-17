/**
 * Share stage. After an ignition the phone mockup shows the donor's
 * clip: the real recorded video when the browser supports it, or a
 * styled still as fallback. The share link points at this page with
 * ?light=<id>, so the recipient lands on the donor's actual light.
 */
export function setupShare() {
  const phoneScreen = document.getElementById("phoneScreen");
  const phoneCaption = document.getElementById("phoneCaption");
  const downloadBtn = document.getElementById("downloadClip");
  const copyLinkBtn = document.getElementById("copyLink");
  const shareMeta = document.getElementById("shareMeta");

  let lastDonation = null;
  let clip = null; // {blob, url, ext} once the recording is ready
  let shareUrl = null;

  downloadBtn.addEventListener("click", () => {
    if (!lastDonation) return;
    let href, filename;
    if (clip) {
      href = clip.url;
      filename = `stolen-years-${slug(lastDonation.name)}.${clip.ext}`;
    } else {
      const svg = buildShareSvg(lastDonation);
      href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      filename = `stolen-years-${slug(lastDonation.name)}.svg`;
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (!clip) setTimeout(() => URL.revokeObjectURL(href), 1000);
  });

  copyLinkBtn.addEventListener("click", async () => {
    const url = shareUrl || `${location.origin}${location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
      shareMeta.textContent = "Link copied.";
    } catch {
      shareMeta.textContent = url;
    }
  });

  function renderShare(life, donation, { pendingClip = false } = {}) {
    lastDonation = donation;
    clip = null;
    document.getElementById("shareStage").classList.remove("is-empty");
    document.getElementById("shareEmpty").hidden = true;

    const who = donation.anonymous ? "An unnamed light" : donation.name;
    const detail =
      donation.kind === "action"
        ? `by ${escapeHtml(donation.action)}`
        : `€${donation.amount} for better ideas`;
    const dedication = donation.dedicate
      ? `<p class="share-render__dedication">for ${escapeHtml(donation.dedicate)}</p>`
      : "";

    phoneScreen.innerHTML = `
      <div class="share-render">
        <div class="share-render__brand">@weandmecfs · The Stolen Years</div>
        <h3 class="share-render__title">I ignited a <em>future</em>.</h3>
        <p class="share-render__name">${escapeHtml(who)} · ${detail}</p>
        ${dedication}
        <div class="share-render__cta">Ignite yours · weandmecfs.org</div>
      </div>
    `;
    phoneCaption.textContent = donation.anonymous
      ? "@weandmecfs"
      : `@weandmecfs · via ${donation.name}`;

    downloadBtn.disabled = pendingClip;
    copyLinkBtn.disabled = false;
    shareMeta.textContent = pendingClip
      ? "Rendering your ten-second clip…"
      : "Your clip is ready to download.";
  }

  function setClip(result) {
    if (!result) {
      // Recording failed — fall back to the SVG still
      downloadBtn.disabled = false;
      shareMeta.textContent = "Your clip is ready to download.";
      return;
    }
    clip = result;
    phoneScreen.innerHTML = `<video class="share-video" src="${result.url}" autoplay muted loop playsinline></video>`;
    downloadBtn.disabled = false;
    shareMeta.textContent = "Your clip is ready.";
  }

  function setShareUrl(url) {
    if (url) shareUrl = url;
  }

  return { renderShare, setClip, setShareUrl };
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 32) || "friend"
  );
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
  const who = donation.anonymous ? "An unnamed light" : donation.name;
  const detail =
    donation.kind === "action"
      ? `by ${donation.action}`
      : `€${donation.amount} for better ideas`;
  const dedication = donation.dedicate ? `for ${donation.dedicate}` : "";
  const accent = donation.kind === "action" ? "#c5e866" : "#bcdcff";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#0c1224"/>
      <stop offset="100%" stop-color="#02020a"/>
    </radialGradient>
    <linearGradient id="line" x1="0" x2="1" y1="1" y2="0">
      <stop offset="0%" stop-color="#2d6be4"/>
      <stop offset="100%" stop-color="${accent}"/>
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
  <text x="40" y="80" fill="#9d9890" font-family="Inter, sans-serif" font-size="13" letter-spacing="3">@WEANDMECFS · THE STOLEN YEARS</text>
  <text x="40" y="${h * 0.78}" fill="#f4f2ed" font-family="Inter, sans-serif" font-size="40" font-weight="500">I ignited a <tspan fill="${accent}" font-style="italic">future</tspan>.</text>
  <text x="40" y="${h * 0.83}" fill="${accent}" font-family="Inter, sans-serif" font-size="17">${escapeHtml(who)} · ${escapeHtml(detail)}</text>
  ${
    dedication
      ? `<text x="40" y="${h * 0.87}" fill="#d4b896" font-family="Inter, sans-serif" font-style="italic" font-size="19">${escapeHtml(dedication)}</text>`
      : ""
  }
  <text x="40" y="${h - 60}" fill="#f4f2ed" font-family="Inter, sans-serif" font-size="13" letter-spacing="3">IGNITE YOURS · WEANDMECFS.ORG</text>
</svg>`;
}
