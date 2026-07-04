'use client';

import { useCallback, useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { ReturnRecord } from '@/lib/types';

export function TrashTable() {
  const [entries, setEntries] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trash');
      if (!res.ok) throw new Error('trash fetch failed');
      const data = await res.json();
      setEntries(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar a lixeira. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function restore(id: string) {
    setRestoringId(id);
    setRestoreError(null);
    try {
      const res = await fetch(`/api/trash/${id}/restaurar`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        setRestoreError(body.error ?? 'Não foi possível restaurar a devolução.');
        return;
      }
      await load();
    } catch {
      setRestoreError('Não foi possível restaurar a devolução. Tente novamente.');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}
      {restoreError && (
        <p role="alert" className="text-sm text-destructive">
          {restoreError}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NF</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Excluído em</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && entries.length === 0 && !loadError && (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                Nenhum item na lixeira.
              </TableCell>
            </TableRow>
          )}
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{e.nf ?? '—'}</TableCell>
              <TableCell>{e.delete_reason ?? '—'}</TableCell>
              <TableCell className="tabular-nums">
                {e.deleted_at ? new Date(e.deleted_at).toLocaleString('pt-BR') : '—'}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  className="cursor-pointer"
                  disabled={restoringId === e.id}
                  onClick={() => restore(e.id)}
                >
                  {restoringId === e.id ? 'Restaurando...' : 'Restaurar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
