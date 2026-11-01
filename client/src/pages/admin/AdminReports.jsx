/** Reports: revenue, appointments, retention, service popularity, barber performance — with CSV export. */
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Download } from 'lucide-react';
import { api } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Button, Card, PageHeader, PageLoader, Select, StatCard, Table, Tabs } from '../../components/ui';
import { ChartCard, ColumnChart, RankBars, RevenueChart } from '../../components/charts/Charts';

const today = format(new Date(), 'yyyy-MM-dd');

export default function AdminReports() {
  const [tab, setTab] = useState('revenue');
  const [from, setFrom] = useState(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState('week');
  const { data, loading } = useFetch(`/reports/${tab}`, { params: { from, to, groupBy } });

  const exportCsv = async () => {
    const res = await api.get(`/reports/${tab}`, { params: { from, to, groupBy, format: 'csv' }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    Object.assign(document.createElement('a'), { href: url, download: `klippers-${tab}-${from}_${to}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Analyse revenue, bookings, retention and performance." actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button>} />
      {/* Filters live in one row above the charts */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onChange={setTab} tabs={[['revenue', 'Revenue'], ['appointments', 'Appointments'], ['retention', 'Retention'], ['services', 'Services'], ['barbers', 'Barbers']].map(([value, label]) => ({ value, label }))} />
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <input type="date" className="input w-auto" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          {['revenue', 'appointments'].includes(tab) && <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ width: 'auto' }}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></Select>}
        </div>
      </div>
      {loading || !data ? <PageLoader /> : (
        <>
          {tab === 'revenue' && <>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Gross" value={money(data.totals.gross)} /><StatCard label="Net (ex. tax, refunds)" value={money(data.totals.net)} />
              <StatCard label="Tax collected" value={money(data.totals.tax)} /><StatCard label="Refunds" value={money(data.totals.refunds)} />
            </div>
            <ChartCard title="Gross revenue" className="mt-6"><RevenueChart data={data.rows.map((r) => ({ date: r.period, revenue: r.gross }))} /></ChartCard>
          </>}
          {tab === 'appointments' && <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Bookings per period"><ColumnChart data={data.rows} xKey="period" valueKey="total" name="Bookings" xFormat={(d) => (d ? format(new Date(d), 'MMM d') : d)} /></ChartCard>
            <ChartCard title="Busiest hours"><ColumnChart data={data.byHour} xKey="hour" valueKey="bookings" name="Bookings" xFormat={(h) => format(new Date(2000, 0, 1, h), 'ha')} /></ChartCard>
          </div>}
          {tab === 'retention' && <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Customers" value={data.summary.customers} /><StatCard label="Repeat rate" value={`${data.summary.repeat_rate ?? 0}%`} />
            <StatCard label="Avg visits" value={data.summary.avg_visits ?? 0} /><StatCard label="At risk (60d+)" value={data.summary.at_risk} />
          </div>}
          {tab === 'services' && <ChartCard title="Service popularity"><RankBars data={data.rows} valueKey="bookings" /></ChartCard>}
          {tab === 'barbers' && <ChartCard title="Revenue by barber"><RankBars data={data.rows} nameKey="barber" valueKey="revenue" valueFormat={(v) => money(v)} /></ChartCard>}

          {/* Table view of the same data (accessibility + exact numbers) */}
          <Card className="mt-6">
            <Table rows={data.rows} columns={Object.keys(data.rows[0] || {}).map((k) => ({
              key: k, label: k.replace(/_/g, ' '),
              render: (r) => (typeof r[k] === 'number' && /revenue|gross|net|tax|refund|card|cash|gift|earnings|price/.test(k) ? money(r[k]) : r[k] ?? '—'),
            }))} />
          </Card>
        </>
      )}
    </>
  );
}
