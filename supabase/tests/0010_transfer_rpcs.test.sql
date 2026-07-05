begin;
select plan(20);

-- seed
insert into suppliers (id, name) values ('00000000-0000-0000-0000-0000000a0001', 'F RPC');
insert into suppliers (id, name) values ('00000000-0000-0000-0000-0000000a0002', 'F Outro');
insert into branches (id, name) values ('00000000-0000-0000-0000-0000000b0001', 'Filial RPC');
insert into supplier_addresses (id, supplier_id, label, city, uf)
  values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000a0001', 'CD SP', 'São Paulo', 'SP');
insert into returns (id, nf, supplier_id, type, qtd, valor_unitario, status) values
  ('00000000-0000-0000-0000-0000000d0001', '101', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'pendente'),
  ('00000000-0000-0000-0000-0000000d0002', '102', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'pendente'),
  ('00000000-0000-0000-0000-0000000d0003', '103', '00000000-0000-0000-0000-0000000a0001', 'avaria', 1, 10, 'pendente'),
  ('00000000-0000-0000-0000-0000000d0004', '104', '00000000-0000-0000-0000-0000000a0002', 'avaria', 1, 10, 'pendente');

-- d0003 needs to be 'venda' to prove programar ignores non-pendente rows;
-- the initial-status trigger (0007) only allows rascunho/pendente on INSERT,
-- so it must reach 'venda' via a valid transition (pendente -> venda).
update returns set status = 'venda' where id = '00000000-0000-0000-0000-0000000d0003';

-- 1) programar: 2 pendentes + 1 venda -> afeta só os 2, cria 2 transfers no mesmo lote
select ok(
  (select array_length(affected_ids, 1) = 2
     from fn_programar_transferencia(
       array['00000000-0000-0000-0000-0000000d0001',
             '00000000-0000-0000-0000-0000000d0002',
             '00000000-0000-0000-0000-0000000d0003']::uuid[],
       'filial', '00000000-0000-0000-0000-0000000b0001', null,
       'Transp X', 'PED-1', 'tabela', null, current_date + 1)),
  'programar affects only pendentes');

select is(
  (select count(*)::int from transfers where status = 'em_transferencia'), 2,
  'two transfer rows created');

select is(
  (select count(distinct lote_id)::int from transfers), 1,
  'both rows share one lote');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  'em_transferencia', 'return 1 moved to em_transferencia');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0003'),
  'venda', 'venda row untouched');

-- 2) programar destino fornecedor exige endereço do MESMO fornecedor das NFs
select throws_ok($$
  select * from fn_programar_transferencia(
    array['00000000-0000-0000-0000-0000000d0004']::uuid[],
    'fornecedor', null, '00000000-0000-0000-0000-0000000c0001',
    null, null, null, null, current_date)
$$, 'P0001', null, 'address of another supplier rejected');

-- 3) chegada: flag off -> recusa
select throws_ok($$
  select * from fn_confirmar_chegada((select lote_id from transfers limit 1))
$$, 'P0001', null, 'chegada refused with flag off');

-- flag on -> preenche arrived_at_branch_at e responsible_branch_id
update feature_flags set enabled = true where key = 'confirmacao_chegada_filial';

select ok(
  (select count(*) from fn_confirmar_chegada((select lote_id from transfers limit 1))) = 2,
  'chegada confirms both transfers of the lote');

select is(
  (select responsible_branch_id from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  '00000000-0000-0000-0000-0000000b0001'::uuid,
  'responsibility assigned to branch');

select ok(
  (select count(*) = 2 from transfers where arrived_at_branch_at is not null),
  'arrived_at_branch_at stamped');

-- 4) reagendar
select ok(
  (select count(*) from fn_reagendar_transferencia((select lote_id from transfers limit 1), current_date + 7)) = 2,
  'reagendar updates both rows');

-- 5) baixa: lote inteiro -> transfers concluida, returns devolvido + resolved_at
select ok(
  (select count(*) from fn_baixar_transferencia((select lote_id from transfers limit 1))) = 2,
  'baixa hits both returns');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0002'),
  'devolvido', 'return devolvido after baixa');

select ok(
  (select resolved_at is not null from returns where id = '00000000-0000-0000-0000-0000000d0002'),
  'resolved_at stamped by baixa');

-- baixa de lote já concluído -> erro (nada elegível)
select throws_ok($$
  select * from fn_baixar_transferencia((select lote_id from transfers limit 1))
$$, 'P0001', null, 'baixa on finished lote errors');

-- cancelar exige motivo
select throws_ok($$ select * from fn_cancelar_transferencia(gen_random_uuid(), '  ') $$,
  'P0001', null, 'cancel without motivo rejected');

-- 6) cancelar: reabre d0001 (devolvido -> pendente), programa uma nova
-- transferência (lote novo, já que a anterior está concluída) e cancela
-- -> volta pendente, sem responsável.
update returns set status = 'pendente', motivo_detalhe = 'reaberto p/ teste'
  where id = '00000000-0000-0000-0000-0000000d0001';

select lives_ok($$
  select * from fn_programar_transferencia(
    array['00000000-0000-0000-0000-0000000d0001']::uuid[], 'filial',
    '00000000-0000-0000-0000-0000000b0001', null, null, null, null, null, current_date)
$$, 'reprogram after reopen');

select ok(
  (select count(*) from fn_cancelar_transferencia(
    (select lote_id from transfers where status = 'em_transferencia'), 'motivo do cancelamento')) = 1,
  'cancel affects the reprogrammed transfer');

select is(
  (select status from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  'pendente', 'return back to pendente after cancel');

select is(
  (select responsible_branch_id from returns where id = '00000000-0000-0000-0000-0000000d0001'),
  null, 'responsibility cleared after cancel');

select * from finish();
rollback;
