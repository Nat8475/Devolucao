import { test, expect } from './fixtures';

const CHAVE_CNPJ_CADASTRADO = '35240112345678000199550010000123451123456780';
// Nota: nNF ocupa as posições 26-34 (9 dígitos, 0-based slice(25,34)); a chave
// abaixo foi recalculada para embutir nNF="000067890" (-> 67890 sem zeros à
// esquerda) e o CNPJ "99999999000199" nas posições corretas.
const CHAVE_CNPJ_DESCONHECIDO = '35240199999999000199550010000678901234567800';

test('scan preenche NF e fornecedor quando o CNPJ está cadastrado', async ({ page }) => {
  await page.goto('/returns/new');
  const scanField = page.getByPlaceholder('Aponte o leitor de código de barras aqui');
  await scanField.fill(CHAVE_CNPJ_CADASTRADO);
  await scanField.press('Enter');

  await expect(page.getByLabel('NF')).toHaveValue('12345');
  await expect(page.getByText('Selecione o fornecedor')).not.toBeVisible();
});

test('scan com CNPJ não cadastrado preenche só o NF e mostra aviso', async ({ page }) => {
  await page.goto('/returns/new');
  const scanField = page.getByPlaceholder('Aponte o leitor de código de barras aqui');
  await scanField.fill(CHAVE_CNPJ_DESCONHECIDO);
  await scanField.press('Enter');

  await expect(page.getByLabel('NF')).toHaveValue('67890');
  await expect(page.getByText('CNPJ não cadastrado')).toBeVisible();
});
