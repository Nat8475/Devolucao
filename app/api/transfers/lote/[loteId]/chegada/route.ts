import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CONFLICT_HINTS = ['não encontrado', 'desativada', 'sem transferências elegíveis'];

export async function POST(_request: NextRequest, { params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_confirmar_chegada', { p_lote_id: loteId });
  if (error) {
    const conflict = CONFLICT_HINTS.some((h) => error.message.includes(h));
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ affected: data ?? [] });
}
