/**
 * Appointment card with role-aware actions.
 *  customer: QR pass, pay, reschedule, cancel, review, invoice
 *  barber/admin: accept / reject / check-in / start / complete / no-show
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, MapPin, QrCode, CalendarClock, XCircle, CreditCard, Star, FileText, Check, X, Play, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { money, fmtDate, fmtTime } from '../../lib/format';
import { Avatar, Badge, Button, Card } from '../ui';
import { RescheduleModal, PayModal, ReviewModal, QrModal, CancelModal, openInvoice } from './AppointmentActions';

export default function AppointmentCard({ appt, role = 'customer', onChange }) {
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const active = ['pending', 'confirmed', 'checked_in'].includes(appt.status);
  const upcoming = new Date(appt.start_at) > new Date() && ['pending', 'confirmed'].includes(appt.status);
  const paid = appt.payment_status === 'paid';
  const minsUntil = (new Date(appt.start_at) - Date.now()) / 60000;
  const canStart = minsUntil <= 60; // start/complete from 1h before
  const canCheckIn = minsUntil <= 120;

  const setStatus = async (status) => {
    let reason;
    if (status === 'rejected') { reason = prompt('Reason for declining (optional)') ?? undefined; }
    setBusy(status);
    try {
      await api.patch(`/appointments/${appt.id}/status`, { status, reason: reason || undefined });
      toast.success(`Marked ${status.replace('_', ' ')}`);
      onChange?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const invoice = async () => {
    const { data } = await api.get(`/appointments/${appt.id}`);
    const p = data.payments.find((x) => x.status !== 'failed');
    if (!p) return toast('No payment on file yet');
    openInvoice(p.id);
  };

  const close = () => setModal(null);
  const done = () => onChange?.();
  const isStaff = role !== 'customer';

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-4 sm:p-5">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-ink-900 py-2 text-white dark:bg-black/30">
            <span className="text-xs uppercase text-brass-300">{fmtDate(appt.start_at, 'MMM', appt.timezone)}</span>
            <span className="font-display text-2xl font-bold">{fmtDate(appt.start_at, 'd', appt.timezone)}</span>
            <span className="text-[10px] uppercase text-white/60">{fmtDate(appt.start_at, 'EEE', appt.timezone)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{appt.services.map((s) => s.name).join(' + ')}</p>
              <div className="flex gap-1.5"><Badge status={appt.status} />{appt.payment_status && appt.payment_status !== 'failed' && <Badge status={appt.payment_status}>{{ paid: 'Paid', pending: 'Pay at shop', refunded: 'Refunded', partially_refunded: 'Part refunded' }[appt.payment_status] || appt.payment_status}</Badge>}</div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm muted">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(appt.start_at, appt.timezone)} – {fmtTime(appt.end_at, appt.timezone)}</span>
              {appt.location_name && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{appt.location_name}</span>}
              <span className="font-semibold text-ink-900 dark:text-white">{money(appt.total)}</span>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {isStaff ? (
                <><Avatar name={appt.customer_name} size="sm" /><span>{appt.customer_name}</span>{appt.customer_phone && <span className="muted">· {appt.customer_phone}</span>}{appt.source !== 'online' && <Badge>{appt.source.replace('_', ' ')}</Badge>}</>
              ) : (
                <><Avatar src={appt.barber_photo} name={appt.barber_name} size="sm" /><span>{appt.barber_name}</span></>
              )}
            </div>
            {appt.notes && <p className="mt-2 rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/5">📝 {appt.notes}</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/5">
          {!isStaff && (
            <>
              {active && <Button variant="secondary" className="py-1.5 text-xs" onClick={() => setModal('qr')}><QrCode className="h-3.5 w-3.5" />Check-in pass</Button>}
              {active && !paid && <Button className="py-1.5 text-xs" onClick={() => setModal('pay')}><CreditCard className="h-3.5 w-3.5" />Pay now</Button>}
              {upcoming && <Button variant="secondary" className="py-1.5 text-xs" onClick={() => setModal('reschedule')}><CalendarClock className="h-3.5 w-3.5" />Reschedule</Button>}
              {upcoming && <Button variant="ghost" className="py-1.5 text-xs text-red-500" onClick={() => setModal('cancel')}><XCircle className="h-3.5 w-3.5" />Cancel</Button>}
              {appt.status === 'completed' && !appt.has_review && <Button className="py-1.5 text-xs" onClick={() => setModal('review')}><Star className="h-3.5 w-3.5" />Leave review</Button>}
            </>
          )}
          {isStaff && (
            <>
              {appt.status === 'pending' && <>
                <Button className="py-1.5 text-xs" loading={busy === 'confirmed'} onClick={() => setStatus('confirmed')}><Check className="h-3.5 w-3.5" />Accept</Button>
                <Button variant="secondary" className="py-1.5 text-xs" loading={busy === 'rejected'} onClick={() => setStatus('rejected')}><X className="h-3.5 w-3.5" />Decline</Button>
              </>}
              {appt.status === 'confirmed' && canCheckIn && <Button variant="secondary" className="py-1.5 text-xs" onClick={() => setStatus('checked_in')}><UserCheck className="h-3.5 w-3.5" />Check in</Button>}
              {['confirmed', 'checked_in'].includes(appt.status) && canStart && <Button variant="secondary" className="py-1.5 text-xs" onClick={() => setStatus('in_progress')}><Play className="h-3.5 w-3.5" />Start</Button>}
              {['confirmed', 'checked_in', 'in_progress'].includes(appt.status) && canStart && <Button className="py-1.5 text-xs" loading={busy === 'completed'} onClick={() => setStatus('completed')}><Check className="h-3.5 w-3.5" />Complete</Button>}
              {['confirmed', 'checked_in'].includes(appt.status) && new Date(appt.start_at) < new Date() && <Button variant="ghost" className="py-1.5 text-xs" onClick={() => setStatus('no_show')}>No-show</Button>}
              {upcoming && <Button variant="ghost" className="py-1.5 text-xs" onClick={() => setModal('reschedule')}><CalendarClock className="h-3.5 w-3.5" />Move</Button>}
              {active && <Button variant="ghost" className="py-1.5 text-xs text-red-500" onClick={() => setModal('cancel')}>Cancel</Button>}
            </>
          )}
          {appt.payment_status && <Button variant="ghost" className="py-1.5 text-xs" onClick={invoice}><FileText className="h-3.5 w-3.5" />Invoice</Button>}
        </div>
      </Card>
      {modal === 'reschedule' && <RescheduleModal appt={appt} open onClose={close} onDone={done} />}
      {modal === 'pay' && <PayModal appt={appt} open onClose={close} onDone={done} />}
      {modal === 'review' && <ReviewModal appt={appt} open onClose={close} onDone={done} />}
      {modal === 'qr' && <QrModal appt={appt} open onClose={close} />}
      {modal === 'cancel' && <CancelModal appt={appt} open onClose={close} onDone={done} staff={isStaff} />}
    </motion.div>
  );
}
