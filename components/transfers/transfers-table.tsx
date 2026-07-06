'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_BADGE_VARIANT, isVencida } from '@/lib/transfer-status';
import type { TransferWithJoins } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

type FilterKey = 'todas' | 'em_transferencia' | 'concluida' | 'cancelada' | 'vencidas';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'em_transferencia', label: 'Em trânsito' },
  { key: 'concluida', label: 'Concluídas' },
  { key: 'cancelada', label: 'Canceladas' },
  { key: 'vencidas', label: 'Vencidas' },
];

function transfersUrl(filter: FilterKey) {
  if (filter === 'todas') return '/api/transfers';
  if (filter === 'vencidas') return '/api/transfers?vencidas=true';
  return `/api/transfers?status=${filter}`;
}

interface LoteGroup {
  loteId: string;
  scheduledDate: string;
  destinationLabel: string;
  nfCount: number;
  valorTotal: number;
  carrier: string | null;
  status: TransferWithJoins['status'];
  vencida: boolean;
}

function destinationLabel(row: TransferWithJoins): string {
  if (row.destination_type === 'filial') {
    return row.branches?.name ?? 'Filial removida';
  }
  const addr = row.supplier_addresses;
  if (!addr) return 'Endereço removido';
  return addr.city ? `${addr.label} — ${addr.city}` : addr.label;
}

function groupByLote(rows: TransferWithJoins[]): LoteGroup[] {
  const map = new Map<string, LoteGroup>();
  for (const row of rows) {
    const existing = map.get(row.lote_id);
    if (existing) {
      existing.nfCount += 1;
      existing.valorTotal += row.returns?.valor_total ?? 0;
      continue;
    }
    map.set(row.lote_id, {
      loteId: row.lote_id,
      scheduledDate: row.scheduled_date,
      destinationLabel: destinationLabel(row),
      nfCount: 1,
      valorTotal: row.returns?.valor_total ?? 0,
      carrier: row.carrier,
      status: row.status,
      vencida: isVencida(row.status, row.scheduled_date),
    });
  }
  return [...map.values()];
}

export function TransfersTable() {
  const router = useRouter();
  const [rows, setRows] = useState<TransferWithJoins[]>([]);
  const [filter, setFilter] = useState<FilterKey>('todas');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(transfersUrl(filter));
      if (!res.ok) throw new Error('transfers fetch failed');
      const data = await res.json();
      setRows(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar as transferências. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const lotes = useMemo(() => groupByLote(rows), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-150',
              filter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data agendada</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead className="text-right">NFs</TableHead>
            <TableHead>Transportadora</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && lotes.length === 0 && !loadError && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma transferência encontrada.
              </TableCell>
            </TableRow>
          )}
          {lotes.map((lote) => (
            <TableRow
              key={lote.loteId}
              tabIndex={0}
              role="button"
              aria-label={`Ver lote de transferência para ${lote.destinationLabel}`}
              className="cursor-pointer"
              onClick={() => router.push(`/transfers/${lote.loteId}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') router.push(`/transfers/${lote.loteId}`);
              }}
            >
              <TableCell className="tabular-nums">{dateFormatter.format(new Date(`${lote.scheduledDate}T00:00:00Z`))}</TableCell>
              <TableCell>{lote.destinationLabel}</TableCell>
              <TableCell className="text-right tabular-nums">
                {lote.nfCount} NF{lote.nfCount === 1 ? '' : 's'} · {currencyFormatter.format(lote.valorTotal)}
              </TableCell>
              <TableCell>{lote.carrier ?? '—'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={TRANSFER_STATUS_BADGE_VARIANT[lote.status]}>
                    {TRANSFER_STATUS_LABELS[lote.status]}
                  </Badge>
                  {lote.vencida && (
                    <Badge className="border-transparent bg-brand text-brand-foreground">Vencida</Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!loading && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => void reload()}>
            Atualizar
          </Button>
        </div>
      )}
    </div>
  );
}
