/**
 * Selfie capture for the Style Advisor.
 * - "Use camera": live front-camera preview (getUserMedia) → capture
 * - "Upload a photo": file picker (on phones this can open the camera directly)
 * Images are resized in the browser to ≤768px JPEG before upload. The camera is
 * switched off as soon as a photo is taken or the component unmounts.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from './ui';

const MAX_SIDE = 768;

function toJpeg(source, width, height, mirror = false) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } // match the mirrored preview
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export default function CameraCapture({ value, onChange }) {
  const videoRef = useRef();
  const fileRef = useRef();
  const [stream, setStream] = useState(null);
  const [starting, setStarting] = useState(false);

  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); setStream(null); };
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => { if (stream && videoRef.current) videoRef.current.srcObject = stream; }, [stream]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Your browser cannot open the camera here. Please upload a photo instead.');
      return fileRef.current.click();
    }
    setStarting(true);
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }));
    } catch (e) {
      toast.error(e.name === 'NotAllowedError' ? 'Camera permission was denied. You can upload a photo instead.' : 'Could not open the camera. Try uploading a photo.');
    } finally { setStarting(false); }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    onChange(toJpeg(v, v.videoWidth, v.videoHeight, true));
    stop();
  };

  const upload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) return toast.error('Please choose an image');
    const img = new Image();
    img.onload = () => { onChange(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(img.src); };
    img.onerror = () => toast.error('Could not read that image. Try a JPEG or PNG.');
    img.src = URL.createObjectURL(file);
  };

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-3xl border border-brass-400/40 bg-ink-900">
        {stream ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Camera preview" />
            {/* Framing guide */}
            <div className="pointer-events-none absolute inset-[14%] rounded-[45%] border-2 border-dashed border-brass-300/70" />
            <p className="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">Face the camera, hair visible, good light</p>
          </>
        ) : value ? (
          <img src={value} alt="Your photo" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-white/70">
            <Camera className="h-10 w-10 text-brass-300" />
            <p className="text-sm">Take a selfie and the AI stylist will read your hair and face shape.</p>
          </div>
        )}
        {value && !stream && (
          <button onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white" aria-label="Remove photo"><X className="h-4 w-4" /></button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {stream ? (
          <>
            <Button onClick={capture}><Camera className="h-4 w-4" />Take photo</Button>
            <Button variant="ghost" onClick={stop}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant={value ? 'secondary' : 'primary'} loading={starting} onClick={start}>
              {value ? <><RotateCcw className="h-4 w-4" />Retake</> : <><Camera className="h-4 w-4" />Use camera</>}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current.click()}><ImageUp className="h-4 w-4" />Upload a photo</Button>
          </>
        )}
        {/* capture="user" lets phones open the front camera straight from the picker */}
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={upload} aria-label="Upload a photo" />
      </div>
      <p className="mt-2 text-center text-[11px] muted">Your photo is only used for this suggestion and is never stored.</p>
    </div>
  );
}
