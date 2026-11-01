import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Button, Card, Field, Input, PageHeader, PageLoader, Select, Textarea, Toggle } from '../../components/ui';
import Profile from '../customer/Profile';

export default function BarberProfileEdit() {
  const { data } = useFetch('/barbers/me');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { const b = data.barber; setForm({ title: b.title || '', bio: b.bio || '', experience_years: b.experience_years, specialties: b.specialties.join(', '), photo_url: b.photo_url || '', auto_confirm: b.auto_confirm, slot_interval: b.slot_interval }); } }, [data]);
  if (!form) return <PageLoader />;
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.patch('/barbers/me', { ...form, photo_url: form.photo_url || null, experience_years: Number(form.experience_years), slot_interval: Number(form.slot_interval), specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean) });
      toast.success('Barber profile saved');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Barber profile" subtitle="This is what customers see when choosing a barber." />
      <Card className="mb-6 p-6">
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-4 md:col-span-2"><Avatar src={form.photo_url} name={data.barber.name} size="xl" /><Field label="Photo URL" className="flex-1"><Input type="url" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></Field></div>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Years of experience"><Input type="number" min={0} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} /></Field>
          <Field label="Bio" className="md:col-span-2"><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={2000} /></Field>
          <Field label="Specialties (comma separated)" className="md:col-span-2"><Input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} /></Field>
          <Field label="Booking slot interval"><Select value={form.slot_interval} onChange={(e) => setForm({ ...form, slot_interval: e.target.value })}>{[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>Every {m} min</option>)}</Select></Field>
          <div className="flex items-end pb-2"><Toggle checked={form.auto_confirm} onChange={(v) => setForm({ ...form, auto_confirm: v })} label="Auto-confirm bookings (skip manual approval)" /></div>
          <div className="md:col-span-2"><Button type="submit" loading={busy}>Save barber profile</Button></div>
        </form>
      </Card>
      <Profile />
    </>
  );
}
