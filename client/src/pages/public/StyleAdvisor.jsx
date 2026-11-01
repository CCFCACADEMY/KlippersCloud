import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Scissors, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { Badge, Button, Card, Field, Input, cn } from '../../components/ui';

const OPTIONS = {
  faceShape: ['oval', 'round', 'square', 'oblong', 'heart', 'diamond'],
  hairType: ['straight', 'wavy', 'curly', 'coily'],
  hairLength: ['short', 'medium', 'long'],
  beard: ['none', 'stubble', 'short', 'full'],
  maintenance: ['low', 'medium', 'high'],
};
const LABELS = { faceShape: 'Face shape', hairType: 'Hair type', hairLength: 'Current length', beard: 'Beard', maintenance: 'Styling effort' };

export default function StyleAdvisor() {
  const [form, setForm] = useState({ faceShape: 'oval', hairType: 'straight', hairLength: 'short', beard: 'none', maintenance: 'medium', lifestyle: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/ai/recommendations', { ...form, lifestyle: form.lifestyle || undefined });
      setResult(data.result);
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brass-400/15 px-3 py-1 text-xs font-semibold text-brass-500"><Sparkles className="h-3.5 w-3.5" /> AI-powered</span>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Style Advisor</h1>
        <p className="mx-auto mt-3 max-w-xl muted">Tell us a little about yourself and get three cuts that suit you — plus exactly what to tell your barber.</p>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit space-y-5 p-6">
          {Object.entries(OPTIONS).map(([key, vals]) => (
            <div key={key}>
              <span className="label">{LABELS[key]}</span>
              <div className="flex flex-wrap gap-2">
                {vals.map((v) => (
                  <button key={v} onClick={() => setForm({ ...form, [key]: v })}
                    className={cn('rounded-full border px-3 py-1.5 text-sm capitalize transition', form[key] === v ? 'border-brass-400 bg-brass-400 text-ink-900' : 'border-black/10 hover:border-brass-400 dark:border-white/10')}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Field label="Lifestyle (optional)"><Input placeholder="e.g. office job, gym 4x/week" value={form.lifestyle} onChange={(e) => setForm({ ...form, lifestyle: e.target.value })} maxLength={100} /></Field>
          <Button className="w-full" loading={loading} onClick={submit}><Wand2 className="h-4 w-4" /> Get recommendations</Button>
        </Card>
        <div>
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-black/10 p-10 text-center dark:border-white/10">
                <div><Scissors className="mx-auto h-10 w-10 text-brass-400" /><p className="mt-3 muted">Your personalised recommendations will appear here.</p></div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <Card className="p-5"><p className="text-sm">{result.summary}</p><p className="mt-2 text-xs muted">Source: {result.source === 'ai' ? 'Claude AI' : 'Klippers style rules'}</p></Card>
                {result.recommendations.map((r, i) => (
                  <motion.div key={r.style} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}>
                    <Card className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xl font-bold"><span className="text-brass-400">{i + 1}.</span> {r.style}</h3>
                        <Badge>{r.maintenance} upkeep</Badge>
                      </div>
                      <p className="mt-2 text-sm muted">{r.why}</p>
                      <p className="mt-3 rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5"><b>Tell your barber:</b> {r.barber_instructions}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {r.suggested_services.map((s) => <span key={s} className="rounded-full bg-brass-400/15 px-2.5 py-0.5 text-xs text-brass-600 dark:text-brass-300">{s}</span>)}
                        <Link to="/book" className="ml-auto text-sm font-semibold text-brass-500 hover:underline">Book this look →</Link>
                      </div>
                    </Card>
                  </motion.div>
                ))}
                {result.products?.length > 0 && <Card className="p-5 text-sm"><b>Recommended products:</b> {result.products.join(', ')}</Card>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
