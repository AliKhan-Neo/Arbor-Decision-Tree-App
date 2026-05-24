// Tree persistence. localStorage only for v3 Phase 1; Phase 6 swaps in Supabase.

import { SCHEMA_VERSION } from './tree.js';

const KEY_TREE  = 'arbor:tree';
const KEY_THEME = 'arbor:theme';

export function saveTree(tree) {
  try {
    localStorage.setItem(KEY_TREE, JSON.stringify(tree));
    return true;
  } catch (e) {
    console.warn('arbor: failed to persist tree', e);
    return false;
  }
}

export function loadTree() {
  try {
    const raw = localStorage.getItem(KEY_TREE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return null;
    return parsed;
  } catch (e) {
    console.warn('arbor: failed to load tree', e);
    return null;
  }
}

export function clearTree() {
  try { localStorage.removeItem(KEY_TREE); } catch (_) {}
}

export function saveTheme(theme) {
  try { localStorage.setItem(KEY_THEME, theme); } catch (_) {}
}

export function loadTheme() {
  try { return localStorage.getItem(KEY_THEME); } catch (_) { return null; }
}
