import { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money, fmtDate } from '../../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Toggle } from '../../components/ui';

export default function AdminCoupons() {
  const { data, reload } = useFetch('/admin/coupons');
  const [form, setForm] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/coupons', {
        code: form.code, description: form.description || undefined, discount_type: form.discount_type, discount_value: Number(form.discount_value),
        min_amount: Number(form.min_amount || 0), max_uses: form.max_uses ? Number(form.max_uses) : null, per_user_limit: Number(form.per_user_limit || 1),
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      });
      toast.success('Coupon created'); setForm(null); reload();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const toggle = async (c) => { await api.patch(`/admin/coupons/${c.id}`, { is_active: !c.is_active }); reload(); };
  return (
    <>
      <PageHeader title="Coupons & discounts" actions={<Button onClick={() => setForm({ code: '', discount_type: 'percent', discount_value: 10, min_amount: 0, max_uses: '', per_user_limit: 1, valid_until: '', description: '' })}><Plus className="h-4 w-4" />New coupon</Button>} />
      <Card>
        <Table rows={data?.coupons} columns={[
          { key: 'code', label: 'Code', render: (c) => <span className="rounded bg-brass-400/15 px-2 py-0.5 font-mono font-semibold text-brass-600 dark:text-brass-300">{c.code}</span> },
          { key: 'description', label: 'Description' },
          { key: 'discount', label: 'Discount', render: (c) => (c.discount_type === 'percent' ? `${c.discount_value}%` : money(c.discount_value)) },
          { key: 'min_amount', label: 'Min spend', render: (c) => money(c.min_amount) },
          { key: 'used', label: 'Used', render: (c) => `${c.used_count}${c.max_uses ? ` / ${c.max_uses}` : ''}` },
          { key: 'valid_until', label: 'Expires', render: (c) => (c.valid_until ? fmtDate(c.valid_until, 'MMM d, yyyy') : 'Never') },
          { key: 'is_active', label: 'Active', render: (c) => <Toggle checked={c.is_active} onChange={() => toggle(c)} /> },
        ]} />
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title="New coupon">
        {form && (
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <Field label="Code"><Input required className="input uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Type"><Select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed $</option></Select></Field>
            <Field label="Value"><Input type="number" min={0.01} step="0.01" required value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></Field>
            <Field label="Min spend $"><Input type="number" min={0} value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} /></Field>
            <Field label="Max total uses"><Input type="number" min={1} placeholder="Unlimited" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} /></Field>
            <Field label="Uses per customer"><Input type="number" min={1} value={form.per_user_limit} onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })} /></Field>
            <Field label="Expires"><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Button type="submit" className="sm:col-span-2">Create coupon</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
