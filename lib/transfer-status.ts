import type { TransferStatus } from '@/lib/types';

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  em_transferencia: 'Em Transferência',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const TRANSFER_STATUS_BADGE_VARIANT: Record<TransferStatus, 'default' | 'secondary' | 'outline'> = {
  em_transferencia: 'secondary',
  concluida: 'default',
  cancelada: 'outline',
};

/** `scheduled_date` vem como `YYYY-MM-DD` — comparação lexicográfica com a data
 * de hoje no mesmo formato é segura e evita fuso-horário de `Date` completo. */
export function isVencida(status: TransferStatus, scheduledDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return status === 'em_transferencia' && scheduledDate < today;
}
