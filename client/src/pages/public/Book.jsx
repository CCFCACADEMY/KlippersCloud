/**
 * Animated multi-step booking flow:
 *   1 Services → 2 Barber → 3 Date & time → 4 Details → 5 Confirmed
 * Works for signed-in customers and guests. Slots refresh in real time when
 * another booking lands on the same barber (Socket.IO "slots:changed").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, format, startOfMonth } from 'date-fns';
import { Check, ChevronLeft, Clock, PartyPopper, Tag, User, CalendarPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { money, fmtDateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Button, Card, Field, Input, PageLoader, Stars, Textarea, cn, Spinner, EmptyState } from '../../components/ui';
import MonthCalendar from '../../components/booking/MonthCalendar';
import SlotGrid from '../../components/booking/SlotGrid';
import ServiceIcon, { CATEGORY_LABELS } from '../../components/booking/ServiceIcon';

const STEPS = ['Services', 'Barber', 'Date & time', 'Details'];

const slide = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

export default function Book() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Deep link from "See who's free": ?service=&barber=&date=YYYY-MM-DD&start=ISO jumps straight to Details
  const preDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? (([y, m, d]) => new Date(y, m - 1, d))(params.get('date').split('-').map(Number)) : null;
  const preStart = preDate && params.get('start') ? params.get('start') : null;
  const prefilled = !!(params.get('service') && params.get('barber') && preStart);
  const [[step, dir], setStep] = useState([prefilled ? 3 : 0, 1]);
  const [serviceIds, setServiceIds] = useState(params.get('service') ? [params.get('service')] : []);
  const [barberId, setBarberId] = useState(params.get('barber') || null);
  const [month, setMonth] = useState(startOfMonth(preDate || new Date()));
  const [date, setDate] = useState(preDate);
  const [slots, setSlots] = useState(null);
  const [slotReason, setSlotReason] = useState('');
  const [tz, setTz] = useState(undefined);
  const [monthAvail, setMonthAvail] = useState({});
  const [startAt, setStartAt] = useState(preStart);
  const [details, setDetails] = useState({ notes: '', couponCode: '', redeemPoints: 0, name: '', email: '', phone: '' });
  const [quote, setQuote] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null);

  const { data: svcData } = useFetch('/services');
  const { data: barberData } = useFetch('/barbers');
  const { data: pub } = useFetch('/settings/public');
  const services = svcData?.services || [];
  const selectedServices = services.filter((s) => serviceIds.includes(s.id));
  const go = (n) => setStep([n, n > step ? 1 : -1]);
  // Refs let the real-time slot refresh see the latest step / selection without re-subscribing
  const stepRef = useRef(step);
  stepRef.current = step;
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  // Barbers who offer every selected service
  const [eligible, setEligible] = useState(null);
  useEffect(() => {
    if (!serviceIds.length || !barberData) return;
    Promise.all(serviceIds.map((id) => api.get('/barbers', { params: { serviceId: id } }).then((r) => r.data.barbers.map((b) => b.id))))
      .then((lists) => setEligible(barberData.barbers.filter((b) => lists.every((l) => l.includes(b.id)))));
  }, [serviceIds, barberData]);

  // A barber pre-selected via ?barber= may not offer the chosen services: clear the choice
  useEffect(() => {
    if (eligible && barberId && !eligible.some((b) => b.id === barberId)) {
      const name = barberData?.barbers.find((b) => b.id === barberId)?.name;
      setBarberId(null); setDate(null); setStartAt(null);
      if (name) toast(`${name} doesn't offer all the selected services. Please choose another barber.`, { icon: 'ℹ️' });
    }
  }, [eligible, barberId, barberData]);

  const barber = barberData?.barbers.find((b) => b.id === barberId);
  // Barber-specific price/duration overrides (e.g. senior barbers charge more)
  const { data: barberDetail } = useFetch(barberId ? `/barbers/${barberId}` : null);
  const priced = useMemo(() => selectedServices.map((s) => {
    const own = barberDetail?.services.find((x) => x.id === s.id);
    return own ? { ...s, price: own.price, duration_min: own.duration_min } : s;
  }), [selectedServices, barberDetail]);
  const duration = useMemo(() => priced.reduce((t, s) => t + s.duration_min, 0), [priced]);

  // Month availability dots
  useEffect(() => {
    if (!barberId || step !== 2) return;
    api.get(`/barbers/${barberId}/availability/month`, { params: { month: format(month, 'yyyy-MM'), duration: duration || 30 } })
      .then((r) => setMonthAvail(Object.fromEntries(r.data.days.map((d) => [d.date, d.open])))).catch(() => {});
  }, [barberId, month, step, duration]);

  const loadSlots = useCallback(async () => {
    if (!barberId || !date) return;
    try {
      const { data } = await api.get(`/barbers/${barberId}/availability`, { params: { date: format(date, 'yyyy-MM-dd'), serviceIds: serviceIds.join(',') } });
      setSlots(data.slots);
      setSlotReason(data.reason || '');
      setTz(data.timezone);
      // If someone else just booked the selected slot, clear it and tell the user
      const cur = startAtRef.current;
      if (cur && !data.slots.find((s) => s.start === cur && s.available)) {
        setStartAt(null);
        if (stepRef.current === 3) {
          toast.error('Sorry, that time was just booked by someone else. Please pick another time.');
          setStep([2, -1]);
        }
      }
    } catch (e) { toast.error(errMsg(e)); }
  }, [barberId, date, serviceIds]);

  useEffect(() => { setSlots(null); loadSlots(); }, [loadSlots]);

  // Real-time availability
  useEffect(() => {
    if (!barberId) return;
    const socket = getSocket();
    socket.emit('subscribe', `barber:${barberId}`);
    const onChange = () => loadSlots();
    socket.on('slots:changed', onChange);
    return () => { socket.off('slots:changed', onChange); socket.emit('unsubscribe', `barber:${barberId}`); };
  }, [barberId, loadSlots]);

  // Live price quote on the details step
  useEffect(() => {
    if (step !== 3 || !barberId) return;
    const t = setTimeout(() => {
      api.post('/appointments/quote', { barberId, serviceIds, couponCode: details.couponCode || undefined, redeemPoints: details.redeemPoints || 0 })
        .then((r) => setQuote({ ...r.data.quote, error: null }))
        .catch((e) => setQuote((q) => ({ ...(q || {}), error: errMsg(e) })));
    }, 350);
    return () => clearTimeout(t);
  }, [step, barberId, serviceIds, details.couponCode, details.redeemPoints]);

  async function submit() {
    if (!startAt) { toast.error('Please pick a time for your appointment.'); go(2); return; }
    if (!user) {
      if (!details.name.trim() || !details.email.trim() || !details.phone.trim()) return toast.error('Please fill in your name, email and phone.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) return toast.error('Please enter a valid email address.');
      if (!/^\+?[0-9\s\-()]{7,20}$/.test(details.phone.trim())) return toast.error('Please enter a valid phone number, e.g. +91 98200 00000.');
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/appointments', {
        barberId, serviceIds, startAt, notes: details.notes || undefined,
        couponCode: details.couponCode || undefined, redeemPoints: details.redeemPoints || undefined,
        guest: user ? undefined : { name: details.name, email: details.email, phone: details.phone },
      });
      setBooked(data.appointment);
      if (user) api.get(`/appointments/${data.appointment.id}/qr`).then((r) => setBooked((b) => ({ ...b, qr: r.data.dataUrl })));
    } catch (e) {
      toast.error(errMsg(e));
      if (e.response?.status === 409) { go(2); loadSlots(); }
    } finally { setSubmitting(false); }
  }

  if (!svcData || !barberData) return <PageLoader />;
  if (booked) return <Success appt={booked} user={user} />;

  const canNext = [serviceIds.length > 0, !!barberId && !!eligible?.some((b) => b.id === barberId), !!startAt, true][step];
  const grouped = services.reduce((g, s) => ({ ...g, [s.category]: [...(g[s.category] || []), s] }), {});

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">Book your appointment</h1>
      <p className="mt-1 muted">Pick a service, choose your barber, and lock in a time. Takes under a minute.</p>

      {/* Progress */}
      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <button disabled={i > step} onClick={() => go(i)} className="flex items-center gap-2">
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition',
                i < step ? 'bg-brass-400 text-ink-900' : i === step ? 'bg-ink-900 text-brass-400 ring-2 ring-brass-400 dark:bg-white/10' : 'bg-black/5 muted dark:bg-white/5')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm font-semibold md:block', i === step ? '' : 'muted')}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-0.5 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/10">
              <motion.div className="h-full bg-brass-400" animate={{ width: i < step ? '100%' : '0%' }} />
            </div>}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="relative min-h-[420px] overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
              {step === 0 && (
                <div className="space-y-6">
                  {Object.entries(grouped).map(([cat, list]) => (
                    <div key={cat}>
                      <p className="label">{CATEGORY_LABELS[cat]}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((s) => {
                          const on = serviceIds.includes(s.id);
                          return (
                            <button key={s.id} onClick={() => setServiceIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}
                              className={cn('card flex items-start gap-3 p-4 text-left transition hover:-translate-y-0.5',
                                on && 'ring-2 ring-brass-400')}>
                              <span className={cn('rounded-xl p-2.5', on ? 'bg-brass-400 text-ink-900' : 'bg-brass-400/15 text-brass-500')}>
                                {on ? <Check className="h-5 w-5" /> : <ServiceIcon category={s.category} />}
                              </span>
                              <span className="flex-1">
                                <span className="flex justify-between gap-2 font-semibold"><span>{s.name}</span><span>{money(s.price)}</span></span>
                                <span className="mt-0.5 block text-xs muted">{s.description}</span>
                                <span className="mt-1.5 flex items-center gap-1 text-xs muted"><Clock className="h-3 w-3" />{s.duration_min} min</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {step === 1 && (
                !eligible ? <Spinner /> : eligible.length === 0 ? <EmptyState title="No barber offers that combination" text="Try removing a service." /> : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {eligible.map((b) => (
                      <button key={b.id} onClick={() => { setBarberId(b.id); setDate(null); setStartAt(null); }}
                        className={cn('card flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5', barberId === b.id && 'ring-2 ring-brass-400')}>
                        <Avatar src={b.photo_url} name={b.name} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{b.name}</p>
                          <p className="text-xs muted">{b.title} · {b.experience_years} yrs · {b.location_name}</p>
                          <div className="mt-1 flex items-center gap-1.5"><Stars value={b.rating_avg} size={12} /><span className="text-xs muted">{Number(b.rating_avg).toFixed(1)} ({b.rating_count})</span></div>
                          <p className="mt-1 truncate text-xs text-brass-500">{b.specialties.join(' · ')}</p>
                        </div>
                        {barberId === b.id && <Check className="h-5 w-5 text-brass-400" />}
                      </button>
                    ))}
                  </div>
                )
              )}

              {step === 2 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="p-5">
                    <MonthCalendar month={month} onMonthChange={setMonth} selected={date} availability={monthAvail}
                      onSelect={(d) => { setDate(d); setStartAt(null); }} maxDate={addDays(new Date(), 60)} />
                  </Card>
                  <Card className="p-5">
                    {!date ? <EmptyState icon={CalendarPlus} title="Pick a date" text="Green dots show days with openings." /> : !slots ? <Spinner /> :
                      slots.filter((s) => s.available).length === 0 ? (
                        <EmptyState title="Fully booked" text={slotReason || 'No openings this day.'} action={user?.role === 'customer' && (
                          <Button variant="secondary" onClick={() => api.post('/me/waitlist', { barberId, serviceId: serviceIds[0], desiredDate: format(date, 'yyyy-MM-dd') })
                            .then(() => toast.success("You're on the waiting list — we'll notify you if a slot opens.")).catch((e) => toast.error(errMsg(e)))}>
                            Join waiting list
                          </Button>)} />
                      ) : (
                        <>
                          <p className="mb-4 font-semibold">{format(date, 'EEEE, MMMM d')} <span className="text-xs font-normal muted">· times in shop local time</span></p>
                          <SlotGrid slots={slots} value={startAt} onChange={setStartAt} timezone={tz} />
                        </>
                      )}
                  </Card>
                </div>
              )}

              {step === 3 && (
                <Card className="space-y-4 p-5">
                  {!user && (
                    <>
                      <div className="flex items-center justify-between rounded-xl bg-brass-400/10 p-3 text-sm">
                        <span className="flex items-center gap-2"><User className="h-4 w-4 text-brass-500" />Booking as a guest</span>
                        <Link to="/login" state={{ from: '/book' }} className="font-semibold text-brass-500 hover:underline">Sign in to earn points</Link>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Full name"><Input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} autoComplete="name" /></Field>
                        <Field label="Email"><Input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} autoComplete="email" /></Field>
                        <Field label="Phone"><Input type="tel" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} autoComplete="tel" placeholder="+91 98200 00000" /></Field>
                      </div>
                    </>
                  )}
                  <Field label="Notes for your barber" hint="e.g. 'Keep length on top, #1 on sides'">
                    <Textarea value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} maxLength={500} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Coupon code" error={details.couponCode && quote?.error?.toLowerCase().includes('coupon') ? quote.error : null}>
                      <div className="relative">
                        <Tag className="absolute left-3 top-3 h-4 w-4 muted" />
                        <input className="input pl-9 uppercase" value={details.couponCode} placeholder="WELCOME10" onChange={(e) => setDetails({ ...details, couponCode: e.target.value.toUpperCase() })} />
                      </div>
                    </Field>
                    {user?.role === 'customer' && (
                      <Field label={`Redeem points (you have ${user.loyalty_points})`} hint={`Min ${pub?.settings.loyalty_min_redeem ?? 100} points · 100 pts = ${money(100 * (pub?.settings.loyalty_redeem_rate ?? 0.5))}`}
                        error={details.redeemPoints > 0 && quote?.error?.toLowerCase().includes('point') ? quote.error : null}>
                        <Input type="number" min={0} step={50} max={user.loyalty_points} value={details.redeemPoints || ''}
                          onChange={(e) => setDetails({ ...details, redeemPoints: Math.max(0, Number(e.target.value)) })} />
                      </Field>
                    )}
                  </div>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Summary */}
        <aside>
          <Card className="sticky top-24 p-5">
            <p className="font-display text-lg font-bold">Your booking</p>
            <div className="mt-4 space-y-3 text-sm">
              {selectedServices.length === 0 && <p className="muted">No services selected yet.</p>}
              {priced.map((s) => (
                <div key={s.id} className="flex justify-between"><span>{s.name}</span><span className="muted">{money(s.price)}</span></div>
              ))}
              {barber && <div className="flex items-center gap-2 border-t border-black/5 pt-3 dark:border-white/5"><Avatar src={barber.photo_url} name={barber.name} size="sm" /><span>{barber.name}</span></div>}
              {startAt && <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-brass-400" />{fmtDateTime(startAt, tz)} · {duration} min</p>}
              {step === 3 && quote && !quote.error && (
                <div className="space-y-1.5 border-t border-black/5 pt-3 dark:border-white/5">
                  <Row label="Subtotal" value={money(quote.subtotal)} />
                  {quote.membershipDiscount > 0 && <Row label={`${quote.membership.plan} (−${quote.membership.discountPercent}%)`} value={`−${money(quote.membershipDiscount)}`} green />}
                  {quote.couponDiscount > 0 && <Row label={`Coupon ${quote.coupon.code}`} value={`−${money(quote.couponDiscount)}`} green />}
                  {quote.pointsDiscount > 0 && <Row label={`${quote.pointsUsed} points`} value={`−${money(quote.pointsDiscount)}`} green />}
                  <Row label={`GST (${quote.taxRate}%)`} value={money(quote.tax)} />
                  <div className="flex justify-between pt-2 text-base font-bold"><span>Total</span><span>{money(quote.total)}</span></div>
                </div>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              {step > 0 && <Button variant="secondary" onClick={() => go(step - 1)} aria-label="Back"><ChevronLeft className="h-4 w-4" /></Button>}
              {step < 3 ? (
                <Button className="flex-1" disabled={!canNext} onClick={() => go(step + 1)}>Continue</Button>
              ) : (
                <Button className="flex-1" loading={submitting} onClick={submit}>Confirm booking</Button>
              )}
            </div>
            {step === 3 && <p className="mt-3 text-center text-xs muted">Pay online after booking or in-store. Free cancellation up to 4h before.</p>}
            {!user && step === 0 && <button onClick={() => navigate('/guest-booking')} className="mt-3 w-full text-center text-xs text-brass-500 hover:underline">Manage an existing guest booking</button>}
          </Card>
        </aside>
      </div>
    </div>
  );
}

const Row = ({ label, value, green }) => (
  <div className="flex justify-between"><span className="muted">{label}</span><span className={green ? 'text-emerald-600 dark:text-emerald-400' : ''}>{value}</span></div>
);

function Success({ appt, user }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brass-400 shadow-glow">
        <PartyPopper className="h-10 w-10 text-ink-900" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h1 className="mt-6 text-3xl font-bold">{appt.status === 'confirmed' ? "You're booked!" : 'Request sent!'}</h1>
        <p className="mt-2 muted">
          {appt.status === 'confirmed'
            ? `See you ${fmtDateTime(appt.start_at, appt.timezone)} with ${appt.barber_name}.`
            : `${appt.barber_name} will confirm your ${fmtDateTime(appt.start_at, appt.timezone)} appointment shortly. We'll notify you.`}
        </p>
        <Card className="mt-6 p-6">
          {appt.qr && <img src={appt.qr} alt="Check-in QR code" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />}
          <p className="mt-3 text-xs uppercase tracking-widest muted">Check-in code</p>
          <p className="font-mono text-3xl font-bold tracking-[.3em] text-brass-500">{appt.checkin_code}</p>
          <p className="mt-2 text-xs muted">Show this at the front desk or scan at the kiosk. {!user && 'Use it with your email to manage your booking.'}</p>
          <div className="mt-4 flex justify-between border-t border-black/5 pt-4 text-sm dark:border-white/5"><span className="muted">Total</span><span className="font-bold">{money(appt.total)}</span></div>
        </Card>
        <div className="mt-6 flex justify-center gap-3">
          {user ? <Link to="/dashboard/appointments" className="btn-primary">View & pay</Link> : <Link to="/register" className="btn-primary">Create account</Link>}
          <Link to="/" className="btn-secondary">Back home</Link>
        </div>
      </motion.div>
    </div>
  );
}
