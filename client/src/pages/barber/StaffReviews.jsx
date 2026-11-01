/** Review management — barbers reply; admins can also hide or delete. */
import { useState } from 'react';
import { Eye, EyeOff, Trash2, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { ago } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader, Stars, Tabs } from '../../components/ui';

export default function StaffReviews() {
  const { user } = useAuth();
  const { data, reload } = useFetch('/me/reviews');
  const [filter, setFilter] = useState('all');
  if (!data) return <PageLoader />;
  const list = data.reviews.filter((r) => filter === 'all' || (filter === 'low' ? r.rating <= 3 : filter === 'hidden' ? !r.is_visible : !r.barber_reply));
  const act = async (fn) => { try { await fn(); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Reviews" subtitle={`${data.reviews.length} reviews`} />
      <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'unanswered', label: 'Unanswered' }, { value: 'low', label: '≤ 3 stars' }, ...(user.role === 'admin' ? [{ value: 'hidden', label: 'Hidden' }] : [])]} />
      <div className="mt-4 space-y-3">
        {list.length === 0 && <EmptyState title="No reviews" />}
        {list.map((r) => (
          <Card key={r.id} className={`p-5 ${r.is_visible ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3"><Stars value={r.rating} /><span className="font-semibold">{r.customer_name}</span>{user.role === 'admin' && <span className="text-sm muted">→ {r.barber_name}</span>}{!r.is_visible && <Badge>hidden</Badge>}</div>
              <span className="text-xs muted">{ago(r.created_at)}</span>
            </div>
            {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
            {r.barber_reply && <p className="mt-2 rounded-lg bg-black/5 p-2 text-sm dark:bg-white/5"><b>Reply:</b> {r.barber_reply}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="py-1.5 text-xs" onClick={() => { const reply = prompt('Your reply', r.barber_reply || ''); if (reply) act(() => api.patch(`/me/reviews/${r.id}/reply`, { reply })); }}><MessageSquare className="h-3.5 w-3.5" />{r.barber_reply ? 'Edit reply' : 'Reply'}</Button>
              {user.role === 'admin' && <>
                <Button variant="ghost" className="py-1.5 text-xs" onClick={() => act(() => api.patch(`/me/reviews/${r.id}/visibility`, { is_visible: !r.is_visible }))}>{r.is_visible ? <><EyeOff className="h-3.5 w-3.5" />Hide</> : <><Eye className="h-3.5 w-3.5" />Show</>}</Button>
                <Button variant="ghost" className="py-1.5 text-xs text-red-500" onClick={() => confirm('Delete this review?') && act(() => api.delete(`/me/reviews/${r.id}`))}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
              </>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
