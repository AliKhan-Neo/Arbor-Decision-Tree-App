// 4-phase pathway exploration animation.
//
// Phases:
//   1. Sweep       — a vertical beam crosses the tree left-to-right.
//   2. Exploration — streams each iteration's best path through the tree.
//                    A short ghost-trail of the last N paths fades out so the
//                    eye sees the search bouncing across alternatives.
//   3. Convergence — collapses onto the overall optimal best-EV path.
//   4. Reveal      — dashboard slides in (caller's responsibility).
//
// The animation runs in parallel with the Monte Carlo loop on the main
// thread. Exploration consumes from a live path stream so the eye-candy
// reflects what the simulator is actually computing.

const TRAIL_LEN = 6;          // recent-path ghost trail length
const FRAME_PATH_MS = 60;     // how long each new path lingers before fading

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

  // Run all phases.
  // opts:
  //   getPathStream() -> array of path-id arrays accumulated so far
  //   getBestPath()   -> final optimal path-id array (must be available before phase 3)
  //   getNodeById(id) -> node lookup
  //   awaitSimulation -> Promise that resolves when MC finishes
  async function play(opts) {
    resize();
    if (!mainCanvasCtl.getTree()) return;

    // Phase 1
    setLabel('Exploring possibilities');
    await sweep(ctx, canvasWrap.getBoundingClientRect());

    // Phase 2 — runs until simulation finishes
    await explore(ctx, canvasWrap.getBoundingClientRect(), opts.getPathStream,
                  opts.getNodeById, mainCanvasCtl, opts.awaitSimulation);

    // Phase 3
    setLabel('Converging on optimal path');
    await converge(ctx, canvasWrap.getBoundingClientRect(),
                   opts.getBestPath(), opts.getNodeById, mainCanvasCtl);

    setLabel('');
    clearOverlay();
  }

  return { play, clear: clearOverlay, resize };
}

async function sweep(ctx, rect) {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim();
  const duration = 480;
  const t0 = performance.now();
  await new Promise(resolve => {
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const x = p * rect.width;
      const grad = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, accent);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x - 80, 0, 160, rect.height);
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  ctx.clearRect(0, 0, rect.width, rect.height);
}

// Streaming exploration. Each tick draws a small trail of recent best-paths:
// the most recent is brightest, older ones fade out. Continues until
// `awaitSimulation` resolves (then exits cleanly).
async function explore(ctx, rect, getPathStream, getNodeById, ctl, awaitSimulation) {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim();
  const hero   = cs.getPropertyValue('--hero').trim();

  let done = false;
  awaitSimulation.then(() => { done = true; });

  let nextCursor = 0;
  const trail = [];

  await new Promise(resolve => {
    function frame() {
      const stream = getPathStream();
      // Pull all newly available paths into the trail, but step at ~1 per frame
      // so the animation actually shows distinct iterations rather than
      // a blur. Cap the trail length so the screen doesn't get too busy.
      const availableNew = Math.min(2, stream.length - nextCursor);
      for (let k = 0; k < availableNew; k++) {
        trail.push(stream[nextCursor++]);
        if (trail.length > TRAIL_LEN) trail.shift();
      }

      ctx.clearRect(0, 0, rect.width, rect.height);
      // Draw oldest first so newest sits on top.
      for (let i = 0; i < trail.length; i++) {
        const age = trail.length - 1 - i;              // 0 = newest
        const alpha = 0.10 + 0.55 * (1 - age / TRAIL_LEN);
        const isNewest = age === 0;
        ctx.strokeStyle = isNewest ? hero : accent;
        ctx.lineWidth   = isNewest ? 2.4 : 1.4;
        ctx.globalAlpha = alpha;
        drawPath(ctx, trail[i], ctl, getNodeById);
      }
      ctx.globalAlpha = 1;

      if (done && nextCursor >= stream.length) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

async function converge(ctx, rect, bestPath, getNodeById, ctl) {
  const cs = getComputedStyle(document.documentElement);
  const hero = cs.getPropertyValue('--hero').trim();
  const duration = 700;
  const t0 = performance.now();

  await new Promise(resolve => {
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = hero;
      ctx.lineWidth = 2 + 2.5 * p;
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
  const elbow = ctl.getTree()?.meta?.connectorStyle === 'elbow';
  ctx.beginPath();
  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = getNodeById(pathIds[i]);
    const b = getNodeById(pathIds[i + 1]);
    if (!a || !b) continue;
    const sa = ctl.w2s(a.x, a.y);
    const sb = ctl.w2s(b.x, b.y);
    const midX = (sa.x + sb.x) / 2;
    if (i === 0) ctx.moveTo(sa.x, sa.y);
    if (elbow) {
      ctx.lineTo(midX, sa.y);
      ctx.lineTo(midX, sb.y);
      ctx.lineTo(sb.x, sb.y);
    } else {
      ctx.bezierCurveTo(midX, sa.y, midX, sb.y, sb.x, sb.y);
    }
  }
  ctx.stroke();
}
