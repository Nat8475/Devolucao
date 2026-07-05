import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-only: usa a service-role key (NUNCA exposta ao browser). Necessário
// pra listar usuários do Auth (branch_users UI) — anon/authenticated não têm
// acesso à admin API.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
