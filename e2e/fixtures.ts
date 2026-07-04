import { test as base, expect, type Page } from '@playwright/test';

export const TEST_USER = { email: 'e2e@example.com', password: 'senha-teste-123' };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(TEST_USER.email);
    await page.getByLabel('Senha').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('/returns');
    await use(page);
  },
});

export { expect };

const STATUS_VALUE_BY_LABEL: Record<string, string> = {
  Rascunho: 'rascunho',
  Pendente: 'pendente',
  'Em Transferência': 'em_transferencia',
  Devolvido: 'devolvido',
  Venda: 'venda',
};

// A tabela de /returns filtra por status via um <Select> client-side (não lê
// `?status=` da URL — não há nenhum server component/searchParams plugado nele),
// então os specs precisam interagir com o combobox em vez de navegar com query string.
// Também é preciso esperar o refetch disparado pela troca de filtro terminar antes
// de interagir com as linhas: a tabela zera a seleção de checkboxes assim que os
// dados recarregam, e clicar num checkbox durante esse refetch parece "não fazer
// nada" (o clique é imediatamente desfeito pelo reload em andamento).
export async function filterByStatus(page: Page, label: string) {
  const statusValue = STATUS_VALUE_BY_LABEL[label];
  await page.getByRole('combobox').filter({ hasText: /status/i }).click();
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes(`/api/returns?status=${statusValue}`) && res.request().method() === 'GET'
  );
  await page.getByRole('option', { name: label, exact: true }).click();
  await responsePromise;
}
