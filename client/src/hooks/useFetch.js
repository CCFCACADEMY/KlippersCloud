import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';

/**
 * Tiny data-fetching hook: const { data, loading, error, reload } = useFetch('/barbers', { params })
 * Pass `null` as url to skip.
 */
export function useFetch(url, options = {}, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(null);
  const key = JSON.stringify(options.params || {});

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await api.get(url, options);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}
