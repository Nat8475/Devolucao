import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { branchUserSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id');
  if (!branchId) return NextResponse.json({ error: 'branch_id é obrigatório' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('branch_users').select('*').eq('branch_id', branchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // resolve e-mails via admin API (auth.users não é exposto ao PostgREST)
  let emails = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    emails = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? '']));
  } catch {
    // sem service key (ex.: preview) — devolve sem e-mail, UI mostra o uuid
  }
  return NextResponse.json(
    (data ?? []).map((row) => ({ ...row, email: emails.get(row.user_id) ?? null }))
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('branch_users').insert(parsed.data).select('*').single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500; // já vinculado
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = branchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('branch_users')
    .delete()
    .eq('branch_id', parsed.data.branch_id)
    .eq('user_id', parsed.data.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
