import { test, expect } from './fixtures';

// Convenções da suíte (Fase 1): NF única por run, assertions com escopo de
// linha/diálogo, setup de dados via API logada (aqui, `page.request`, que
// compartilha os cookies de sessão da própria `page` já logada pela fixture —
// não há um fixture `request` separado autenticado nesta suíte).

const TEST_SUPPLIER_NAME = 'E2E Fornecedor';

interface ReturnRecordLike {
  id: string;
  nf: string | null;
  responsible_branch_id: string | null;
}

async function getSupplierId(page: import('@playwright/test').Page): Promise<string> {
  const res = await page.request.get('/api/suppliers');
  expect(res.ok()).toBeTruthy();
  const suppliers: { id: string; name: string }[] = await res.json();
  const supplier = suppliers.find((s) => s.name === TEST_SUPPLIER_NAME);
  if (!supplier) throw new Error('Fornecedor de teste (E2E Fornecedor) não encontrado — global-setup deveria criá-lo.');
  return supplier.id;
}

async function createBranch(page: import('@playwright/test').Page, name: string): Promise<string> {
  const res = await page.request.post('/api/branches', { data: { name } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as string;
}

async function createPendingReturn(page: import('@playwright/test').Page, supplierId: string, nf: string) {
  const res = await page.request.post('/api/returns', {
    data: {
      nf,
      supplier_id: supplierId,
      type: 'avaria',
      qtd: 1,
      valor_unitario: 10,
      status: 'pendente',
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function setFlag(page: import('@playwright/test').Page, key: string, enabled: boolean) {
  const res = await page.request.patch(`/api/feature-flags/${key}`, { data: { enabled } });
  expect(res.ok()).toBeTruthy();
}

/** Programa via UI uma transferência para `branchName` a partir das NFs já
 * selecionadas na tabela de /returns (o chamador precisa ter marcado os
 * checkboxes antes de chamar isto). */
async function programarParaFilial(page: import('@playwright/test').Page, branchName: string) {
  await page.getByRole('button', { name: 'Programar transferência', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Avançar', exact: true }).click();
  await dialog.getByText('Selecione a filial').click();
  await page.getByRole('option', { name: branchName, exact: true }).click();
  await dialog.getByRole('button', { name: 'Programar transferência', exact: true }).click();
  await expect(dialog.getByText(/programada\(s\) no lote/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
}

/** Abre o detalhe do lote a partir de /transfers e espera a página carregar de
 * fato (o clique navega client-side; sem esperar o heading, a próxima ação
 * pode disparar antes do fetch de `/api/transfers/lote/[loteId]` terminar). */
async function abrirLoteDetalhe(page: import('@playwright/test').Page, branchName: string) {
  await page.getByRole('button', { name: `Ver lote de transferência para ${branchName}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: branchName, exact: true, level: 1 })).toBeVisible();
}

test.describe.serial('transferências', () => {
  const nfA = `e2e-tr-${Date.now()}-a`;
  const nfB = `e2e-tr-${Date.now()}-b`;
  const nfC = `e2e-tr-${Date.now()}-c`;
  let etiquetaReturnId: string;

  test('programar lote para filial e dar baixa -> Devolvido', async ({ page }) => {
    const supplierId = await getSupplierId(page);
    const branchName = `E2E Filial Baixa ${Date.now()}`;
    await createBranch(page, branchName);
    await createPendingReturn(page, supplierId, nfA);
    const returnB = await createPendingReturn(page, supplierId, nfB);
    etiquetaReturnId = returnB.id;

    await page.goto('/returns');
    await page.getByRole('checkbox', { name: `Selecionar devolução ${nfA}` }).check();
    await page.getByRole('checkbox', { name: `Selecionar devolução ${nfB}` }).check();

    await programarParaFilial(page, branchName);

    await expect(page.locator('table tbody tr', { hasText: nfA })).toContainText('Em Transferência');
    await expect(page.locator('table tbody tr', { hasText: nfB })).toContainText('Em Transferência');

    await page.goto('/transfers');
    const loteRow = page.getByRole('button', { name: `Ver lote de transferência para ${branchName}`, exact: true });
    await expect(loteRow).toContainText('2 NFs');
    await abrirLoteDetalhe(page, branchName);

    await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirmar baixa', exact: true }).click();
    await expect(dialog.getByText('Baixa concluída.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();

    await expect(page.getByText('Concluída')).toBeVisible();

    await page.goto('/returns');
    await expect(page.locator('table tbody tr', { hasText: nfA })).toContainText('Devolvido');
    await expect(page.locator('table tbody tr', { hasText: nfB })).toContainText('Devolvido');
  });

  test('cancelar transferência exige motivo e devolve NF a Pendente', async ({ page }) => {
    const supplierId = await getSupplierId(page);
    const branchName = `E2E Filial Cancelar ${Date.now()}`;
    await createBranch(page, branchName);
    await createPendingReturn(page, supplierId, nfC);

    await page.goto('/returns');
    await page.getByRole('checkbox', { name: `Selecionar devolução ${nfC}` }).check();
    await programarParaFilial(page, branchName);

    await page.goto('/transfers');
    await abrirLoteDetalhe(page, branchName);

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const confirmButton = dialog.getByRole('button', { name: 'Confirmar cancelamento', exact: true });
    await expect(confirmButton).toBeDisabled();

    await dialog.getByPlaceholder('Motivo do cancelamento').fill('Filial fechada temporariamente');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(dialog.getByText(/voltaram para Pendente/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();

    await expect(page.getByText('Cancelada')).toBeVisible();

    await page.goto('/returns');
    await expect(page.locator('table tbody tr', { hasText: nfC })).toContainText('Pendente');
  });

  test('chegada na filial só com flag ligada e atribui responsabilidade', async ({ page }) => {
    const supplierId = await getSupplierId(page);
    const branchName = `E2E Filial Chegada ${Date.now()}`;
    const branchId = await createBranch(page, branchName);
    const nf = `e2e-tr-${Date.now()}-chegada`;
    await createPendingReturn(page, supplierId, nf);

    await page.goto('/returns');
    await page.getByRole('checkbox', { name: `Selecionar devolução ${nf}` }).check();
    await programarParaFilial(page, branchName);

    await page.goto('/transfers');
    await abrirLoteDetalhe(page, branchName);

    // Flag desligada por padrão: o botão de confirmar chegada nem aparece.
    await expect(page.getByRole('button', { name: 'Confirmar chegada', exact: true })).toHaveCount(0);

    await setFlag(page, 'confirmacao_chegada_filial', true);
    try {
      await page.reload();
      await page.getByRole('button', { name: 'Confirmar chegada', exact: true }).click();
      await expect(page.getByText(/Chegou na filial em/)).toBeVisible();

      const listRes = await page.request.get(`/api/returns?supplier_id=${supplierId}`);
      expect(listRes.ok()).toBeTruthy();
      const list: ReturnRecordLike[] = await listRes.json();
      const record = list.find((r) => r.nf === nf);
      expect(record?.responsible_branch_id).toBe(branchId);
    } finally {
      await setFlag(page, 'confirmacao_chegada_filial', false);
    }
  });

  test('etiqueta renderiza NF em destaque', async ({ page }) => {
    await page.goto(`/returns/${etiquetaReturnId}/etiqueta`);
    const etiqueta = page.locator('.etiqueta');
    await expect(etiqueta).toBeVisible();
    await expect(etiqueta).toContainText(nfB);
  });
});
