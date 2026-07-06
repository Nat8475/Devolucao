'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

const HEIGHT_PX = 160;

/**
 * Canvas de assinatura sem lib externa. Usa Pointer Events (cobre mouse e
 * touch com o mesmo código) e é devicePixelRatio-safe para não borrar o
 * traço em telas de alta densidade. A cada traço concluído (pointerup),
 * exporta o canvas inteiro como PNG via `toBlob` e entrega ao chamador —
 * quem decide o que fazer com o blob (ex.: anexar no upload de baixa).
 */
export function SignaturePad({
  onCapture,
  onClear,
  disabled = false,
}: {
  onCapture: (blob: Blob) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef(false);

  function setupCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(HEIGHT_PX * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, HEIGHT_PX);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  useEffect(() => {
    setupCanvas();
    function handleResize() {
      hasDrawnRef.current = false;
      setupCanvas();
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    hasDrawnRef.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPointRef.current) return;
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function handlePointerUp() {
    if (disabled) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnRef.current) return;
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, 'image/png');
  }

  function handleClear() {
    hasDrawnRef.current = false;
    setupCanvas();
    onClear?.();
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Área de assinatura — desenhe com o mouse ou o dedo"
        style={{ height: HEIGHT_PX, width: '100%', touchAction: 'none' }}
        className="w-full cursor-crosshair rounded-md border border-input bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        disabled={disabled}
        onClick={handleClear}
      >
        Limpar
      </Button>
    </div>
  );
}
