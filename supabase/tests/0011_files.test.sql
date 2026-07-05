begin;
select plan(6);

select has_table('files');
select col_not_null('files', 'entity_type');
select col_not_null('files', 'file_type');
select col_not_null('files', 'r2_key');

-- entity_id nullable ONLY for entity_type = 'system' (logo)
select lives_ok($$
  insert into files (entity_type, entity_id, file_type, r2_key)
  values ('system', null, 'logo', 'system/logo/x.png')
$$, 'system file without entity_id ok');

select throws_ok($$
  insert into files (entity_type, entity_id, file_type, r2_key)
  values ('transfer', null, 'receipt', 'transfer/x/y.pdf')
$$, '23514', null, 'non-system file requires entity_id');

select * from finish();
rollback;
