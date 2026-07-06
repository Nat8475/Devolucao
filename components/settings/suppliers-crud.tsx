'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { SupplierAddressesPanel } from '@/components/settings/supplier-addresses-panel';
import type { Supplier } from '@/lib/types';

export function SuppliersCrud() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers');
      if (!res.ok) throw new Error('suppliers fetch failed');
      const data = await res.json();
      setSuppliers(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar os fornecedores. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? 'Não foi possível adicionar o fornecedor.');
        return;
      }
      setName('');
      await load();
    } catch {
      setCreateError('Não foi possível adicionar o fornecedor. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="supplier-name">Nome do fornecedor</Label>
          <Input
            id="supplier-name"
            placeholder="Nome do fornecedor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </div>
        <Button className="cursor-pointer" disabled={creating || !name.trim()} onClick={create}>
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
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && suppliers.length === 0 && !loadError && (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                Nenhum fornecedor cadastrado.
              </TableCell>
            </TableRow>
          )}
          {suppliers.map((s) => {
            const isExpanded = expandedId === s.id;
            return (
              <Fragment key={s.id}>
                <TableRow>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.cnpj ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    >
                      {isExpanded ? 'Ocultar endereços' : 'Endereços'}
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={3} className="bg-background/50 py-3">
                      <SupplierAddressesPanel supplierId={s.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
