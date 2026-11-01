/** Working hours editor + vacation / unavailable dates. */
import { useEffect, useState } from 'react';
import { Trash2, Plane } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { DAYS, fmtDate } from '../../lib/format';
import { Button, Card, Field, Input, PageHeader, PageLoader, Toggle, EmptyState } from '../../components/ui';

export default function BarberSchedule() {
  const { data, reload } = useFetch('/barbers/me');
  const [hours, setHours] = useState(null);
  const [off, setOff] = useState({ start_date: '', end_date: '', reason: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setHours(data.hours.map((h) => ({ ...h, start_time: h.start_time.slice(0, 5), end_time: h.end_time.slice(0, 5), break_start: h.break_start?.slice(0, 5) || '', break_end: h.break_end?.slice(0, 5) || '' }))); }, [data]);
  if (!data || !hours) return <PageLoader />;

  const set = (i, patch) => setHours(hours.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/barbers/me/hours', { hours: hours.map((h) => ({ day_of_week: h.day_of_week, is_off: h.is_off, start_time: h.start_time, end_time: h.end_time, break_start: h.break_start || null, break_end: h.break_end || null })) });
      toast.success('Working hours saved — availability updated live');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const addOff = async (e) => {
    e.preventDefault();
    try {
      const { data: r } = await api.post('/barbers/me/time-off', { ...off, end_date: off.end_date || off.start_date, reason: off.reason || undefined });
      toast.success('Time off added'); if (r.warning) toast(r.warning, { icon: '⚠️', duration: 8000 });
      setOff({ start_date: '', end_date: '', reason: '' }); reload();
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <>
      <PageHeader title="Hours & time off" subtitle="Customers can only book inside these hours." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <div className="space-y-3">
            {hours.map((h, i) => (
              <div key={h.day_of_week} className="grid grid-cols-2 items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/5 md:grid-cols-[120px_90px_1fr_1fr]">
                <p className="font-semibold">{DAYS[h.day_of_week]}</p>
                <Toggle checked={!h.is_off} onChange={(v) => set(i, { is_off: !v })} label={<span className="text-xs muted">{h.is_off ? 'Off' : 'Open'}</span>} />
                {!h.is_off && <>
                  <div className="col-span-2 flex items-center gap-2 md:col-span-1"><span className="w-12 text-xs muted">Hours</span><input type="time" className="input py-1.5" value={h.start_time} onChange={(e) => set(i, { start_time: e.target.value })} /><span>–</span><input type="time" className="input py-1.5" value={h.end_time} onChange={(e) => set(i, { end_time: e.target.value })} /></div>
                  <div className="col-span-2 flex items-center gap-2 md:col-span-1"><span className="w-12 text-xs muted">Break</span><input type="time" className="input py-1.5" value={h.break_start} onChange={(e) => set(i, { break_start: e.target.value })} /><span>–</span><input type="time" className="input py-1.5" value={h.break_end} onChange={(e) => set(i, { break_end: e.target.value })} /></div>
                </>}
              </div>
            ))}
          </div>
          <Button className="mt-5" loading={busy} onClick={save}>Save hours</Button>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Plane className="h-5 w-5 text-brass-400" />Add vacation / day off</h2>
            <form onSubmit={addOff} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><Input type="date" required value={off.start_date} onChange={(e) => setOff({ ...off, start_date: e.target.value })} /></Field>
                <Field label="To"><Input type="date" value={off.end_date} min={off.start_date} onChange={(e) => setOff({ ...off, end_date: e.target.value })} /></Field>
              </div>
              <Field label="Reason"><Input placeholder="Vacation, training…" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></Field>
              <Button type="submit" variant="secondary" className="w-full">Block dates</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-bold">Upcoming time off</h2>
            <div className="mt-3 space-y-2">
              {data.timeOff.length === 0 ? <EmptyState title="No time off scheduled" /> : data.timeOff.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5">
                  <div><p className="font-semibold">{fmtDate(t.start_date, 'MMM d', null)}{t.end_date !== t.start_date && ` – ${fmtDate(t.end_date, 'MMM d', null)}`}</p><p className="text-xs muted">{t.reason || 'Unavailable'}</p></div>
                  <button className="btn-ghost p-2 text-red-500" aria-label="Remove" onClick={async () => { await api.delete(`/barbers/me/time-off/${t.id}`); reload(); }}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
