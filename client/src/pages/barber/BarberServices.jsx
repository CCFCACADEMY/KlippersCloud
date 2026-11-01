/** Barber chooses which services they offer and can override price/duration. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Button, Card, PageHeader, PageLoader, Toggle } from '../../components/ui';
import ServiceIcon from '../../components/booking/ServiceIcon';

export default function BarberServices() {
  const { data } = useFetch('/barbers/me');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setRows(data.services); }, [data]);
  if (!rows) return <PageLoader />;
  const set = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/barbers/me/services', { services: rows.filter((r) => r.offered).map((r) => ({ service_id: r.id, custom_price: r.custom_price === '' ? null : r.custom_price, custom_duration: r.custom_duration === '' ? null : r.custom_duration })) });
      toast.success('Services updated');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="My services" subtitle="Choose what you offer. Leave price/duration blank to use the shop default." actions={<Button loading={busy} onClick={save}>Save</Button>} />
      <div className="grid gap-3">
        {rows.map((s) => (
          <Card key={s.id} className={`flex flex-wrap items-center gap-4 p-4 ${s.offered ? '' : 'opacity-60'}`}>
            <span className="rounded-xl bg-brass-400/15 p-2.5 text-brass-500"><ServiceIcon category={s.category} /></span>
            <div className="min-w-[160px] flex-1"><p className="font-semibold">{s.name}</p><p className="text-xs muted">Default {money(s.base_price)} · {s.base_duration} min</p></div>
            <input type="number" min={0} step="0.5" className="input w-28 py-1.5" placeholder="Price $" value={s.custom_price ?? ''} disabled={!s.offered} onChange={(e) => set(s.id, { custom_price: e.target.value === '' ? '' : Number(e.target.value) })} aria-label="Custom price" />
            <input type="number" min={5} step={5} className="input w-28 py-1.5" placeholder="Minutes" value={s.custom_duration ?? ''} disabled={!s.offered} onChange={(e) => set(s.id, { custom_duration: e.target.value === '' ? '' : Number(e.target.value) })} aria-label="Custom duration" />
            <Toggle checked={s.offered} onChange={(v) => set(s.id, { offered: v })} label={<span className="w-14 text-xs">{s.offered ? 'Offered' : 'Off'}</span>} />
          </Card>
        ))}
      </div>
    </>
  );
}
