-- Seed data for local development. Applied by 'supabase db reset' (see config.toml [db.seed]).

-- Fornecedor com CNPJ conhecido, usado pelo teste E2E de leitura de DANFE
-- (a chave de acesso de teste embute este CNPJ nas posições 7-20).
insert into suppliers (name, cnpj) values ('Fornecedor Scan E2E', '12345678000199');
