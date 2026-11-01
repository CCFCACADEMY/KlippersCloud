import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { Avatar, Card, EmptyState, PageHeader, PageLoader, Stars } from '../../components/ui';

export default function Favorites() {
  const { data, reload } = useFetch('/me/favorites');
  if (!data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Favorite barbers" />
      {data.favorites.length === 0 ? <EmptyState icon={Heart} title="No favorites yet" action={<Link to="/barbers" className="btn-primary">Browse barbers</Link>} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.favorites.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-center gap-3"><Avatar src={b.photo_url} name={b.name} size="lg" /><div><p className="font-semibold">{b.name}</p><p className="text-xs muted">{b.title}</p><Stars value={b.rating_avg} size={12} /></div></div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={async () => { await api.delete(`/me/favorites/${b.id}`); reload(); }}>Remove</button>
                <Link to={`/book?barber=${b.id}`} className="btn-primary">Book</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
