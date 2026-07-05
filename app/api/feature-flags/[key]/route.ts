import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { featureFlagPatchSchema } from '@/lib/validation';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = featureFlagPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feature_flags').update({ enabled: parsed.data.enabled }).eq('key', key).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'flag não encontrada' }, { status: 404 });
  return NextResponse.json(data);
}
