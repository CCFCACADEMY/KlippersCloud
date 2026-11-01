import { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Badge, Button, Card, Field, Input, Modal, PageHeader, PageLoader, Select, Stars, Table, Toggle } from '../../components/ui';

export default function AdminBarbers() {
  const { data, reload } = useFetch('/admin/barbers');
  const { data: loc } = useFetch('/locations');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', location_id: '', title: 'Barber', experience_years: 0, commission_rate: 60 });
  const update = async (id, patch, msg = 'Saved') => { try { await api.patch(`/admin/barbers/${id}`, patch); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/barbers', { ...form, phone: form.phone || undefined, location_id: form.location_id || null, experience_years: Number(form.experience_years), commission_rate: Number(form.commission_rate) });
      toast.success('Barber created'); setOpen(false); reload();
    } catch (err) { toast.error(errMsg(err)); }
  };
  if (!data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Barbers" subtitle="Approve, assign locations and set commission." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add barber</Button>} />
      <Card>
        <Table rows={data.barbers} columns={[
          { key: 'name', label: 'Barber', render: (b) => <div className="flex items-center gap-3"><Avatar src={b.photo_url} name={b.name} size="sm" /><div><p className="font-semibold">{b.name}</p><p className="text-xs muted">{b.email}</p></div></div> },
          { key: 'rating', label: 'Rating', render: (b) => <div className="flex items-center gap-1"><Stars value={b.rating_avg} size={11} /><span className="text-xs muted">({b.rating_count})</span></div> },
          { key: 'completed', label: 'Cuts' },
          { key: 'location', label: 'Location', render: (b) => <Select value={b.location_id || ''} onChange={(e) => update(b.id, { location_id: e.target.value || null })}><option value="">—</option>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select> },
          { key: 'commission_rate', label: 'Commission %', render: (b) => <input type="number" className="input w-20 py-1.5" defaultValue={b.commission_rate} min={0} max={100} onBlur={(e) => Number(e.target.value) !== b.commission_rate && update(b.id, { commission_rate: Number(e.target.value) })} /> },
          { key: 'auto', label: 'Auto-confirm', render: (b) => <Toggle checked={b.auto_confirm} onChange={(v) => update(b.id, { auto_confirm: v })} /> },
          { key: 'status', label: 'Status', render: (b) => b.is_approved ? <Badge status="confirmed">Approved</Badge>
            : <Button className="py-1.5 text-xs" onClick={() => update(b.id, { is_approved: true }, 'Barber approved')}>Approve</Button> },
        ]} />
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add barber">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password"><Input required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Location"><Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}><option value="">—</option>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Experience (years)"><Input type="number" min={0} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} /></Field>
          <Field label="Commission %"><Input type="number" min={0} max={100} value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></Field>
          <Button type="submit" className="sm:col-span-2">Create barber</Button>
        </form>
      </Modal>
    </>
  );
}
