import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { Button, EmptyState, PageHeader, PageLoader, Tabs } from '../../components/ui';
import AppointmentCard from '../../components/appointments/AppointmentCard';

export default function MyAppointments() {
  const [scope, setScope] = useState('upcoming');
  const [limit, setLimit] = useState(20);
  useEffect(() => setLimit(20), [scope]);
  const { data, reload, loading } = useFetch('/appointments', { params: { scope, limit } });
  const { data: wl, reload: reloadWl } = useFetch('/me/waitlist');
  return (
    <>
      <PageHeader title="My appointments" subtitle="Reschedule, cancel, pay or review your visits." actions={<Link to="/book" className="btn-primary">New booking</Link>} />
      <Tabs value={scope} onChange={setScope} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'History' }, { value: 'all', label: 'All' }]} />
      <div className="mt-6 space-y-4">
        {loading && !data ? <PageLoader /> : data?.appointments.length === 0 ? <EmptyState title="No appointments here" /> :
          data?.appointments.map((a) => <AppointmentCard key={a.id} appt={a} onChange={() => { reload(); reloadWl(); }} />)}
        {data && data.appointments.length < data.total && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className="text-sm muted">Showing {data.appointments.length} of {data.total}</span>
            <Button variant="secondary" loading={loading} onClick={() => setLimit((l) => Math.min(l + 20, 100))} disabled={limit >= 100}>Show more</Button>
          </div>
        )}
      </div>
      {wl?.waitlist.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Waiting list</h2>
          {wl.waitlist.map((w) => (
            <div key={w.id} className="card mb-2 flex items-center justify-between p-4 text-sm">
              <span>{w.service_name} · {w.desired_date} {w.barber_name && `· ${w.barber_name}`}</span>
              <span className="flex items-center gap-3">
                {w.status === 'notified' ? <Link to={`/book${w.barber_id ? `?barber=${w.barber_id}` : ''}`} className="font-semibold text-brass-500 hover:underline">🔔 Slot opened: book now</Link> : <span className="muted">Waiting</span>}
                <button className="text-xs text-red-500 hover:underline" onClick={async () => {
                  try { await api.delete(`/me/waitlist/${w.id}`); toast.success('Removed from waiting list'); reloadWl(); } catch (e) { toast.error(errMsg(e)); }
                }}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
