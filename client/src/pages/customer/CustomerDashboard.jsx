import { Link } from 'react-router-dom';
import { CalendarDays, Gift, Heart, Trophy, Crown } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { api, errMsg } from '../../lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Card, EmptyState, PageHeader, PageLoader, StatCard, Stars } from '../../components/ui';
import AppointmentCard from '../../components/appointments/AppointmentCard';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { data, reload } = useFetch('/me/dashboard');
  if (!data) return <PageLoader />;
  const { rewards, membership } = data;
  const progress = rewards.tier.next ? Math.min(100, (rewards.lifetime / rewards.tier.next) * 100) : 100;
  return (
    <>
      <PageHeader title={`Hey ${user.name.split(' ')[0]} 👋`} subtitle="Here's what's coming up." actions={<Link to="/book" className="btn-primary">Book appointment</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Upcoming" value={data.upcomingCount ?? data.upcoming.length} icon={CalendarDays} />
        <StatCard label="Reward points" value={rewards.points} icon={Gift} sub={`≈ ${money(rewards.cashValue)} value`} />
        <StatCard label="Visits" value={rewards.visits} icon={Trophy} />
        <StatCard label="Favorite barbers" value={data.favorites.length} icon={Heart} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-xl font-bold">Upcoming bookings</h2>
          {data.upcoming.length === 0 ? <EmptyState icon={CalendarDays} title="Nothing booked" text="Time for a fresh cut?" action={<Link to="/book" className="btn-primary">Book now</Link>} />
            : data.upcoming.map((a) => <AppointmentCard key={a.id} appt={a} onChange={reload} />)}
          <div className="flex items-center justify-between pt-4"><h2 className="text-xl font-bold">Recent visits</h2><Link to="/dashboard/appointments" className="text-sm text-brass-500 hover:underline">View all</Link></div>
          {data.past.length === 0 ? <p className="muted">No past appointments yet.</p> : data.past.slice(0, 3).map((a) => <AppointmentCard key={a.id} appt={a} onChange={reload} />)}
        </div>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-ink-900 to-brass-700 p-5 text-white">
              <p className="text-xs uppercase tracking-widest text-brass-200">Loyalty tier</p>
              <p className="font-display text-3xl font-bold">{rewards.tier.name}</p>
              <p className="mt-1 text-sm text-white/70">{rewards.points} points available</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-brass-300" style={{ width: `${progress}%` }} /></div>
              <p className="mt-1 text-xs text-white/60">{rewards.tier.next ? `${rewards.tier.next - rewards.lifetime} pts to next tier` : 'Top tier reached 🏆'}</p>
            </div>
            <div className="p-4"><Link to="/dashboard/rewards" className="text-sm font-semibold text-brass-500 hover:underline">See rewards history →</Link></div>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 font-semibold"><Crown className="h-4 w-4 text-brass-400" />Membership</p>
            {membership ? <div className="mt-2 text-sm"><p><b>{membership.plan_name}</b> · {membership.discount_percent}% off every visit</p>
              <button className="mt-2 text-xs text-red-500 hover:underline" onClick={async () => {
                if (!confirm(`Cancel your ${membership.plan_name} membership? Discounts stop immediately.`)) return;
                try { await api.post('/memberships/cancel'); toast.success('Membership cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); }
              }}>Cancel membership</button></div>
              : <p className="mt-2 text-sm muted">Save up to 25% on every visit. <Link to="/memberships" className="text-brass-500 hover:underline">Explore plans</Link></p>}
          </Card>
          <Card className="p-5">
            <p className="font-semibold">Favorite barbers</p>
            <div className="mt-3 space-y-3">
              {data.favorites.length === 0 && <p className="text-sm muted">Tap ♥ on a barber to save them here.</p>}
              {data.favorites.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <Avatar src={b.photo_url} name={b.name} size="sm" />
                  <div className="flex-1"><p className="text-sm font-semibold">{b.name}</p><Stars value={b.rating_avg} size={10} /></div>
                  <Link to={`/book?barber=${b.id}`} className="btn-secondary px-3 py-1 text-xs">Book</Link>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
