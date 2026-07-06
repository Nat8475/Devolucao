'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoteActions } from '@/components/transfers/lote-actions';
import { useR2Status } from '@/components/transfers/use-r2-status';
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_BADGE_VARIANT } from '@/lib/transfer-status';
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from '@/lib/return-status';
import type { FileRecord, TransferWithJoins } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const FREIGHT_LABELS: Record<string, string> = {
  tabela: 'Tabela',
  valor_icms: 'Valor + ICMS',
  valor: 'Valor fechado',
  cortesia: 'Cortesia',
};

function dateOnly(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export default function TransferLoteDetailPage() {
  const { loteId } = useParams<{ loteId: string }>();
  const r2Configured = useR2Status();
  const [rows, setRows] = useState<TransferWithJoins[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [transfersRes, filesRes] = await Promise.all([
        fetch(`/api/transfers/lote/${loteId}`),
        fetch(`/api/files?entity_type=transfer&entity_id=${loteId}`),
      ]);
      if (!transfersRes.ok) throw new Error('lote fetch failed');
      setRows(await transfersRes.json());
      setFiles(filesRes.ok ? await filesRes.json() : []);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar a transferência. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [loteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;

  const first = rows[0];
  if (loadError || !first) {
    return (
      <div className="max-w-3xl space-y-4 p-6">
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? 'Lote não encontrado.'}
        </p>
        <Link href="/transfers" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para transferências
        </Link>
      </div>
    );
  }

  const destino =
    first.destination_type === 'filial'
      ? (first.branches?.name ?? 'Filial removida')
      : first.supplier_addresses
        ? `${first.supplier_addresses.label}${first.supplier_addresses.city ? ` — ${first.supplier_addresses.city}` : ''}`
        : 'Endereço removido';

  const showFilesSection = files.length > 0 || r2Configured === true;

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <Link href="/transfers" className="text-sm text-primary underline-offset-4 hover:underline">
        Voltar para transferências
      </Link>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{destino}</h1>
          <Badge variant={TRANSFER_STATUS_BADGE_VARIANT[first.status]}>
            {TRANSFER_STATUS_LABELS[first.status]}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <dt className="text-muted-foreground">Data agendada</dt>
          <dd className="col-span-1 sm:col-span-2">{dateOnly(first.scheduled_date)}</dd>
          <dt className="text-muted-foreground">Frete</dt>
          <dd className="col-span-1 sm:col-span-2">
            {first.freight_type ? FREIGHT_LABELS[first.freight_type] ?? first.freight_type : '—'}
            {first.freight_value != null ? ` · ${currencyFormatter.format(first.freight_value)}` : ''}
          </dd>
          <dt className="text-muted-foreground">Transportadora</dt>
          <dd className="col-span-1 sm:col-span-2">{first.carrier ?? '—'}</dd>
          <dt className="text-muted-foreground">Nº do pedido</dt>
          <dd className="col-span-1 sm:col-span-2">{first.numero_pedido ?? '—'}</dd>
          {first.arrived_at_branch_at && (
            <>
              <dt className="text-muted-foreground">Chegada</dt>
              <dd className="col-span-1 sm:col-span-2">
                Chegou na filial em {dateTimeFormatter.format(new Date(first.arrived_at_branch_at))}
              </dd>
            </>
          )}
          {first.cancel_reason && (
            <>
              <dt className="text-muted-foreground">Motivo do cancelamento</dt>
              <dd className="col-span-1 sm:col-span-2">{first.cancel_reason}</dd>
            </>
          )}
        </dl>
      </div>

      <LoteActions loteId={loteId} rows={rows} onChanged={load} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Itens do lote</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NF</TableHead>
              <TableHead>NFD</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.returns?.nf ?? '—'}</TableCell>
                <TableCell>{row.returns?.nfd ?? '—'}</TableCell>
                <TableCell>{row.returns?.suppliers?.name ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {currencyFormatter.format(row.returns?.valor_total ?? 0)}
                </TableCell>
                <TableCell>
                  {row.returns?.status && (
                    <Badge variant={STATUS_BADGE_VARIANT[row.returns.status]}>
                      {STATUS_LABELS[row.returns.status]}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showFilesSection && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Arquivos</h2>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum arquivo anexado ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>
                    {file.filename ?? file.r2_key} <span className="text-muted-foreground">({file.file_type})</span>
                  </span>
                  {file.url ? (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Abrir
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Indisponível</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
