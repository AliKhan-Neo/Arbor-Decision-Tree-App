// Customisation — floating pill + panel below QA/QC (top-left of canvas).
//
// Two concerns:
//   1. Per-node colour overrides — fill + line, stored on `node.style`.
//      These are user data: they travel inside the tree JSON and export
//      with it. Defaults stay theme-driven (CSS vars); an override wins
//      until reset.
//   2. Global connector style — tree.meta.connectorStyle:
//      'bezier' (curved, default) | 'elbow' (right-angle step, no curves).

const TPL = `
  <div class="custom-pill" role="button" tabindex="0" aria-expanded="false">
    <span class="custom-glyph">◧</span>
    <span class="custom-label">Customise</span>
  </div>
  <div class="custom-panel" hidden></div>
`;

export function createCustomisation(canvasWrap, opts = {}) {
  const onChange = opts.onChange || (() => {});
  const getNodeById = opts.getNodeById || (() => null);
  let tree = null;
  let selectedId = null;
  let expanded = false;

  const root = document.createElement('div');
  root.className = 'custom-root';
  root.innerHTML = TPL;
  canvasWrap.appendChild(root);
  const pill = root.querySelector('.custom-pill');
  const panel = root.querySelector('.custom-panel');

  pill.addEventListener('click', toggle);
  pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  document.addEventListener('mousedown', e => {
    if (expanded && !root.contains(e.target)) collapse();
  });

  function toggle() { expanded ? collapse() : expand(); }
  function expand() {
    expanded = true;
    panel.hidden = false;
    pill.setAttribute('aria-expanded', 'true');
    render();
  }
  function collapse() {
    expanded = false;
    panel.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
  }

  function setTree(t) { tree = t; if (expanded) render(); }
  function setSelection(id) {
    if (id === selectedId) return;
    selectedId = id;
    if (expanded) render();
  }

  function effective(node, key, cssVar) {
    if (node?.style?.[key]) return node.style[key];
    return cssToHex(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
  }

  function render() {
    if (!tree) { panel.innerHTML = ''; return; }
    const connStyle = tree.meta?.connectorStyle || 'bezier';
    const node = selectedId ? getNodeById(selectedId) : null;
    panel.innerHTML = `
      <div class="cz-section">Connectors</div>
      <div class="seg cz-seg">
        <button type="button" data-conn="bezier" class="${connStyle === 'bezier' ? 'on' : ''}">Curved</button>
        <button type="button" data-conn="elbow"  class="${connStyle === 'elbow'  ? 'on' : ''}">Angled</button>
      </div>
      <div class="cz-section">Node colours</div>
      ${node ? `
        <div class="cz-row">
          <label class="cz-label">Fill</label>
          <input type="color" class="cz-color" data-czkey="fill" value="${effective(node, 'fill', '--node-fill')}">
        </div>
        <div class="cz-row">
          <label class="cz-label">Line</label>
          <input type="color" class="cz-color" data-czkey="stroke" value="${effective(node, 'stroke', '--node-stroke')}">
        </div>
        <button class="cz-btn" type="button" data-czact="apply-type">Apply to all ${node.type} nodes</button>
        <button class="cz-link" type="button" data-czact="reset-node">Reset this node</button>
      ` : `<div class="cz-hint">Select a node to change its colours.</div>`}
      <button class="cz-link" type="button" data-czact="reset-all">Reset all custom colours</button>
    `;
    wire(node);
  }

  function wire(node) {
    panel.querySelectorAll('[data-conn]').forEach(btn => {
      btn.addEventListener('click', () => {
        tree.meta.connectorStyle = btn.dataset.conn;
        render();
        onChange({ kind: 'connectorStyle', structural: true });
      });
    });
    panel.querySelectorAll('.cz-color').forEach(inp => {
      inp.addEventListener('input', () => {
        if (!node) return;
        node.style = { ...(node.style || {}), [inp.dataset.czkey]: inp.value };
        onChange({ kind: 'nodeStyle' });
      });
    });
    panel.querySelector('[data-czact="apply-type"]')?.addEventListener('click', () => {
      if (!node) return;
      for (const n of tree.nodes) {
        if (n.type === node.type) n.style = { ...(node.style || {}) };
      }
      onChange({ kind: 'nodeStyleBulk', structural: true });
    });
    panel.querySelector('[data-czact="reset-node"]')?.addEventListener('click', () => {
      if (!node) return;
      delete node.style;
      render();
      onChange({ kind: 'nodeStyle', structural: true });
    });
    panel.querySelector('[data-czact="reset-all"]')?.addEventListener('click', () => {
      for (const n of tree.nodes) delete n.style;
      render();
      onChange({ kind: 'nodeStyleBulk', structural: true });
    });
  }

  return { setTree, setSelection, refresh: render };
}

// Normalise any CSS colour (hex / rgb / rgba var value) to #rrggbb for
// <input type="color">, which accepts nothing else.
let _cvt = null;
function cssToHex(color) {
  color = (color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (!_cvt) _cvt = document.createElement('canvas').getContext('2d');
  _cvt.fillStyle = '#000000';
  _cvt.fillStyle = color;
  const v = _cvt.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#888888';
  const h = n => parseInt(n, 10).toString(16).padStart(2, '0');
  return '#' + h(m[1]) + h(m[2]) + h(m[3]);
}
