import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reagendarSchema } from '@/lib/validation';

const CONFLICT_HINTS = ['não encontrado', 'desativada', 'sem transferências elegíveis'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = reagendarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_reagendar_transferencia', {
    p_lote_id: loteId,
    p_scheduled_date: parsed.data.scheduled_date,
  });
  if (error) {
    const conflict = CONFLICT_HINTS.some((h) => error.message.includes(h));
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ affected: data ?? [] });
}
