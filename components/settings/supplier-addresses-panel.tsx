'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SupplierAddress } from '@/lib/types';

function parseEmails(input: string): string[] {
  return input
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

export function SupplierAddressesPanel({ supplierId }: { supplierId: string }) {
  const [addresses, setAddresses] = useState<SupplierAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [address, setAddress] = useState('');
  const [contactEmailsInput, setContactEmailsInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supplier-addresses?supplier_id=${supplierId}`);
      if (!res.ok) throw new Error('addresses fetch failed');
      const data = await res.json();
      setAddresses(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar os endereços. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!label.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/supplier-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          label,
          city: city.trim() || null,
          uf: uf.trim() || null,
          address: address.trim() || null,
          contact_emails: parseEmails(contactEmailsInput),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? 'Não foi possível adicionar o endereço.');
        return;
      }
      setLabel('');
      setCity('');
      setUf('');
      setAddress('');
      setContactEmailsInput('');
      await load();
    } catch {
      setCreateError('Não foi possível adicionar o endereço. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(a: SupplierAddress) {
    setTogglingId(a.id);
    try {
      const res = await fetch(`/api/supplier-addresses/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !a.active }),
      });
      if (res.ok) await load();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:items-end">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`addr-label-${supplierId}`}>Etiqueta</Label>
          <Input
            id={`addr-label-${supplierId}`}
            placeholder="Ex.: Matriz"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`addr-city-${supplierId}`}>Cidade</Label>
          <Input
            id={`addr-city-${supplierId}`}
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`addr-uf-${supplierId}`}>UF</Label>
          <Input
            id={`addr-uf-${supplierId}`}
            placeholder="UF"
            maxLength={2}
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`addr-address-${supplierId}`}>Endereço</Label>
          <Input
            id={`addr-address-${supplierId}`}
            placeholder="Rua, número"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`addr-emails-${supplierId}`}>E-mails (vírgula)</Label>
          <Input
            id={`addr-emails-${supplierId}`}
            placeholder="a@x.com, b@x.com"
            value={contactEmailsInput}
            onChange={(e) => setContactEmailsInput(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Sem e-mail próprio — envio usará o e-mail geral do fornecedor.
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          {createError && (
            <p role="alert" className="text-sm text-destructive">
              {createError}
            </p>
          )}
        </div>
        <Button className="cursor-pointer" size="sm" disabled={creating || !label.trim()} onClick={create}>
          {creating ? 'Adicionando...' : 'Adicionar endereço'}
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Cidade-UF</TableHead>
              <TableHead>E-mails</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {addresses.length === 0 && !loadError && (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum endereço cadastrado para este fornecedor.
                </TableCell>
              </TableRow>
            )}
            {addresses.map((a) => (
              <TableRow key={a.id} className={cn(!a.active && 'opacity-50')}>
                <TableCell className="font-medium">{a.label}</TableCell>
                <TableCell>
                  {a.city ?? '—'}
                  {a.uf ? `-${a.uf}` : ''}
                </TableCell>
                <TableCell className="tabular-nums">{a.contact_emails.length}</TableCell>
                <TableCell>
                  <Badge variant={a.active ? 'default' : 'outline'}>{a.active ? 'Ativa' : 'Inativa'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    disabled={togglingId === a.id}
                    onClick={() => toggleActive(a)}
                  >
                    {togglingId === a.id ? 'Salvando...' : a.active ? 'Desativar' : 'Ativar'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
