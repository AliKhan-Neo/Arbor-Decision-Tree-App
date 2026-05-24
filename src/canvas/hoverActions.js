// Make.com-style "+" popover.
// When the user clicks the small "+" port on a Decision or Chance node, this
// module pops up a small menu offering the three node types to insert.

const POPOVER_HTML = `
  <div class="hp-popover" role="menu">
    <button type="button" data-type="decision" role="menuitem">
      <span class="hp-glyph">◆</span><span class="hp-label">Decision</span>
      <span class="hp-hint">A choice</span>
    </button>
    <button type="button" data-type="chance" role="menuitem">
      <span class="hp-glyph">◎</span><span class="hp-label">Chance</span>
      <span class="hp-hint">A random outcome</span>
    </button>
    <button type="button" data-type="terminal" role="menuitem">
      <span class="hp-glyph">●</span><span class="hp-label">Terminal</span>
      <span class="hp-hint">An end-state payoff</span>
    </button>
  </div>
`;

export function createHoverPopover(onPick) {
  const root = document.createElement('div');
  root.className = 'hp-root';
  root.innerHTML = POPOVER_HTML;
  root.style.display = 'none';
  document.body.appendChild(root);
  const popover = root.querySelector('.hp-popover');

  let activeContext = null;

  function show(screenX, screenY, context) {
    activeContext = context;
    root.style.display = 'block';
    // Position to the right of the click point, clamped to viewport.
    const rect = popover.getBoundingClientRect();
    const pad = 8;
    let x = screenX + 16;
    let y = screenY - rect.height / 2;
    if (x + rect.width > window.innerWidth - pad) x = screenX - rect.width - 16;
    if (y < pad) y = pad;
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    root.style.left = x + 'px';
    root.style.top  = y + 'px';
  }

  function hide() {
    root.style.display = 'none';
    activeContext = null;
  }

  popover.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !activeContext) return;
    const type = btn.dataset.type;
    onPick(type, activeContext);
    hide();
  });

  document.addEventListener('mousedown', e => {
    if (root.style.display === 'none') return;
    if (!root.contains(e.target)) hide();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
  });

  return { show, hide };
}
