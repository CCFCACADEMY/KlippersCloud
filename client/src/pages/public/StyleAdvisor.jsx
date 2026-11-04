/**
 * AI Style Advisor.
 *  • Photo mode: take a selfie with the device camera (or upload one); Claude's vision reads
 *    hair type/length, beard and face shape, then suggests trending + timeless styles.
 *  • Questionnaire mode: pick face shape, hair type, etc. yourself.
 * Both modes share the customer's style preferences (vibe, length change, upkeep, notes).
 * Each suggestion links straight into booking with the matching service pre-selected.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Scissors, Wand2, Camera, ListChecks, TrendingUp, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { Badge, Button, Card, Field, Input, Tabs, cn } from '../../components/ui';
import CameraCapture from '../../components/CameraCapture';

const FEATURES = {
  faceShape: ['oval', 'round', 'square', 'oblong', 'heart', 'diamond'],
  hairType: ['straight', 'wavy', 'curly', 'coily'],
  hairLength: ['short', 'medium', 'long'],
  beard: ['none', 'stubble', 'short', 'full'],
};
const PREFERENCES = {
  vibe: [['classic', 'Classic'], ['trending', 'Trending now'], ['bold', 'Bold'], ['professional', 'Office-ready']],
  lengthChange: [['any', 'Open to anything'], ['keep', 'Keep my length'], ['shorter', 'Go shorter'], ['longer', 'Grow it out']],
  maintenance: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
};
const LABELS = { faceShape: 'Face shape', hairType: 'Hair type', hairLength: 'Current length', beard: 'Beard', vibe: 'Style vibe', lengthChange: 'Length', maintenance: 'Daily styling effort' };

function Chips({ name, options, value, onChange }) {
  return (
    <div>
      <span className="label">{LABELS[name]}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={LABELS[name]}>
        {options.map((o) => {
          const [val, label] = Array.isArray(o) ? o : [o, o];
          return (
            <button key={val} type="button" role="radio" aria-checked={value === val} onClick={() => onChange(val)}
              className={cn('rounded-full border px-3 py-1.5 text-sm capitalize transition',
                value === val ? 'border-brass-400 bg-brass-400 text-ink-900' : 'border-black/10 hover:border-brass-400 dark:border-white/10')}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StyleAdvisor() {
  const { data: cfg } = useFetch('/ai/config');
  const { data: svc } = useFetch('/services');
  const photoAvailable = cfg?.photoAnalysis !== false;
  const [mode, setMode] = useState('photo');
  useEffect(() => { if (cfg && !cfg.photoAnalysis) setMode('questions'); }, [cfg]);

  const [photo, setPhoto] = useState(null);
  const [features, setFeatures] = useState({ faceShape: 'oval', hairType: 'straight', hairLength: 'short', beard: 'none' });
  const [prefs, setPrefs] = useState({ vibe: 'trending', lengthChange: 'any', maintenance: 'medium', notes: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (mode === 'photo' && !photo) return toast.error('Take or upload a photo first, or switch to "Answer questions".');
    setLoading(true);
    setResult(null);
    try {
      const body = { vibe: prefs.vibe, lengthChange: prefs.lengthChange, maintenance: prefs.maintenance, notes: prefs.notes.trim() || undefined };
      Object.assign(body, mode === 'photo' ? { photo } : features);
      const { data } = await api.post('/ai/recommendations', body);
      setResult(data.result);
      if (mode === 'photo' && !data.result.photoUsed) toast('Photo analysis is unavailable right now, so we used your answers.', { icon: 'ℹ️' });
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  };

  // Map a suggested service name to a bookable service
  const serviceFor = (names = []) => names.map((n) => n.toLowerCase())
    .map((n) => svc?.services.find((s) => n === s.name.toLowerCase() || n.includes(s.name.toLowerCase())))
    .find(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brass-400/15 px-3 py-1 text-xs font-semibold text-brass-600 dark:text-brass-300"><Sparkles className="h-3.5 w-3.5" /> AI-powered</span>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Style Advisor</h1>
        <p className="mx-auto mt-3 max-w-xl muted">Snap a selfie or answer a few questions. Get three cuts that suit you and what&apos;s trending, plus exactly what to tell your barber.</p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="h-fit space-y-5 p-6">
          <Tabs value={mode} onChange={setMode} tabs={[{ value: 'photo', label: '📷 Use a photo' }, { value: 'questions', label: 'Answer questions' }]} />

          {mode === 'photo' ? (
            photoAvailable ? <CameraCapture value={photo} onChange={setPhoto} /> : (
              <div className="rounded-2xl border border-dashed border-black/10 p-5 text-center text-sm dark:border-white/10">
                <Camera className="mx-auto h-8 w-8 text-brass-400" />
                <p className="mt-2 font-semibold">Photo analysis isn&apos;t available right now</p>
                <p className="mt-1 muted">Please use “Answer questions” instead.</p>
              </div>
            )
          ) : (
            Object.entries(FEATURES).map(([k, opts]) => <Chips key={k} name={k} options={opts} value={features[k]} onChange={(v) => setFeatures({ ...features, [k]: v })} />)
          )}

          <div className="space-y-4 border-t border-black/5 pt-5 dark:border-white/10">
            <p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-brass-400" />Your preferences</p>
            {Object.entries(PREFERENCES).map(([k, opts]) => <Chips key={k} name={k} options={opts} value={prefs[k]} onChange={(v) => setPrefs({ ...prefs, [k]: v })} />)}
            <Field label="Anything else? (optional)">
              <Input placeholder="e.g. wedding next month, hide receding hairline, cricket on weekends" maxLength={300} value={prefs.notes} onChange={(e) => setPrefs({ ...prefs, notes: e.target.value })} />
            </Field>
          </div>
          <Button className="w-full" loading={loading} disabled={mode === 'photo' && (!photo || !photoAvailable)} onClick={submit}>
            <Wand2 className="h-4 w-4" />{mode === 'photo' ? 'Analyse my photo' : 'Get recommendations'}
          </Button>
        </Card>

        <div aria-live="polite">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brass-400/30 p-10 text-center">
                <Sparkles className="h-10 w-10 animate-pulse text-brass-400" />
                <p className="font-semibold">{mode === 'photo' ? 'Reading your hair and face shape…' : 'Finding your best looks…'}</p>
                <p className="text-sm muted">This usually takes a few seconds.</p>
              </motion.div>
            ) : !result ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-black/10 p-10 text-center dark:border-white/10">
                <div><Scissors className="mx-auto h-10 w-10 text-brass-400" /><p className="mt-3 muted">Your personalised recommendations will appear here.</p></div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <Card className="p-5">
                  <p className="text-sm">{result.summary}</p>
                  {result.analysis && (
                    <div className="mt-4 rounded-xl bg-royal-500/10 p-3 text-sm">
                      <p className="mb-2 flex items-center gap-2 font-semibold"><Eye className="h-4 w-4 text-royal-400" />{result.photoUsed ? 'What we see in your photo' : 'Based on'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[['Face', result.analysis.face_shape], ['Hair', result.analysis.hair_type], ['Length', result.analysis.hair_length], ['Beard', result.analysis.beard]].filter(([, v]) => v && v !== 'not assessed').map(([k, v]) => (
                          <span key={k} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs capitalize dark:bg-white/10"><b>{k}:</b> {v}</span>
                        ))}
                      </div>
                      {result.analysis.observations && <p className="mt-2 text-xs muted">{result.analysis.observations}</p>}
                    </div>
                  )}
                  <p className="mt-3 text-xs muted">Source: {result.source === 'ai' ? 'Claude AI stylist' : 'Klippers style rules'}</p>
                </Card>
                {result.recommendations.map((r, i) => {
                  const s = serviceFor(r.suggested_services);
                  return (
                    <motion.div key={r.style} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}>
                      <Card className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-xl font-bold"><span className="text-brass-500">{i + 1}.</span> {r.style}</h3>
                          <Badge>{r.maintenance} upkeep</Badge>
                        </div>
                        <p className="mt-2 text-sm muted">{r.why}</p>
                        {r.trend_note && <p className="mt-2 flex items-start gap-2 text-sm"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-royal-400" /><span>{r.trend_note}</span></p>}
                        <p className="mt-3 rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5"><b>Tell your barber:</b> {r.barber_instructions}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {r.suggested_services.map((x) => <span key={x} className="rounded-full bg-brass-400/15 px-2.5 py-0.5 text-xs text-brass-700 dark:text-brass-300">{x}</span>)}
                          <Link to={s ? `/book?service=${s.id}` : '/book'} className="ml-auto text-sm font-semibold text-brass-600 hover:underline dark:text-brass-300">Book this look →</Link>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
                {result.products?.length > 0 && <Card className="p-5 text-sm"><b>Recommended products:</b> {result.products.join(', ')}</Card>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
