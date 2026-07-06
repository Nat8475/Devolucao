import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isR2Configured, r2Put, r2SignedGetUrl } from '@/lib/r2';

const ENTITY_TYPES = ['return', 'transfer', 'system'] as const;
const FILE_TYPES = ['photo', 'attachment', 'receipt', 'document', 'signature', 'logo'] as const;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — free tier, sem arquivos gigantes

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 não configurado' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data inválido' }, { status: 400 });
  }

  const file = form.get('file');
  const entityType = String(form.get('entity_type') ?? '');
  const entityIdRaw = form.get('entity_id');
  const fileType = String(form.get('file_type') ?? '');

  if (!(file instanceof File)) return NextResponse.json({ error: 'file é obrigatório' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'arquivo acima de 10 MB' }, { status: 400 });
  if (!ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number]))
    return NextResponse.json({ error: 'entity_type inválido' }, { status: 400 });
  if (!FILE_TYPES.includes(fileType as (typeof FILE_TYPES)[number]))
    return NextResponse.json({ error: 'file_type inválido' }, { status: 400 });

  const entityId = entityIdRaw ? String(entityIdRaw) : null;
  if (entityType !== 'system' && !entityId)
    return NextResponse.json({ error: 'entity_id é obrigatório fora de system' }, { status: 400 });
  // valida formato ANTES do upload — insert com uuid inválido falharia depois
  // do PUT e deixaria objeto órfão no R2
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (entityId && !UUID_RE.test(entityId))
    return NextResponse.json({ error: 'entity_id deve ser um uuid' }, { status: 400 });

  const safeName = (file.name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const key = `${entityType}/${entityId ?? 'system'}/${crypto.randomUUID()}-${safeName}`;

  try {
    await r2Put(key, await file.arrayBuffer(), file.type || 'application/octet-stream');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'falha no upload' }, { status: 502 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('files')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      file_type: fileType,
      r2_key: key,
      filename: file.name || null,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userData?.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, url: await r2SignedGetUrl(key) }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const fileType = searchParams.get('file_type');

  if (!entityType) return NextResponse.json({ error: 'entity_type é obrigatório' }, { status: 400 });

  const supabase = await createClient();
  let query = supabase
    .from('files')
    .select('*')
    .eq('entity_type', entityType)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (entityId) query = query.eq('entity_id', entityId);
  if (fileType) query = query.eq('file_type', fileType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!isR2Configured()) {
    // lista metadados mesmo sem R2 (sem url) — a UI decide o que mostrar
    return NextResponse.json(data ?? []);
  }
  const withUrls = await Promise.all(
    (data ?? []).map(async (f) => ({ ...f, url: await r2SignedGetUrl(f.r2_key) }))
  );
  return NextResponse.json(withUrls);
}
