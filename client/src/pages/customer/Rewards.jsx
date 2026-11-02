import { Gift, TrendingUp } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { fmtDate, money } from '../../lib/format';
import { Card, PageHeader, PageLoader, StatCard, Table } from '../../components/ui';

export default function Rewards() {
  const { data } = useFetch('/me/loyalty');
  if (!data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Rewards" subtitle={`You're a ${data.tier.name} member.`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available points" value={data.points} icon={Gift} sub={`Worth ${money(data.cashValue)}`} />
        <StatCard label="Lifetime earned" value={data.lifetime} icon={TrendingUp} />
        <StatCard label="Tier" value={data.tier.name} sub={data.tier.next ? `Next tier at ${data.tier.next} pts` : 'Top tier'} />
      </div>
      <Card className="mt-6 p-5 text-sm">
        <p className="font-semibold">How it works</p>
        <ul className="mt-2 list-inside list-disc space-y-1 muted">
          <li>Earn 1 point for every {money(1 / data.rules.perDollar)} spent (members earn more).</li>
          <li>Get {data.rules.reviewBonus} bonus points for every review.</li>
          <li>Redeem from {data.rules.minRedeem} points at checkout — each point is worth {money(data.rules.redeemRate)}.</li>
        </ul>
      </Card>
      <Card className="mt-6">
        <Table rows={data.history} empty="No points activity yet" columns={[
          { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at, 'MMM d, yyyy') },
          { key: 'reason', label: 'Activity' },
          { key: 'points', label: 'Points', className: 'text-right', render: (r) => <span className={r.points > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>{r.points > 0 ? '+' : ''}{r.points}</span> },
        ]} />
      </Card>
    </>
  );
}
