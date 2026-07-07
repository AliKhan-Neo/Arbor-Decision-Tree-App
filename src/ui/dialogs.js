// Brand-styled confirm dialog + toast notifications.
// Replaces native window.confirm()/alert(), which clash with the app's
// visual language. Reuses the .modal-overlay/.modal styles from the Pro modal.

let overlay = null, titleEl = null, bodyEl = null, okBtn = null, cancelBtn = null;
let resolver = null;

function ensureDialog() {
  if (overlay) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal-overlay" id="confirm-dialog" role="dialog" aria-modal="true">
      <div class="modal dialog">
        <div class="modal-eyebrow">Arbor</div>
        <div class="modal-title" id="cd-title"></div>
        <div class="modal-desc" id="cd-body"></div>
        <div class="dialog-actions">
          <button class="btn" id="cd-cancel" type="button">Cancel</button>
          <button class="btn btn-primary" id="cd-ok" type="button">Confirm</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap.firstElementChild);
  overlay   = document.getElementById('confirm-dialog');
  titleEl   = document.getElementById('cd-title');
  bodyEl    = document.getElementById('cd-body');
  okBtn     = document.getElementById('cd-ok');
  cancelBtn = document.getElementById('cd-cancel');

  okBtn.addEventListener('click', () => settle(true));
  cancelBtn.addEventListener('click', () => settle(false));
  overlay.addEventListener('click', e => { if (e.target === overlay) settle(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) settle(false);
  });
}

function settle(value) {
  overlay.classList.remove('show');
  if (resolver) { resolver(value); resolver = null; }
}

export function confirmDialog({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  ensureDialog();
  titleEl.innerHTML = title;
  bodyEl.textContent = body || '';
  okBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  okBtn.classList.toggle('btn-danger', danger);
  okBtn.classList.toggle('btn-primary', !danger);
  overlay.classList.add('show');
  okBtn.focus();
  return new Promise(res => { resolver = res; });
}

let stack = null;

export function toast(message, { type = '', duration = 2800 } = {}) {
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, duration);
}
