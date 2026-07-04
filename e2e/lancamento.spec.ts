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
  await page.goto('/returns/new');
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Falta' }).click();
  await page.getByLabel('Quantidade').fill('1');
  await page.getByLabel('Valor unitário').fill('1');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();

  await page.waitForURL('/returns');
  await expect(page.getByText('Rascunho').first()).toBeVisible();
});
