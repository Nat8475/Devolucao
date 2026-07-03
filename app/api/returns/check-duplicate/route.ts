import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nf = searchParams.get('nf');
  const supplierId = searchParams.get('supplier_id');

  if (!nf || !supplierId) {
    return NextResponse.json({ error: 'nf e supplier_id são obrigatórios' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('returns')
    .select('id, status')
    .eq('nf', nf)
    .eq('supplier_id', supplierId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ duplicate: (data?.length ?? 0) > 0, matches: data });
}
