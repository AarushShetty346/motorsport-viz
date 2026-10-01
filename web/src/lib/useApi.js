import { useEffect, useState } from 'react';
import { api, onInvalidate } from './api.js';

// Loads a GET endpoint (or nothing when path is falsy) and reloads after writes.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [version, setVersion] = useState(0);
  useEffect(() => onInvalidate(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    if (!path) return setState({ data: null, error: null, loading: false });
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false })
    );
    return () => { alive = false; };
  }, [path, version]);
  return state;
}
