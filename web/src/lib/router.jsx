import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setApiSeason } from './api.js';

// Minimal History-API router. URLs carry the season:
//   /              the front door with the season picker
//   /2025, /2024   a season's home page
//   /2024/race/5   any page, for that season
// Links without a year (/race/5, old shared links) open the 2025 season.
export const SEASONS = [2025, 2024];
export const DEFAULT_SEASON = 2025;
const STORE_KEY = 'lapbylap.season';

function parse(pathname) {
  const m = pathname.match(/^\/(\d{4})(\/.*)?$/);
  if (m && SEASONS.includes(Number(m[1]))) return { season: Number(m[1]), path: m[2] && m[2] !== '/' ? m[2].replace(/\/$/, '') : '/', landing: false };
  return { season: DEFAULT_SEASON, path: pathname, landing: pathname === '/' };
}

// The season someone picked last time, for the front door.
export function rememberedSeason() {
  try { return Number(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}
function remember(season) {
  try { localStorage.setItem(STORE_KEY, String(season)); } catch {}
}

// "/race/5" -> "/2024/race/5", "/#title" -> "/2024#title".
export function seasonHref(to, season) {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('/api/')) return to;
  if (/^\/\d{4}(\/|#|\?|$)/.test(to)) return to;
  if (to === '/' || to.startsWith('/#') || to.startsWith('/?')) return `/${season}${to.slice(1)}`;
  return `/${season}${to}`;
}

const RouterContext = createContext({ path: '/', season: DEFAULT_SEASON, query: new URLSearchParams(), navigate: () => {} });

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(() => ({ ...parse(location.pathname), search: location.search, hash: location.hash, n: 0 }));
  setApiSeason(loc.season);
  useEffect(() => {
    if (!loc.landing) remember(loc.season);
  }, [loc.season, loc.landing]);
  useEffect(() => {
    const onPop = () => setLoc((l) => ({ ...parse(location.pathname), search: location.search, hash: location.hash, n: l.n + 1 }));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to, { replace = false, raw = false } = {}) => {
    const url = new URL(raw ? to : seasonHref(to, parse(location.pathname).season), location.origin);
    if (url.pathname + url.search === location.pathname + location.search && !url.hash) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    setLoc((l) => ({ ...parse(url.pathname), search: url.search, hash: url.hash, n: l.n + 1 }));
  }, []);
  return (
    <RouterContext.Provider value={{ path: loc.path, season: loc.season, landing: loc.landing, hash: loc.hash, nav: loc.n, query: new URLSearchParams(loc.search), navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export const useRouter = () => useContext(RouterContext);

// raw: the link already says exactly where to go (the front door, another season).
export function Link({ to, children, onClick, raw = false, ...rest }) {
  const { navigate, season } = useRouter();
  return (
    <a
      href={raw ? to : seasonHref(to, season)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to, { raw });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
