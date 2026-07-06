'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BatchActionsStepper } from './batch-actions-stepper';
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from '@/lib/return-status';
import type { ReturnRecord, ReturnStatus } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR');

function returnsUrl(statusFilter: ReturnStatus | 'todos') {
  return statusFilter === 'todos' ? '/api/returns' : `/api/returns?status=${statusFilter}`;
}

export function ReturnsTable() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | 'todos'>('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(returnsUrl(statusFilter));
      if (!res.ok) throw new Error('returns fetch failed');
      const data = await res.json();
      setReturns(data);
      setSelected(new Set());
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar as devoluções. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    // Carga inicial + recarga ao trocar o filtro; `reload` é async (não seta estado
    // sincronicamente), o lint não distingue isso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === returns.length ? new Set() : new Set(returns.map((r) => r.id))));
  }

  const allSelected = returns.length > 0 && selected.size === returns.length;
  const selectedReturns = returns.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReturnStatus | 'todos')}>
          <SelectTrigger className="w-48 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos" className="cursor-pointer">Todos os status</SelectItem>
            <SelectItem value="rascunho" className="cursor-pointer">Rascunho</SelectItem>
            <SelectItem value="pendente" className="cursor-pointer">Pendente</SelectItem>
            <SelectItem value="em_transferencia" className="cursor-pointer">Em Transferência</SelectItem>
            <SelectItem value="devolvido" className="cursor-pointer">Devolvido</SelectItem>
            <SelectItem value="venda" className="cursor-pointer">Venda</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <BatchActionsStepper
            action="transferencia"
            selectedIds={[...selected]}
            selectedReturns={selectedReturns}
            onDone={reload}
          />
          <BatchActionsStepper action="venda" selectedIds={[...selected]} onDone={reload} />
          <BatchActionsStepper action="reabrir" selectedIds={[...selected]} onDone={reload} />
        </div>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="cursor-pointer"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Selecionar todos"
                disabled={returns.length === 0}
              />
            </TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Qtd</TableHead>
            <TableHead className="text-right">Valor total</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && returns.length === 0 && !loadError && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma devolução encontrada.
              </TableCell>
            </TableRow>
          )}
          {returns.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Selecionar devolução ${r.nf ?? r.id}`}
                />
              </TableCell>
              <TableCell>{r.nf ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{numberFormatter.format(r.qtd)}</TableCell>
              <TableCell className="text-right tabular-nums">{currencyFormatter.format(r.valor_total)}</TableCell>
              <TableCell>
                <Link href={`/returns/${r.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                  Ver
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
