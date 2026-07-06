import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  // gate: só usuário logado pode listar (proxy já cobre, mas /api/users expõe
  // e-mails — checagem explícita aqui é barata)
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'sem service key' }, { status: 503 });
  }
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data?.users ?? []).map((u) => ({ id: u.id, email: u.email ?? '' })));
}
