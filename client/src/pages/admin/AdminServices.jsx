import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Textarea, Toggle } from '../../components/ui';
import ServiceIcon from '../../components/booking/ServiceIcon';
import { categoryLabel } from '../../lib/format';

const BUILTIN = ['haircut', 'beard', 'coloring', 'wash', 'facial', 'package', 'custom'];
const NEW = '__new__';

const EMPTY = { name: '', category: 'haircut', newCategory: '', description: '', duration_min: 30, price: 300, is_active: true };

export default function AdminServices() {
  const { data, reload } = useFetch('/services', { params: { all: 'true' } });
  const [edit, setEdit] = useState(null);
  // Built-in types plus any the admin has created before
  const categories = [...new Set([...BUILTIN, ...(data?.services || []).map((x) => x.category)])];
  const save = async (e) => {
    e.preventDefault();
    const category = edit.category === NEW ? edit.newCategory.trim() : edit.category;
    if (!category) return toast.error('Enter a name for the new service type');
    const body = { name: edit.name, category, description: edit.description || null, duration_min: Number(edit.duration_min), price: Number(edit.price), is_active: edit.is_active };
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
          { key: 'category', label: 'Type', render: (s) => categoryLabel(s.category) },
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Service type"><Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                <option value={NEW}>＋ New type…</option>
              </Select></Field>
              <Field label="Minutes"><Input type="number" min={5} step={5} value={edit.duration_min} onChange={(e) => setEdit({ ...edit, duration_min: e.target.value })} /></Field>
              <Field label="Price ₹"><Input type="number" min={0} step="any" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            </div>
            {edit.category === NEW && (
              <Field label="New service type name" hint="e.g. Head Spa, Bridal, Hair Treatment — it becomes a filter on the Services page">
                <Input autoFocus required maxLength={40} value={edit.newCategory} onChange={(e) => setEdit({ ...edit, newCategory: e.target.value })} />
              </Field>
            )}
            <Field label="Description"><Textarea value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Toggle checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Active (bookable)" />
            <Button type="submit" className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
