/** QR / code check-in kiosk page. QR codes link to /checkin?code=XXXXXXXX. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, QrCode } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { Button, Card } from '../../components/ui';

export default function CheckIn() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [state, setState] = useState({ loading: false, message: null, error: null });

  const submit = async (c = code) => {
    setState({ loading: true });
    try {
      const { data } = await api.post('/appointments/checkin', { code: c });
      setState({ message: data.message });
    } catch (e) { setState({ error: errMsg(e) }); }
  };
  // Auto check-in when arriving from a scanned QR code
  useEffect(() => { if (params.get('code')?.length === 8) submit(params.get('code')); /* eslint-disable-next-line */ }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8 text-center">
        {state.message ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold">You're checked in!</h1>
            <p className="mt-2 muted">{state.message}</p>
          </motion.div>
        ) : (
          <>
            <QrCode className="mx-auto h-14 w-14 text-brass-400" />
            <h1 className="mt-4 text-2xl font-bold">Check in</h1>
            <p className="mt-1 text-sm muted">Scan your booking QR code, or enter the 8-character code from your confirmation.</p>
            <input className="input mt-6 text-center font-mono text-2xl uppercase tracking-[.4em]" maxLength={8} value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" aria-label="Check-in code" />
            {state.error && <p className="mt-3 text-sm text-red-500">{state.error}</p>}
            <Button className="mt-4 w-full" loading={state.loading} disabled={code.length !== 8} onClick={() => submit()}>Check in</Button>
          </>
        )}
      </Card>
    </div>
  );
}
