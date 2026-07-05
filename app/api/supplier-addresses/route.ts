import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supplierAddressSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplier_id');
  if (!supplierId) return NextResponse.json({ error: 'supplier_id é obrigatório' }, { status: 400 });

  const supabase = await createClient();
  let query = supabase.from('supplier_addresses').select('*').eq('supplier_id', supplierId).order('label');
  if (searchParams.get('active') === 'true') query = query.eq('active', true);
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
  const parsed = supplierAddressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('supplier_addresses').insert(parsed.data).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
