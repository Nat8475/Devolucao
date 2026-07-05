'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/transfers/signature-pad';
import { useR2Status } from '@/components/transfers/use-r2-status';
import type { FeatureFlag, TransferWithJoins } from '@/lib/types';

type DialogKind = 'baixa' | 'cancelar' | 'reagendar' | null;

async function uploadFile(
  file: File,
  fileType: 'receipt' | 'signature',
  loteId: string
): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', 'transfer');
    form.append('entity_id', loteId);
    form.append('file_type', fileType);
    const res = await fetch('/api/files', { method: 'POST', body: form });
    return res.ok;
  } catch {
    return false;
  }
}

export function LoteActions({
  loteId,
  rows,
  onChanged,
}: {
  loteId: string;
  rows: TransferWithJoins[];
  onChanged: () => void;
}) {
  const first = rows[0];
  const r2Configured = useR2Status();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const [chegadaLoading, setChegadaLoading] = useState(false);
  const [chegadaError, setChegadaError] = useState<string | null>(null);

  const [comprovante, setComprovante] = useState<File | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [baixaLoading, setBaixaLoading] = useState(false);
  const [baixaError, setBaixaError] = useState<string | null>(null);
  const [baixaWarning, setBaixaWarning] = useState<string | null>(null);
  const [baixaDone, setBaixaDone] = useState(false);

  const [motivo, setMotivo] = useState('');
  const [cancelarLoading, setCancelarLoading] = useState(false);
  const [cancelarError, setCancelarError] = useState<string | null>(null);
  const [cancelarResult, setCancelarResult] = useState<{ affected: string[] } | null>(null);

  const [novaData, setNovaData] = useState('');
  const [reagendarLoading, setReagendarLoading] = useState(false);
  const [reagendarError, setReagendarError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-flags');
      if (!res.ok) return;
      setFlags(await res.json());
    } catch {
      // funcionalidades opcionais ficam desligadas por padrão em caso de falha
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFlags();
  }, [loadFlags]);

  if (!first) return null;

  const flagOn = (key: string) => flags.find((f) => f.key === key)?.enabled ?? false;

  const canChegada =
    flagOn('confirmacao_chegada_filial') &&
    first.destination_type === 'filial' &&
    first.status === 'em_transferencia' &&
    !first.arrived_at_branch_at;
  const emTransferencia = first.status === 'em_transferencia';

  async function handleChegada() {
    setChegadaLoading(true);
    setChegadaError(null);
    try {
      const res = await fetch(`/api/transfers/lote/${loteId}/chegada`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setChegadaError(body.error ?? 'Não foi possível confirmar a chegada.');
        return;
      }
      onChanged();
    } catch {
      setChegadaError('Não foi possível confirmar a chegada. Tente novamente.');
    } finally {
      setChegadaLoading(false);
    }
  }

  function openBaixa() {
    setComprovante(null);
    setSignatureBlob(null);
    setBaixaError(null);
    setBaixaWarning(null);
    setBaixaDone(false);
    setDialog('baixa');
  }

  async function submitBaixa() {
    setBaixaLoading(true);
    setBaixaError(null);
    setBaixaWarning(null);
    try {
      const res = await fetch(`/api/transfers/lote/${loteId}/baixa`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setBaixaError(body.error ?? 'Não foi possível dar baixa na transferência.');
        return;
      }
      setBaixaDone(true);

      const failures: string[] = [];
      if (comprovante) {
        const ok = await uploadFile(comprovante, 'receipt', loteId);
        if (!ok) failures.push('comprovante');
      }
      if (signatureBlob) {
        const file = new File([signatureBlob], 'assinatura.png', { type: 'image/png' });
        const ok = await uploadFile(file, 'signature', loteId);
        if (!ok) failures.push('assinatura');
      }
      if (failures.length > 0) {
        setBaixaWarning('Baixa concluída; falha ao anexar arquivo.');
      }
    } catch {
      setBaixaError('Não foi possível dar baixa na transferência. Tente novamente.');
    } finally {
      setBaixaLoading(false);
    }
  }

  function closeBaixa() {
    setDialog(null);
    if (baixaDone) onChanged();
  }

  function openCancelar() {
    setMotivo('');
    setCancelarError(null);
    setCancelarResult(null);
    setDialog('cancelar');
  }

  async function submitCancelar() {
    setCancelarLoading(true);
    setCancelarError(null);
    try {
      const res = await fetch(`/api/transfers/lote/${loteId}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelarError(body.error ?? 'Não foi possível cancelar a transferência.');
        return;
      }
      setCancelarResult(body);
    } catch {
      setCancelarError('Não foi possível cancelar a transferência. Tente novamente.');
    } finally {
      setCancelarLoading(false);
    }
  }

  function closeCancelar() {
    setDialog(null);
    if (cancelarResult) onChanged();
  }

  function openReagendar() {
    setNovaData(first.scheduled_date);
    setReagendarError(null);
    setDialog('reagendar');
  }

  async function submitReagendar() {
    setReagendarLoading(true);
    setReagendarError(null);
    try {
      const res = await fetch(`/api/transfers/lote/${loteId}/reagendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_date: novaData }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setReagendarError(body.error ?? 'Não foi possível reagendar a transferência.');
        return;
      }
      setDialog(null);
      onChanged();
    } catch {
      setReagendarError('Não foi possível reagendar a transferência. Tente novamente.');
    } finally {
      setReagendarLoading(false);
    }
  }

  if (!canChegada && !emTransferencia) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canChegada && (
          <Button variant="outline" className="cursor-pointer" disabled={chegadaLoading} onClick={handleChegada}>
            {chegadaLoading ? 'Confirmando...' : 'Confirmar chegada'}
          </Button>
        )}
        {emTransferencia && (
          <>
            <Button className="cursor-pointer" onClick={openBaixa}>
              Dar baixa
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={openReagendar}>
              Reagendar
            </Button>
            <Button variant="destructive" className="cursor-pointer" onClick={openCancelar}>
              Cancelar
            </Button>
          </>
        )}
      </div>
      {chegadaError && (
        <p role="alert" className="text-sm text-destructive">
          {chegadaError}
        </p>
      )}

      {/* Dar baixa */}
      <Dialog open={dialog === 'baixa'} onOpenChange={(v) => !v && closeBaixa()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar baixa na transferência</DialogTitle>
          </DialogHeader>

          {!baixaDone && (
            <div className="space-y-4">
              {r2Configured === false && (
                <p className="text-sm text-muted-foreground">
                  Envio de arquivos indisponível (armazenamento não configurado). A baixa será
                  registrada sem comprovante ou assinatura.
                </p>
              )}
              {r2Configured && (
                <div className="space-y-1.5">
                  <Label htmlFor="comprovante">Comprovante (opcional)</Label>
                  <Input
                    id="comprovante"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
              {r2Configured && flagOn('assinatura_baixa') && (
                <div className="space-y-1.5">
                  <Label>Assinatura</Label>
                  <SignaturePad onCapture={setSignatureBlob} />
                </div>
              )}
              {baixaError && (
                <p role="alert" className="text-sm text-destructive">
                  {baixaError}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={closeBaixa} disabled={baixaLoading}>
                  Cancelar
                </Button>
                <Button className="cursor-pointer" disabled={baixaLoading} onClick={submitBaixa}>
                  {baixaLoading ? 'Processando...' : 'Confirmar baixa'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {baixaDone && (
            <div className="space-y-3 text-sm">
              <p>Baixa concluída.</p>
              {baixaWarning && (
                <p role="alert" className="text-destructive">
                  {baixaWarning}
                </p>
              )}
              <DialogFooter>
                <Button className="cursor-pointer" onClick={closeBaixa}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancelar */}
      <Dialog open={dialog === 'cancelar'} onOpenChange={(v) => !v && closeCancelar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar transferência</DialogTitle>
          </DialogHeader>

          {!cancelarResult && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="motivo-cancelar">Motivo</Label>
                <Textarea
                  id="motivo-cancelar"
                  placeholder="Motivo do cancelamento"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              {cancelarError && (
                <p role="alert" className="text-sm text-destructive">
                  {cancelarError}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={closeCancelar} disabled={cancelarLoading}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  className="cursor-pointer"
                  disabled={cancelarLoading || motivo.trim() === ''}
                  onClick={submitCancelar}
                >
                  {cancelarLoading ? 'Cancelando...' : 'Confirmar cancelamento'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {cancelarResult && (
            <div className="space-y-3 text-sm">
              <p>
                Transferência cancelada. {cancelarResult.affected.length} NF(s) voltaram para
                Pendente.
              </p>
              <DialogFooter>
                <Button className="cursor-pointer" onClick={closeCancelar}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reagendar */}
      <Dialog open={dialog === 'reagendar'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar transferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nova-data">Nova data agendada</Label>
              <Input
                id="nova-data"
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
              />
            </div>
            {reagendarError && (
              <p role="alert" className="text-sm text-destructive">
                {reagendarError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setDialog(null)}
                disabled={reagendarLoading}
              >
                Voltar
              </Button>
              <Button
                className="cursor-pointer"
                disabled={reagendarLoading || novaData.trim() === ''}
                onClick={submitReagendar}
              >
                {reagendarLoading ? 'Salvando...' : 'Confirmar novo agendamento'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
