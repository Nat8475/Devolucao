begin;
select plan(6);

select has_table('suppliers');
select has_table('return_reasons');
select has_table('feature_flags');
select col_is_pk('suppliers', 'id');
select col_is_fk('return_reasons', 'supplier_id');
select col_is_pk('feature_flags', 'key');

select * from finish();
rollback;
