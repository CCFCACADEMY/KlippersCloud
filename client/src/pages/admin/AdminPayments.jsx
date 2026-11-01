import toast from 'react-hot-toast';
import { FileText, Undo2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { money, fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, PageHeader, PageLoader, Table } from '../../components/ui';
import { openInvoice } from '../../components/appointments/AppointmentActions';

/** Payment history, invoices and refund management. */
export default function AdminPayments() {
  const { data, reload } = useFetch('/payments', { params: { limit: 100 } });
  if (!data) return <PageLoader />;
  const refund = async (p) => {
    const amt = prompt(`Refund amount (max ${money(p.amount - p.refunded_amount)}). Leave blank for full refund.`);
    if (amt === null) return;
    try { await api.post(`/payments/${p.id}/refund`, { amount: amt ? Number(amt) : undefined, reason: 'Admin refund' }); toast.success('Refund issued'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const markPaid = async (p) => { try { await api.post(`/payments/${p.id}/mark-paid`); toast.success('Marked as paid'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Payments" subtitle="Online, cash & gift card transactions" />
      <Card>
        <Table rows={data.payments} columns={[
          { key: 'invoice_number', label: 'Invoice', render: (p) => <span className="font-mono text-xs">{p.invoice_number}</span> },
          { key: 'customer_name', label: 'Customer', render: (p) => p.customer_name || '—' },
          { key: 'purpose', label: 'For', render: (p) => <span className="capitalize">{p.purpose.replace('_', ' ')}{p.barber_name && <span className="muted"> · {p.barber_name}</span>}</span> },
          { key: 'created_at', label: 'Date', render: (p) => fmtDateTime(p.paid_at || p.created_at) },
          { key: 'method', label: 'Method', render: (p) => <span className="capitalize">{p.method.replace('_', ' ')}</span> },
          { key: 'amount', label: 'Amount', render: (p) => <span>{money(p.amount)}{p.refunded_amount > 0 && <span className="block text-xs text-red-500">−{money(p.refunded_amount)}</span>}</span> },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
          { key: 'a', label: '', className: 'text-right whitespace-nowrap', render: (p) => <>
            <button className="btn-ghost p-2" title="Invoice" onClick={() => openInvoice(p.id)}><FileText className="h-4 w-4" /></button>
            {['paid', 'partially_refunded'].includes(p.status) && <button className="btn-ghost p-2 text-red-500" title="Refund" onClick={() => refund(p)}><Undo2 className="h-4 w-4" /></button>}
            {p.status === 'pending' && p.method === 'cash' && <Button className="py-1 text-xs" onClick={() => markPaid(p)}>Mark paid</Button>}
          </> },
        ]} />
      </Card>
    </>
  );
}
