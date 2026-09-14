// Keep only routes visited in this tab, including query filters and public pages.
// Browser POP/REPLACE must update the same stack rather than adding phantom visits.
const entries = [];
const MAX = 50;

export function resetHistory() { entries.length = 0; }

export function recordRoute(path, key, navigationType = 'PUSH') {
  if (!path || !key) return;
  const existing = entries.findIndex(entry => entry.key === key);
  if (existing >= 0) {
    entries.splice(existing + 1);
    entries[existing] = { path, key };
    return;
  }
  if (navigationType === 'POP') resetHistory();
  if (navigationType === 'REPLACE') entries.pop();
  entries.push({ path, key });
  if (entries.length > MAX) entries.shift();
}

export function previousRoute() {
  return entries.length > 1 ? entries[entries.length - 2].path : null;
}
