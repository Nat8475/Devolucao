'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Branch } from '@/lib/types';

interface BranchUserRow {
  branch_id: string;
  user_id: string;
  created_at: string;
  email: string | null;
}

interface UserOption {
  id: string;
  email: string;
}

export function BranchesCrud() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [responsaveisBranch, setResponsaveisBranch] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/branches');
      if (!res.ok) throw new Error('branches fetch failed');
      const data = await res.json();
      setBranches(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar as filiais. Tente novamente.');
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
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address: address.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? 'Não foi possível adicionar a filial.');
        return;
      }
      setName('');
      setAddress('');
      await load();
    } catch {
      setCreateError('Não foi possível adicionar a filial. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(branch: Branch) {
    setTogglingId(branch.id);
    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !branch.active }),
      });
      if (res.ok) await load();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="branch-name">Nome da filial</Label>
          <Input
            id="branch-name"
            placeholder="Nome da filial"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="branch-address">Endereço (opcional)</Label>
          <Input
            id="branch-address"
            placeholder="Endereço"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 && !loadError && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma filial cadastrada.
                </TableCell>
              </TableRow>
            )}
            {branches.map((b) => (
              <TableRow key={b.id} className={cn(!b.active && 'opacity-50')}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.address ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={b.active ? 'default' : 'outline'}>{b.active ? 'Ativa' : 'Inativa'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => setResponsaveisBranch(b)}
                    >
                      Responsáveis
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={togglingId === b.id}
                      onClick={() => toggleActive(b)}
                    >
                      {togglingId === b.id ? 'Salvando...' : b.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ResponsaveisDialog branch={responsaveisBranch} onClose={() => setResponsaveisBranch(null)} />
    </div>
  );
}

function ResponsaveisDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const [linked, setLinked] = useState<BranchUserRow[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [usersUnavailable, setUsersUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (branchId: string) => {
    setLoading(true);
    setError(null);
    setUsersUnavailable(false);
    try {
      const [linkedRes, usersRes] = await Promise.all([
        fetch(`/api/branch-users?branch_id=${branchId}`),
        fetch('/api/users'),
      ]);
      if (linkedRes.ok) {
        setLinked(await linkedRes.json());
      } else {
        setError('Não foi possível carregar os responsáveis.');
      }
      if (usersRes.status === 503) {
        setUsersUnavailable(true);
        setAllUsers([]);
      } else if (usersRes.ok) {
        setAllUsers(await usersRes.json());
      }
    } catch {
      setError('Não foi possível carregar os responsáveis.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (branch) {
      setSelectedUserId('');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load(branch.id);
    }
  }, [branch, load]);

  if (!branch) return null;

  const linkedIds = new Set(linked.map((l) => l.user_id));
  const availableUsers = allUsers.filter((u) => !linkedIds.has(u.id));

  async function vincular() {
    if (!branch || !selectedUserId) return;
    setLinking(true);
    setError(null);
    try {
      const res = await fetch('/api/branch-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branch.id, user_id: selectedUserId }),
      });
      if (res.status === 409) {
        setError('usuário já vinculado');
        return;
      }
      if (!res.ok) {
        setError('Não foi possível vincular o usuário.');
        return;
      }
      setSelectedUserId('');
      await load(branch.id);
    } finally {
      setLinking(false);
    }
  }

  async function remover(userId: string) {
    if (!branch) return;
    setRemovingId(userId);
    try {
      const res = await fetch('/api/branch-users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branch.id, user_id: userId }),
      });
      if (res.ok) await load(branch.id);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Responsáveis — {branch.name}</DialogTitle>
          <DialogDescription>Usuários vinculados a esta filial.</DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!loading && (
          <div className="space-y-3">
            <ul className="space-y-1">
              {linked.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum responsável vinculado.</li>
              )}
              {linked.map((row) => (
                <li key={row.user_id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{row.email ?? row.user_id}</span>
                  {!usersUnavailable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer text-destructive"
                      disabled={removingId === row.user_id}
                      onClick={() => remover(row.user_id)}
                    >
                      {removingId === row.user_id ? 'Removendo...' : 'Remover'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {usersUnavailable ? (
              <p className="text-sm text-muted-foreground">
                Lista de usuários indisponível neste ambiente.
              </p>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="branch-user-select">Vincular usuário</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger id="branch-user-select" className="w-full">
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="cursor-pointer"
                  disabled={linking || !selectedUserId}
                  onClick={vincular}
                >
                  {linking ? 'Vinculando...' : 'Vincular'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
