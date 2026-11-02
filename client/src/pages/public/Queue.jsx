/** Public live walk-in queue — lobby display + "join the queue" form. Updates in real time. */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFetch } from '../../hooks/useFetch';
import { api, errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { Badge, Button, Card, Field, Input, Select, EmptyState } from '../../components/ui';

export default function Queue() {
  const { data: loc } = useFetch('/locations');
  const { data: svc } = useFetch('/services');
  const [locationId, setLocationId] = useState('');
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', serviceId: '' });
  const [mine, setMine] = useState(null);

  useEffect(() => { if (loc?.locations[0] && !locationId) setLocationId(loc.locations[0].id); }, [loc, locationId]);
  useEffect(() => {
    if (!locationId) return;
    const load = () => api.get('/queue', { params: { locationId } }).then((r) => setQueue(r.data.queue));
    load();
    const socket = getSocket();
    socket.emit('subscribe', `location:${locationId}`);
    socket.on('queue:updated', load);
    return () => { socket.off('queue:updated', load); socket.emit('unsubscribe', `location:${locationId}`); };
  }, [locationId]);

  const join = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/queue', { locationId, name: form.name, phone: form.phone || undefined, serviceId: form.serviceId || undefined });
      setMine(data.entry);
      toast.success(`You're #${data.entry.position} in line`);
    } catch (err) { toast.error(errMsg(err)); }
  };

  const waiting = queue.filter((q) => q.status === 'waiting');
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-4xl font-bold">Live walk-in queue</h1><p className="mt-2 muted">No appointment? Join the line from your phone and we'll text you when you're up.</p></div>
        <Select aria-label="Choose location" value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ maxWidth: 260 }}>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="mb-4 flex gap-6">
            <p className="flex items-center gap-2"><Users className="h-5 w-5 text-brass-400" /><b>{waiting.length}</b> waiting</p>
            <p className="flex items-center gap-2"><Timer className="h-5 w-5 text-brass-400" />~<b>{waiting.at(-1)?.est_wait_min ?? 0}</b> min wait</p>
          </div>
          {queue.length === 0 ? <EmptyState title="No one in line" text="Walk right in!" /> : (
            <ul className="space-y-2">
              <AnimatePresence>
                {queue.map((q) => (
                  <motion.li key={q.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                    className={`flex items-center gap-4 rounded-xl p-3 ${mine?.id === q.id ? 'bg-brass-400/15 ring-1 ring-brass-400' : 'bg-black/[.03] dark:bg-white/5'}`}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 font-display text-lg font-bold text-brass-400">{q.position}</span>
                    <div className="flex-1"><p className="font-semibold">{q.name}</p><p className="text-xs muted">{q.service_name || 'Any service'}{q.barber_name && ` · ${q.barber_name}`}</p></div>
                    {q.status === 'serving' ? <Badge status="serving">In the chair</Badge> : <span className="text-sm muted">~{q.est_wait_min} min</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
        <Card className="h-fit p-6">
          <h2 className="text-xl font-bold">Join the queue</h2>
          {mine ? <p className="mt-3 text-sm">You're in! Keep this page open — your spot updates live. Position <b>#{queue.find((q) => q.id === mine.id)?.position ?? mine.position}</b>.</p> : (
            <form onSubmit={join} className="mt-4 space-y-4">
              <Field label="Your name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Mobile (for SMS alert)"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Service"><Select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
                <option value="">Decide at the chair</option>{svc?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Button type="submit" className="w-full">Join line</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
