'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type Step = 'previa' | 'confirmacao';

export function BatchActionsStepper({
  action,
  selectedIds,
  onDone,
}: {
  action: 'venda' | 'reabrir';
  selectedIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('previa');
  const [motivo, setMotivo] = useState('');
  const [result, setResult] = useState<{ affected: string[]; ignored: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function start() {
    setStep('previa');
    setOpen(true);
  }

  async function confirm() {
    setError(null);
    setConfirming(true);
    try {
      const res = await fetch(`/api/returns/batch/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reabrir' ? { ids: selectedIds, motivo } : { ids: selectedIds }),
      });

      if (!res.ok) {
        let message = 'Erro ao processar a ação em lote. Tente novamente.';
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
      setStep('confirmacao');
    } catch {
      setError('Não foi possível concluir a ação. Verifique sua conexão e tente novamente.');
    } finally {
      setConfirming(false);
    }
  }

  function close() {
    setOpen(false);
    setStep('previa');
    setMotivo('');
    setResult(null);
    setError(null);
    onDone();
  }

  return (
    <>
      <Button
        variant={action === 'venda' ? 'default' : 'outline'}
        className="cursor-pointer"
        disabled={selectedIds.length === 0}
        onClick={start}
      >
        {action === 'venda' ? 'Dar baixa para venda' : 'Reabrir selecionados'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === 'previa' ? `Confirmar ação em ${selectedIds.length} item(ns)` : 'Resultado'}
            </DialogTitle>
          </DialogHeader>

          {step === 'previa' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Itens que não estiverem mais no status esperado serão ignorados automaticamente, não geram erro.
              </p>
              {action === 'reabrir' && (
                <Textarea
                  placeholder="Motivo da reabertura"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={close} disabled={confirming}>
                  Cancelar
                </Button>
                <Button
                  className="cursor-pointer"
                  disabled={confirming || (action === 'reabrir' && motivo.trim() === '')}
                  onClick={confirm}
                >
                  {confirming ? 'Confirmando...' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 'confirmacao' && result && (
            <div className="space-y-2 text-sm">
              <p>{result.affected.length} item(ns) atualizado(s).</p>
              {result.ignored.length > 0 && (
                <p>{result.ignored.length} item(ns) ignorado(s) (status já havia mudado).</p>
              )}
              <DialogFooter>
                <Button className="cursor-pointer" onClick={close}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
