import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Button, Card, Field, Input, PageHeader, Toggle } from '../../components/ui';

/** Profile & notification preferences — shared by every role. */
export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', avatar_url: user.avatar_url || '', notify_email: user.notify_email, notify_sms: user.notify_sms, notify_push: user.notify_push });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.patch('/auth/me', { ...form, phone: form.phone || null, avatar_url: form.avatar_url || null });
      setUser(data.user); toast.success('Profile saved');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    try { await api.patch('/auth/me/password', pw); toast.success('Password changed'); setPw({ currentPassword: '', newPassword: '' }); } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <>
      <PageHeader title="Profile & settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4"><Avatar src={form.avatar_url} name={form.name} size="lg" /><div><p className="font-semibold">{user.email}</p><p className="text-sm capitalize muted">{user.role}</p></div></div>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Mobile"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Avatar URL"><Input type="url" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} /></Field>
            <div className="space-y-3 rounded-xl bg-black/5 p-4 dark:bg-white/5">
              <p className="label">Notifications</p>
              <Toggle checked={form.notify_email} onChange={(v) => setForm({ ...form, notify_email: v })} label="Email confirmations & reminders" />
              <Toggle checked={form.notify_sms} onChange={(v) => setForm({ ...form, notify_sms: v })} label="SMS reminders (24h & 1h before)" />
              <Toggle checked={form.notify_push} onChange={(v) => setForm({ ...form, notify_push: v })} label="Push / in-browser notifications" />
            </div>
            <Button type="submit" loading={busy}>Save changes</Button>
          </form>
        </Card>
        <Card className="h-fit p-6">
          <h2 className="text-lg font-bold">Change password</h2>
          <form onSubmit={changePw} className="mt-4 space-y-4">
            <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password"><Input type="password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Button type="submit" variant="secondary">Update password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
