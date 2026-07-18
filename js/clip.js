/**
 * The real share clip. While a branch ignites, we composite the WebGL
 * canvas into a 9:16 vertical frame with the donor's name and record
 * ~9 seconds of it via MediaRecorder. The result is an actual video
 * file: the branch igniting, ready for a story.
 *
 * Falls back silently on browsers without MediaRecorder — share.js
 * then keeps its SVG still as the download.
 */
const W = 720;
const H = 1280;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    ["video/mp4;codecs=avc1", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, ext] of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export function makeClipRecorder(sourceCanvas) {
  const support = pickMime();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  let active = false;
  let donation = null;
  let startedAt = 0;
  let duration = 9;
  let recorder = null;
  let chunks = [];
  let resolveClip = null;

  function drawOverlay(elapsed) {
    // Bottom scrim so the text always reads
    const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
    grad.addColorStop(0, "rgba(4,4,7,0)");
    grad.addColorStop(1, "rgba(4,4,7,0.88)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const fadeIn = Math.min(1, Math.max(0, (elapsed - 0.8) / 0.9));
    ctx.globalAlpha = fadeIn;

    ctx.fillStyle = "#9d9890";
    ctx.font = "500 22px 'Inter', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("@WEANDMECFS · THE STOLEN YEARS", 48, 56);

    const isAct = donation.kind === "action";
    const accent = isAct ? "#c5e866" : "#bcdcff";
    const who = donation.anonymous ? "An unnamed light" : donation.name;
    const detail = isAct ? `by ${donation.action}` : `€${donation.amount} for better ideas`;

    let y = H - 320;
    ctx.fillStyle = "#f4f2ed";
    ctx.font = "500 64px 'Inter Tight', 'Inter', sans-serif";
    ctx.fillText("I lit a", 48, y);
    ctx.fillStyle = accent;
    ctx.font = "italic 500 64px 'Inter Tight', 'Inter', sans-serif";
    ctx.fillText("branch.", 48 + ctx.measureText("I lit a ").width - 14, y);

    y += 92;
    ctx.fillStyle = accent;
    ctx.font = "500 30px 'Inter', sans-serif";
    ctx.fillText(`${who} · ${detail}`, 48, y);

    if (donation.dedicate) {
      y += 52;
      ctx.fillStyle = "#d4b896";
      ctx.font = "italic 400 32px 'Inter Tight', 'Inter', sans-serif";
      ctx.fillText(`for ${donation.dedicate}`, 48, y);
    }

    ctx.fillStyle = "#f4f2ed";
    ctx.font = "600 22px 'Inter', sans-serif";
    ctx.fillText("LIGHT YOURS · WEANDMECFS.ORG", 48, H - 96);
    ctx.globalAlpha = 1;
  }

  return {
    supported: !!support,

    /** Start recording. Resolves with {blob, url, ext} when done. */
    start(don, seconds = 9) {
      if (!support || active) return Promise.resolve(null);
      donation = don;
      duration = seconds;
      startedAt = performance.now();
      chunks = [];
      active = true;

      const stream = canvas.captureStream(30);
      recorder = new MediaRecorder(stream, {
        mimeType: support.mime,
        videoBitsPerSecond: 5_000_000,
      });
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((resolve) => {
        resolveClip = resolve;
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: support.mime.split(";")[0] });
          resolve({ blob, url: URL.createObjectURL(blob), ext: support.ext });
        };
      });
      recorder.start(500);
      return done;
    },

    /** Called from the main animate loop, right after the scene renders. */
    captureFrame() {
      if (!active) return;
      const elapsed = (performance.now() - startedAt) / 1000;

      // Center-crop the source canvas to 9:16
      const sw = sourceCanvas.width;
      const sh = sourceCanvas.height;
      const targetRatio = W / H;
      let cw = sh * targetRatio;
      let chh = sh;
      if (cw > sw) {
        cw = sw;
        chh = sw / targetRatio;
      }
      const sx = (sw - cw) / 2;
      const sy = (sh - chh) / 2;
      ctx.fillStyle = "#060609";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(sourceCanvas, sx, sy, cw, chh, 0, 0, W, H);
      drawOverlay(elapsed);

      if (elapsed >= duration) {
        active = false;
        recorder.stop();
      }
    },
  };
}
