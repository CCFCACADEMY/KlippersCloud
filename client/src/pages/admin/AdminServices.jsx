import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Textarea, Toggle } from '../../components/ui';
import ServiceIcon, { CATEGORY_LABELS } from '../../components/booking/ServiceIcon';

const EMPTY = { name: '', category: 'haircut', description: '', duration_min: 30, price: 30, is_active: true };

export default function AdminServices() {
  const { data, reload } = useFetch('/services', { params: { all: 'true' } });
  const [edit, setEdit] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const body = { name: edit.name, category: edit.category, description: edit.description || null, duration_min: Number(edit.duration_min), price: Number(edit.price), is_active: edit.is_active };
    try {
      await (edit.id ? api.patch(`/services/${edit.id}`, body) : api.post('/services', body));
      toast.success('Service saved'); setEdit(null); reload();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <>
      <PageHeader title="Services" subtitle="Haircuts, beard trims, coloring, packages and custom services." actions={<Button onClick={() => setEdit(EMPTY)}><Plus className="h-4 w-4" />New service</Button>} />
      <Card>
        <Table rows={data?.services} columns={[
          { key: 'name', label: 'Service', render: (s) => <div className="flex items-center gap-3"><span className="rounded-lg bg-brass-400/15 p-2 text-brass-500"><ServiceIcon category={s.category} className="h-4 w-4" /></span><div><p className="font-semibold">{s.name}</p><p className="max-w-xs truncate text-xs muted">{s.description}</p></div></div> },
          { key: 'category', label: 'Category', render: (s) => CATEGORY_LABELS[s.category] },
          { key: 'duration_min', label: 'Duration', render: (s) => `${s.duration_min} min` },
          { key: 'price', label: 'Price', render: (s) => money(s.price) },
          { key: 'barber_count', label: 'Barbers' },
          { key: 'is_active', label: 'Status', render: (s) => <Badge status={s.is_active ? 'confirmed' : 'cancelled'}>{s.is_active ? 'Active' : 'Inactive'}</Badge> },
          { key: 'edit', label: '', render: (s) => <button className="btn-ghost p-2" aria-label="Edit" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></button> },
        ]} />
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit service' : 'New service'}>
        {edit && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category"><Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Minutes"><Input type="number" min={5} step={5} value={edit.duration_min} onChange={(e) => setEdit({ ...edit, duration_min: e.target.value })} /></Field>
              <Field label="Price $"><Input type="number" min={0} step="0.5" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            </div>
            <Field label="Description"><Textarea value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Active (bookable)" />
            <Button type="submit" className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
