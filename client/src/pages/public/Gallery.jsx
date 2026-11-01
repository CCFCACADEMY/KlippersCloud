import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { PageLoader, Tabs } from '../../components/ui';
import BeforeAfter from '../../components/BeforeAfter';

export default function Gallery() {
  const [tag, setTag] = useState('all');
  const { data } = useFetch('/gallery', { params: { tag: tag === 'all' ? undefined : tag } });
  const tags = ['all', 'fade', 'beard', 'classic', 'color', 'curly', 'textured'];
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">Before & after</h1>
      <p className="mt-2 muted">Drag the slider to see the transformation.</p>
      <div className="mt-6"><Tabs value={tag} onChange={setTag} tabs={tags.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} /></div>
      {!data ? <PageLoader /> : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((g) => <BeforeAfter key={g.id} item={g} />)}</div>
      )}
    </div>
  );
}
