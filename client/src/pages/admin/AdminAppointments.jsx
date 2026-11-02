import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useDebounced, useFetch } from '../../hooks/useFetch';
import { Button, EmptyState, PageHeader, PageLoader, Select, Tabs } from '../../components/ui';
import CalendarView from '../../components/calendar/CalendarView';
import AppointmentCard from '../../components/appointments/AppointmentCard';
import WalkInModal from '../../components/appointments/WalkInModal';

export default function AdminAppointments() {
  const [mode, setMode] = useState('list');
  const [barberId, setBarberId] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  const { data: barbers } = useFetch('/barbers');
  const q = useDebounced(search);
  const [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [barberId, status, scope, q]);
  const { data, reload, loading } = useFetch(mode === 'list' ? '/appointments' : null, { params: { barberId: barberId || undefined, status: status || undefined, scope, search: q || undefined, limit } });
  return (
    <>
      <PageHeader title="Appointments" actions={<><Tabs value={mode} onChange={setMode} tabs={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} /><Button onClick={() => setWalkIn(true)}><Plus className="h-4 w-4" />Walk-in</Button></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select value={barberId} onChange={(e) => setBarberId(e.target.value)}><option value="">All barbers</option>{barbers?.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        {mode === 'list' && <>
          <Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{['pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
          <input className="input" aria-label="Search customer" placeholder="Search customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </>}
      </div>
      {mode === 'calendar' ? <CalendarView key={barberId} barberId={barberId || undefined} role="admin" /> : !data ? <PageLoader /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.appointments.length === 0 ? <EmptyState title="No appointments match" /> : data.appointments.map((a) => <AppointmentCard key={a.id} appt={a} role="admin" onChange={reload} />)}
        </div>
      )}
      {data && mode === 'list' && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="muted">Showing {data.appointments.length} of {data.total}</span>
          {data.appointments.length < data.total && limit < 100 && <Button variant="secondary" loading={loading} onClick={() => setLimit(100)}>Show 100</Button>}
          {data.appointments.length < data.total && limit >= 100 && <span className="muted">· narrow the filters to see older bookings</span>}
        </div>
      )}
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} onDone={reload} />
    </>
  );
}
