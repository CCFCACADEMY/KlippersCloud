import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MapPin, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, PageLoader, Select, Stars, cn } from '../../components/ui';

export default function Barbers() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [sort, setSort] = useState('rating');
  const { data, setData } = useFetch('/barbers', { params: { search: search || undefined, locationId: locationId || undefined, sort } });
  const { data: loc } = useFetch('/locations');

  const toggleFav = async (b) => {
    if (!user) return toast('Sign in to save favorites', { icon: '❤️' });
    await (b.is_favorite ? api.delete(`/me/favorites/${b.id}`) : api.post(`/me/favorites/${b.id}`));
    setData({ barbers: data.barbers.map((x) => (x.id === b.id ? { ...x, is_favorite: !x.is_favorite } : x)) });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">Our barbers</h1>
      <p className="mt-2 muted">Every barber is vetted, reviewed and ready to make you look sharp.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_200px_180px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 muted" /><input className="input pl-9" placeholder="Search by name or specialty (e.g. fades)" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">All locations</option>{loc?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)}><option value="rating">Top rated</option><option value="experience">Most experienced</option><option value="name">Name</option></Select>
      </div>
      {!data ? <PageLoader /> : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.barbers.map((b, i) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="group overflow-hidden">
                <div className="relative aspect-[4/3] overflow-hidden bg-ink-800">
                  <img src={b.photo_url} alt={b.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <button onClick={() => toggleFav(b)} aria-label="Toggle favorite" className="absolute right-3 top-3 rounded-full bg-black/50 p-2 backdrop-blur transition hover:scale-110">
                    <Heart className={cn('h-5 w-5', b.is_favorite ? 'fill-pole-red text-pole-red' : 'text-white')} />
                  </button>
                </div>
                <div className="p-5">
                  <p className="font-display text-xl font-bold">{b.name}</p>
                  <p className="text-sm muted">{b.title} · {b.experience_years} yrs experience</p>
                  <div className="mt-2 flex items-center gap-2"><Stars value={b.rating_avg} /><span className="text-sm muted">{Number(b.rating_avg).toFixed(1)} · {b.rating_count} reviews</span></div>
                  <p className="mt-2 flex items-center gap-1 text-xs muted"><MapPin className="h-3.5 w-3.5" />{b.location_name}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{b.specialties.map((s) => <span key={s} className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs dark:bg-white/5">{s}</span>)}</div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <Link to={`/barbers/${b.id}`} className="btn-secondary">Profile</Link>
                    <Link to={`/book?barber=${b.id}`} className="btn-primary">Book</Link>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
