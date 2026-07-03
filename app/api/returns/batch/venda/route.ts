import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { batchVendaSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = batchVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { ids } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_dar_baixa_venda', { p_ids: ids });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affected: string[] = data ?? [];
  return NextResponse.json({
    affected,
    ignored: ids.filter((id: string) => !affected.includes(id)),
  });
}
