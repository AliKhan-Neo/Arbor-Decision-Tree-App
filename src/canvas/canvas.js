// Canvas controller. Owns pan/zoom/drag state and the draw loop.
// Talks to nodes.js / connectors.js for primitives, and emits events that
// main.js wires into the inspector and hoverActions.

import { drawNode, hitTest, hoverPlusPort, refreshPalette, palette } from './nodes.js';
import { drawConnector } from './connectors.js';
import { childrenOf, rootOf } from '../model/tree.js';

const HOVER_PLUS_RADIUS = 14;

export function createCanvasController(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  let tree = null;
  let selectedId = null;
  let hoveredId = null;
  let stickyHoverId = null;     // hover-popover target — persists past mouseleave
  let stickyHoverTimer = null;  // setTimeout handle that clears stickyHoverId
  let bestPathIds = new Set();
  let terminalEmvs = null;      // { [terminalId]: emv } after a simulation runs
  let pan = { x: 0, y: 0 };
  let zoom = 1;

  let dragging = null;   // 'pan' | 'node' | null
  let dragStart = { x: 0, y: 0 };
  let dragNode = null;
  let dragNodeOrig = null;
  let panOrig = null;

  const listeners = {
    select: [],
    hoverPlus: [],      // ({node, screenX, screenY}) when "+" is clicked
    move: [],           // ({node}) any drag
    background: []      // background click — clear selection
  };

  function on(evt, fn) { listeners[evt].push(fn); }
  function emit(evt, payload) { listeners[evt].forEach(fn => fn(payload)); }

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width  = Math.round(rect.width * dpr);
    canvasEl.height = Math.round(rect.height * dpr);
    canvasEl.style.width = rect.width + 'px';
    canvasEl.style.height = rect.height + 'px';
    draw();
  }
  window.addEventListener('resize', resize);

  // Fit the camera so the tree fills the canvas with comfortable padding.
  // Only runs when the canvas has a non-zero layout (skipped silently if the
  // browser hasn't completed layout yet — the caller can call again on rAF).
  function fitToContent() {
    if (!tree || !tree.nodes.length) return;
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xs = tree.nodes.map(n => n.x), ys = tree.nodes.map(n => n.y);
    const minX = Math.min(...xs) - 120, maxX = Math.max(...xs) + 220;
    const minY = Math.min(...ys) - 100, maxY = Math.max(...ys) + 100;
    const zx = rect.width  / (maxX - minX);
    const zy = rect.height / (maxY - minY);
    zoom = Math.min(1, Math.min(zx, zy) * 0.9);
    pan.x = (rect.width  - (maxX + minX) * zoom) / 2;
    pan.y = (rect.height - (maxY + minY) * zoom) / 2;
  }

  function w2s(x, y) { return { x: x * zoom + pan.x, y: y * zoom + pan.y }; }
  function s2w(sx, sy) { return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }; }

  // Zoom about the canvas centre (wheel zoom uses the cursor instead).
  function zoomBy(factor) {
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newZoom = Math.max(0.2, Math.min(3, zoom * factor));
    pan.x = cx - (cx - pan.x) * (newZoom / zoom);
    pan.y = cy - (cy - pan.y) * (newZoom / zoom);
    zoom = newZoom;
    draw();
  }

  function pickNode(wx, wy) {
    if (!tree) return null;
    // Iterate in reverse so visually-top nodes win.
    for (let i = tree.nodes.length - 1; i >= 0; i--) {
      if (hitTest(tree.nodes[i], wx, wy)) return tree.nodes[i];
    }
    return null;
  }

  function pickHoverPlus(wx, wy) {
    const targetId = stickyHoverId || hoveredId;
    if (!targetId || !tree) return null;
    const n = tree.nodes.find(n => n.id === targetId);
    if (!n || n.type === 'terminal') return null;
    const port = hoverPlusPort(n);
    const dx = wx - port.x, dy = wy - port.y;
    return (dx * dx + dy * dy <= HOVER_PLUS_RADIUS * HOVER_PLUS_RADIUS) ? n : null;
  }

  // Sticky-hover behaviour: once the "+" is showing for a node, keep it
  // showing for STICKY_MS after the cursor leaves the node, so the user has
  // time to move toward the "+" without it vanishing.
  const STICKY_MS = 800;
  function markStickyHover(nodeId) {
    stickyHoverId = nodeId;
    if (stickyHoverTimer) clearTimeout(stickyHoverTimer);
    stickyHoverTimer = null;
  }
  function startStickyClear() {
    if (stickyHoverTimer) clearTimeout(stickyHoverTimer);
    stickyHoverTimer = setTimeout(() => {
      stickyHoverId = null;
      stickyHoverTimer = null;
      draw();
    }, STICKY_MS);
  }
  function cancelStickyClear() {
    if (stickyHoverTimer) { clearTimeout(stickyHoverTimer); stickyHoverTimer = null; }
  }

  function mouseToCanvas(e) {
    const r = canvasEl.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  canvasEl.addEventListener('mousedown', e => {
    const { sx, sy } = mouseToCanvas(e);
    const w = s2w(sx, sy);

    // If a "+" hover hotspot is targeted, emit instead of dragging.
    const plusNode = pickHoverPlus(w.x, w.y);
    if (plusNode) {
      emit('hoverPlus', { node: plusNode, screenX: e.clientX, screenY: e.clientY });
      return;
    }

    const n = pickNode(w.x, w.y);
    if (n) {
      dragging = 'node';
      dragNode = n;
      dragNodeOrig = { x: n.x, y: n.y };
      dragStart = { x: e.clientX, y: e.clientY };
      selectedId = n.id;
      emit('select', { node: n });
      draw();
    } else {
      dragging = 'pan';
      dragStart = { x: e.clientX, y: e.clientY };
      panOrig = { x: pan.x, y: pan.y };
      selectedId = null;
      emit('background', {});
      draw();
    }
  });

  canvasEl.addEventListener('mousemove', e => {
    const { sx, sy } = mouseToCanvas(e);
    const w = s2w(sx, sy);
    if (dragging === 'node' && dragNode) {
      dragNode.x = dragNodeOrig.x + (e.clientX - dragStart.x) / zoom;
      dragNode.y = dragNodeOrig.y + (e.clientY - dragStart.y) / zoom;
      emit('move', { node: dragNode });
      draw();
    } else if (dragging === 'pan') {
      pan.x = panOrig.x + (e.clientX - dragStart.x);
      pan.y = panOrig.y + (e.clientY - dragStart.y);
      draw();
    } else {
      const prev = hoveredId;
      const n = pickNode(w.x, w.y);
      hoveredId = n ? n.id : null;

      // Sticky-hover bookkeeping. If cursor sits on a + or non-terminal node,
      // mark it sticky and cancel any pending clear. Otherwise start a delayed
      // clear so the + lingers long enough for the user to aim at it.
      const onPlus = pickHoverPlus(w.x, w.y);
      if (onPlus) {
        markStickyHover(onPlus.id);
      } else if (n && n.type !== 'terminal') {
        markStickyHover(n.id);
      } else if (stickyHoverId) {
        startStickyClear();
      }

      if (prev !== hoveredId || onPlus) draw();
    }
  });

  canvasEl.addEventListener('mouseup', () => { dragging = null; dragNode = null; });
  canvasEl.addEventListener('mouseleave', () => {
    dragging = null;
    dragNode = null;
    hoveredId = null;
    // Don't kill stickyHover instantly — let the timer expire so the user can
    // still reach the popover if it's open just outside the canvas.
    if (stickyHoverId) startStickyClear();
    draw();
  });

  canvasEl.addEventListener('wheel', e => {
    e.preventDefault();
    const { sx, sy } = mouseToCanvas(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const newZoom = Math.max(0.2, Math.min(3, zoom * factor));
    pan.x = sx - (sx - pan.x) * (newZoom / zoom);
    pan.y = sy - (sy - pan.y) * (newZoom / zoom);
    zoom = newZoom;
    draw();
  }, { passive: false });

  function draw() {
    const w = canvasEl.width, h = canvasEl.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const p = palette();
    const cs = getComputedStyle(document.documentElement);
    ctx.fillStyle = cs.getPropertyValue('--bg').trim();
    ctx.fillRect(0, 0, w, h);

    if (!tree || !tree.nodes.length) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Edges first.
    for (const child of tree.nodes) {
      if (!child.parentId) continue;
      const parent = tree.nodes.find(n => n.id === child.parentId);
      if (!parent) continue;
      const isBest = bestPathIds.has(parent.id) && bestPathIds.has(child.id);
      drawConnector(ctx, parent, child, {
        best: isBest,
        style: tree.meta?.connectorStyle || 'bezier'
      });
    }

    // Nodes on top.
    for (const n of tree.nodes) {
      drawNode(ctx, n, {
        selected: n.id === selectedId,
        best: bestPathIds.has(n.id),
        hover: n.id === hoveredId || n.id === stickyHoverId,
        emv: terminalEmvs ? terminalEmvs[n.id] : undefined,
        currency: tree.meta?.currency || '$'
      });
    }
  }

  // === Public API ========================================================
  return {
    setTree(t, opts = {}) {
      tree = t;
      if (opts.fit !== false) fitToContent();
      draw();
    },
    fitToContent,
    zoomBy,
    getTree() { return tree; },
    setSelection(id) { selectedId = id; draw(); },
    getSelectedId() { return selectedId; },
    setBestPath(ids) { bestPathIds = new Set(ids || []); draw(); },
    getBestPathIds() { return [...bestPathIds]; },
    setTerminalEmvs(map) { terminalEmvs = map || null; draw(); },
    clearTerminalEmvs() { terminalEmvs = null; draw(); },
    refreshTheme() { refreshPalette(); draw(); },
    autoLayout() {
      if (!tree) return;
      const root = rootOf(tree);
      if (!root) return;
      function layout(id, depth, yCursor) {
        const kids = childrenOf(tree, id);
        if (!kids.length) {
          return { yMin: yCursor, yMax: yCursor + 80, yCentre: yCursor + 40 };
        }
        let y = yCursor;
        const childCentres = [];
        for (const k of kids) {
          const res = layout(k.id, depth + 1, y);
          childCentres.push(res.yCentre);
          y = res.yMax + 30;
        }
        const node = tree.nodes.find(n => n.id === id);
        node.y = (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
        node.x = 120 + depth * 280;
        for (let i = 0; i < kids.length; i++) {
          kids[i].x = 120 + (depth + 1) * 280;
          kids[i].y = childCentres[i];
        }
        return { yMin: yCursor, yMax: y, yCentre: node.y };
      }
      layout(root.id, 0, 80);
      draw();
    },
    draw,
    resize,
    on,
    w2s,
    s2w
  };
}
