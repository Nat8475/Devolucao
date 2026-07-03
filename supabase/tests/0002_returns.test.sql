begin;
select plan(5);

select has_table('returns');
select has_column('returns', 'valor_total');
select col_is_null('returns', 'nf');
select col_default_is('returns', 'status', 'rascunho');

insert into suppliers (name) values ('Fornecedor Teste');
insert into returns (supplier_id, type, qtd, valor_unitario)
  select id, 'avaria', 10, 5.5 from suppliers where name = 'Fornecedor Teste';
select is(
  (select valor_total from returns limit 1),
  55.0::numeric,
  'valor_total is computed as qtd * valor_unitario'
);

select * from finish();
rollback;
