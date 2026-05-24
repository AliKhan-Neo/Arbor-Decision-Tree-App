// QA/QC checker — floating badge top-left of the canvas.
//
// Re-runs `validate(tree)` whenever the tree changes. Renders a compact
// summary pill:
//   • Green tick when no issues.
//   • Amber dot + count when warnings only.
//   • Red dot + count when any errors.
// Clicking the pill expands a panel listing the issues, with each
// row clickable to focus the affected node on the canvas.

import { validate, validationStatus } from '../model/validation.js';

const TPL = `
  <div class="qa-pill" id="qa-pill" role="button" tabindex="0" aria-expanded="false">
    <span class="qa-glyph"></span>
    <span class="qa-label">QA/QC</span>
    <span class="qa-count"></span>
  </div>
  <div class="qa-panel" id="qa-panel" hidden></div>
`;

export function createQaChecker(canvasWrap, opts = {}) {
  const onFocusNode = opts.onFocusNode || (() => {});
  let tree = null;
  let issues = [];
  let expanded = false;

  const root = document.createElement('div');
  root.className = 'qa-root';
  root.innerHTML = TPL;
  canvasWrap.appendChild(root);

  const pill  = root.querySelector('#qa-pill');
  const panel = root.querySelector('#qa-panel');
  const glyph = pill.querySelector('.qa-glyph');
  const count = pill.querySelector('.qa-count');

  pill.addEventListener('click', toggle);
  pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });

  // Click outside to close.
  document.addEventListener('mousedown', e => {
    if (!expanded) return;
    if (!root.contains(e.target)) collapse();
  });

  function toggle() { expanded ? collapse() : expand(); }
  function expand() {
    if (issues.length === 0) return;       // nothing to expand
    expanded = true;
    panel.hidden = false;
    pill.setAttribute('aria-expanded', 'true');
  }
  function collapse() {
    expanded = false;
    panel.hidden = true;
    pill.setAttribute('aria-expanded', 'false');
  }

  function setTree(t) {
    tree = t;
    refresh();
  }

  function refresh() {
    if (!tree) return;
    issues = validate(tree);
    const status = validationStatus(issues);
    root.dataset.status = status;
    const errs  = issues.filter(i => i.severity === 'error').length;
    const warns = issues.filter(i => i.severity === 'warn').length;

    if (status === 'ok') {
      glyph.textContent = '✓';
      count.textContent = '';
    } else if (status === 'warnings') {
      glyph.textContent = '!';
      count.textContent = String(warns);
    } else {
      glyph.textContent = '×';
      count.textContent = String(errs + warns);
    }

    // Re-render the issue list.
    panel.innerHTML = issues.map((i, idx) => `
      <button class="qa-issue qa-issue-${i.severity}" type="button" data-idx="${idx}"
              ${i.nodeId ? `data-node="${i.nodeId}"` : ''}>
        <span class="qa-dot"></span>
        <span class="qa-msg">${escText(i.message)}</span>
      </button>
    `).join('');

    panel.querySelectorAll('button[data-node]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = btn.dataset.node;
        onFocusNode(nodeId);
        collapse();
      });
    });

    // If no issues remain, automatically collapse.
    if (issues.length === 0 && expanded) collapse();
  }

  return { setTree, refresh };
}

function escText(s) {
  return String(s ?? '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
}
