import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api, errMsg } from '../../lib/api';
import { money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, PageLoader, cn } from '../../components/ui';

export default function Memberships() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data } = useFetch('/memberships/plans');
  const { data: mine, reload } = useFetch(user ? '/memberships/me' : null);
  const [busy, setBusy] = useState(null);

  const subscribe = async (plan) => {
    if (!user) return navigate('/login', { state: { from: '/memberships' } });
    setBusy(plan.id);
    try {
      await api.post('/memberships/subscribe', { planId: plan.id });
      toast.success(`Welcome to ${plan.name}!`);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  if (!data) return <PageLoader />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">Membership plans</h1>
        <p className="mx-auto mt-3 max-w-xl muted">Look sharp all year. Members save on every visit, earn points faster and get priority booking.</p>
      </div>
      {mine?.membership && (
        <p className="mt-6 text-center text-sm">You're on <b>{mine.membership.plan_name}</b> (renews {new Date(mine.membership.renews_at).toLocaleDateString('en-IN')}).{' '}
          <button className="text-red-500 hover:underline" onClick={async () => {
            if (!confirm('Cancel your membership? Member discounts stop immediately.')) return;
            try { await api.post('/memberships/cancel'); toast.success('Membership cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); }
          }}>Cancel membership</button></p>
      )}
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {data.plans.map((p, i) => {
          const featured = i === 1;
          const current = mine?.membership?.plan_id === p.id;
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={cn('relative flex h-full flex-col p-7', featured && 'ring-2 ring-brass-400 shadow-glow md:-translate-y-3')}>
                {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass-400 px-3 py-1 text-xs font-bold text-ink-900">MOST POPULAR</span>}
                <Crown className="h-7 w-7 text-brass-400" />
                <h3 className="mt-3 text-2xl font-bold">{p.name}</h3>
                <p className="text-sm muted">{p.description}</p>
                <p className="mt-5"><span className="font-display text-5xl font-bold">{money(p.price_monthly)}</span><span className="muted">/mo</span></p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.perks.map((perk) => <li key={perk} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-brass-400" />{perk}</li>)}
                </ul>
                <Button className="mt-7 w-full" variant={featured ? 'primary' : 'secondary'} loading={busy === p.id}
                  disabled={!!mine?.membership} onClick={() => subscribe(p)}>
                  {current ? 'Current plan' : mine?.membership ? 'Already a member' : 'Join now'}
                </Button>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
