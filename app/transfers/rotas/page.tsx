'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RotaGroups } from '@/components/transfers/rota-groups';
import { groupPendingByCity, type RotaGroup } from '@/lib/rotas';
import type { FeatureFlag, ReturnRecord, Supplier, SupplierAddress } from '@/lib/types';

type LoadState = 'loading' | 'ready' | 'error';

export default function RotasPage() {
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [flagOn, setFlagOn] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [groups, setGroups] = useState<RotaGroup[]>([]);
  const [suppliersById, setSuppliersById] = useState<Map<string, Supplier>>(new Map());

  const loadFlag = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-flags');
      const flags: FeatureFlag[] = res.ok ? await res.json() : [];
      setFlagOn(flags.find((f) => f.key === 'roteirizacao_coleta')?.enabled ?? false);
    } catch {
      setFlagOn(false);
    } finally {
      setFlagsLoaded(true);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    setState('loading');
    try {
      const [returnsRes, suppliersRes] = await Promise.all([
        fetch('/api/returns?status=pendente'),
        fetch('/api/suppliers'),
      ]);
      if (!returnsRes.ok || !suppliersRes.ok) throw new Error('failed');

      const returns: ReturnRecord[] = await returnsRes.json();
      const suppliers: Supplier[] = await suppliersRes.json();
      const suppliersMap = new Map(suppliers.map((s) => [s.id, s]));

      const distinctSupplierIds = [...new Set(returns.map((r) => r.supplier_id))];
      const addressLists = await Promise.all(
        distinctSupplierIds.map((id) =>
          fetch(`/api/supplier-addresses?supplier_id=${id}`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data: SupplierAddress[]) => [id, data] as [string, SupplierAddress[]])
            .catch(() => [id, [] as SupplierAddress[]] as [string, SupplierAddress[]])
        )
      );
      const addressesBySupplier = new Map<string, SupplierAddress[]>(addressLists);

      setGroups(groupPendingByCity(returns, addressesBySupplier));
      setSuppliersById(suppliersMap);
      setState('ready');
      setHasLoadedOnce(true);
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFlag();
  }, [loadFlag]);

  useEffect(() => {
    if (!flagsLoaded || !flagOn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGroups();
  }, [flagsLoaded, flagOn, loadGroups]);

  if (!flagsLoaded) return null;

  if (!flagOn) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">Sugestão de rota</h1>
        <p className="text-sm text-muted-foreground">
          A roteirização de coleta está desativada.{' '}
          <Link href="/settings/features" className="text-primary underline-offset-4 hover:underline">
            Ativar em Configurações
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold text-foreground">Sugestão de rota</h1>
        <p className="text-sm text-muted-foreground">
          Devoluções pendentes agrupadas pela cidade/UF do endereço de coleta do fornecedor.
        </p>
      </div>

      {state === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as rotas. Tente novamente.
        </p>
      )}

      {hasLoadedOnce && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma devolução pendente no momento.</p>
      )}

      {/* Uma vez carregado, o componente fica montado durante recargas (`state`
          pode voltar para 'loading' num refresh) para não desmontar — e fechar —
          o TransferFormDialog no meio do passo de resultado (Task 14). */}
      {hasLoadedOnce && (
        <RotaGroups groups={groups} suppliersById={suppliersById} onScheduled={() => void loadGroups()} />
      )}
    </div>
  );
}
