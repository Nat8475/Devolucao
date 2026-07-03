begin;
select plan(12);

insert into suppliers (name) values ('Fornecedor RPC');

-- fn_confirmar_rascunho: missing nf raises
insert into returns (supplier_id, type, qtd, valor_unitario, status)
  select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor RPC';
select throws_ok(
  $$ select fn_confirmar_rascunho(id) from returns where status = 'rascunho' limit 1 $$,
  'P0001', null,
  'fn_confirmar_rascunho rejects missing nf'
);

update returns set nf = '1001' where status = 'rascunho';
select lives_ok(
  $$ select fn_confirmar_rascunho(id) from returns where status = 'rascunho' limit 1 $$,
  'fn_confirmar_rascunho succeeds once nf is set'
);
select is((select status from returns where nf = '1001'), 'pendente', 'status is pendente after confirm');

-- fn_confirmar_rascunho: race closed - calling again on an already-pendente row raises
select throws_ok(
  $$ select fn_confirmar_rascunho(id) from returns where nf = '1001' $$,
  'P0001', null,
  'fn_confirmar_rascunho raises when the row is no longer rascunho (race closed)'
);

-- fn_dar_baixa_venda: batch, only pendente rows affected
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 2, 3, 'pendente', '1002' from suppliers where name = 'Fornecedor RPC';
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 2, 3, 'em_transferencia', '1003' from suppliers where name = 'Fornecedor RPC';

select results_eq(
  $$ select fn_dar_baixa_venda(array(select id from returns where nf in ('1002','1003')))::text $$,
  $$ select id::text from returns where nf = '1002' $$,
  'fn_dar_baixa_venda only affects the pendente row, ignoring the em_transferencia one'
);

-- fn_reabrir: batch reopen with motivo
select lives_ok(
  $$ select fn_reabrir(array(select id from returns where nf = '1002'), 'erro de digitação') $$,
  'fn_reabrir succeeds with motivo'
);
select is((select motivo_detalhe from returns where nf = '1002'), 'erro de digitação', 'motivo_detalhe recorded');

-- fn_excluir: guarded to pendente only
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 1, 1, 'venda', '1004' from suppliers where name = 'Fornecedor RPC';
select throws_ok(
  $$ select fn_excluir(id, 'teste') from returns where nf = '1004' $$,
  'P0001', null,
  'fn_excluir refuses a non-pendente return'
);

-- fn_excluir: soft-deletes a pendente row (no hard delete, no trash table)
insert into returns (supplier_id, type, qtd, valor_unitario, status, nf)
  select id, 'falta', 1, 1, 'pendente', '1005' from suppliers where name = 'Fornecedor RPC';
select lives_ok(
  $$ select fn_excluir(id, 'lançado por engano') from returns where nf = '1005' $$,
  'fn_excluir succeeds on a pendente row'
);
select is(
  (select deleted_at is not null and delete_reason = 'lançado por engano' from returns where nf = '1005'),
  true,
  'fn_excluir sets deleted_at and delete_reason instead of removing the row'
);

-- fn_restaurar: clears soft-delete fields and reopens as pendente
select lives_ok(
  $$ select fn_restaurar(id) from returns where nf = '1005' $$,
  'fn_restaurar succeeds on a soft-deleted row'
);
select is(
  (select (deleted_at is null and status = 'pendente') from returns where nf = '1005'),
  true,
  'fn_restaurar clears deleted_at and resets status to pendente'
);

select * from finish();
rollback;
