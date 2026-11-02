/**
 * Day / Week / Month calendar for barbers and admins.
 * Fetches /appointments/calendar for the visible range and positions events
 * on a time grid (day/week) or as chips (month). Clicking an event opens the
 * full appointment card with staff actions. Live-refreshes via Socket.IO.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfDay, startOfMonth, startOfWeek, differenceInMinutes,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { fmtTime, inTz } from '../../lib/format';
import { Button, Card, Modal, Tabs, cn } from '../ui';
import AppointmentCard from '../appointments/AppointmentCard';

const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_PX = 64;

const EVENT_COLORS = {
  pending: 'border-l-amber-400 bg-amber-400/15',
  confirmed: 'border-l-emerald-500 bg-emerald-500/15',
  checked_in: 'border-l-sky-500 bg-sky-500/15',
  in_progress: 'border-l-indigo-500 bg-indigo-500/15',
  completed: 'border-l-brass-400 bg-brass-400/15',
  no_show: 'border-l-red-500 bg-red-500/10',
};

export default function CalendarView({ barberId, role = 'barber', defaultView = 'week' }) {
  // Day view suits phones; week/month need the width
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : defaultView));
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);

  const range = useMemo(() => {
    if (view === 'day') return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
    if (view === 'week') return [startOfWeek(cursor), addDays(startOfWeek(cursor), 7)];
    return [startOfWeek(startOfMonth(cursor)), addDays(endOfWeek(endOfMonth(cursor)), 1)];
  }, [view, cursor]);

  // Ignore responses from older requests (fast view switching could otherwise show stale events)
  const latest = useRef(0);
  const load = useCallback(async () => {
    const reqId = ++latest.current;
    const { data } = await api.get('/appointments/calendar', {
      params: { from: range[0].toISOString(), to: range[1].toISOString(), barberId: barberId || undefined },
    });
    if (reqId === latest.current) setEvents(data.events);
  }, [range, barberId]);

  useEffect(() => { load(); }, [load]);

  // Live updates for the barber's room
  useEffect(() => {
    if (!barberId) return;
    const s = getSocket();
    s.emit('subscribe', `barber:${barberId}`);
    s.on('slots:changed', load); s.on('appointment:updated', load);
    return () => { s.off('slots:changed', load); s.off('appointment:updated', load); };
  }, [barberId, load]);

  const move = (dir) => setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)));
  const days = eachDayOfInterval({ start: range[0], end: addDays(range[1], -1) });
  const title = view === 'month' ? format(cursor, 'MMMM yyyy') : view === 'week'
    ? `${format(range[0], 'MMM d')} – ${format(addDays(range[1], -1), 'MMM d, yyyy')}` : format(cursor, 'EEEE, MMMM d, yyyy');

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-black/5 p-4 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setCursor(new Date())}>Today</Button>
          <button className="btn-ghost p-1.5" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
          <button className="btn-ghost p-1.5" onClick={() => move(1)} aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
          <h2 className="ml-1 font-display text-lg font-bold">{title}</h2>
        </div>
        <Tabs value={view} onChange={setView} tabs={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>

      {view === 'month' ? (
        <div className="grid grid-cols-7">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="border-b border-black/5 py-2 text-center text-xs font-semibold uppercase muted dark:border-white/5">{d}</div>)}
          {days.map((day) => {
            const list = events.filter((e) => isSameDay(inTz(e.start_at, e.timezone || undefined), day));
            return (
              <button key={day.toISOString()} onClick={() => { setCursor(day); setView('day'); }}
                className={cn('min-h-[96px] border-b border-r border-black/5 p-1.5 text-left align-top transition hover:bg-black/[.02] dark:border-white/5 dark:hover:bg-white/[.03]',
                  !isSameMonth(day, cursor) && 'opacity-40')}>
                <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', isToday(day) && 'bg-brass-400 text-ink-900')}>{format(day, 'd')}</span>
                <div className="mt-1 space-y-0.5">
                  {list.slice(0, 3).map((e) => (
                    <div key={e.id} className={cn('truncate rounded border-l-2 px-1 text-[11px]', EVENT_COLORS[e.status])}>
                      {fmtTime(e.start_at, e.timezone || undefined)} {e.customer_name}
                    </div>
                  ))}
                  {list.length > 3 && <div className="px-1 text-[11px] font-semibold text-brass-500">+{list.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]" style={{ minWidth: view === 'day' ? 0 : undefined }}>
            {/* Header row */}
            <div className="grid border-b border-black/5 dark:border-white/5" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className="py-2 text-center">
                  <p className="text-xs uppercase muted">{format(d, 'EEE')}</p>
                  <p className={cn('mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-bold', isToday(d) && 'bg-brass-400 text-ink-900')}>{format(d, 'd')}</p>
                </div>
              ))}
            </div>
            {/* Time grid */}
            <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div key={i} className="pr-2 text-right text-[11px] muted" style={{ height: HOUR_PX }}>{format(new Date(2000, 0, 1, START_HOUR + i), 'h a')}</div>
                ))}
              </div>
              {days.map((d) => (
                <div key={d.toISOString()} className="relative border-l border-black/5 dark:border-white/5">
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <div key={i} className="border-b border-black/5 dark:border-white/5" style={{ height: HOUR_PX }} />)}
                  {isToday(d) && <NowLine />}
                  {(() => { const dayEvents = events.filter((e) => isSameDay(inTz(e.start_at, e.timezone || undefined), d)); const lay = layoutDay(dayEvents); return dayEvents.map((e) => {
                    const s = inTz(e.start_at, e.timezone || undefined);
                    const top = ((s.getHours() - START_HOUR) * 60 + s.getMinutes()) * (HOUR_PX / 60);
                    const height = Math.max(22, differenceInMinutes(new Date(e.end_at), new Date(e.start_at)) * (HOUR_PX / 60) - 2);
                    return (
                      <button key={e.id} onClick={() => setSelected(e)} title={`${e.customer_name} · ${fmtTime(e.start_at, e.timezone || undefined)} · ${e.services.map((x) => x.name).join(', ')}`}
                        style={{ top, height, left: `calc(${(lay[e.id].lane / lay[e.id].lanes) * 100}% + 2px)`, width: `calc(${100 / lay[e.id].lanes}% - 4px)` }}
                        className={cn('absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:z-10 hover:shadow-md', EVENT_COLORS[e.status])}>
                        <p className="truncate font-semibold">{e.customer_name}</p>
                        <p className="truncate muted">{fmtTime(e.start_at, e.timezone || undefined)} · {e.services.map((x) => x.name).join(', ')}</p>
                        {!barberId && <p className="truncate text-brass-600 dark:text-brass-300">{e.barber_name}</p>}
                      </button>
                    );
                  })})()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-black/5 p-3 text-xs dark:border-white/5">
        {Object.entries(EVENT_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1.5 capitalize"><span className={cn('h-3 w-3 rounded border-l-4', c)} />{k.replace('_', ' ')}</span>)}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Appointment" wide>
        {selected && <AppointmentCard appt={selected} role={role} onChange={() => { setSelected(null); load(); }} />}
      </Modal>
    </Card>
  );
}

/**
 * Place overlapping events side by side: greedy lane assignment within each
 * cluster of overlapping events; every event in a cluster shares its lane count.
 */
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const out = {};
  let cluster = []; let clusterEnd = 0; let lanesEnd = [];
  const flush = () => { const n = lanesEnd.length || 1; cluster.forEach((id) => { out[id].lanes = n; }); cluster = []; lanesEnd = []; };
  for (const e of sorted) {
    const s = new Date(e.start_at).getTime(); const en = new Date(e.end_at).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    let lane = lanesEnd.findIndex((end) => end <= s);
    if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(en); } else lanesEnd[lane] = en;
    out[e.id] = { lane, lanes: 1 };
    cluster.push(e.id); clusterEnd = Math.max(clusterEnd, en);
  }
  flush();
  return out;
}

function NowLine() {
  const now = inTz(new Date());
  const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60);
  if (top < 0 || now.getHours() >= END_HOUR) return null;
  return <div className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-pole-red" style={{ top }}><span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-pole-red" /></div>;
}
