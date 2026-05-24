// 4-phase pathway exploration animation.
//
// Phases (BRIEF §0):
//   1. Sweep       — a vertical beam crosses the tree from left to right.
//   2. Exploration — many translucent traces of sampled paths flash through.
//   3. Convergence — traces collapse onto the optimal (best-EV) path.
//   4. Reveal      — dashboard slides in (handled by caller via callback).
//
// The animation overlay is its own <canvas> on top of the main one.
// It does not affect the tree state; it only consumes positions from the
// canvas controller's world-to-screen transform.

export function createAnimation(canvasWrap, mainCanvasCtl) {
  const overlay = document.createElement('div');
  overlay.className = 'anim-overlay';
  overlay.innerHTML = `<canvas></canvas><div class="anim-stage-label"></div>`;
  canvasWrap.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  const label  = overlay.querySelector('.anim-stage-label');
  const ctx = canvas.getContext('2d');

  function resize() {
    const r = canvasWrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function clearOverlay() {
    const r = canvasWrap.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
  }

  function setLabel(text) {
    label.textContent = text;
    label.classList.toggle('show', !!text);
  }

  // Run the four phases. `getSampledPaths()` returns an array of arrays of
  // node-id sequences to draw during exploration (we use ~80 sampled paths).
  // `getBestPath()` returns the final optimal path node ids.
  async function play({ getSampledPaths, getBestPath, getNodeById }) {
    resize();
    const tree = mainCanvasCtl.getTree();
    if (!tree) return;

    // Phase 1: sweep
    setLabel('Exploring possibilities');
    await sweep(canvas, ctx, canvasWrap.getBoundingClientRect());

    // Phase 2: exploration
    const paths = getSampledPaths();
    await explore(canvas, ctx, canvasWrap.getBoundingClientRect(), paths, mainCanvasCtl, getNodeById);

    // Phase 3: convergence
    setLabel('Converging on optimal path');
    const best = getBestPath();
    await converge(canvas, ctx, canvasWrap.getBoundingClientRect(), best, mainCanvasCtl, getNodeById);

    // Phase 4: caller handles dashboard reveal
    setLabel('');
    clearOverlay();
  }

  return { play, clear: clearOverlay, resize };
}

async function sweep(canvas, ctx, rect) {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim();
  const duration = 600;
  const t0 = performance.now();
  await new Promise(resolve => {
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const x = p * rect.width;
      const grad = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, accent);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x - 60, 0, 120, rect.height);
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  ctx.clearRect(0, 0, rect.width, rect.height);
}

async function explore(canvas, ctx, rect, paths, ctl, getNodeById) {
  if (!paths || !paths.length) return;
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim();
  const duration = 1200;
  const t0 = performance.now();

  await new Promise(resolve => {
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const showCount = Math.min(paths.length, Math.floor(paths.length * p));
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < showCount; i++) {
        drawPath(ctx, paths[i], ctl, getNodeById);
      }
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

async function converge(canvas, ctx, rect, bestPath, ctl, getNodeById) {
  const cs = getComputedStyle(document.documentElement);
  const hero = cs.getPropertyValue('--hero').trim();
  const duration = 800;
  const t0 = performance.now();

  await new Promise(resolve => {
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = hero;
      ctx.lineWidth = 2 + 2 * p;
      ctx.globalAlpha = 0.4 + 0.6 * p;
      drawPath(ctx, bestPath, ctl, getNodeById);
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function drawPath(ctx, pathIds, ctl, getNodeById) {
  if (!pathIds || pathIds.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = getNodeById(pathIds[i]);
    const b = getNodeById(pathIds[i + 1]);
    if (!a || !b) continue;
    const sa = ctl.w2s(a.x, a.y);
    const sb = ctl.w2s(b.x, b.y);
    const midX = (sa.x + sb.x) / 2;
    if (i === 0) ctx.moveTo(sa.x, sa.y);
    ctx.bezierCurveTo(midX, sa.y, midX, sb.y, sb.x, sb.y);
  }
  ctx.stroke();
}
