import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Card, PageLoader, Tabs } from '../../components/ui';
import ServiceIcon, { CATEGORY_LABELS } from '../../components/booking/ServiceIcon';

export default function Services() {
  const [cat, setCat] = useState('all');
  const { data } = useFetch('/services');
  if (!data) return <PageLoader />;
  const cats = ['all', ...new Set(data.services.map((s) => s.category))];
  const list = data.services.filter((s) => cat === 'all' || s.category === cat);
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">Services & pricing</h1>
      <p className="mt-2 muted">Prices may vary slightly by barber seniority. All services include a hot towel finish.</p>
      <div className="mt-8"><Tabs value={cat} onChange={setCat} tabs={cats.map((c) => ({ value: c, label: c === 'all' ? 'All' : CATEGORY_LABELS[c] }))} /></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {list.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className="flex h-full flex-col p-6">
              <div className="flex items-start gap-4">
                <span className="rounded-xl bg-brass-400/15 p-3 text-brass-500"><ServiceIcon category={s.category} className="h-6 w-6" /></span>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3"><h3 className="text-xl font-bold">{s.name}</h3><p className="font-display text-2xl font-bold text-brass-500">{money(s.price)}</p></div>
                  <p className="mt-1 text-sm muted">{s.description}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-5">
                <span className="flex items-center gap-1.5 text-sm muted"><Clock className="h-4 w-4" />{s.duration_min} min · {s.barber_count} barbers</span>
                <Link to={`/book?service=${s.id}`} className="btn-primary py-2">Book</Link>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
