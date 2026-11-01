import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, PageHeader } from '../../components/ui';
import CalendarView from '../../components/calendar/CalendarView';
import WalkInModal from '../../components/appointments/WalkInModal';

export default function BarberCalendar() {
  const { user } = useAuth();
  const [walkIn, setWalkIn] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <PageHeader title="Calendar" subtitle="Daily, weekly and monthly views of your bookings." actions={<Button onClick={() => setWalkIn(true)}><Plus className="h-4 w-4" />Walk-in</Button>} />
      <CalendarView key={key} barberId={user.barber_id} role="barber" />
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} onDone={() => setKey((k) => k + 1)} />
    </>
  );
}
