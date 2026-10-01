// Tiny fetch wrapper with a GET cache. Any write clears the cache so every
// view re-reads MongoDB after a change.
const cache = new Map();
const listeners = new Set();

export async function api(path, options = {}) {
  const method = options.method || 'GET';
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
