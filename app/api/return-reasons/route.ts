import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { returnReasonSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const supplierId = new URL(request.url).searchParams.get('supplier_id');
  const supabase = await createClient();

  let query = supabase.from('return_reasons').select('*').eq('active', true);
  query = supplierId ? query.or(`supplier_id.eq.${supplierId},supplier_id.is.null`) : query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = returnReasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('return_reasons').insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
