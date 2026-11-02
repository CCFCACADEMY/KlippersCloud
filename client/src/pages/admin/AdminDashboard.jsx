import { Link } from 'react-router-dom';
import { CalendarDays, IndianRupee, Users, Scissors, Star, Clock } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { money, fmtDateTime } from '../../lib/format';
import { Badge, Card, PageHeader, PageLoader, StatCard, Table } from '../../components/ui';
import { ChartCard, RevenueChart, RankBars, StatusDonut } from '../../components/charts/Charts';

export default function AdminDashboard() {
  const { data } = useFetch('/admin/dashboard');
  if (!data) return <PageLoader />;
  const k = data.kpis;
  const trend = k.revenue_prev_30d ? Math.round(((k.revenue_30d - k.revenue_prev_30d) / k.revenue_prev_30d) * 100) : null;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Business at a glance" actions={<Link to="/admin/reports" className="btn-secondary">Full reports</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue · 30 days" value={money(k.revenue_30d)} icon={IndianRupee} trend={trend} sub="vs previous 30 days" />
        <StatCard label="Total bookings" value={k.total_bookings.toLocaleString()} icon={CalendarDays} sub={`${k.today_bookings} today`} />
        <StatCard label="Active customers" value={k.active_customers} icon={Users} sub={`of ${k.total_customers} · last 90 days`} />
        <StatCard label="Avg rating" value={Number(k.avg_rating).toFixed(2)} icon={Star} sub={`${k.active_barbers} active barbers`} />
      </div>
      {(k.pending_requests > 0 || k.pending_barbers > 0) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {k.pending_requests > 0 && <Link to="/admin/appointments" className="flex items-center gap-2 rounded-xl bg-amber-400/15 px-4 py-2 text-sm"><Clock className="h-4 w-4 text-amber-500" />{k.pending_requests} booking requests awaiting barbers</Link>}
          {k.pending_barbers > 0 && <Link to="/admin/barbers" className="flex items-center gap-2 rounded-xl bg-brass-400/15 px-4 py-2 text-sm"><Scissors className="h-4 w-4 text-brass-500" />{k.pending_barbers} barber(s) pending approval</Link>}
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ChartCard title="Revenue overview" subtitle={`Last 30 days · ${money(k.total_revenue)} all time`} className="lg:col-span-2"><RevenueChart data={data.revenue} /></ChartCard>
        <ChartCard title="Appointment status"><StatusDonut breakdown={data.statusBreakdown} /></ChartCard>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Popular services" subtitle="By bookings"><RankBars data={data.popular} valueKey="bookings" /></ChartCard>
        <ChartCard title="Barber performance" subtitle="Completed revenue">
          <RankBars data={data.barbers} valueKey="revenue" valueFormat={(v) => money(v)} />
        </ChartCard>
      </div>
      <Card className="mt-6">
        <div className="p-5 pb-0"><p className="font-semibold">Latest bookings</p></div>
        <Table rows={data.recent} columns={[
          { key: 'customer_name', label: 'Customer' }, { key: 'barber_name', label: 'Barber' },
          { key: 'start_at', label: 'When', render: (r) => fmtDateTime(r.start_at) },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          { key: 'total', label: 'Total', className: 'text-right', render: (r) => money(r.total) },
        ]} />
      </Card>
    </>
  );
}
