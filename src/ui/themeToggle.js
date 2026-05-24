// Theme toggle (Warmed Ink ⇄ Editorial Light).
// Reads/writes data-theme on <html>; persists to localStorage; calls onChange
// so the canvas can refresh its palette and redraw.

import { saveTheme, loadTheme } from '../model/persistence.js';

const THEMES = ['warmed-ink', 'editorial-light'];
const GLYPHS = { 'warmed-ink': '☾', 'editorial-light': '☀' };
const LABELS = { 'warmed-ink': 'Editorial', 'editorial-light': 'Warmed Ink' };

export function initTheme() {
  const saved = loadTheme();
  const theme = THEMES.includes(saved) ? saved : 'warmed-ink';
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function mountThemeToggle(container, onChange) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost theme-toggle';
  btn.setAttribute('aria-label', 'Switch theme');
  container.appendChild(btn);

  function render() {
    const t = document.documentElement.dataset.theme || 'warmed-ink';
    btn.textContent = `${GLYPHS[t]}  ${LABELS[t]}`;
  }

  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'warmed-ink';
    const next = cur === 'warmed-ink' ? 'editorial-light' : 'warmed-ink';
    document.documentElement.dataset.theme = next;
    saveTheme(next);
    render();
    onChange && onChange(next);
  });

  render();
  return btn;
}
