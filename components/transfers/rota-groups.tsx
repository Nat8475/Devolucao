'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TransferFormDialog } from '@/components/transfers/transfer-form-dialog';
import type { RotaGroup } from '@/lib/rotas';
import type { ReturnRecord, Supplier } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const SEM_ENDERECO = 'Sem endereço cadastrado';

interface DialogContext {
  group: RotaGroup;
  returns: ReturnRecord[];
  initialDestinationType?: 'filial' | 'fornecedor';
  initialSupplierAddressId?: string;
  restrictSupplierAddressIds?: string[];
}

export function RotaGroups({
  groups,
  suppliersById,
  onScheduled,
}: {
  groups: RotaGroup[];
  suppliersById: Map<string, Supplier>;
  onScheduled: () => void;
}) {
  // Estado de seleção de NFs por grupo (chave = `${city}|${uf}`), todas marcadas por padrão.
  const [checkedByGroup, setCheckedByGroup] = useState<Record<string, Set<string>>>({});
  const [dialogCtx, setDialogCtx] = useState<DialogContext | null>(null);

  function groupKey(g: RotaGroup) {
    return `${g.city}|${g.uf}`;
  }

  function checkedIdsFor(g: RotaGroup): Set<string> {
    return checkedByGroup[groupKey(g)] ?? new Set(g.returns.map((r) => r.id));
  }

  function toggleReturn(g: RotaGroup, returnId: string) {
    const key = groupKey(g);
    const current = new Set(checkedIdsFor(g));
    if (current.has(returnId)) current.delete(returnId);
    else current.add(returnId);
    setCheckedByGroup((prev) => ({ ...prev, [key]: current }));
  }

  function openDialogFor(g: RotaGroup) {
    const checked = checkedIdsFor(g);
    const selected = g.returns.filter((r) => checked.has(r.id));
    if (selected.length === 0) return;

    const supplierIds = new Set(selected.map((r) => r.supplier_id));
    const isSingleSupplier = supplierIds.size === 1 && g.city !== SEM_ENDERECO;

    if (!isSingleSupplier) {
      setDialogCtx({ group: g, returns: selected });
      return;
    }

    const supplierId = [...supplierIds][0];
    const supplierAddresses = g.addresses.filter((a) => a.supplier_id === supplierId);
    setDialogCtx({
      group: g,
      returns: selected,
      initialDestinationType: 'fornecedor',
      initialSupplierAddressId: supplierAddresses.length === 1 ? supplierAddresses[0].id : undefined,
      restrictSupplierAddressIds: supplierAddresses.length > 0 ? supplierAddresses.map((a) => a.id) : undefined,
    });
  }

  const dialogOpen = dialogCtx !== null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <RotaGroupCard
          key={groupKey(g)}
          group={g}
          suppliersById={suppliersById}
          checkedIds={checkedIdsFor(g)}
          onToggle={(id) => toggleReturn(g, id)}
          onSchedule={() => openDialogFor(g)}
        />
      ))}

      {dialogCtx && (
        <TransferFormDialog
          open={dialogOpen}
          onOpenChange={(v) => !v && setDialogCtx(null)}
          selectedReturns={dialogCtx.returns}
          initialDestinationType={dialogCtx.initialDestinationType}
          initialSupplierAddressId={dialogCtx.initialSupplierAddressId}
          restrictSupplierAddressIds={dialogCtx.restrictSupplierAddressIds}
          onSuccess={() => onScheduled()}
        />
      )}
    </div>
  );
}

function RotaGroupCard({
  group,
  suppliersById,
  checkedIds,
  onToggle,
  onSchedule,
}: {
  group: RotaGroup;
  suppliersById: Map<string, Supplier>;
  checkedIds: Set<string>;
  onToggle: (returnId: string) => void;
  onSchedule: () => void;
}) {
  const isOrphan = group.city === SEM_ENDERECO;
  const total = useMemo(() => group.returns.reduce((sum, r) => sum + r.valor_total, 0), [group.returns]);
  const distinctSuppliers = useMemo(
    () => new Set(group.returns.map((r) => r.supplier_id)).size,
    [group.returns]
  );
  const hasSelection = checkedIds.size > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2 text-lg font-semibold">
          <span>{isOrphan ? group.city : `${group.city}/${group.uf}`}</span>
          <span className="shrink-0 text-sm font-normal tabular-nums text-muted-foreground">
            {group.returns.length} NF{group.returns.length === 1 ? '' : 's'} · {currencyFormatter.format(total)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isOrphan && (
          <p className="text-sm text-muted-foreground">
            Fornecedores sem endereço de devolução ativo cadastrado.{' '}
            <Link href="/settings/suppliers" className="text-primary underline-offset-4 hover:underline">
              Cadastrar endereço
            </Link>
          </p>
        )}

        <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {group.returns.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`rota-${group.city}-${group.uf}-${r.id}`}
                className="size-4 shrink-0 cursor-pointer accent-primary"
                checked={checkedIds.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
              <label
                htmlFor={`rota-${group.city}-${group.uf}-${r.id}`}
                className="flex flex-1 cursor-pointer items-center justify-between gap-2"
              >
                <span>{r.nf ?? r.id}</span>
                <span className="text-xs text-muted-foreground">
                  {suppliersById.get(r.supplier_id)?.name ?? 'Fornecedor removido'}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {!isOrphan && distinctSuppliers > 1 && (
          <p className="text-xs text-muted-foreground">
            NFs de fornecedores diferentes — programe um lote por fornecedor ou destino filial.
          </p>
        )}

        {!isOrphan && (
          <Button className="cursor-pointer" disabled={!hasSelection} onClick={onSchedule}>
            Programar lote para esta rota
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
