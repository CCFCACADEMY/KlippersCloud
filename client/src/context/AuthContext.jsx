/**
 * Auth state: current user + role, login/register/logout, Google sign-in.
 * On load we try a silent refresh using the httpOnly refresh cookie.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api, setAccessToken, setLogoutHandler, refreshSession } from '../lib/api';
import { getSocket, resetSocketAuth } from '../lib/socket';

const AuthContext = createContext(null);

// Non-sensitive hint that a refresh cookie probably exists. It lets anonymous
// visitors skip the silent /auth/refresh call (which would just 401).
const SESSION_HINT = 'klippers-has-session';
const hint = {
  set: () => { try { localStorage.setItem(SESSION_HINT, '1'); } catch { /* storage disabled */ } },
  clear: () => { try { localStorage.removeItem(SESSION_HINT); } catch { /* storage disabled */ } },
  exists: () => { try { return localStorage.getItem(SESSION_HINT) === '1'; } catch { return true; } },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback(({ accessToken, user: u }) => {
    setAccessToken(accessToken);
    setUser(u);
    hint.set();
    resetSocketAuth();
  }, []);

  useEffect(() => {
    setLogoutHandler(() => { hint.clear(); setUser(null); });
    if (!hint.exists()) { setReady(true); return; }
    refreshSession().then(applySession).catch(() => hint.clear()).finally(() => setReady(true));
  }, [applySession]);

  // Real-time "push" notifications → toast + native browser notification
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const handler = (n) => {
      toast(`${n.title}\n${n.body}`, { icon: '🔔', duration: 6000 });
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(n.title, { body: n.body, icon: '/favicon.svg' });
      }
      window.dispatchEvent(new CustomEvent('klippers:notification', { detail: n }));
    };
    socket.on('notification', handler);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    return () => socket.off('notification', handler);
  }, [user]);

  const value = useMemo(() => ({
    user, ready,
    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password });
      applySession(data);
      return data.user;
    },
    async register(payload) {
      const { data } = await api.post('/auth/register', payload);
      applySession(data);
      return data.user;
    },
    async googleLogin(credential) {
      const { data } = await api.post('/auth/google', { credential });
      applySession(data);
      return data.user;
    },
    async logout() {
      await api.post('/auth/logout').catch(() => {});
      hint.clear();
      setAccessToken(null);
      setUser(null);
      resetSocketAuth();
    },
    async refreshUser() {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    },
    setUser,
  }), [user, ready, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Where each role lands after sign-in. */
export const homeFor = (role) => ({ admin: '/admin', barber: '/barber', customer: '/dashboard' }[role] || '/');
