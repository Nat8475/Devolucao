import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transferCreateSchema } from '@/lib/validation';

const SELECT = `*,
  returns(id, nf, nfd, supplier_id, valor_total, status, suppliers(id, name)),
  branches(id, name),
  supplier_addresses(id, label, city, uf, supplier_id)`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  let query = supabase.from('transfers').select(SELECT).order('scheduled_date', { ascending: true });

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);
  if (searchParams.get('vencidas') === 'true') {
    const today = new Date().toISOString().slice(0, 10);
    query = query.eq('status', 'em_transferencia').lt('scheduled_date', today);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = transferCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_programar_transferencia', {
    p_return_ids: d.return_ids,
    p_destination_type: d.destination_type,
    p_branch_id: d.branch_id ?? null,
    p_supplier_address_id: d.supplier_address_id ?? null,
    p_carrier: d.carrier ?? null,
    p_numero_pedido: d.numero_pedido ?? null,
    p_freight_type: d.freight_type ?? null,
    p_freight_value: d.freight_value ?? null,
    p_scheduled_date: d.scheduled_date,
  });
  if (error) {
    const conflict =
      error.message.includes('nenhuma devolução elegível') ||
      error.message.includes('não pertence ao fornecedor');
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }

  // RETURNS TABLE -> array com uma linha { lote_id, affected_ids }
  const row = Array.isArray(data) ? data[0] : data;
  const affected: string[] = row?.affected_ids ?? [];
  return NextResponse.json(
    {
      lote_id: row?.lote_id ?? null,
      affected,
      ignored: d.return_ids.filter((id) => !affected.includes(id)),
    },
    { status: 201 }
  );
}
