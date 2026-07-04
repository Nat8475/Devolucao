'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XmlUpload } from './xml-upload';
import { DuplicateWarningDialog } from './duplicate-warning-dialog';
import { DanfeScanInput } from './danfe-scan-input';
import { DanfeScanCameraDialog } from './danfe-scan-camera-dialog';
import type { Supplier, ReturnReason, ReturnType } from '@/lib/types';

interface FormState {
  nf: string;
  supplier_id: string;
  type: ReturnType | '';
  reason_id: string;
  descricao: string;
  qtd: string;
  valor_unitario: string;
}

type FieldErrors = Partial<Record<'supplier_id' | 'type' | 'qtd' | 'valor_unitario' | 'nf', string>>;

const EMPTY_FORM: FormState = {
  nf: '',
  supplier_id: '',
  type: '',
  reason_id: '',
  descricao: '',
  qtd: '',
  valor_unitario: '',
};

// nf/nfd são os únicos campos opcionais em rascunho (schema do banco). Fornecedor,
// tipo, quantidade e valor unitário são NOT NULL na tabela `returns` independente do status.
// nf passa a ser exigido quando o envio é como pendente (mirror de lib/validation.ts
// returnCreateSchema.superRefine): lançar direto como pendente sem nf pularia o
// portão que fn_confirmar_rascunho aplica no fluxo normal (rascunho -> pendente).
function validate(form: FormState, status: 'rascunho' | 'pendente'): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.supplier_id) errors.supplier_id = 'Selecione o fornecedor.';
  if (!form.type) errors.type = 'Selecione o tipo.';
  if (!form.qtd || Number(form.qtd) <= 0) errors.qtd = 'Informe uma quantidade maior que zero.';
  if (!form.valor_unitario || Number(form.valor_unitario) <= 0)
    errors.valor_unitario = 'Informe um valor unitário maior que zero.';
  if (status === 'pendente' && !form.nf.trim()) errors.nf = 'NF é obrigatória para lançar como pendente.';
  return errors;
}

export function ReturnForm() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'rascunho' | 'pendente' | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scanWarning, setScanWarning] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => {
        if (!r.ok) throw new Error('suppliers fetch failed');
        return r.json();
      })
      .then(setSuppliers)
      .catch(() => setFormError('Não foi possível carregar os fornecedores.'));
  }, []);

  useEffect(() => {
    if (!form.supplier_id) return;
    fetch(`/api/return-reasons?supplier_id=${form.supplier_id}`)
      .then((r) => {
        if (!r.ok) throw new Error('reasons fetch failed');
        return r.json();
      })
      .then(setReasons)
      .catch(() => setFormError('Não foi possível carregar os motivos.'));
  }, [form.supplier_id]);

  function applyParsedXml(nf: string, descricao: string, qtd: number, valorUnitario: number) {
    setForm((f) => ({ ...f, nf, descricao, qtd: String(qtd), valor_unitario: String(valorUnitario) }));
  }

  async function handleScan({ cnpjEmitente, nNF }: { cnpjEmitente: string; nNF: string }) {
    setScanWarning(null);
    let matches: Supplier[] = [];
    try {
      matches = await fetch(`/api/suppliers?cnpj=${cnpjEmitente}`).then((r) => {
        if (!r.ok) throw new Error('suppliers fetch failed');
        return r.json();
      });
    } catch {
      setScanWarning('Não foi possível verificar o fornecedor. Preencha manualmente.');
      setForm((f) => ({ ...f, nf: nNF }));
      return;
    }

    setForm((f) => ({
      ...f,
      nf: nNF,
      supplier_id: matches[0]?.id ?? f.supplier_id,
    }));

    if (matches.length === 0) {
      setScanWarning('CNPJ não cadastrado — selecione o fornecedor manualmente.');
    }
  }

  async function submit(status: 'rascunho' | 'pendente') {
    setFormError(null);
    const errors = validate(form, status);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (status === 'pendente' && form.nf && form.supplier_id) {
      setSubmitting(status);
      let check: { duplicate: boolean };
      try {
        check = await fetch(
          `/api/returns/check-duplicate?nf=${encodeURIComponent(form.nf)}&supplier_id=${form.supplier_id}`
        ).then((r) => {
          if (!r.ok) throw new Error('duplicate check failed');
          return r.json();
        });
      } catch {
        setSubmitting(null);
        setFormError('Não foi possível verificar duplicidade da NF. Tente novamente.');
        return;
      }
      if (check.duplicate) {
        setSubmitting(null);
        setShowDuplicate(true);
        return;
      }
    }

    await doSubmit(status);
  }

  async function doSubmit(status: 'rascunho' | 'pendente') {
    setSubmitting(status);
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nf: form.nf.trim() || null,
          supplier_id: form.supplier_id,
          type: form.type,
          reason_id: form.reason_id || null,
          descricao: form.descricao.trim() || null,
          qtd: Number(form.qtd),
          valor_unitario: Number(form.valor_unitario),
          status,
        }),
      });

      if (!res.ok) {
        let message = 'Erro ao salvar. Tente novamente.';
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // resposta não-JSON: mantém a mensagem genérica
        }
        setFormError(message);
        return;
      }

      setShowDuplicate(false);
      router.push('/returns');
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const isSubmitting = submitting !== null;

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4">
        <XmlUpload onParsed={(p) => applyParsedXml(p.nf, p.descricao, p.qtd, p.valorUnitario)} />

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <DanfeScanInput onScan={handleScan} />
          </div>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => setShowCamera(true)}
          >
            Escanear com câmera
          </Button>
        </div>
        {scanWarning && (
          <p role="alert" className="text-sm text-amber-600 dark:text-amber-500">
            {scanWarning}
          </p>
        )}
        <DanfeScanCameraDialog
          open={showCamera}
          onClose={() => setShowCamera(false)}
          onScan={handleScan}
        />

        <div className="space-y-2">
          <Label htmlFor="nf">NF</Label>
          <Input
            id="nf"
            aria-invalid={!!fieldErrors.nf}
            value={form.nf}
            onChange={(e) => setForm({ ...form, nf: e.target.value })}
            placeholder="Opcional em rascunho"
          />
          {fieldErrors.nf && <p className="text-sm text-destructive">{fieldErrors.nf}</p>}
        </div>

        <div className="space-y-2">
          <Label>Fornecedor *</Label>
          <Select
            value={form.supplier_id}
            onValueChange={(v) => {
              setForm({ ...form, supplier_id: v, reason_id: '' });
              setReasons([]);
            }}
          >
            <SelectTrigger aria-invalid={!!fieldErrors.supplier_id} className="w-full cursor-pointer">
              <SelectValue placeholder="Selecione o fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.supplier_id && <p className="text-sm text-destructive">{fieldErrors.supplier_id}</p>}
        </div>

        <div className="space-y-2">
          <Label>Tipo *</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ReturnType })}>
            <SelectTrigger aria-invalid={!!fieldErrors.type} className="w-full cursor-pointer">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avaria" className="cursor-pointer">Avaria</SelectItem>
              <SelectItem value="falta" className="cursor-pointer">Falta</SelectItem>
              <SelectItem value="rejeicao" className="cursor-pointer">Rejeição</SelectItem>
            </SelectContent>
          </Select>
          {fieldErrors.type && <p className="text-sm text-destructive">{fieldErrors.type}</p>}
        </div>

        <div className="space-y-2">
          <Label>Motivo</Label>
          <Select value={form.reason_id} onValueChange={(v) => setForm({ ...form, reason_id: v })}>
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue placeholder="Selecione o motivo" />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id} className="cursor-pointer">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="qtd">Quantidade *</Label>
            <Input
              id="qtd"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              aria-invalid={!!fieldErrors.qtd}
              value={form.qtd}
              onChange={(e) => setForm({ ...form, qtd: e.target.value })}
              className="tabular-nums"
            />
            {fieldErrors.qtd && <p className="text-sm text-destructive">{fieldErrors.qtd}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor_unitario">Valor unitário *</Label>
            <Input
              id="valor_unitario"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-invalid={!!fieldErrors.valor_unitario}
              value={form.valor_unitario}
              onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })}
              className="tabular-nums"
            />
            {fieldErrors.valor_unitario && (
              <p className="text-sm text-destructive">{fieldErrors.valor_unitario}</p>
            )}
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={isSubmitting}
            onClick={() => submit('rascunho')}
          >
            {submitting === 'rascunho' ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
          <Button
            type="button"
            className="cursor-pointer"
            disabled={isSubmitting}
            onClick={() => submit('pendente')}
          >
            {submitting === 'pendente' ? 'Confirmando...' : 'Confirmar lançamento'}
          </Button>
        </div>

        <DuplicateWarningDialog
          open={showDuplicate}
          onCancel={() => setShowDuplicate(false)}
          onConfirm={() => doSubmit('pendente')}
          confirming={isSubmitting}
        />
      </CardContent>
    </Card>
  );
}
