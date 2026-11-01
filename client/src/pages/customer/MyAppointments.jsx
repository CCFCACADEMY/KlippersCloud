import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { EmptyState, PageHeader, PageLoader, Tabs } from '../../components/ui';
import AppointmentCard from '../../components/appointments/AppointmentCard';

export default function MyAppointments() {
  const [scope, setScope] = useState('upcoming');
  const { data, reload, loading } = useFetch('/appointments', { params: { scope } });
  const { data: wl, reload: reloadWl } = useFetch('/me/waitlist');
  return (
    <>
      <PageHeader title="My appointments" subtitle="Reschedule, cancel, pay or review your visits." actions={<Link to="/book" className="btn-primary">New booking</Link>} />
      <Tabs value={scope} onChange={setScope} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'History' }, { value: 'all', label: 'All' }]} />
      <div className="mt-6 space-y-4">
        {loading && !data ? <PageLoader /> : data?.appointments.length === 0 ? <EmptyState title="No appointments here" /> :
          data?.appointments.map((a) => <AppointmentCard key={a.id} appt={a} onChange={() => { reload(); reloadWl(); }} />)}
      </div>
      {wl?.waitlist.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Waiting list</h2>
          {wl.waitlist.map((w) => (
            <div key={w.id} className="card mb-2 flex items-center justify-between p-4 text-sm">
              <span>{w.service_name} · {w.desired_date} {w.barber_name && `· ${w.barber_name}`}</span>
              <span className="capitalize muted">{w.status === 'notified' ? '🔔 Slot opened — book now!' : 'Waiting'}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
