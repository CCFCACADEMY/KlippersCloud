/**
 * Admin → Barbers: add new barber profiles and edit any barber's full profile
 * (name, contact, photo upload, title, bio, specialties, experience, location,
 * commission, auto-confirm), plus approval of self-registered barbers.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Badge, Button, Card, Field, Input, Modal, PageHeader, PageLoader, Select, Stars, Table, Textarea, Toggle } from '../../components/ui';
import PhotoInput from '../../components/ui/PhotoInput';

const EMPTY = {
  name: '', email: '', phone: '', password: '', title: 'Barber', bio: '', specialties: '',
  experience_years: 0, location_id: '', commission_rate: 60, auto_confirm: false, photo_url: null,
};

export default function AdminBarbers() {
  const { data, reload } = useFetch('/admin/barbers');
  const { data: loc } = useFetch('/locations');
  const [form, setForm] = useState(null); // null = closed; { id? ... } = add/edit
  const [busy, setBusy] = useState(false);

  const quick = async (id, patch, msg = 'Saved') => {
    try { await api.patch(`/admin/barbers/${id}`, patch); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  const openEdit = (b) => setForm({
    id: b.id, name: b.name, email: b.email, phone: b.phone || '', title: b.title || '', bio: b.bio || '',
    specialties: (b.specialties || []).join(', '), experience_years: b.experience_years, location_id: b.location_id || '',
    commission_rate: b.commission_rate, auto_confirm: b.auto_confirm, photo_url: b.photo_url || null,
  });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const profile = {
      name: form.name, phone: form.phone || undefined, title: form.title || undefined, bio: form.bio || null,
      specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean),
      experience_years: Number(form.experience_years), location_id: form.location_id || null,
      commission_rate: Number(form.commission_rate), auto_confirm: form.auto_confirm, photo_url: form.photo_url || null,
    };
    try {
      if (form.id) {
        await api.patch(`/admin/barbers/${form.id}`, { ...profile, phone: form.phone || null });
        toast.success('Barber profile updated');
      } else {
        await api.post('/admin/barbers', { ...profile, email: form.email, password: form.password });
        toast.success(`${form.name} added — they can sign in with the email and temporary password`);
      }
      setForm(null);
      reload();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  if (!data) return <PageLoader />;
  const set = (patch) => setForm({ ...form, ...patch });

  return (
    <>
      <PageHeader title="Barbers" subtitle="Add barbers, edit their public profiles, approve sign-ups and set commission."
        actions={<Button onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" />Add barber</Button>} />
      <Card>
        <Table rows={data.barbers} columns={[
          { key: 'name', label: 'Barber', render: (b) => (
            <div className="flex items-center gap-3"><Avatar src={b.photo_url} name={b.name} size="sm" />
              <div><p className="font-semibold">{b.name}</p><p className="text-xs muted">{b.title} · {b.email}</p></div></div>) },
          { key: 'rating', label: 'Rating', render: (b) => <div className="flex items-center gap-1"><Stars value={b.rating_avg} size={11} /><span className="text-xs muted">({b.rating_count})</span></div> },
          { key: 'completed', label: 'Cuts' },
          { key: 'location', label: 'Location', render: (b) => b.location_name || '—' },
          { key: 'commission_rate', label: 'Commission', render: (b) => `${b.commission_rate}%` },
          { key: 'auto', label: 'Auto-confirm', render: (b) => <Toggle checked={b.auto_confirm} onChange={(v) => quick(b.id, { auto_confirm: v })} /> },
          { key: 'status', label: 'Status', render: (b) => (!b.is_active ? <Badge status="rejected">Suspended</Badge> : b.is_approved
            ? <Badge status="confirmed">Approved</Badge>
            : <Button className="py-1.5 text-xs" onClick={() => quick(b.id, { is_approved: true }, 'Barber approved')}>Approve</Button>) },
          { key: 'actions', label: '', className: 'whitespace-nowrap text-right', render: (b) => (
            <>
              <button className="btn-ghost p-2" title="Edit profile" aria-label={`Edit ${b.name}`} onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></button>
              <Link className="btn-ghost p-2" title="View public profile" aria-label={`View ${b.name}'s public profile`} to={`/barbers/${b.id}`} target="_blank"><ExternalLink className="h-4 w-4" /></Link>
            </>) },
        ]} />
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.name}` : 'Add barber'} wide>
        {form && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><span className="label">Photo</span><PhotoInput value={form.photo_url} name={form.name} onChange={(v) => set({ photo_url: v })} /></div>
            <Field label="Full name"><Input required minLength={2} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Title"><Input placeholder="Senior Barber" value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            {!form.id && <>
              <Field label="Email (login)"><Input required type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
              <Field label="Temporary password" hint="8+ characters with a letter and a number"><Input required minLength={8} value={form.password} onChange={(e) => set({ password: e.target.value })} /></Field>
            </>}
            <Field label="Mobile"><Input type="tel" placeholder="+91 98200 00000" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Experience (years)"><Input type="number" min={0} max={70} value={form.experience_years} onChange={(e) => set({ experience_years: e.target.value })} /></Field>
            <Field label="Bio" className="sm:col-span-2"><Textarea maxLength={2000} placeholder="What makes this barber great?" value={form.bio} onChange={(e) => set({ bio: e.target.value })} /></Field>
            <Field label="Specialties" hint="Comma separated, e.g. Skin Fades, Beard Styling" className="sm:col-span-2">
              <Input value={form.specialties} onChange={(e) => set({ specialties: e.target.value })} />
            </Field>
            <Field label="Location"><Select value={form.location_id} onChange={(e) => set({ location_id: e.target.value })}>
              <option value="">—</option>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
            <Field label="Commission %"><Input type="number" min={0} max={100} value={form.commission_rate} onChange={(e) => set({ commission_rate: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Toggle checked={form.auto_confirm} onChange={(v) => set({ auto_confirm: v })} label="Auto-confirm bookings (no manual approval)" /></div>
            {!form.id && <p className="text-xs muted sm:col-span-2">New barbers are approved immediately and offer every active service — they can adjust services, prices and hours after signing in.</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={busy}>{form.id ? 'Save profile' : 'Add barber'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
