// Pro modal — gates the Phase-1 Pro-locked features (PDF/SVG/Excel export,
// >3 saved analyses). Wire-up uses a single global overlay; descriptions are
// keyed by feature.

const FEATURES = {
  pdf: {
    title: 'Unlock <em>pixel-perfect</em><br>PDF export.',
    desc: 'Generate print-ready PDFs of your decision tree, sized for IC memos and board presentations.'
  },
  svg: {
    title: 'Unlock <em>vector</em><br>SVG export.',
    desc: 'Edit your tree downstream in Figma, Illustrator, or PowerPoint at any scale without quality loss.'
  },
  excel: {
    title: 'Unlock <em>audit-ready</em><br>Excel export.',
    desc: 'A six-sheet workbook: cover, structure, raw iterations, rollback trace, results, and visual tree.'
  },
  save: {
    title: 'Save <em>more</em> analyses<br>in the cloud.',
    desc: 'Free accounts keep up to three trees. Upgrade to keep unlimited decision trees and MACC models, synced across devices.'
  }
};

const COMMON_FEATURES = [
  'Distribution modes on every input',
  'Seeded Monte Carlo (10,000 iterations)',
  '2-variable joint sensitivity heatmap',
  'Six-sheet audit-ready Excel export',
  'Cloud-saved analyses with auto-sync',
  'Priority support'
];

const TPL = `
  <div class="modal-overlay" id="pro-modal" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-eyebrow">Arbor Pro</div>
      <div class="modal-title" id="pro-modal-title"></div>
      <div class="modal-desc" id="pro-modal-desc"></div>
      <ul class="modal-features">
        ${COMMON_FEATURES.map(f => `<li>${f}</li>`).join('')}
      </ul>
      <button class="btn btn-primary" id="pro-modal-cta" style="width:100%; height:46px;">Join the waitlist</button>
      <button class="modal-dismiss" id="pro-modal-dismiss">No thanks, continue with Free</button>
    </div>
  </div>
`;

export function createProModal() {
  const wrap = document.createElement('div');
  wrap.innerHTML = TPL;
  document.body.appendChild(wrap.firstElementChild);
  const overlay = document.getElementById('pro-modal');
  const title = document.getElementById('pro-modal-title');
  const desc  = document.getElementById('pro-modal-desc');

  document.getElementById('pro-modal-cta').addEventListener('click', () => {
    alert('Arbor Pro is launching soon — hello@arbor.finance');
    hide();
  });
  document.getElementById('pro-modal-dismiss').addEventListener('click', hide);
  overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  function show(feature) {
    const f = FEATURES[feature] || FEATURES.pdf;
    title.innerHTML = f.title;
    desc.textContent = f.desc;
    overlay.classList.add('show');
  }
  function hide() { overlay.classList.remove('show'); }

  return { show, hide };
}
