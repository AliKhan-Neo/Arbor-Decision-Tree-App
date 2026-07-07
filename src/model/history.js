// Undo/redo history — JSON snapshot stack.
//
// The tree is plain JSON-safe data and small (a few KB even for large trees),
// so whole-state snapshots are simpler and more robust than command inversion.
// `push` after every mutation; callers debounce rapid edits (typing, drags)
// so a burst coalesces into one undo step.

export function createHistory(capacity = 60) {
  let past = [];      // snapshots preceding `current`, oldest first
  let future = [];    // snapshots undone from, most recent last
  let current = null; // snapshot of the live state

  const snap = tree => JSON.stringify(tree);

  function init(tree) {
    past = [];
    future = [];
    current = snap(tree);
  }

  function push(tree) {
    const s = snap(tree);
    if (s === current) return;
    past.push(current);
    if (past.length > capacity) past.shift();
    current = s;
    future = [];
  }

  function undo() {
    if (!past.length) return null;
    future.push(current);
    current = past.pop();
    return JSON.parse(current);
  }

  function redo() {
    if (!future.length) return null;
    past.push(current);
    current = future.pop();
    return JSON.parse(current);
  }

  return {
    init, push, undo, redo,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0
  };
}
