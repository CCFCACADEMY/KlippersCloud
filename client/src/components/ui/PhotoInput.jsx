/**
 * Photo picker for barber profiles: upload an image (resized in the browser to
 * a ~400px JPEG before sending) or paste an https URL.
 */
import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Avatar, Button } from './index';

const MAX_SIDE = 400;

/** Resize + re-encode an image file to a JPEG data URL. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please choose a JPEG, PNG or WebP image'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('Image is larger than 10 MB'));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function PhotoInput({ value, onChange, name }) {
  const fileRef = useRef();
  const [url, setUrl] = useState(value?.startsWith('https://') ? value : '');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { onChange(await fileToDataUrl(file)); setUrl(''); } catch (err) { toast.error(err.message); }
  };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Avatar src={value} name={name || '?'} size="xl" />
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => fileRef.current.click()}><Upload className="h-4 w-4" />Upload photo</Button>
          {value && <Button type="button" variant="ghost" onClick={() => { onChange(null); setUrl(''); }}><X className="h-4 w-4" />Remove</Button>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} aria-label="Upload photo" />
        </div>
        <input className="input" type="url" placeholder="…or paste an https:// image link" value={url}
          onChange={(e) => { setUrl(e.target.value); if (/^https:\/\/\S+$/.test(e.target.value)) onChange(e.target.value); }} />
        <p className="text-xs muted">JPEG, PNG or WebP. Resized to {MAX_SIDE}px automatically.</p>
      </div>
    </div>
  );
}
