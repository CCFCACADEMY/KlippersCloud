import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useDebounced, useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { money, fmtDate } from '../../lib/format';
import { Avatar, Badge, Button, Card, PageHeader, Select } from '../../components/ui';
import { Table } from '../../components/ui';

/** User management: search, filter, suspend/activate, change role, award points. */
export default function AdminCustomers() {
  const [role, setRole] = useState('customer');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { user: me } = useAuth();
  const q = useDebounced(search);
  const { data, reload } = useFetch('/admin/users', { params: { role: role || undefined, status: status || undefined, search: q || undefined, page } });
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Users" subtitle="Manage customers, staff and account status." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <input className="input" aria-label="Search users" placeholder="Search name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="customer">Customers</option><option value="barber">Barbers</option><option value="admin">Admins</option></Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
      </div>
      <Card>
        <Table rows={data?.users} columns={[
          { key: 'name', label: 'User', render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div><p className="font-semibold">{u.name}</p><p className="text-xs muted">{u.email}</p></div></div> },
          { key: 'role', label: 'Role', render: (u) => (u.id === me.id ? <span className="capitalize">{u.role} (you)</span> : (
            <div className="min-w-[120px]"><Select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => {
              const role = e.target.value;
              if (!confirm(`Change ${u.name} from ${u.role} to ${role}?${role === 'admin' ? ' Admins have full access to the business.' : ''}`)) return;
              act(() => api.patch(`/admin/users/${u.id}/role`, { role }), 'Role updated');
            }}><option value="customer">customer</option><option value="barber">barber</option><option value="admin">admin</option></Select></div>)) },
          { key: 'bookings', label: 'Bookings' },
          { key: 'spent', label: 'Spent', render: (u) => money(u.spent) },
          { key: 'loyalty_points', label: 'Points', render: (u) => <button className="hover:text-brass-500" title="Adjust points" onClick={() => { const p = prompt('Points to add (negative to deduct)'); if (p && !isNaN(p)) act(() => api.post(`/admin/users/${u.id}/points`, { points: Number(p), reason: 'Manual adjustment by admin' }), 'Points adjusted'); }}>{u.loyalty_points}</button> },
          { key: 'created_at', label: 'Joined', render: (u) => fmtDate(u.created_at, 'MMM d, yyyy') },
          { key: 'is_active', label: 'Status', render: (u) => <Badge status={u.is_active ? 'confirmed' : 'rejected'}>{u.is_active ? 'Active' : 'Suspended'}</Badge> },
          { key: 'actions', label: '', className: 'text-right', render: (u) => u.id === me.id ? null : (
            <Button variant={u.is_active ? 'ghost' : 'secondary'} className={`py-1.5 text-xs ${u.is_active ? 'text-red-500' : ''}`}
              onClick={() => act(() => api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active }), u.is_active ? 'User suspended' : 'User activated')}>
              {u.is_active ? 'Suspend' : 'Activate'}
            </Button>) },
        ]} />
      </Card>
      {data && <div className="mt-4 flex items-center justify-between text-sm"><span className="muted">{data.total} users</span>
        <div className="flex gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button><Button variant="secondary" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    </>
  );
}
