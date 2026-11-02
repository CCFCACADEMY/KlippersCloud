/**
 * Modals for appointment actions: reschedule, pay, review, QR, cancel.
 * Shared by the customer, barber and admin screens.
 */
import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CreditCard, Banknote, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { money, fmtDateTime, fmtDate } from '../../lib/format';
import { Button, Field, Input, Modal, Spinner, Stars, Textarea, cn } from '../ui';
import SlotGrid from '../booking/SlotGrid';

/** Open an authenticated invoice (HTML) in a new tab. */
export async function openInvoice(paymentId) {
  const win = window.open('', '_blank');
  try {
    const { data } = await api.get(`/payments/${paymentId}/invoice`, { responseType: 'text' });
    win.document.write(data);
    win.document.close();
  } catch (e) { win?.close(); toast.error(errMsg(e)); }
}

export function RescheduleModal({ appt, open, onClose, onDone }) {
  const [date, setDate] = useState(fmtDate(appt.start_at, 'yyyy-MM-dd', appt.timezone));
  const [tz, setTz] = useState(appt.timezone);
  const [slots, setSlots] = useState(null);
  const [startAt, setStartAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setSlots(null);
    const duration = appt.services.reduce((t, s) => t + s.duration_min, 0);
    api.get(`/barbers/${appt.barber_id}/availability`, { params: { date, duration, excludeAppointmentId: appt.id } })
      .then((r) => { setSlots(r.data.slots); setTz(r.data.timezone); }).catch((e) => toast.error(errMsg(e)));
  }, [appt, date]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/appointments/${appt.id}/reschedule`, { startAt });
      toast.success(`Moved to ${fmtDateTime(data.appointment.start_at, data.appointment.timezone)}`);
      onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Reschedule appointment" wide>
      <p className="text-sm muted">Currently {fmtDateTime(appt.start_at, appt.timezone)} with {appt.barber_name}.</p>
      <Field label="New date" className="mt-4"><Input type="date" min={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={(e) => { setDate(e.target.value); setStartAt(null); }} /></Field>
      <div className="mt-4 max-h-80 overflow-y-auto">
        {!slots ? <Spinner /> : slots.some((s) => s.available) ? <SlotGrid slots={slots} value={startAt} onChange={setStartAt} timezone={tz} /> : <p className="py-6 text-center muted">No openings on this date.</p>}
      </div>
      <Button className="mt-5 w-full" disabled={!startAt} loading={busy} onClick={submit}>Confirm new time</Button>
    </Modal>
  );
}

export function PayModal({ appt, open, onClose, onDone }) {
  const [method, setMethod] = useState('card');
  const [giftCardCode, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/payments/appointments/${appt.id}`, { method, giftCardCode: method === 'gift_card' ? giftCardCode : undefined });
      if (data.payment.clientSecret) {
        // Stripe mode: confirm with Stripe.js / Elements here using data.payment.clientSecret
        toast('Complete payment in the Stripe form', { icon: '💳' });
      } else {
        toast.success(method === 'cash' ? 'Pay at the shop — see you soon!' : 'Payment successful');
      }
      onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const opts = [['card', 'Card', CreditCard, 'Pay securely now'], ['cash', 'Cash', Banknote, 'Pay at the shop'], ['gift_card', 'Gift card', Gift, 'Use a gift card code']];
  return (
    <Modal open={open} onClose={onClose} title="Payment">
      <div className="rounded-xl bg-black/5 p-4 text-sm dark:bg-white/5">
        {appt.services.map((s) => <div key={s.service_id} className="flex justify-between"><span>{s.name}</span><span>{money(s.price)}</span></div>)}
        {appt.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discounts</span><span>−{money(appt.discount)}</span></div>}
        <div className="flex justify-between muted"><span>Tax</span><span>{money(appt.tax)}</span></div>
        <div className="mt-2 flex justify-between border-t border-black/10 pt-2 text-base font-bold dark:border-white/10"><span>Total</span><span>{money(appt.total)}</span></div>
      </div>
      <div className="mt-4 grid gap-2">
        {opts.map(([v, label, Icon, hint]) => (
          <button key={v} onClick={() => setMethod(v)} className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition', method === v ? 'border-brass-400 bg-brass-400/10' : 'border-black/10 dark:border-white/10')}>
            <Icon className="h-5 w-5 text-brass-400" /><span className="flex-1"><b className="block text-sm">{label}</b><span className="text-xs muted">{hint}</span></span>
          </button>
        ))}
      </div>
      {method === 'gift_card' && <Field label="Gift card code" className="mt-4"><Input value={giftCardCode} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GIFT-DEMO-2026" /></Field>}
      <Button className="mt-5 w-full" loading={busy} onClick={submit}>{method === 'cash' ? 'Confirm cash payment' : `Pay ${money(appt.total)}`}</Button>
    </Modal>
  );
}

export function ReviewModal({ appt, open, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/me/reviews', { appointmentId: appt.id, rating, comment: comment || undefined });
      toast.success(`Thanks! +${data.bonusPoints} bonus points`);
      onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Rate ${appt.barber_name}`}>
      <div className="flex justify-center"><Stars value={rating} size={36} onChange={setRating} /></div>
      <Field label="Your review (optional)" className="mt-4"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="How was your cut?" /></Field>
      <Button className="mt-5 w-full" loading={busy} onClick={submit}>Submit review</Button>
    </Modal>
  );
}

export function QrModal({ appt, open, onClose }) {
  const [qr, setQr] = useState(null);
  useEffect(() => { if (open) api.get(`/appointments/${appt.id}/qr`).then((r) => setQr(r.data)); }, [open, appt.id]);
  return (
    <Modal open={open} onClose={onClose} title="Check-in pass">
      <div className="text-center">
        {qr ? <img src={qr.dataUrl} alt="QR code" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" /> : <Spinner className="mx-auto" />}
        <p className="mt-4 font-mono text-3xl font-bold tracking-[.3em] text-brass-500">{appt.checkin_code}</p>
        <p className="mt-2 text-sm muted">{fmtDateTime(appt.start_at, appt.timezone)} · {appt.barber_name}</p>
        <p className="mt-1 text-xs muted">Scan at the kiosk when you arrive (opens 2h before).</p>
      </div>
    </Modal>
  );
}

export function CancelModal({ appt, open, onClose, onDone, staff = false }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/appointments/${appt.id}/cancel`, { reason: reason || undefined });
      toast.success(data.refunded ? 'Cancelled — refund issued' : data.lateCancel ? 'Cancelled (late cancellation — no refund)' : 'Appointment cancelled');
      onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Cancel appointment?">
      <p className="text-sm muted">{fmtDateTime(appt.start_at, appt.timezone)} with {appt.barber_name}. {staff ? 'The customer is notified and any online payment is refunded in full.' : 'Cancellations within 4 hours of the appointment are not refunded.'}</p>
      <Field label="Reason (optional)" className="mt-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      <div className="mt-5 flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Keep it</Button><Button variant="danger" className="flex-1" loading={busy} onClick={submit}>Cancel appointment</Button></div>
    </Modal>
  );
}
