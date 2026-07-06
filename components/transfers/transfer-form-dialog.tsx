'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { transferCreateSchema } from '@/lib/validation';
import { STATUS_LABELS } from '@/lib/return-status';
import type { Branch, ReturnRecord, SupplierAddress } from '@/lib/types';

type Step = 'previa' | 'form' | 'resultado';
type DestinationType = 'filial' | 'fornecedor';
type FreightType = 'tabela' | 'valor_icms' | 'valor' | 'cortesia';

const FREIGHT_TYPE_LABELS: Record<FreightType, string> = {
  tabela: 'Tabela',
  valor_icms: 'Valor + ICMS',
  valor: 'Valor',
  cortesia: 'Cortesia',
};

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TransferFormDialog({
  open,
  onOpenChange,
  selectedReturns,
  onSuccess,
  initialDestinationType,
  initialSupplierAddressId,
  restrictSupplierAddressIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedReturns: ReturnRecord[];
  onSuccess: (result: { lote_id: string; affected: string[]; ignored: string[] }) => void;
  /** Pré-seleção opcional (ex.: sugestão de rota — Task 14). Não afeta o fluxo padrão (Task 11). */
  initialDestinationType?: DestinationType;
  /** Endereço do fornecedor a pré-selecionar quando o destino sugerido é único. */
  initialSupplierAddressId?: string;
  /** Restringe o dropdown de endereços a este subconjunto (ex.: apenas os endereços do grupo/rota). */
  restrictSupplierAddressIds?: string[];
}) {
  const [step, setStep] = useState<Step>('previa');
  const [destinationType, setDestinationType] = useState<DestinationType>('filial');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [addresses, setAddresses] = useState<SupplierAddress[]>([]);
  const [supplierAddressId, setSupplierAddressId] = useState<string>('');
  const [carrier, setCarrier] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [freightType, setFreightType] = useState<FreightType>('tabela');
  const [freightValue, setFreightValue] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ lote_id: string; affected: string[]; ignored: string[] } | null>(null);

  const pendentes = useMemo(() => selectedReturns.filter((r) => r.status === 'pendente'), [selectedReturns]);
  const uniqueSupplierId = useMemo(() => {
    const ids = new Set(selectedReturns.map((r) => r.supplier_id));
    return ids.size === 1 ? [...ids][0] : null;
  }, [selectedReturns]);

  useEffect(() => {
    if (!open) return;
    // Reseta o formulário sempre que o diálogo abre para uma nova seleção
    // (padrão reset-on-open; roda uma vez por abertura, não em cascata).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('previa');
    setDestinationType(initialDestinationType ?? 'filial');
    setBranchId('');
    setSupplierAddressId(initialSupplierAddressId ?? '');
    setCarrier('');
    setNumeroPedido('');
    setFreightType('tabela');
    setFreightValue('');
    setScheduledDate(tomorrowYmd());
    setError(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/branches?active=true')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBranches(Array.isArray(data) ? data : []))
      .catch(() => setBranches([]));
  }, [open]);

  useEffect(() => {
    if (!open || destinationType !== 'fornecedor' || !uniqueSupplierId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddresses([]);
      return;
    }
    fetch(`/api/supplier-addresses?supplier_id=${uniqueSupplierId}&active=true`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list: SupplierAddress[] = Array.isArray(data) ? data : [];
        setAddresses(
          restrictSupplierAddressIds
            ? list.filter((a) => restrictSupplierAddressIds.includes(a.id))
            : list
        );
      })
      .catch(() => setAddresses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, destinationType, uniqueSupplierId]);

  function close() {
    onOpenChange(false);
  }

  function goToForm() {
    setError(null);
    setStep('form');
  }

  async function submit() {
    setError(null);

    const payload = {
      return_ids: selectedReturns.map((r) => r.id),
      destination_type: destinationType,
      branch_id: destinationType === 'filial' ? branchId || null : null,
      supplier_address_id: destinationType === 'fornecedor' ? supplierAddressId || null : null,
      carrier: carrier.trim() === '' ? null : carrier.trim(),
      numero_pedido: numeroPedido.trim() === '' ? null : numeroPedido.trim(),
      freight_type: freightType,
      freight_value:
        freightType === 'valor_icms' || freightType === 'valor'
          ? freightValue.trim() === ''
            ? null
            : Number(freightValue)
          : null,
      scheduled_date: scheduledDate,
    };

    const parsed = transferCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        let message = 'Erro ao programar a transferência. Tente novamente.';
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // resposta não-JSON: mantém a mensagem genérica
        }
        setError(message);
        return;
      }

      const body = await res.json();
      setResult(body);
      setStep('resultado');
      onSuccess(body);
    } catch {
      setError('Não foi possível concluir a ação. Verifique sua conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const fornecedorDisabled = !uniqueSupplierId;
  const freightValueVisible = freightType === 'valor_icms' || freightType === 'valor';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'previa' && `Programar transferência — ${selectedReturns.length} item(ns)`}
            {step === 'form' && 'Destino da transferência'}
            {step === 'resultado' && 'Transferência programada'}
          </DialogTitle>
          {step === 'form' && (
            <DialogDescription>Defina para onde essas devoluções serão enviadas.</DialogDescription>
          )}
        </DialogHeader>

        {step === 'previa' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Itens que não estiverem mais pendentes serão ignorados automaticamente, não geram erro.
            </p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {selectedReturns.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{r.nf ?? r.id}</span>
                  {r.status === 'pendente' ? (
                    <Badge variant="secondary">{STATUS_LABELS[r.status]}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      será ignorada ({STATUS_LABELS[r.status]})
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" className="cursor-pointer" onClick={close}>
                Cancelar
              </Button>
              <Button className="cursor-pointer" disabled={pendentes.length === 0} onClick={goToForm}>
                Avançar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Destino</legend>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="destination_type"
                    className="cursor-pointer"
                    checked={destinationType === 'filial'}
                    onChange={() => setDestinationType('filial')}
                  />
                  Filial
                </label>
                <label
                  className={`flex items-center gap-2 text-sm ${fornecedorDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="destination_type"
                    className={fornecedorDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                    checked={destinationType === 'fornecedor'}
                    disabled={fornecedorDisabled}
                    onChange={() => setDestinationType('fornecedor')}
                  />
                  Fornecedor
                </label>
                {fornecedorDisabled && (
                  <p className="text-xs text-muted-foreground">
                    Selecione NFs de um único fornecedor para devolver direto ao fornecedor.
                  </p>
                )}
              </div>
            </fieldset>

            {destinationType === 'filial' && (
              <div className="space-y-1.5">
                <Label htmlFor="branch">Filial</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="branch" className="w-full cursor-pointer">
                    <SelectValue placeholder="Selecione a filial" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="cursor-pointer">
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {destinationType === 'fornecedor' && (
              <div className="space-y-1.5">
                <Label htmlFor="supplier-address">Endereço do fornecedor</Label>
                {addresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Este fornecedor não tem endereço de devolução cadastrado.{' '}
                    <Link href="/settings/suppliers" className="text-primary underline-offset-4 hover:underline">
                      Cadastrar endereço
                    </Link>
                  </p>
                ) : (
                  <Select value={supplierAddressId} onValueChange={setSupplierAddressId}>
                    <SelectTrigger id="supplier-address" className="w-full cursor-pointer">
                      <SelectValue placeholder="Selecione o endereço" />
                    </SelectTrigger>
                    <SelectContent>
                      {addresses.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="cursor-pointer">
                          {a.label}
                          {a.city ? ` — ${a.city}${a.uf ? `/${a.uf}` : ''}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="carrier">Transportadora</Label>
                <Input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="numero-pedido">Nº pedido</Label>
                <Input id="numero-pedido" value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="freight-type">Tipo de frete</Label>
                <Select value={freightType} onValueChange={(v) => setFreightType(v as FreightType)}>
                  <SelectTrigger id="freight-type" className="w-full cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREIGHT_TYPE_LABELS) as FreightType[]).map((v) => (
                      <SelectItem key={v} value={v} className="cursor-pointer">
                        {FREIGHT_TYPE_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {freightValueVisible && (
                <div className="space-y-1.5">
                  <Label htmlFor="freight-value">Valor do frete</Label>
                  <Input
                    id="freight-value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={freightValue}
                    onChange={(e) => setFreightValue(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scheduled-date">Data agendada</Label>
              <Input
                id="scheduled-date"
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" className="cursor-pointer" onClick={() => setStep('previa')} disabled={submitting}>
                Voltar
              </Button>
              <Button className="cursor-pointer" disabled={submitting} onClick={submit}>
                {submitting ? 'Programando...' : 'Programar transferência'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'resultado' && result && (
          <div className="space-y-2 text-sm">
            <p>
              {result.affected.length} NF(s) programada(s) no lote
              {result.ignored.length > 0 ? `; ${result.ignored.length} ignorada(s)` : ''}.
            </p>
            <DialogFooter>
              <Button className="cursor-pointer" onClick={close}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
