/** Customer list with visit history and private notes. */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, StickyNote, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money, fmtDate, ago } from '../../lib/format';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, PageLoader, Textarea, cn } from '../../components/ui';

export default function BarberCustomers() {
  const [params] = useSearchParams();
  const { data } = useFetch('/barbers/me/customers');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(params.get('id'));
  const { data: detail, reload } = useFetch(selected ? `/barbers/me/customers/${selected}` : null);
  const [note, setNote] = useState('');
  useEffect(() => { if (!selected && data?.customers[0]) setSelected(data.customers[0].id); }, [data, selected]);
  if (!data) return <PageLoader />;
  const list = data.customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  const addNote = async () => {
    try { await api.post(`/barbers/me/customers/${selected}/notes`, { note }); setNote(''); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <>
      <PageHeader title="Customers" subtitle={`${data.customers.length} clients you've served`} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="p-3">
          <div className="relative mb-2"><Search className="absolute left-3 top-3 h-4 w-4 muted" /><input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="max-h-[65vh] space-y-1 overflow-y-auto">
            {list.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cn('flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition', selected === c.id ? 'bg-brass-400/15' : 'hover:bg-black/5 dark:hover:bg-white/5')}>
                <Avatar name={c.name} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.name}</p><p className="text-xs muted">{c.visits} visit{c.visits === 1 ? '' : 's'}{c.last_visit ? ` · last ${ago(c.last_visit)}` : ''}{c.next_visit ? ` · next ${fmtDate(c.next_visit, 'MMM d')}` : ''}</p></div>
                <span className="text-xs font-semibold">{money(c.spent)}</span>
              </button>
            ))}
          </div>
        </Card>
        {!detail ? <EmptyState title="Select a customer" /> : (
          <div className="space-y-6">
            <Card className="flex items-center gap-4 p-5">
              <Avatar name={detail.customer.name} size="lg" />
              <div><h2 className="text-2xl font-bold">{detail.customer.name}</h2><p className="text-sm muted">{detail.customer.email} · {detail.customer.phone || 'no phone'}</p><p className="text-xs muted">Client since {fmtDate(detail.customer.created_at, 'MMM yyyy')}</p></div>
            </Card>
            <Card className="p-5">
              <h3 className="flex items-center gap-2 font-bold"><StickyNote className="h-4 w-4 text-brass-400" />Private notes</h3>
              <div className="mt-3 flex gap-2"><Textarea placeholder="e.g. #2 on sides, prefers quiet appointments" value={note} onChange={(e) => setNote(e.target.value)} /><Button disabled={!note.trim()} onClick={addNote}>Add</Button></div>
              <div className="mt-4 space-y-2">
                {detail.notes.map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-2 rounded-xl bg-amber-100/60 p-3 text-sm dark:bg-amber-400/10">
                    <div><p>{n.note}</p><p className="mt-1 text-xs muted">{ago(n.created_at)}</p></div>
                    <button className="btn-ghost p-1.5" aria-label="Delete note" onClick={async () => { await api.delete(`/barbers/me/customers/${selected}/notes/${n.id}`); reload(); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-bold">Visit history</h3>
              <div className="mt-3 divide-y divide-black/5 dark:divide-white/5">
                {detail.history.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>{fmtDate(h.start_at, 'MMM d, yyyy')}</span><span className="flex-1 px-4 muted">{h.services}</span><span>{money(h.total)}</span><Badge status={h.status} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
