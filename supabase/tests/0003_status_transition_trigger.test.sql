begin;
select plan(9);

insert into suppliers (name) values ('Fornecedor Trigger');

-- valid: rascunho -> pendente
insert into returns (supplier_id, type, qtd, valor_unitario, status)
  select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor Trigger';
update returns set status = 'pendente' where status = 'rascunho';
select is((select status from returns limit 1), 'pendente', 'rascunho -> pendente allowed');

-- valid: pendente -> em_transferencia
update returns set status = 'em_transferencia' where status = 'pendente';
select is((select status from returns limit 1), 'em_transferencia', 'pendente -> em_transferencia allowed');

-- valid: em_transferencia -> devolvido
update returns set status = 'devolvido' where status = 'em_transferencia';
select is((select status from returns limit 1), 'devolvido', 'em_transferencia -> devolvido allowed');

-- valid: devolvido -> pendente with motivo
update returns set status = 'pendente', motivo_detalhe = 'reaberto por engano' where status = 'devolvido';
select is((select status from returns limit 1), 'pendente', 'devolvido -> pendente allowed with motivo');

-- reset to devolvido via the valid path (pendente -> em_transferencia -> devolvido);
-- a direct pendente -> devolvido hop is itself an invalid transition under the trigger.
update returns set status = 'em_transferencia' where status = 'pendente';
update returns set status = 'devolvido', motivo_detalhe = null where status = 'em_transferencia';

-- invalid: devolvido -> pendente without motivo
select throws_ok(
  $$ update returns set status = 'pendente', motivo_detalhe = null where status = 'devolvido' $$,
  'P0001', 'reabertura exige motivo_detalhe preenchido',
  'devolvido -> pendente without motivo rejected'
);

-- rascunho has no valid transition back into it once left, so use a fresh row
-- instead of trying to reset the existing (devolvido) row to rascunho.
insert into returns (supplier_id, type, qtd, valor_unitario, status)
  select id, 'avaria', 1, 1, 'rascunho' from suppliers where name = 'Fornecedor Trigger';

-- invalid: rascunho -> devolvido (skips machine)
select throws_ok(
  $$ update returns set status = 'devolvido' where status = 'rascunho' $$,
  'P0001', null,
  'rascunho -> devolvido rejected'
);

-- valid: rascunho -> pendente, to set up the next assertion
update returns set status = 'pendente' where status = 'rascunho';

-- invalid: pendente -> rascunho (backwards)
select throws_ok(
  $$ update returns set status = 'rascunho' where status = 'pendente' $$,
  'P0001', null,
  'pendente -> rascunho rejected'
);

-- valid: pendente -> venda
select lives_ok(
  $$ update returns set status = 'venda' where status = 'pendente' $$,
  'pendente -> venda allowed'
);

-- invalid: venda -> em_transferencia
select throws_ok(
  $$ update returns set status = 'em_transferencia' where status = 'venda' $$,
  'P0001', null,
  'venda -> em_transferencia rejected'
);

select * from finish();
rollback;
