import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supplierSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const cnpj = new URL(request.url).searchParams.get('cnpj');

  const supabase = await createClient();
  let query = supabase.from('suppliers').select('*').order('name');
  if (cnpj) query = query.eq('cnpj', cnpj);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('suppliers').insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
