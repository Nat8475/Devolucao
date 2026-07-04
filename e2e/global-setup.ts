import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_USER } from './fixtures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

// A suíte roda contra uma instância local do Supabase (Docker via `supabase start`).
// O usuário de teste e um fornecedor de apoio precisam existir antes dos specs
// rodarem. `supabase/seed.sql` não é uma opção robusta para o `auth.users` (exige
// reproduzir o hash da senha e as linhas de `auth.identities` que o GoTrue espera),
// então este setup usa a Admin API do supabase-js, que é idempotente e não exige
// segredos versionados: a service_role key é lida em tempo real via `supabase status`.
function getServiceRoleCredentials(): { url: string; serviceRoleKey: string } {
  const raw = execSync('npx supabase status -o json', { encoding: 'utf-8' });
  const status = JSON.parse(raw) as { API_URL: string; SERVICE_ROLE_KEY: string };
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

const TEST_SUPPLIER_NAME = 'E2E Fornecedor';

// Logo após `supabase db reset`, o CLI reinicia os containers e o gateway (Kong)
// leva um instante para reconectar ao container do GoTrue — chamadas de auth
// feitas nessa janela falham com 502/AuthRetryableFetchError mesmo com os
// containers já "healthy". Espera o endpoint de auth responder antes de seguir.
async function waitForAuthReady(url: string, serviceRoleKey: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (res.ok) return;
      lastError = new Error(`auth health respondeu ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Auth local não ficou pronto a tempo: ${String(lastError)}`);
}

export default async function globalSetup() {
  const { url, serviceRoleKey } = getServiceRoleCredentials();
  await waitForAuthReady(url, serviceRoleKey);
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureTestUser(admin);
  await ensureTestSupplier(admin);
}

async function ensureTestUser(admin: AdminClient) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const alreadyExists = existing?.users.some((u) => u.email === TEST_USER.email);
  if (alreadyExists) return;

  const { error } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (error && !/already registered/i.test(error.message)) {
    throw new Error(`Falha ao criar usuário de teste e2e: ${error.message}`);
  }
}

async function ensureTestSupplier(admin: AdminClient) {
  const { data: existing, error: selectError } = await admin
    .from('suppliers')
    .select('id')
    .eq('name', TEST_SUPPLIER_NAME)
    .maybeSingle();
  if (selectError) throw new Error(`Falha ao consultar fornecedor de teste: ${selectError.message}`);
  if (existing) return;

  const { error: insertError } = await admin
    .from('suppliers')
    .insert({ name: TEST_SUPPLIER_NAME, is_key_account: false });
  if (insertError) throw new Error(`Falha ao criar fornecedor de teste: ${insertError.message}`);
}
