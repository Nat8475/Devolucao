'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseDanfeCode, type ParsedDanfeCode } from '@/lib/danfe-scanner';

export function DanfeScanCameraDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (result: Pick<ParsedDanfeCode, 'cnpjEmitente' | 'nNF'>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoRef.current) return;

    setError(null);
    const reader = new BrowserMultiFormatReader();
    let handled = false;
    let controls: IScannerControls | null = null;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (handled || !result) return;
        const parsed = parseDanfeCode(result.getText());
        if (!parsed) return;
        handled = true;
        onScan(parsed);
        onClose();
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
          return;
        }
        controls = c;
      })
      .catch(() => setError('Sem acesso à câmera — preencha manualmente.'));

    return () => {
      cancelled = true;
      handled = true;
      controls?.stop();
    };
  }, [open, onClose, onScan]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear código da DANFE</DialogTitle>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <video ref={videoRef} className="w-full rounded-lg" />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
