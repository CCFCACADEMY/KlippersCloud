/** Staff view of the walk-in queue (barbers & admins): call next, mark done, convert to appointment. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useFetch } from '../../hooks/useFetch';
import { ago } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Select } from '../../components/ui';
import WalkInModal from '../../components/appointments/WalkInModal';
import { useAuth } from '../../context/AuthContext';

export default function StaffQueue() {
  const { data: loc } = useFetch('/locations');
  const [locationId, setLocationId] = useState('');
  const [queue, setQueue] = useState([]);
  const [walkIn, setWalkIn] = useState(null);
  const { user } = useAuth();
  useEffect(() => { if (loc && !locationId) setLocationId(user?.location_id || loc.locations[0]?.id); }, [loc, locationId, user]);
  const load = useCallback(() => locationId && api.get('/queue', { params: { locationId } }).then((r) => setQueue(r.data.queue)), [locationId]);
  useEffect(() => {
    if (!locationId) return;
    load();
    const s = getSocket();
    s.emit('subscribe', `location:${locationId}`);
    s.on('queue:updated', load);
    return () => s.off('queue:updated', load);
  }, [locationId, load]);

  const setStatus = async (q, status) => {
    try { await api.patch(`/queue/${q.id}`, { status }); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <>
      <PageHeader title="Walk-ins & queue" subtitle="Live lobby queue. Customers can join from /queue on their phone."
        actions={<><Select aria-label="Choose location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
          <Button onClick={() => setWalkIn({})}><Plus className="h-4 w-4" />Walk-in</Button><Link to="/queue" target="_blank" className="btn-secondary">Lobby display</Link></>} />
      <Card className="p-4">
        {queue.length === 0 ? <EmptyState title="Queue is empty" /> : (
          <div className="space-y-2">
            {queue.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 font-bold text-brass-400">{q.position}</span>
                <div className="min-w-[160px] flex-1"><p className="font-semibold">{q.name} {q.phone && <span className="text-xs font-normal muted">· {q.phone}</span>}</p>
                  <p className="text-xs muted">{q.service_name || 'Any service'} · joined {ago(q.joined_at)} {q.barber_name && `· ${q.barber_name}`}</p></div>
                <Badge status={q.status} />
                {q.status === 'waiting' && <Button className="py-1.5 text-xs" onClick={() => setStatus(q, 'serving')}>Call next</Button>}
                {q.status === 'serving' && <>
                  <Button variant="secondary" className="py-1.5 text-xs" onClick={() => setWalkIn({ name: q.name, phone: q.phone || '', serviceId: q.service_id || '', queueId: q.id })}>Add to calendar</Button>
                  <Button className="py-1.5 text-xs" onClick={() => setStatus(q, 'done')}>Done</Button></>}
                <Button variant="ghost" className="py-1.5 text-xs" onClick={() => setStatus(q, 'left')}>Left</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {walkIn && <WalkInModal open defaults={walkIn} onClose={() => setWalkIn(null)} onDone={() => walkIn.queueId && setStatus({ id: walkIn.queueId }, 'done')} />}
    </>
  );
}
