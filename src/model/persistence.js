// Tree persistence. localStorage only for v3 Phase 1; Phase 6 swaps in Supabase.
//
// Two layers:
//   - Active-tree cache (arbor:tree) — the tree currently on canvas.
//   - Analyses registry (arbor:analyses) — named, saved analyses shown in
//     the sidebar, Claude-chats style. Each entry stores the full tree plus
//     bookkeeping. Shape maps 1:1 onto the Phase 6 Supabase analyses table.

import { SCHEMA_VERSION } from './tree.js';

const KEY_TREE     = 'arbor:tree';
const KEY_THEME    = 'arbor:theme';
const KEY_ANALYSES = 'arbor:analyses';
const KEY_ACTIVE   = 'arbor:analysis:active';

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

// ── Analyses registry ─────────────────────────────────────────────────

function readRegistry() {
  try {
    const raw = localStorage.getItem(KEY_ANALYSES);
    const reg = raw ? JSON.parse(raw) : {};
    return (reg && typeof reg === 'object') ? reg : {};
  } catch (_) { return {}; }
}

function writeRegistry(reg) {
  try {
    localStorage.setItem(KEY_ANALYSES, JSON.stringify(reg));
    return true;
  } catch (e) {
    console.warn('arbor: failed to persist analyses registry', e);
    return false;
  }
}

export function newAnalysisId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Newest first. Entries carry list metadata only — load the tree via
// loadAnalysis when actually opening one.
export function listAnalyses() {
  return Object.values(readRegistry())
    .map(e => ({
      id: e.id,
      title: e.title || 'Untitled decision',
      updatedAt: e.updatedAt || 0,
      nodeCount: e.tree?.nodes?.length ?? 0,
      simulated: !!e.simulated
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadAnalysis(id) {
  const e = readRegistry()[id];
  if (!e?.tree || e.tree.schemaVersion !== SCHEMA_VERSION) return null;
  return JSON.parse(JSON.stringify(e.tree));
}

export function saveAnalysis(id, tree, extra = {}) {
  const reg = readRegistry();
  const prev = reg[id] || {};
  reg[id] = {
    ...prev,
    id,
    title: tree.meta?.title || 'Untitled decision',
    updatedAt: Date.now(),
    simulated: 'simulated' in extra ? !!extra.simulated : !!prev.simulated,
    tree: JSON.parse(JSON.stringify(tree))
  };
  return writeRegistry(reg);
}

export function deleteAnalysis(id) {
  const reg = readRegistry();
  delete reg[id];
  writeRegistry(reg);
}

export function getActiveAnalysisId() {
  try { return localStorage.getItem(KEY_ACTIVE); } catch (_) { return null; }
}

export function setActiveAnalysisId(id) {
  try { localStorage.setItem(KEY_ACTIVE, id); } catch (_) {}
}
