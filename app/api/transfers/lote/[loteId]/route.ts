import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SELECT = `*,
  returns(id, nf, nfd, supplier_id, valor_total, status, suppliers(id, name)),
  branches(id, name),
  supplier_addresses(id, label, city, uf, supplier_id)`;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ loteId: string }> }) {
  const { loteId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transfers').select(SELECT).eq('lote_id', loteId).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'lote não encontrado' }, { status: 404 });
  return NextResponse.json(data);
}
