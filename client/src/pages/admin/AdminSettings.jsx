/** Business settings, locations, membership plans and gift card overview. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money, fmtDate } from '../../lib/format';
import { Button, Card, Field, Input, PageHeader, PageLoader, Table, Tabs, Toggle } from '../../components/ui';

const FIELDS = [
  ['business_name', 'Business name', 'text'], ['contact_email', 'Contact email', 'email'], ['contact_phone', 'Contact phone', 'text'],
  ['tax_rate', 'Tax rate (%)', 'number'], ['booking_lead_minutes', 'Min. booking notice (minutes)', 'number'], ['booking_window_days', 'Booking window (days ahead)', 'number'],
  ['cancellation_window_hours', 'Free cancellation window (hours)', 'number'], ['loyalty_points_per_dollar', 'Points per $1', 'number'],
  ['loyalty_redeem_rate', '$ value per point', 'number'], ['loyalty_min_redeem', 'Min points to redeem', 'number'], ['review_bonus_points', 'Review bonus points', 'number'],
  ['default_timezone', 'Default timezone', 'text'],
];

export default function AdminSettings() {
  const [tab, setTab] = useState('business');
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'business', label: 'Business' }, { value: 'locations', label: 'Locations' }, { value: 'memberships', label: 'Memberships' }, { value: 'giftcards', label: 'Gift cards' }]} />
      <div className="mt-6">
        {tab === 'business' && <Business />}
        {tab === 'locations' && <Locations />}
        {tab === 'memberships' && <Plans />}
        {tab === 'giftcards' && <GiftCardList />}
      </div>
    </>
  );
}

function Business() {
  const { data } = useFetch('/admin/settings');
  const [form, setForm] = useState(null);
  useEffect(() => { if (data) setForm(data.settings); }, [data]);
  if (!form) return <PageLoader />;
  const save = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(FIELDS.map(([k, , t]) => [k, t === 'number' ? Number(form[k]) : form[k]]));
    try { await api.put('/admin/settings', { ...body, whatsapp_enabled: form.whatsapp_enabled }); toast.success('Settings saved'); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Card className="p-6">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-3">
        {FIELDS.map(([k, label, type]) => <Field key={k} label={label}><Input type={type} step="any" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
        <div className="md:col-span-3"><Toggle checked={!!form.whatsapp_enabled} onChange={(v) => setForm({ ...form, whatsapp_enabled: v })} label="Enable WhatsApp booking bot" /></div>
        <div className="md:col-span-3"><Button type="submit">Save settings</Button></div>
      </form>
    </Card>
  );
}

function Locations() {
  const { data, reload } = useFetch('/locations');
  const [form, setForm] = useState({ name: '', address: '', city: '', phone: '', timezone: 'America/New_York' });
  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/locations', { ...form, phone: form.phone || null }); toast.success('Location added'); setForm({ ...form, name: '', address: '', city: '', phone: '' }); reload(); } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {data?.locations.map((l) => (
          <Card key={l.id} className="p-5"><MapPin className="h-5 w-5 text-brass-400" /><p className="mt-2 font-semibold">{l.name}</p><p className="text-sm muted">{l.address}, {l.city}</p><p className="mt-2 text-xs muted">{l.barber_count} barbers · {l.timezone}</p></Card>
        ))}
      </div>
      <Card className="h-fit p-5">
        <form onSubmit={add} className="space-y-3">
          <p className="font-semibold">Add location</p>
          {['name', 'address', 'city', 'phone', 'timezone'].map((k) => <Field key={k} label={k}><Input required={k !== 'phone'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
          <Button type="submit" className="w-full"><Plus className="h-4 w-4" />Add</Button>
        </form>
      </Card>
    </div>
  );
}

function Plans() {
  const { data, reload } = useFetch('/memberships/plans');
  const [form, setForm] = useState({ name: '', price_monthly: 39, discount_percent: 10, included_cuts: 0, points_multiplier: 1.25, perks: '' });
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/memberships/plans', { ...form, price_monthly: Number(form.price_monthly), discount_percent: Number(form.discount_percent), included_cuts: Number(form.included_cuts), points_multiplier: Number(form.points_multiplier), perks: form.perks.split(',').map((p) => p.trim()).filter(Boolean) });
      toast.success('Plan created'); reload();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card><Table rows={data?.plans} columns={[
        { key: 'name', label: 'Plan' }, { key: 'price_monthly', label: 'Monthly', render: (p) => money(p.price_monthly) },
        { key: 'discount_percent', label: 'Discount', render: (p) => `${p.discount_percent}%` }, { key: 'included_cuts', label: 'Free cuts' },
        { key: 'points_multiplier', label: 'Points ×' },
      ]} /></Card>
      <Card className="h-fit p-5">
        <form onSubmit={add} className="space-y-3">
          <p className="font-semibold">New plan</p>
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="$/month"><Input type="number" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} /></Field>
            <Field label="Discount %"><Input type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} /></Field>
            <Field label="Free cuts"><Input type="number" value={form.included_cuts} onChange={(e) => setForm({ ...form, included_cuts: e.target.value })} /></Field>
            <Field label="Points ×"><Input type="number" step="0.25" value={form.points_multiplier} onChange={(e) => setForm({ ...form, points_multiplier: e.target.value })} /></Field>
          </div>
          <Field label="Perks (comma separated)"><Input value={form.perks} onChange={(e) => setForm({ ...form, perks: e.target.value })} /></Field>
          <Button type="submit" className="w-full">Create plan</Button>
        </form>
      </Card>
    </div>
  );
}

function GiftCardList() {
  const { data } = useFetch('/gift-cards');
  return (
    <Card><Table rows={data?.giftCards} columns={[
      { key: 'code', label: 'Code', render: (g) => <span className="font-mono">{g.code}</span> }, { key: 'recipient_name', label: 'Recipient' },
      { key: 'purchaser_name', label: 'Purchased by' }, { key: 'initial_amount', label: 'Value', render: (g) => money(g.initial_amount) },
      { key: 'balance', label: 'Balance', render: (g) => money(g.balance) }, { key: 'expires_at', label: 'Expires', render: (g) => (g.expires_at ? fmtDate(g.expires_at, 'MMM d, yyyy') : '—') },
    ]} /></Card>
  );
}
