'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Etiqueta } from '@/components/returns/etiqueta';
import type { ReturnRecord, Supplier, ReturnReason, FileRecord } from '@/lib/types';

export default function EtiquetaPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ReturnRecord | null>(null);
  const [supplierName, setSupplierName] = useState('—');
  const [reasonLabel, setReasonLabel] = useState('—');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/returns/${id}`);
      if (!res.ok) throw new Error('return fetch failed');
      const data: ReturnRecord = await res.json();
      setRecord(data);

      const [suppliersRes, reasonsRes, filesRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch(`/api/return-reasons?supplier_id=${data.supplier_id}`),
        fetch('/api/files?entity_type=system&file_type=logo'),
      ]);

      if (suppliersRes.ok) {
        const suppliers: Supplier[] = await suppliersRes.json();
        setSupplierName(suppliers.find((s) => s.id === data.supplier_id)?.name ?? '—');
      }

      if (reasonsRes.ok) {
        const reasons: ReturnReason[] = await reasonsRes.json();
        setReasonLabel(reasons.find((r) => r.id === data.reason_id)?.label ?? '—');
      }

      if (filesRes.ok) {
        const files: FileRecord[] = await filesRes.json();
        setLogoUrl(files[0]?.url ?? null);
      }

      setError(null);
    } catch {
      setError('Não foi possível carregar a etiqueta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;

  if (error || !record) {
    return (
      <div className="max-w-xl space-y-4 p-6">
        <p role="alert" className="text-sm text-destructive">
          {error ?? 'Devolução não encontrada.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-muted/40 p-8 print:bg-white print:p-0">
      <Button className="cursor-pointer print:hidden" onClick={() => window.print()}>
        Imprimir
      </Button>
      <div className="rounded-md shadow-sm print:shadow-none">
        <Etiqueta record={record} supplierName={supplierName} reasonLabel={reasonLabel} logoUrl={logoUrl} />
      </div>
    </div>
  );
}
