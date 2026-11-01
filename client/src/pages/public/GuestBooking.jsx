/** Guests (no account) can look up and cancel a booking with code + email. */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, money } from '../../lib/format';
import { Badge, Button, Card, Field, Input } from '../../components/ui';

export default function GuestBooking() {
  const [form, setForm] = useState({ code: '', email: '' });
  const [appt, setAppt] = useState(null);
  const [busy, setBusy] = useState(false);
  const lookup = async (e) => {
    e.preventDefault(); setBusy(true);
    try { setAppt((await api.post('/appointments/guest/lookup', form)).data.appointment); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!confirm('Cancel this appointment?')) return;
    try { setAppt((await api.post('/appointments/guest/cancel', form)).data.appointment); toast.success('Appointment cancelled'); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold">Manage guest booking</h1>
      <p className="mt-1 muted">Enter the check-in code from your confirmation and the email you booked with.</p>
      <Card className="mt-6 p-6">
        <form onSubmit={lookup} className="space-y-4">
          <Field label="Booking code"><Input required maxLength={8} className="input font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Button type="submit" className="w-full" loading={busy}>Find booking</Button>
        </form>
        {appt && (
          <div className="mt-6 space-y-2 border-t border-black/5 pt-6 text-sm dark:border-white/5">
            <div className="flex justify-between"><b>{appt.services.map((s) => s.name).join(', ')}</b><Badge status={appt.status} /></div>
            <p>{fmtDateTime(appt.start_at)} with {appt.barber_name}</p>
            <p className="muted">{appt.location_name} · {money(appt.total)}</p>
            {['pending', 'confirmed'].includes(appt.status) && <Button variant="danger" className="mt-3 w-full" onClick={cancel}>Cancel appointment</Button>}
          </div>
        )}
      </Card>
    </div>
  );
}
