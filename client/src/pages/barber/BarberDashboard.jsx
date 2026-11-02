import { Link } from 'react-router-dom';
import { CalendarCheck, IndianRupee, Users, Repeat, AlertCircle } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../lib/format';
import { Avatar, Card, EmptyState, PageHeader, PageLoader, StatCard } from '../../components/ui';
import AppointmentCard from '../../components/appointments/AppointmentCard';
import { ChartCard, RevenueChart, StatusDonut } from '../../components/charts/Charts';
import { format } from 'date-fns';

export default function BarberDashboard() {
  const { user } = useAuth();
  const { data, reload } = useFetch('/barbers/me/dashboard');
  if (!user.barber_approved) {
    return <EmptyState icon={AlertCircle} title="Your profile is pending approval" text="An admin will review your barber account shortly. Meanwhile, complete your profile and working hours." action={<Link to="/barber/profile" className="btn-primary">Complete profile</Link>} />;
  }
  if (!data) return <PageLoader />;
  const { stats } = data;
  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.name.split(' ')[0]}`} subtitle={format(new Date(), 'EEEE, MMMM d')}
        actions={<Link to="/barber/calendar" className="btn-secondary">Open calendar</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={data.today.length} icon={CalendarCheck} sub="appointments" />
        <StatCard label="Earnings (month)" value={money(stats.month_earnings)} icon={IndianRupee} sub={`${stats.commission_rate}% commission`} />
        <StatCard label="Lifetime earnings" value={money(stats.earnings)} icon={IndianRupee} sub={`${stats.completed} cuts completed`} />
        <StatCard label="Repeat clients" value={`${stats.repeat_rate}%`} icon={Repeat} sub={`${stats.unique_customers} unique customers`} />
      </div>

      {data.pending.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">Booking requests <span className="rounded-full bg-amber-400 px-2 text-sm text-ink-900">{data.pending.length}</span></h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.pending.map((a) => <AppointmentCard key={a.id} appt={a} role="barber" onChange={reload} />)}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xl font-bold">Today's schedule</h2>
          {data.today.length === 0 ? <EmptyState title="No appointments today" text="Enjoy the downtime — or take walk-ins!" /> : (
            <div className="relative min-w-0 space-y-3 border-l-2 border-brass-400/30 pl-4 sm:pl-5">
              {data.today.map((a) => (
                <div key={a.id} className="relative">
                  <span className="absolute -left-[27px] top-6 h-3 w-3 rounded-full bg-brass-400 ring-4 ring-cream dark:ring-ink-950" />
                  <AppointmentCard appt={a} role="barber" onChange={reload} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <ChartCard title="Appointment statistics" subtitle="All time"><StatusDonut breakdown={data.statusBreakdown} /></ChartCard>
          <Card className="p-5">
            <p className="font-semibold">Top customers</p>
            <div className="mt-3 space-y-3">
              {data.topCustomers.map((c) => (
                <Link to={`/barber/customers?id=${c.id}`} key={c.id} className="flex items-center gap-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
                  <Avatar name={c.name} size="sm" /><div className="flex-1 text-sm"><p className="font-semibold">{c.name}</p><p className="text-xs muted">{c.visits} visits</p></div>
                  <span className="text-sm font-semibold">{money(c.spent)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <ChartCard title="Revenue — last 30 days" subtitle="Completed services, before commission" className="mt-6"><RevenueChart data={data.revenue} /></ChartCard>
    </>
  );
}
