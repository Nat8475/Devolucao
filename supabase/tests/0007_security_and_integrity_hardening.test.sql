begin;
select plan(15);

-- C1: anon must not be able to execute any of the 5 RPCs; authenticated must
insert into suppliers (name) values ('Fornecedor Hardening');

select is(
  has_function_privilege('anon', 'fn_confirmar_rascunho(uuid)', 'execute'),
  false, 'anon cannot execute fn_confirmar_rascunho'
);
select is(
  has_function_privilege('authenticated', 'fn_confirmar_rascunho(uuid)', 'execute'),
  true, 'authenticated can execute fn_confirmar_rascunho'
);

select is(
  has_function_privilege('anon', 'fn_dar_baixa_venda(uuid[])', 'execute'),
  false, 'anon cannot execute fn_dar_baixa_venda'
);
select is(
  has_function_privilege('authenticated', 'fn_dar_baixa_venda(uuid[])', 'execute'),
  true, 'authenticated can execute fn_dar_baixa_venda'
);

select is(
  has_function_privilege('anon', 'fn_reabrir(uuid[], text)', 'execute'),
  false, 'anon cannot execute fn_reabrir'
);
select is(
  has_function_privilege('authenticated', 'fn_reabrir(uuid[], text)', 'execute'),
  true, 'authenticated can execute fn_reabrir'
);

select is(
  has_function_privilege('anon', 'fn_excluir(uuid, text)', 'execute'),
  false, 'anon cannot execute fn_excluir'
);
select is(
  has_function_privilege('authenticated', 'fn_excluir(uuid, text)', 'execute'),
  true, 'authenticated can execute fn_excluir'
);

select is(
  has_function_privilege('anon', 'fn_restaurar(uuid)', 'execute'),
  false, 'anon cannot execute fn_restaurar'
);
select is(
  has_function_privilege('authenticated', 'fn_restaurar(uuid)', 'execute'),
  true, 'authenticated can execute fn_restaurar'
);

-- I4: fn_dar_baixa_venda must ignore a soft-deleted pendente row
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 1, 1, 'pendente', 'hard-2001' from suppliers where name = 'Fornecedor Hardening';
update returns set deleted_at = now(), delete_reason = 'teste hardening'
  where nf = 'hard-2001';

select results_eq(
  $$ select fn_dar_baixa_venda(array(select id from returns where nf = 'hard-2001'))::text $$,
  array[]::text[],
  'fn_dar_baixa_venda ignores a soft-deleted pendente row (no ids returned)'
);
select is(
  (select status from returns where nf = 'hard-2001'),
  'pendente',
  'soft-deleted row stays pendente (untouched by fn_dar_baixa_venda)'
);

-- I5: rows must not be born past rascunho/pendente
select throws_ok(
  $$ insert into returns (supplier_id, type, qtd, valor_unitario, status)
       select id, 'avaria', 1, 1, 'venda' from suppliers where name = 'Fornecedor Hardening' $$,
  'P0001', null,
  'inserting a return with status venda is rejected'
);
select lives_ok(
  $$ insert into returns (supplier_id, type, qtd, valor_unitario, status)
       select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor Hardening' $$,
  'inserting a return with status rascunho succeeds'
);
select lives_ok(
  $$ insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
       select id, 'avaria', 1, 1, 'pendente', 'hard-2002' from suppliers where name = 'Fornecedor Hardening' $$,
  'inserting a return with status pendente succeeds'
);

select * from finish();
rollback;
