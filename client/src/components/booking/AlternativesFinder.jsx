/**
 * "Can't find your time?" — the customer names the time they want; we return real,
 * bookable alternatives (same time with another barber, an express shorter service at
 * that exact time, nearest times that day, or a similar time on another day).
 * Suggestions are ranked and explained by AI when configured.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Clock, CalendarDays, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, money } from '../../lib/format';
import { Avatar, Button, Select, cn } from '../ui';

// Shop hours are 10:00–20:00 by default; offer 15-minute steps across the whole day
const TIMES = Array.from({ length: 4 * 14 }, (_, i) => {
  const h = 8 + Math.floor(i / 4); const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});
const label12 = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

const TYPE = {
  exact: { icon: UserRound, label: 'Your time, another barber' },
  express: { icon: Zap, label: 'Your time, express service' },
  same_day: { icon: Clock, label: 'Same day, nearby time' },
  other_day: { icon: CalendarDays, label: 'Another day' },
};

export default function AlternativesFinder({ serviceIds, barberId, date, onPick, defaultTime = '11:00', autoOpen = false }) {
  const [time, setTime] = useState(defaultTime);
  const [notes, setNotes] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(autoOpen);

  const find = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/appointments/alternatives', {
        serviceIds, barberId: barberId || undefined, date: format(date, 'yyyy-MM-dd'), time, notes: notes.trim() || undefined,
      });
      setRes(data);
      if (data.requestedAvailable) toast.success('Good news: that exact time is free. Pick it from the list.');
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brass-400/50 p-3 text-sm font-semibold text-brass-600 hover:bg-brass-400/10 dark:text-brass-300">
        <Sparkles className="h-4 w-4" /> Need a specific time? Let us find you a slot
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-brass-400/40 bg-brass-400/5 p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brass-500" />Tell us when you&apos;d like to come</p>
      <p className="mt-1 text-xs muted">We&apos;ll find the closest real opening: another barber at your time, a quicker express service, or the nearest time or day.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="w-36"><Select aria-label="Preferred time" value={time} onChange={(e) => setTime(e.target.value)}>
          {TIMES.map((t) => <option key={t} value={t}>{label12(t)}</option>)}
        </Select></div>
        <input className="input min-w-[160px] flex-1" placeholder="Anything we should know? (optional)" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
        <Button loading={loading} onClick={find}>Find me a slot</Button>
      </div>

      {res && (
        <div className="mt-4 grid gap-2 lg:grid-cols-2" aria-live="polite">
          <p className="text-sm lg:col-span-2">{res.message}</p>
          {res.options.map((o, i) => {
            const T = TYPE[o.type];
            return (
              <motion.button key={o.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                onClick={() => onPick(o)}
                className={cn('flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left transition hover:border-brass-400 dark:bg-ink-900',
                  o.express ? 'border-brass-400/60' : 'border-black/10 dark:border-white/10')}>
                <Avatar src={o.photo_url} name={o.barberName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold">{fmtDateTime(o.start, res.timezone)}</span>
                    <span className="text-sm muted">with {o.barberName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-royal-500/10 px-2 py-0.5 text-[11px] font-semibold text-royal-600 dark:text-royal-300"><T.icon className="h-3 w-3" />{T.label}</span>
                  </span>
                  <span className="mt-0.5 block text-sm">{o.reason}</span>
                  <span className="mt-0.5 block text-xs muted">{o.durationMin} min{o.express ? ` (instead of ${o.fullDurationMin})` : ''} · {money(o.price)}</span>
                </span>
                <span className="self-center text-sm font-semibold text-brass-600 dark:text-brass-300">Book →</span>
              </motion.button>
            );
          })}
          {!res.options.length && <p className="text-sm muted lg:col-span-2">Try another day, or join the waiting list.</p>}
          <p className="text-[11px] muted lg:col-span-2">{res.source === 'ai' ? 'Suggestions picked by our AI booking assistant' : 'Closest options first'} · every option is a real opening</p>
        </div>
      )}
    </div>
  );
}
