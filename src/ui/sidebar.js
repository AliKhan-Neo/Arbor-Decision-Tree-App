// Saved-analyses sidebar — left rail listing the user's analyses,
// Claude-chats style. Rendering + interaction only; all data operations
// route through callbacks so main.js owns state, persistence, and gating.

const KEY_CLOSED = 'arbor:panel:sidebar:closed';

export function createSidebar(el, opts = {}) {
  const onOpen      = opts.onOpen      || (() => {});
  const onNew       = opts.onNew       || (() => {});
  const onRename    = opts.onRename    || (() => {});
  const onDuplicate = opts.onDuplicate || (() => {});
  const onDelete    = opts.onDelete    || (() => {});
  const onToggle    = opts.onToggle    || (() => {});

  const listEl = el.querySelector('#sidebar-list');
  const toggle = el.querySelector('#sidebar-toggle');
  const newBtn = el.querySelector('#btn-analysis-new');

  if (localStorage.getItem(KEY_CLOSED) === '1') el.classList.add('collapsed');

  toggle.addEventListener('click', () => {
    el.classList.toggle('collapsed');
    localStorage.setItem(KEY_CLOSED, el.classList.contains('collapsed') ? '1' : '0');
    onToggle();
  });
  newBtn.addEventListener('click', onNew);

  let renamingId = null;

  function refresh(list, activeId) {
    if (renamingId) return;   // don't clobber an in-progress rename
    listEl.innerHTML = list.map(a => `
      <div class="sa-item ${a.id === activeId ? 'active' : ''}" data-id="${a.id}">
        <div class="sa-title">${esc(a.title)}</div>
        <div class="sa-meta">${a.nodeCount} nodes · ${a.simulated ? 'simulated · ' : ''}${relTime(a.updatedAt)}</div>
        <div class="sa-actions">
          <button class="sa-act" data-act="rename" title="Rename" aria-label="Rename analysis">✎</button>
          <button class="sa-act" data-act="duplicate" title="Duplicate" aria-label="Duplicate analysis">⧉</button>
          <button class="sa-act danger" data-act="delete" title="Delete" aria-label="Delete analysis">×</button>
        </div>
      </div>
    `).join('') || `<div class="sa-empty">No saved analyses yet.</div>`;

    listEl.querySelectorAll('.sa-item').forEach(item => {
      const id = item.dataset.id;
      item.addEventListener('click', e => {
        if (e.target.closest('.sa-act')) return;
        if (renamingId) return;
        onOpen(id);
      });
      item.querySelector('[data-act="rename"]').addEventListener('click', () => startRename(item, id));
      item.querySelector('[data-act="duplicate"]').addEventListener('click', () => onDuplicate(id));
      item.querySelector('[data-act="delete"]').addEventListener('click', () => onDelete(id));
    });
  }

  function startRename(item, id) {
    const titleEl = item.querySelector('.sa-title');
    const current = titleEl.textContent;
    renamingId = id;
    titleEl.innerHTML = `<input class="sa-title-input" type="text" value="${esc(current)}">`;
    const inp = titleEl.querySelector('input');
    inp.focus();
    inp.select();

    function commit() {
      const v = inp.value.trim();
      renamingId = null;
      if (v && v !== current) onRename(id, v);
      else refreshLast();
    }
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { renamingId = null; refreshLast(); }
      e.stopPropagation();   // keep Delete/arrows from hitting canvas shortcuts
    });
    inp.addEventListener('blur', commit);
  }

  // Re-render with the last data refresh() was given.
  let lastList = [], lastActive = null;
  const rawRefresh = refresh;
  function refreshLast() { rawRefresh(lastList, lastActive); }

  return {
    refresh(list, activeId) {
      lastList = list;
      lastActive = activeId;
      rawRefresh(list, activeId);
    }
  };
}

function relTime(ts) {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
