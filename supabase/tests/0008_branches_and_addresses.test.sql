begin;
select plan(12);

select has_table('branches');
select has_table('supplier_addresses');
select has_table('branch_users');
select has_column('returns', 'responsible_branch_id');

select col_not_null('branches', 'name');
select col_default_is('branches', 'active', 'true');

select col_not_null('supplier_addresses', 'supplier_id');
select col_not_null('supplier_addresses', 'label');
select col_default_is('supplier_addresses', 'contact_emails', '{}'::text[]);

-- supplier_addresses.supplier_id must reference suppliers
select fk_ok('supplier_addresses', 'supplier_id', 'suppliers', 'id');

-- branch_users composite PK (no duplicate link)
select col_is_pk('branch_users', array['branch_id', 'user_id']);

-- RLS enabled on the three new tables
select ok(
  (select count(*) = 3 from pg_class c
    where c.relname in ('branches','supplier_addresses','branch_users') and c.relrowsecurity),
  'RLS enabled on branches, supplier_addresses, branch_users'
);

select * from finish();
rollback;
