import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Minimal History-API router: /, /race/16, /driver/lando-norris, /compare, /lab.
const RouterContext = createContext({ path: '/', query: new URLSearchParams(), navigate: () => {} });

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search, hash: location.hash, n: 0 }));
  useEffect(() => {
    const onPop = () => setLoc((l) => ({ path: location.pathname, search: location.search, hash: location.hash, n: l.n + 1 }));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, location.origin);
    if (url.pathname + url.search === location.pathname + location.search && !url.hash) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    setLoc((l) => ({ path: url.pathname, search: url.search, hash: url.hash, n: l.n + 1 }));
  }, []);
  return <RouterContext.Provider value={{ path: loc.path, hash: loc.hash, nav: loc.n, query: new URLSearchParams(loc.search), navigate }}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
