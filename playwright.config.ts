import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Os specs compartilham estado no banco entre si (lançamento cria devoluções que
  // a baixa em lote consome; a baixa cria o item 'venda' que a reabertura usa) —
  // um único worker sequencial mantém a ordem determinística em vez de arriscar
  // condições de corrida entre arquivos rodando em paralelo.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
