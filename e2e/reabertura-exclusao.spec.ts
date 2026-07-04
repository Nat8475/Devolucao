import { test, expect, filterByStatus } from './fixtures';

test('reabertura sem motivo fica bloqueada, com motivo funciona', async ({ page }) => {
  await page.goto('/returns');
  await filterByStatus(page, 'Venda');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Reabrir selecionados' }).click();

  const confirmButton = page.getByRole('button', { name: 'Confirmar' });
  await expect(confirmButton).toBeDisabled();

  await page.getByPlaceholder('Motivo da reabertura').fill('Erro de digitação, reabrindo');
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(page.getByText(/item\(ns\) atualizado/)).toBeVisible();
});

test('excluir só disponível em pendente, vai para lixeira, e pode ser restaurado', async ({ page }) => {
  await page.goto('/returns');
  await filterByStatus(page, 'Pendente');
  await page.locator('table tbody tr td:last-child a').first().click();

  await expect(page.getByRole('button', { name: 'Excluir' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByPlaceholder('Motivo da exclusão').fill('Lançado por engano');
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

  await page.waitForURL('/returns');
  await page.goto('/trash');
  await page.getByRole('button', { name: 'Restaurar' }).first().click();

  await page.goto('/returns');
  await filterByStatus(page, 'Pendente');
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
});
