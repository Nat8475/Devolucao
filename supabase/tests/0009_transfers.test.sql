begin;
select plan(12);

select has_table('transfers');
select col_not_null('transfers', 'return_id');
select col_not_null('transfers', 'lote_id');
select col_not_null('transfers', 'destination_type');
select col_not_null('transfers', 'scheduled_date');
select fk_ok('transfers', 'return_id', 'returns', 'id');

-- seed minimal graph
insert into suppliers (id, name) values ('00000000-0000-0000-0000-00000000a001', 'F XOR');
insert into branches (id, name) values ('00000000-0000-0000-0000-00000000b001', 'Filial XOR');
insert into supplier_addresses (id, supplier_id, label)
  values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'CD XOR');
insert into returns (id, supplier_id, type, qtd, valor_unitario, status)
  values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000a001', 'avaria', 1, 10, 'pendente');

-- XOR: filial com branch_id ok
select lives_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date)
$$, 'filial + branch_id inserts');

-- XOR: filial com supplier_address_id junto -> rejeita
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, supplier_address_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', current_date)
$$, '23514', null, 'filial with both destinations rejected');

-- XOR: fornecedor sem supplier_address_id -> rejeita
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'fornecedor', current_date)
$$, '23514', null, 'fornecedor without address rejected');

-- freight_type restrito
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date, freight_type)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date, 'gratis')
$$, '23514', null, 'invalid freight_type rejected');

-- segunda transferência ATIVA pro mesmo return -> rejeita (unique parcial)
select throws_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date)
$$, '23505', null, 'second active transfer for same return rejected');

-- mas com a ativa cancelada, nova ativa é permitida (histórico ok)
update transfers set status = 'cancelada' where return_id = '00000000-0000-0000-0000-00000000d001';
select lives_ok($$
  insert into transfers (return_id, lote_id, destination_type, branch_id, scheduled_date)
  values ('00000000-0000-0000-0000-00000000d001', gen_random_uuid(), 'filial',
          '00000000-0000-0000-0000-00000000b001', current_date)
$$, 'new active transfer allowed after previous cancelled');

select * from finish();
rollback;
