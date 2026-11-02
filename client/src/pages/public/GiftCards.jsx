import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errMsg } from '../../lib/api';
import { money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Field, Input, Textarea, cn } from '../../components/ui';

export default function GiftCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ amount: 1000, recipientName: '', recipientEmail: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState(null);
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState(null);

  const buy = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: '/gift-cards' } });
    setBusy(true);
    try {
      const { data } = await api.post('/gift-cards/purchase', { ...form, amount: Number(form.amount) });
      setCard(data.giftCard);
      toast.success('Gift card sent!');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const check = async () => {
    if (!code.trim()) return toast.error('Enter a gift card code to check its balance.');
    try { setBalance((await api.get(`/gift-cards/${code.trim()}/balance`)).data.giftCard); } catch (err) { toast.error(errMsg(err)); setBalance(null); }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="text-4xl font-bold">Gift cards</h1>
        <p className="mt-2 muted">The gift of a fresh cut. Delivered instantly by email, valid for 12 months on any service.</p>
        {/* Card preview */}
        <div className="relative mt-8 aspect-[1.6] max-w-md overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-brass-700 p-7 text-white shadow-2xl">
          <div className="pole-stripes absolute -right-8 top-0 h-full w-6 rotate-12 opacity-60" />
          <Gift className="h-8 w-8 text-brass-300" />
          <p className="mt-6 font-display text-5xl font-bold">{money(form.amount)}</p>
          <p className="mt-1 text-white/70">for {form.recipientName || 'someone special'}</p>
          <p className="absolute bottom-6 left-7 font-mono tracking-widest text-brass-300">{card?.code || 'XXXX-XXXX-XXXX'}</p>
          <p className="absolute bottom-6 right-7 font-display font-bold">KLIPPERS</p>
        </div>
        <Card className="mt-8 max-w-md p-5">
          <p className="font-semibold">Check a balance</p>
          <div className="mt-3 flex gap-2">
            <Input aria-label="Gift card code" placeholder="GIFT-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Button variant="secondary" onClick={check} aria-label="Check balance"><Search className="h-4 w-4" /></Button>
          </div>
          {balance && <p className="mt-3 text-sm">Balance: <b>{money(balance.balance)}</b> of {money(balance.initial_amount)} {!balance.is_active && '(inactive)'}</p>}
        </Card>
      </div>
      <Card className="h-fit p-6">
        {card ? (
          <div className="py-8 text-center">
            <Gift className="mx-auto h-12 w-12 text-brass-400" />
            <h2 className="mt-4 text-2xl font-bold">Sent to {card.recipient_name}!</h2>
            <p className="mt-2 muted">Code <b className="font-mono">{card.code}</b> was emailed to {card.recipient_email}.</p>
            <Button className="mt-6" variant="secondary" onClick={() => setCard(null)}>Send another</Button>
          </div>
        ) : (
          <form onSubmit={buy} className="space-y-4">
            <div>
              <span className="label">Amount</span>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2000, 5000].map((a) => (
                  <button type="button" key={a} onClick={() => setForm({ ...form, amount: a })}
                    className={cn('rounded-xl border py-3 font-semibold transition', Number(form.amount) === a ? 'border-brass-400 bg-brass-400 text-ink-900' : 'border-black/10 dark:border-white/10')}>
                    {money(a)}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Custom amount (₹100 – ₹50,000)"><Input type="number" min={100} max={50000} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Recipient name"><Input required value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} /></Field>
            <Field label="Recipient email"><Input required type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} /></Field>
            <Field label="Personal message (optional)"><Textarea maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
            <Button type="submit" className="w-full" loading={busy}>{user ? `Buy for ${money(form.amount)}` : 'Sign in to purchase'}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
