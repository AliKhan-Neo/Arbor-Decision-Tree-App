// Floating settings box — top-right of the canvas.
//
// Two editable fields wired to tree.meta:
//   - Seed       (integer)
//   - Iterations (integer, clamped to [100, 100000])
// Changes propagate via the onChange callback so main.js persists + reflects
// in the header stats.

const TPL = `
  <div class="settings-box">
    <div class="settings-label">Simulation</div>
    <div class="settings-row">
      <label class="settings-field-label" for="settings-seed">Seed</label>
      <input class="settings-input" id="settings-seed" type="number" step="1" min="0">
    </div>
    <div class="settings-row">
      <label class="settings-field-label" for="settings-iter">Iterations</label>
      <input class="settings-input" id="settings-iter" type="number" step="1000" min="100" max="100000">
    </div>
  </div>
`;

export function createSettingsBox(canvasWrap, opts = {}) {
  const onChange = opts.onChange || (() => {});
  let tree = null;

  const root = document.createElement('div');
  root.className = 'settings-root';
  root.innerHTML = TPL;
  canvasWrap.appendChild(root);

  const seedInp = root.querySelector('#settings-seed');
  const iterInp = root.querySelector('#settings-iter');

  seedInp.addEventListener('input', () => {
    if (!tree) return;
    const v = parseInt(seedInp.value, 10);
    if (Number.isFinite(v) && v >= 0) {
      tree.meta.seed = v;
      onChange({ kind: 'seed', value: v });
    }
  });

  iterInp.addEventListener('input', () => {
    if (!tree) return;
    const v = parseInt(iterInp.value, 10);
    if (Number.isFinite(v) && v >= 100 && v <= 100000) {
      tree.meta.iterations = v;
      onChange({ kind: 'iterations', value: v });
    }
  });

  function setTree(t) {
    tree = t;
    if (!t) return;
    seedInp.value = String(t.meta?.seed ?? 42);
    iterInp.value = String(t.meta?.iterations ?? 10000);
  }

  return { setTree };
}
