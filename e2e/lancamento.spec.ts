import { test, expect } from './fixtures';

test('lança devolução individual e ela aparece na lista com status pendente', async ({ page }) => {
  // NF única por execução: um valor fixo (ex.: '9001') dispararia o aviso de
  // duplicidade na segunda rodada da suíte contra um banco não-resetado, e
  // getByText sem escopo acumularia matches de rodadas anteriores.
  const nf = `e2e-${Date.now()}`;

  await page.goto('/returns/new');
  await page.getByLabel('NF').fill(nf);
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Avaria' }).click();
  await page.getByLabel('Quantidade').fill('5');
  await page.getByLabel('Valor unitário').fill('10');
  await page.getByRole('button', { name: 'Confirmar lançamento' }).click();

  await page.waitForURL('/returns');
  const row = page.locator('table tbody tr').filter({ hasText: nf });
  await expect(row).toBeVisible();
  await expect(row.getByText('Pendente')).toBeVisible();
});

test('salva rascunho e depois confirma, virando pendente', async ({ page }) => {
  // fn_confirmar_rascunho exige nf preenchido (é o único jeito de a RPC saber
  // que o lançamento está pronto para virar pendente), então o rascunho desta
  // suíte precisa de nf mesmo sendo opcional no formulário/schema. Evita a
  // substring "rascunho" no valor: getByText faz match case-insensitive por
  // padrão e colidiria com o texto do badge de status.
  const nf = `e2e-draft-${Date.now()}`;

  await page.goto('/returns/new');
  await page.getByLabel('NF').fill(nf);
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Falta' }).click();
  await page.getByLabel('Quantidade').fill('1');
  await page.getByLabel('Valor unitário').fill('1');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();

  await page.waitForURL('/returns');
  const row = page.locator('table tbody tr').filter({ hasText: nf });
  await expect(row.getByText('Rascunho', { exact: true })).toBeVisible();

  await row.getByRole('link', { name: 'Ver' }).click();
  await page.waitForURL(/\/returns\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Confirmar lançamento' }).click();
  await expect(page.getByText('Pendente')).toBeVisible();
});
