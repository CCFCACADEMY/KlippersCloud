import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../lib/api';

/**
 * Tiny data-fetching hook: const { data, loading, error, reload } = useFetch('/barbers', { params })
 * Pass `null` as url to skip.
 *
 * - Responses from superseded requests are ignored, so fast filter changes never show stale results.
 * - When the URL itself changes (e.g. a different report), old data is cleared so a page never renders
 *   one endpoint's data with another endpoint's shape. Param-only changes keep the old data while loading.
 */
export function useFetch(url, options = {}, deps = []) {
  // Data is stored with the URL it came from; data for a different URL is never returned
  const [state, setState] = useState({ url: null, value: null });
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(null);
  const key = JSON.stringify(options.params || {});
  const latest = useRef(0);
  const data = state.url === url ? state.value : null;
  const setData = useCallback((value) => setState((s) => ({ url, value: typeof value === 'function' ? value(s.value) : value })), [url]);

  const reload = useCallback(async () => {
    if (!url) return;
    const reqId = ++latest.current;
    setLoading(true);
    try {
      const res = await api.get(url, options);
      if (reqId !== latest.current) return;
      setState({ url, value: res.data });
      setError(null);
    } catch (e) {
      if (reqId === latest.current) setError(errMsg(e));
    } finally {
      if (reqId === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

/** Debounce a fast-changing value (e.g. a search box) before using it in a request. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
