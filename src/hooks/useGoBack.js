import { useNavigate } from 'react-router-dom';

// Shared in-app navigation stack (independent of browser history, which is
// unreliable when entering via tabs, deep links, or reloads).
const history = [];
const MAX = 50;

export function recordRoute(pathname) {
  if (!pathname) return;
  const last = history[history.length - 1];
  if (last !== pathname) {
    history.push(pathname);
    if (history.length > MAX) history.shift();
  }
}

export function resetHistory() {
  history.length = 0;
}

// Returns a goBack() that pops the in-app stack to the previous screen,
// falling back to `fallback` (default "/") when there's nowhere to go.
export default function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    if (history.length > 1) {
      history.pop();
      const prev = history[history.length - 1];
      navigate(prev);
    } else {
      navigate(fallback);
    }
  };
}