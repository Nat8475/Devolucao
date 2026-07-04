import { test, expect, filterByStatus } from './fixtures';

test('duplicata avisa e permite confirmar mesmo assim', async ({ page }) => {
  const nf = `dup-${Date.now()}`;

  async function lancar() {
    await page.goto('/returns/new');
    await page.getByLabel('NF').fill(nf);
    await page.getByText('Selecione o fornecedor').click();
    await page.getByRole('option').first().click();
    await page.getByText('Selecione o tipo').click();
    await page.getByRole('option', { name: 'Avaria' }).click();
    await page.getByLabel('Quantidade').fill('1');
    await page.getByLabel('Valor unitário').fill('1');
    await page.getByRole('button', { name: 'Confirmar lançamento' }).click();
  }

  await lancar();
  await page.waitForURL('/returns');
  await lancar();

  await expect(page.getByText('NF já lançada para este fornecedor')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar mesmo assim' }).click();
  await page.waitForURL('/returns');
});

test('baixa em lote para venda muda o status dos itens selecionados', async ({ page }) => {
  await page.goto('/returns');
  await filterByStatus(page, 'Pendente');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Dar baixa para venda' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/item\(ns\) atualizado/)).toBeVisible();
});
