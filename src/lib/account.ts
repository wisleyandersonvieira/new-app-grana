export type BillingStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'admin_free';

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('pt-BR') : '—';

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : '—';

export const formatCurrency = (value?: number | null, currency = 'BRL') =>
  typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency })
    : '—';

export const getStatusMeta = (status?: string | null) => {
  switch (status) {
    case 'active':
      return { label: 'Ativa', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'trial':
      return { label: 'Teste', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'past_due':
      return { label: 'Pagamento pendente', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'unpaid':
      return { label: 'Não paga', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'canceled':
      return { label: 'Cancelada', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'incomplete':
      return { label: 'Incompleta', className: 'bg-orange-100 text-orange-800 border-orange-200' };
    case 'incomplete_expired':
      return { label: 'Incompleta expirada', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'admin_free':
      return { label: 'Admin', className: 'bg-primary/10 text-primary border-primary/20' };
    default:
      return { label: 'Expirada', className: 'bg-red-100 text-red-800 border-red-200' };
  }
};

export const getAccountStatusMeta = (status?: string | null, blocked?: boolean | null) => {
  if (blocked) return { label: 'Bloqueado', className: 'bg-red-100 text-red-800 border-red-200' };
  switch (status) {
    case 'active':
      return { label: 'Ativo', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'inactive':
      return { label: 'Inativo', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    default:
      return { label: status || '—', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

export const getDaysLeft = (value?: string | null) => {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
};
