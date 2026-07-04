import { test, expect } from './fixtures';

test('lança devolução individual e ela aparece na lista com status pendente', async ({ page }) => {
  await page.goto('/returns/new');
  await page.getByLabel('NF').fill('9001');
  await page.getByText('Selecione o fornecedor').click();
  await page.getByRole('option').first().click();
  await page.getByText('Selecione o tipo').click();
  await page.getByRole('option', { name: 'Avaria' }).click();
  await page.getByLabel('Quantidade').fill('5');
  await page.getByLabel('Valor unitário').fill('10');
  await page.getByRole('button', { name: 'Confirmar lançamento' }).click();

  await page.waitForURL('/returns');
  await expect(page.getByText('9001')).toBeVisible();
  await expect(page.getByText('Pendente')).toBeVisible();
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
