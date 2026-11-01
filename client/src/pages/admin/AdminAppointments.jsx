import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
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
  const { data, reload } = useFetch(mode === 'list' ? '/appointments' : null, { params: { barberId: barberId || undefined, status: status || undefined, scope, search: search || undefined, limit: 50 } });
  return (
    <>
      <PageHeader title="Appointments" actions={<><Tabs value={mode} onChange={setMode} tabs={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} /><Button onClick={() => setWalkIn(true)}><Plus className="h-4 w-4" />Walk-in</Button></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select value={barberId} onChange={(e) => setBarberId(e.target.value)}><option value="">All barbers</option>{barbers?.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        {mode === 'list' && <>
          <Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{['pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
          <input className="input" placeholder="Search customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </>}
      </div>
      {mode === 'calendar' ? <CalendarView key={barberId} barberId={barberId || undefined} role="admin" /> : !data ? <PageLoader /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.appointments.length === 0 ? <EmptyState title="No appointments match" /> : data.appointments.map((a) => <AppointmentCard key={a.id} appt={a} role="admin" onChange={reload} />)}
        </div>
      )}
      {data && mode === 'list' && <p className="mt-4 text-sm muted">Showing {data.appointments.length} of {data.total}</p>}
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} onDone={reload} />
    </>
  );
}
