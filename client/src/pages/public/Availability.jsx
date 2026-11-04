/**
 * "See who's free" — pick any day (and optionally a service / shop) and see every
 * open time slot with the barbers available at that time. Two views:
 *   • By time   — each time slot lists the barbers free then
 *   • By barber — each barber lists their open times
 * Choosing a slot opens the booking flow with service, barber, date and time pre-filled.
 * Updates live when bookings change (Socket.IO).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { CalendarSearch, Clock, MapPin, Users, Scissors } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { getSocket } from '../../lib/socket';
import { money, fmtTime, hourIn } from '../../lib/format';
import { Avatar, Card, EmptyState, PageLoader, Select, Stars, Tabs, cn } from '../../components/ui';

const DAYS_AHEAD = 14;

export default function Availability() {
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  const [date, setDate] = useState(today);
  const [serviceId, setServiceId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [view, setView] = useState('time');
  const [part, setPart] = useState('all');

  const { data: svc } = useFetch('/services');
  const { data: loc } = useFetch('/locations');
  useEffect(() => { if (svc && !serviceId) setServiceId(svc.services[0]?.id || ''); }, [svc, serviceId]);

  const dateStr = format(date, 'yyyy-MM-dd');
  const { data, loading, reload } = useFetch(serviceId ? '/barbers/availability' : null, {
    params: { date: dateStr, serviceId, locationId: locationId || undefined },
  });

  // Live refresh: any booking change for a listed barber reloads the view
  useEffect(() => {
    if (!data?.barbers?.length) return;
    const socket = getSocket();
    const rooms = data.barbers.map((b) => `barber:${b.id}`);
    rooms.forEach((r) => socket.emit('subscribe', r));
    socket.on('slots:changed', reload);
    return () => { socket.off('slots:changed', reload); rooms.forEach((r) => socket.emit('unsubscribe', r)); };
  }, [data, reload]);

  // If today has nothing left (late in the day), jump once to the next day with openings
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (!data || autoAdvanced.current) return;
    autoAdvanced.current = true;
    if (!data.times.length && isSameDay(date, today)) setDate(addDays(today, 1));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tz = data?.timezone;
  const service = svc?.services.find((s) => s.id === serviceId);
  const barbersById = useMemo(() => Object.fromEntries((data?.barbers || []).map((b) => [b.id, b])), [data]);
  const inPart = (start) => {
    if (part === 'all') return true;
    const h = hourIn(start, tz);
    return part === 'morning' ? h < 12 : part === 'afternoon' ? h >= 12 && h < 17 : h >= 17;
  };
  const times = (data?.times || []).filter((t) => inPart(t.start));
  const freeBarbers = (data?.barbers || []).filter((b) => b.slots.some((s) => inPart(s.start)));

  // Price range for the chosen service (senior barbers may charge more)
  const prices = (data?.barbers || []).map((b) => b.price).filter((x) => x !== null);
  const priceText = prices.length ? (Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} – ${money(Math.max(...prices))} depending on barber`) : null;

  const book = (barberId, start) => navigate(`/book?service=${serviceId}&barber=${barberId}&date=${dateStr}&start=${encodeURIComponent(start)}`);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">See who&apos;s free</h1>
          <p className="mt-1 muted">Pick a day to see every open time and the barbers available. Tap a barber to book.</p>
        </div>
        <Link to="/book" className="btn-secondary self-start sm:self-auto">Full booking flow</Link>
      </div>

      {/* Day strip */}
      <div className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Choose a day">
        {days.map((d) => {
          const sel = isSameDay(d, date);
          return (
            <button key={d.toISOString()} role="tab" aria-selected={sel} onClick={() => setDate(d)}
              className={cn('flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition',
                sel ? 'border-brass-400 bg-brass-400 text-ink-900 shadow-glow' : 'border-black/10 hover:border-brass-400 dark:border-white/10')}>
              <span className="text-[11px] font-semibold uppercase">{isSameDay(d, today) ? 'Today' : format(d, 'EEE')}</span>
              <span className="font-display text-xl font-bold">{format(d, 'd')}</span>
              <span className="text-[11px] opacity-70">{format(d, 'MMM')}</span>
            </button>
          );
        })}
        <label className="flex w-36 shrink-0 cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-black/15 px-2 text-center text-xs dark:border-white/15">
          <span className="flex items-center justify-center gap-1 font-semibold"><CalendarSearch className="h-3.5 w-3.5" />Other date</span>
          <input type="date" className="mt-1 w-full bg-transparent text-center text-xs" aria-label="Pick another date"
            min={format(today, 'yyyy-MM-dd')} max={format(addDays(today, 60), 'yyyy-MM-dd')} value={dateStr}
            onChange={(e) => { if (e.target.value) { const [y, m, dd] = e.target.value.split('-').map(Number); setDate(new Date(y, m - 1, dd)); } }} />
        </label>
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Select aria-label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {svc?.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min</option>)}
        </Select>
        <Select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Tabs value={view} onChange={setView} tabs={[{ value: 'time', label: 'By time' }, { value: 'barber', label: 'By barber' }]} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={part} onChange={setPart} tabs={[{ value: 'all', label: 'All day' }, { value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} />
        {data && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm muted">
            {service && priceText && <span className="flex items-center gap-1.5"><Scissors className="h-4 w-4" />{service.name}: {priceText}</span>}
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{times.length} open times</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{freeBarbers.length} barbers free</span>
          </p>
        )}
      </div>

      <div className="mt-6">
        {!data || (loading && !data) ? <PageLoader /> : times.length === 0 ? (
          <EmptyState icon={CalendarSearch} title={isSameDay(date, today) ? 'No more open times today' : `No open times on ${format(date, 'EEEE, MMM d')}`}
            text={data.barbers.length ? 'Everyone is booked or off this day. Try another day or service.' : 'No barber offers this service at the chosen location.'} />
        ) : view === 'time' ? (
          <div className="space-y-2">
            {times.map((t, i) => (
              <motion.div key={t.start} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }}>
                <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
                  <div className="flex w-28 shrink-0 items-baseline gap-2">
                    <span className="font-display text-xl font-bold">{fmtTime(t.start, tz)}</span>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {t.barbers.map((id) => {
                      const b = barbersById[id];
                      return (
                        <button key={id} onClick={() => book(id, t.start)} title={`Book ${b.name} at ${fmtTime(t.start, tz)}`}
                          className="group flex items-center gap-2 rounded-full border border-black/10 py-1 pl-1 pr-3 text-sm transition hover:border-brass-400 hover:bg-brass-400/10 dark:border-white/10">
                          <Avatar src={b.photo_url} name={b.name} size="sm" />
                          <span className="font-semibold">{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.barbers.map((b) => {
              const slots = b.slots.filter((s) => inPart(s.start));
              return (
                <Card key={b.id} className={cn('p-5', !slots.length && 'opacity-60')}>
                  <div className="flex items-center gap-3">
                    <Avatar src={b.photo_url} name={b.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/barbers/${b.id}`} className="font-display text-lg font-bold hover:text-brass-500">{b.name}</Link>
                      <p className="text-xs muted">{b.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs muted">
                        <span className="flex items-center gap-1"><Stars value={b.rating_avg} size={10} />{Number(b.rating_avg).toFixed(1)}</span>
                        {b.location_name && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{b.location_name}</span>}
                        {b.price !== null && <span className="flex items-center gap-1"><Scissors className="h-3 w-3" />{service?.name}: {money(b.price)} · {b.duration_min} min</span>}
                      </div>
                    </div>
                  </div>
                  {slots.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {slots.map((s) => (
                        <button key={s.start} onClick={() => book(b.id, s.start)}
                          className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-semibold transition hover:border-brass-400 hover:bg-brass-400 hover:text-ink-900 dark:border-white/10">
                          {fmtTime(s.start, tz)}
                        </button>
                      ))}
                    </div>
                  ) : <p className="mt-4 text-sm muted">{b.reason || 'Fully booked'}{part !== 'all' && b.slots.length ? ' in this part of the day' : ''}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {service && data && <p className="mt-6 text-center text-xs muted">Times are shown in shop time.</p>}
    </div>
  );
}
