// Tiny fetch wrapper with a GET cache. Any write clears the cache so every
// view re-reads MongoDB after a change.
// Every call is about the season in the URL (sent as ?season=), unless the path names one.
const cache = new Map();
const listeners = new Set();
let season = 2025;
export const setApiSeason = (year) => { season = year; };
export const apiSeason = () => season;

export async function api(rawPath, options = {}) {
  const method = options.method || 'GET';
  const path = rawPath.startsWith('/api/') && !/[?&]season=/.test(rawPath) && !rawPath.startsWith('/api/auth')
    ? `${rawPath}${rawPath.includes('?') ? '&' : '?'}season=${season}`
    : rawPath;
  if (method === 'GET' && cache.has(path)) return cache.get(path);
  const request = fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.payload = data;
      throw err;
    }
    return data;
  });
  if (method === 'GET') {
    cache.set(path, request);
    request.catch(() => cache.delete(path));
  } else {
    request.then(invalidate, invalidate);
  }
  return request;
}

export function invalidate() {
  cache.clear();
  listeners.forEach((fn) => fn());
}

export function onInvalidate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
