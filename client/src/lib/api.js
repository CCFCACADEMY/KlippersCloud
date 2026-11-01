/**
 * Axios instance with JWT handling.
 * - Access token kept in memory (not localStorage → less XSS exposure).
 * - On 401, transparently calls /auth/refresh (httpOnly cookie) once and retries.
 */
import axios from 'axios';

const baseURL = `${import.meta.env.VITE_API_URL || ''}/api`;
export const api = axios.create({ baseURL, withCredentials: true });

let accessToken = null;
let onLogout = () => {};
export const setAccessToken = (t) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const setLogoutHandler = (fn) => { onLogout = fn; };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing = null;
export function refreshSession() {
  // De-duplicate concurrent refreshes
  refreshing ||= axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
    .then((r) => { setAccessToken(r.data.accessToken); return r.data; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onLogout();
      }
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from an API error. */
export const errMsg = (e) => e?.response?.data?.error?.message || e?.message || 'Something went wrong';
