/**
 * Dashboard charts (Recharts). Colors come from CSS variables defined in
 * index.css (--series-1..4) so light/dark themes each use their own
 * validated steps. One y-axis per chart, thin marks, recessive grid,
 * hover tooltips on every chart.
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { money, compactMoney } from '../../lib/format';
import { Card } from '../ui';

const axis = { stroke: 'var(--chart-text)', fontSize: 11, tickLine: false, axisLine: false };

function TooltipBox({ active, payload, label, valueFormat = (v) => v, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-ink-900">
      <p className="mb-1 font-semibold">{labelFormat(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload.fill }} />
          <span className="muted">{p.name}:</span><span className="font-semibold">{valueFormat(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, action, className = '' }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div><p className="font-semibold">{title}</p>{subtitle && <p className="text-xs muted">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Single-series revenue over time (area). */
export function RevenueChart({ data, dataKey = 'revenue', height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="date" {...axis} tickFormatter={(d) => format(parseISO(d), 'MMM d')} minTickGap={24} />
        <YAxis {...axis} tickFormatter={compactMoney} width={56} />
        <Tooltip content={<TooltipBox valueFormat={money} labelFormat={(d) => format(parseISO(d), 'EEE, MMM d')} />} cursor={{ stroke: 'var(--chart-text)', strokeDasharray: 4 }} />
        <Area type="monotone" dataKey={dataKey} name="Revenue" stroke="var(--series-1)" strokeWidth={2} fill="url(#revFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--chart-surface)' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bar ranking (single series → one hue). */
export function RankBars({ data, nameKey = 'name', valueKey, valueFormat = (v) => v, height }) {
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(160, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={nameKey} {...axis} width={130} />
        <Tooltip content={<TooltipBox valueFormat={valueFormat} />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Bar dataKey={valueKey} name={valueKey.replace(/_/g, ' ')} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}
          label={{ position: 'right', fill: 'var(--chart-text)', fontSize: 11, formatter: valueFormat }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars (e.g. bookings per hour). */
export function ColumnChart({ data, xKey, valueKey, name, height = 220, xFormat = (v) => v }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormat} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip content={<TooltipBox labelFormat={xFormat} />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Bar dataKey={valueKey} name={name} fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Donut for appointment status mix. Statuses are grouped into ≤4 slices
 * (fixed slot order) and every slice is direct-labeled in the legend with
 * its count — identity never relies on color alone.
 */
const STATUS_GROUPS = [
  ['Completed', ['completed'], 'var(--series-1)'],
  ['Upcoming', ['pending', 'confirmed', 'checked_in', 'in_progress'], 'var(--series-2)'],
  ['Cancelled', ['cancelled', 'rejected'], 'var(--series-3)'],
  ['No-show', ['no_show'], 'var(--series-4)'],
];
export function StatusDonut({ breakdown }) {
  const data = STATUS_GROUPS.map(([name, keys, color]) => ({
    name, color, value: breakdown.filter((b) => keys.includes(b.status)).reduce((t, b) => t + b.count, 0),
  })).filter((d) => d.value > 0);
  const total = data.reduce((t, d) => t + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="var(--chart-surface)" strokeWidth={2}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold">{total}</span><span className="text-xs muted">total</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-semibold">{d.value}</span>
            <span className="w-10 text-right text-xs muted">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
