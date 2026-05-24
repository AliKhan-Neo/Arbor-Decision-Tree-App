// Inspector + dashboard collapse / resize behaviour.
//
// Both panels:
//   - Have a "rail toggle" button that flips a `.collapsed` class on the
//     panel element. Width / height drops to a thin rail showing a vertical
//     (inspector) or horizontal (dashboard) label.
//   - Have a draggable edge handle. Dragging updates a CSS variable on
//     document.documentElement, which the grid template consumes.
//   - Persist their open size + collapsed state to localStorage so the
//     user's preference survives reload.

const KEY = {
  inspectorW:        'arbor:panel:inspector:w',
  inspectorClosed:   'arbor:panel:inspector:closed',
  dashboardH:        'arbor:panel:dashboard:h',
  dashboardClosed:   'arbor:panel:dashboard:closed'
};

const MIN_INSPECTOR_W = 240;
const MAX_INSPECTOR_W = 560;
const MIN_DASHBOARD_H = 160;
const MAX_DASHBOARD_H = 480;
const RAIL = 32;

export function initPanels(opts) {
  const onResize = opts?.onResize || (() => {});

  // Restore persisted sizes / collapsed flags.
  const wPx = parseInt(localStorage.getItem(KEY.inspectorW) || '', 10);
  if (Number.isFinite(wPx)) setInspectorW(wPx);
  const hPx = parseInt(localStorage.getItem(KEY.dashboardH) || '', 10);
  if (Number.isFinite(hPx)) setDashboardH(hPx);

  const inspectorEl = document.getElementById('inspector');
  const dashboardEl = document.getElementById('dashboard');

  if (localStorage.getItem(KEY.inspectorClosed) === '1') inspectorEl.classList.add('collapsed');
  if (localStorage.getItem(KEY.dashboardClosed) === '1') dashboardEl.classList.add('collapsed');

  document.documentElement.style.setProperty('--rail-size', RAIL + 'px');

  // ── Rail toggles ──────────────────────────────────────────────────────
  const inspectorToggle = document.getElementById('inspector-toggle');
  inspectorToggle.addEventListener('click', () => {
    inspectorEl.classList.toggle('collapsed');
    localStorage.setItem(KEY.inspectorClosed, inspectorEl.classList.contains('collapsed') ? '1' : '0');
    onResize();
  });

  const dashboardToggle = document.getElementById('dashboard-toggle');
  dashboardToggle.addEventListener('click', () => {
    dashboardEl.classList.toggle('collapsed');
    localStorage.setItem(KEY.dashboardClosed, dashboardEl.classList.contains('collapsed') ? '1' : '0');
    onResize();
  });

  // ── Drag handles ──────────────────────────────────────────────────────
  attachDrag(document.getElementById('inspector-handle'), 'h', (delta, startVal) => {
    const w = clamp(startVal - delta, MIN_INSPECTOR_W, MAX_INSPECTOR_W);
    setInspectorW(w);
    localStorage.setItem(KEY.inspectorW, String(w));
    onResize();
  }, () => readVarPx('--inspector-w'));

  attachDrag(document.getElementById('dashboard-handle'), 'v', (delta, startVal) => {
    const h = clamp(startVal - delta, MIN_DASHBOARD_H, MAX_DASHBOARD_H);
    setDashboardH(h);
    localStorage.setItem(KEY.dashboardH, String(h));
    onResize();
  }, () => readVarPx('--dashboard-h'));
}

function setInspectorW(px) {
  document.documentElement.style.setProperty('--inspector-w', px + 'px');
}
function setDashboardH(px) {
  document.documentElement.style.setProperty('--dashboard-h', px + 'px');
}

function readVarPx(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return parseInt(v, 10) || 0;
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// axis: 'h' = horizontal drag (track deltaX); 'v' = vertical (deltaY).
function attachDrag(handleEl, axis, onMove, getStartVal) {
  if (!handleEl) return;
  let startCoord = 0;
  let startVal = 0;
  let active = false;

  function onMouseMove(e) {
    if (!active) return;
    const delta = axis === 'h' ? (e.clientX - startCoord) : (e.clientY - startCoord);
    onMove(delta, startVal);
  }
  function onMouseUp() {
    if (!active) return;
    active = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  handleEl.addEventListener('mousedown', e => {
    e.preventDefault();
    active = true;
    startCoord = axis === 'h' ? e.clientX : e.clientY;
    startVal = getStartVal();
    document.body.style.cursor = axis === 'h' ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}
