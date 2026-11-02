/** Staff form to add a walk-in customer straight into the calendar. */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { Button, Field, Input, Modal, Select } from '../ui';

export default function WalkInModal({ open, onClose, onDone, defaults = {} }) {
  const { user } = useAuth();
  const { data: barbers } = useFetch(open && user.role === 'admin' ? '/barbers' : null);
  const [form, setForm] = useState({ name: defaults.name || '', phone: defaults.phone || '', serviceId: defaults.serviceId || '', barberId: '' });
  const [busy, setBusy] = useState(false);
  // Services offered by the barber doing the walk-in (their own prices/durations)
  const svcBarberId = user.role === 'barber' ? user.barber_id : form.barberId;
  const { data: svc } = useFetch(open && svcBarberId ? `/barbers/${svcBarberId}` : null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post('/appointments/walk-in', { name: form.name, phone: form.phone || undefined, serviceIds: [form.serviceId], barberId: form.barberId || undefined });
      toast.success('Walk-in added to the calendar'); onDone?.(); onClose();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add walk-in customer">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Customer name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone (optional)"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Service"><Select required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
          <option value="">{svcBarberId ? 'Select…' : 'Choose a barber first'}</option>{svc?.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_min}m)</option>)}</Select></Field>
        {user.role === 'admin' && <Field label="Barber"><Select required value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value, serviceId: '' })}>
          <option value="">Select…</option>{barbers?.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>}
        <p className="text-xs muted">Starts now (next 5-minute mark). If the chair is busy you'll get a conflict — use the queue instead.</p>
        <Button type="submit" className="w-full" loading={busy}>Add & check in</Button>
      </form>
    </Modal>
  );
}
