import { Link, useParams } from 'react-router-dom';
import { Award, Clock, MapPin, Scissors } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { money, ago, DAYS } from '../../lib/format';
import { Avatar, Card, EmptyState, PageLoader, Stars } from '../../components/ui';
import BeforeAfter from '../../components/BeforeAfter';

export default function BarberProfile() {
  const { id } = useParams();
  const { data, error } = useFetch(`/barbers/${id}`);
  if (error) return <div className="p-12"><EmptyState title="Barber not found" /></div>;
  if (!data) return <PageLoader />;
  const { barber: b, services, hours, reviews, gallery } = data;
  const dist = [5, 4, 3, 2, 1].map((r) => [r, reviews.filter((x) => x.rating === r).length]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Card className="overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-ink-900 via-ink-800 to-brass-700 sm:h-36" />
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar src={b.photo_url} name={b.name} size="xl" className="-mt-14 ring-4 ring-white dark:ring-ink-800" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{b.name}</h1>
            <p className="muted">{b.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5"><Stars value={b.rating_avg} />{Number(b.rating_avg).toFixed(1)} ({b.rating_count})</span>
              <span className="flex items-center gap-1 muted"><Award className="h-4 w-4" />{b.experience_years} years</span>
              <span className="flex items-center gap-1 muted"><Scissors className="h-4 w-4" />{b.completed_cuts} cuts on Klippers</span>
              <span className="flex items-center gap-1 muted"><MapPin className="h-4 w-4" />{b.location_name}</span>
            </div>
          </div>
          <Link to={`/book?barber=${b.id}`} className="btn-primary px-6 py-3">Book with {b.name.split(' ')[0]}</Link>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-xl font-bold">About</h2>
            <p className="mt-2 muted">{b.bio}</p>
            <div className="mt-4 flex flex-wrap gap-2">{b.specialties.map((s) => <span key={s} className="rounded-full bg-brass-400/15 px-3 py-1 text-sm text-brass-600 dark:text-brass-300">{s}</span>)}</div>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl font-bold">Services</h2>
            <div className="mt-4 divide-y divide-black/5 dark:divide-white/5">
              {services.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <div><p className="font-semibold">{s.name}</p><p className="flex items-center gap-1 text-xs muted"><Clock className="h-3 w-3" />{s.duration_min} min</p></div>
                  <div className="flex items-center gap-3"><span className="font-semibold">{money(s.price)}</span><Link to={`/book?barber=${b.id}&service=${s.id}`} className="btn-secondary py-1.5 text-xs">Book</Link></div>
                </div>
              ))}
            </div>
          </Card>
          {gallery.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-bold">Portfolio</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">{gallery.map((g) => <BeforeAfter key={g.id} item={g} />)}</div>
            </Card>
          )}
          <Card className="p-6">
            <h2 className="text-xl font-bold">Reviews</h2>
            {reviews.length === 0 ? <p className="mt-2 muted">No reviews yet.</p> : (
              <div className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-black/5 pb-4 last:border-0 dark:border-white/5">
                    <div className="flex items-center justify-between"><p className="font-semibold">{r.customer_name}</p><span className="text-xs muted">{ago(r.created_at)}</span></div>
                    <Stars value={r.rating} size={12} />
                    {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                    {r.barber_reply && <p className="mt-2 rounded-lg bg-black/5 p-2 text-sm dark:bg-white/5"><b>{b.name.split(' ')[0]}:</b> {r.barber_reply}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-bold">Working hours</h2>
            <div className="mt-3 space-y-1.5 text-sm">
              {hours.map((h) => (
                <div key={h.day_of_week} className="flex justify-between"><span>{DAYS[h.day_of_week]}</span>
                  <span className="muted">{h.is_off ? 'Closed' : `${h.start_time.slice(0, 5)} – ${h.end_time.slice(0, 5)}`}</span></div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl font-bold">Rating breakdown</h2>
            <div className="mt-3 space-y-2">
              {dist.map(([r, n]) => (
                <div key={r} className="flex items-center gap-2 text-sm">
                  <span className="w-3">{r}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"><div className="h-full rounded-full bg-brass-400" style={{ width: `${reviews.length ? (n / reviews.length) * 100 : 0}%` }} /></div>
                  <span className="w-6 text-right muted">{n}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs muted">Based on the latest {reviews.length} reviews</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
