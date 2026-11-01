/** Login, Register (customer or barber), Forgot & Reset password. */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useAuth, homeFor } from '../../context/AuthContext';
import { Button, Card, Field, Input, Tabs } from '../../components/ui';
import Logo from '../../components/layout/Logo';

function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="overflow-hidden">
          <div className="pole-stripes h-1.5 animate-pole" />
          <div className="p-8">
            <Logo />
            <h1 className="mt-6 text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

/** Google Identity Services button — rendered only when VITE_GOOGLE_CLIENT_ID is set. */
function GoogleButton({ onDone }) {
  const ref = useRef();
  const { googleLogin } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => { try { onDone(await googleLogin(credential)); } catch (e) { toast.error(errMsg(e)); } },
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', width: 320, shape: 'pill' });
    };
    if (window.google?.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = init;
    document.body.appendChild(s);
  }, [clientId, googleLogin, onDone]);
  if (!clientId) return null;
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs muted"><div className="h-px flex-1 bg-black/10 dark:bg-white/10" />OR<div className="h-px flex-1 bg-black/10 dark:bg-white/10" /></div>
      <div ref={ref} className="flex justify-center" />
    </>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const done = (user) => navigate(location.state?.from || homeFor(user.role), { replace: true });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { done(await login(form.email, form.password)); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Welcome back" subtitle="Sign in to manage your bookings.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-brass-500 hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <GoogleButton onDone={done} />
      <p className="mt-6 text-center text-sm muted">New to Klippers? <Link to="/register" className="font-semibold text-brass-500 hover:underline">Create an account</Link></p>
      <details className="mt-6 rounded-xl bg-black/5 p-3 text-xs dark:bg-white/5">
        <summary className="cursor-pointer font-semibold">Demo accounts</summary>
        <div className="mt-2 space-y-1">
          {[['Customer', 'john@example.com'], ['Barber', 'marcus@klippers.app'], ['Admin', 'admin@klippers.app']].map(([r, e]) => (
            <button key={e} type="button" className="block w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setForm({ email: e, password: 'Password123' })}>
              <b>{r}:</b> {e} / Password123
            </button>
          ))}
        </div>
      </details>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'barber' ? 'barber' : 'customer');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const user = await register({ ...form, phone: form.phone || undefined, role });
      toast.success(role === 'barber' ? 'Account created — pending admin approval.' : 'Welcome to Klippers!');
      navigate(homeFor(user.role));
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your account" subtitle="Book faster, earn points, never miss a reminder.">
      <Tabs value={role} onChange={setRole} tabs={[{ value: 'customer', label: "I'm a customer" }, { value: 'barber', label: "I'm a barber" }]} />
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Full name"><Input required minLength={2} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Mobile (for SMS reminders)"><Input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Password" hint="At least 8 characters, with a letter and a number"><Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      {role === 'customer' && <GoogleButton onDone={(u) => navigate(homeFor(u.role))} />}
      <p className="mt-6 text-center text-sm muted">Already have an account? <Link to="/login" className="font-semibold text-brass-500 hover:underline">Sign in</Link></p>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/forgot-password', { email }); setSent(true); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Shell title="Reset password" subtitle="We'll email you a secure reset link.">
      {sent ? <p className="text-sm">If an account exists for <b>{email}</b>, a reset link is on its way. It expires in 1 hour.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/reset-password', { token: params.get('token'), password }); toast.success('Password updated'); navigate('/login'); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password"><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" className="w-full">Update password</Button>
      </form>
    </Shell>
  );
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-8xl font-extrabold text-brass-400">404</p>
      <p className="mt-2 text-xl font-semibold">This page got a little too close a shave.</p>
      <Link to="/" className="btn-primary mt-6">Back home</Link>
    </div>
  );
}
