'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DuplicateWarningDialog({
  open,
  onCancel,
  onConfirm,
  confirming = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>NF já lançada para este fornecedor</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Já existe uma devolução com esta NF para este fornecedor. Confirmar mesmo assim?
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onCancel} disabled={confirming}>
            Cancelar
          </Button>
          <Button type="button" className="cursor-pointer" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Confirmando...' : 'Confirmar mesmo assim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
