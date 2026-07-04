'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import type { ReturnReason } from '@/lib/types';

export function ReasonsCrud() {
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/return-reasons');
      if (!res.ok) throw new Error('return-reasons fetch failed');
      const data = await res.json();
      setReasons(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar os motivos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!label.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/return-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, supplier_id: null }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? 'Não foi possível adicionar o motivo.');
        return;
      }
      setLabel('');
      await load();
    } catch {
      setCreateError('Não foi possível adicionar o motivo. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="reason-label">Motivo (genérico)</Label>
          <Input
            id="reason-label"
            placeholder="Motivo (genérico)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </div>
        <Button className="cursor-pointer" disabled={creating || !label.trim()} onClick={create}>
          {creating ? 'Adicionando...' : 'Adicionar'}
        </Button>
      </div>

      {createError && (
        <p role="alert" className="text-sm text-destructive">
          {createError}
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Motivo</TableHead>
            <TableHead>Escopo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && reasons.length === 0 && !loadError && (
            <TableRow>
              <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                Nenhum motivo cadastrado.
              </TableCell>
            </TableRow>
          )}
          {reasons.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.label}</TableCell>
              <TableCell>{r.supplier_id ? 'específico' : 'genérico'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
