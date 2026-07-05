'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from '@/lib/return-status';
import type { ReturnRecord } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR');

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<ReturnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/returns/${id}`);
      if (!res.ok) throw new Error('return fetch failed');
      const data = await res.json();
      setRecord(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar a devolução. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleConfirmar() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/returns/${id}/confirmar`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        setConfirmError(body.error ?? 'Não foi possível confirmar o lançamento.');
        return;
      }
      const data = await res.json();
      setRecord(data);
    } catch {
      setConfirmError('Não foi possível confirmar o lançamento. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  }

  function openDelete() {
    setMotivo('');
    setDeleteError(null);
    setShowDelete(true);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) {
        const body = await res.json();
        setDeleteError(body.error ?? 'Não foi possível excluir a devolução.');
        return;
      }
      router.push('/returns');
    } catch {
      setDeleteError('Não foi possível excluir a devolução. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;

  if (loadError || !record) {
    return (
      <div className="max-w-xl space-y-4 p-6">
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? 'Devolução não encontrada.'}
        </p>
        <Link href="/returns" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para devoluções
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4 p-6">
      <Link href="/returns" className="text-sm text-primary underline-offset-4 hover:underline">
        Voltar para devoluções
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">NF {record.nf ?? '(sem NF)'}</h1>
        <Badge variant={STATUS_BADGE_VARIANT[record.status]}>{STATUS_LABELS[record.status]}</Badge>
      </div>
      <Button variant="outline" className="cursor-pointer" asChild>
        <Link href={`/returns/${id}/etiqueta`} target="_blank" rel="noopener noreferrer">
          Imprimir etiqueta
        </Link>
      </Button>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">NFD</dt>
        <dd>{record.nfd ?? '—'}</dd>
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>{record.type}</dd>
        <dt className="text-muted-foreground">Descrição</dt>
        <dd>{record.descricao ?? '—'}</dd>
        <dt className="text-muted-foreground">Quantidade</dt>
        <dd className="tabular-nums">{numberFormatter.format(record.qtd)}</dd>
        <dt className="text-muted-foreground">Valor total</dt>
        <dd className="tabular-nums">{currencyFormatter.format(record.valor_total)}</dd>
      </dl>

      {record.status === 'rascunho' && (
        <div className="space-y-2">
          <Button className="cursor-pointer" disabled={confirming} onClick={handleConfirmar}>
            {confirming ? 'Confirmando...' : 'Confirmar lançamento'}
          </Button>
          {confirmError && (
            <p role="alert" className="text-sm text-destructive">
              {confirmError}
            </p>
          )}
        </div>
      )}

      {record.status === 'pendente' && (
        <Button variant="destructive" className="cursor-pointer" onClick={openDelete}>
          Excluir
        </Button>
      )}

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir devolução</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da exclusão"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setShowDelete(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              disabled={motivo.trim() === '' || deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Excluindo...' : 'Confirmar exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
