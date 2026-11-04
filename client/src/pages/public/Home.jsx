import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck, Gift, Sparkles, Star, Clock, ShieldCheck, QrCode } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { money } from '../../lib/format';
import { Avatar, Card, Stars } from '../../components/ui';
import ServiceIcon from '../../components/booking/ServiceIcon';

const fadeUp = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

export default function Home() {
  const { data: s } = useFetch('/services');
  const { data: b } = useFetch('/barbers');
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(106,70,176,.35),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,.18),transparent_50%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-brass-400/30 bg-brass-400/10 px-3 py-1 text-xs font-semibold text-brass-500 dark:text-brass-300">
              <Sparkles className="h-3.5 w-3.5" /> New: AI hairstyle advisor
            </span>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] sm:text-6xl lg:text-7xl">
              Sharp cuts.<br /><span className="text-brass-400">Zero waiting.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg muted">
              Book master barbers in seconds, check in with a QR code, and earn rewards on every visit. Classic craft, modern convenience.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/book" className="btn-primary px-6 py-3 text-base">Book an appointment <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/availability" className="btn-secondary px-6 py-3 text-base">See who&apos;s free today</Link>
            </div>
            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-3">
                {b?.barbers.slice(0, 4).map((x) => <Avatar key={x.id} src={x.photo_url} name={x.name} className="ring-4 ring-cream dark:ring-ink-950" />)}
              </div>
              <div>
                <div className="flex items-center gap-1"><Stars value={5} /><span className="text-sm font-semibold">4.8/5</span></div>
                <p className="text-sm muted">Loved by 2,000+ regulars</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
            <div className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-[2rem] bg-ink-900 shadow-2xl ring-1 ring-brass-400/30">
              <img src="/images/hero.svg" alt="Illustration of a Klippers master barber" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
              <div className="absolute left-4 top-4 h-28 w-3 overflow-hidden rounded-full ring-2 ring-white/40"><div className="pole-stripes h-full" /></div>
              <Card className="absolute bottom-5 left-5 right-5 flex items-center gap-3 p-4">
                <span className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-500"><CalendarCheck className="h-5 w-5" /></span>
                <div className="text-sm"><p className="font-semibold">Booking confirmed</p><p className="muted">Skin Fade · Today 3:30 PM</p></div>
                <QrCode className="ml-auto h-8 w-8 text-brass-400" />
              </Card>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[[Clock, 'Real-time booking', 'Live availability — no phone tag, no double bookings.'],
            [QrCode, 'QR check-in', 'Scan on arrival and your barber is notified instantly.'],
            [Gift, 'Loyalty rewards', 'Earn points every visit and redeem them for discounts.'],
            [ShieldCheck, 'Secure payments', 'Pay online by card, gift card, or in-store with cash.']].map(([Icon, t, d], i) => (
            <motion.div key={t} {...fadeUp} transition={{ delay: i * 0.08 }}>
              <Card className="h-full p-6"><Icon className="h-6 w-6 text-brass-400" /><p className="mt-4 font-semibold">{t}</p><p className="mt-1 text-sm muted">{d}</p></Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <motion.div {...fadeUp} className="flex items-end justify-between">
          <div><p className="label text-brass-500">The menu</p><h2 className="text-4xl font-bold">Services & pricing</h2></div>
          <Link to="/services" className="hidden text-sm font-semibold text-brass-500 hover:underline sm:block">Full menu →</Link>
        </motion.div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s?.services.slice(0, 6).map((x, i) => (
            <motion.div key={x.id} {...fadeUp} transition={{ delay: i * 0.05 }}>
              <Link to={`/book?service=${x.id}`} className="card group flex items-center gap-4 p-5 transition hover:-translate-y-1 hover:shadow-glow">
                <span className="rounded-xl bg-brass-400/15 p-3 text-brass-500 transition group-hover:bg-brass-400 group-hover:text-ink-900"><ServiceIcon category={x.category} /></span>
                <div className="flex-1"><p className="font-semibold">{x.name}</p><p className="text-xs muted">{x.duration_min} min</p></div>
                <p className="font-display text-xl font-bold">{money(x.price)}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Barbers */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <motion.div {...fadeUp}><p className="label text-brass-500">The crew</p><h2 className="text-4xl font-bold">Master barbers</h2></motion.div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {b?.barbers.slice(0, 3).map((x, i) => (
            <motion.div key={x.id} {...fadeUp} transition={{ delay: i * 0.08 }}>
              <Link to={`/barbers/${x.id}`} className="card group block overflow-hidden">
                <div className="aspect-[4/3] overflow-hidden bg-ink-800"><img src={x.photo_url} alt={x.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>
                <div className="p-5">
                  <div className="flex items-center justify-between"><p className="font-display text-xl font-bold">{x.name}</p><span className="flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-brass-400 text-brass-400" />{Number(x.rating_avg).toFixed(1)}</span></div>
                  <p className="text-sm muted">{x.title} · {x.experience_years} years</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{x.specialties.map((sp) => <span key={sp} className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs dark:bg-white/5">{sp}</span>)}</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <motion.div {...fadeUp} className="relative overflow-hidden rounded-[2rem] bg-ink-900 px-6 py-14 text-center text-white sm:px-12">
                    <h2 className="text-4xl font-bold">Not sure what suits you?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/60">Tell our AI style advisor about your face shape and hair type — get three tailored cuts and exactly what to ask your barber.</p>
          <Link to="/style-advisor" className="btn-primary mt-8 px-6 py-3"><Sparkles className="h-4 w-4" /> Try the Style Advisor</Link>
        </motion.div>
      </section>
    </>
  );
}
