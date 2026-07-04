import type { ReturnStatus } from '@/lib/types';

export const STATUS_LABELS: Record<ReturnStatus, string> = {
  rascunho: 'Rascunho',
  pendente: 'Pendente',
  em_transferencia: 'Em Transferência',
  devolvido: 'Devolvido',
  venda: 'Venda',
};

export const STATUS_BADGE_VARIANT: Record<ReturnStatus, 'default' | 'secondary' | 'outline'> = {
  rascunho: 'outline',
  pendente: 'secondary',
  em_transferencia: 'secondary',
  devolvido: 'default',
  venda: 'default',
};
