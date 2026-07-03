begin;
select plan(4);

select is(
  (select relrowsecurity from pg_class where relname = 'suppliers'),
  true, 'RLS enabled on suppliers'
);
select is(
  (select relrowsecurity from pg_class where relname = 'returns'),
  true, 'RLS enabled on returns'
);
select policies_are('suppliers', array['fase1_authenticated_full_access']);
select policies_are('returns', array['fase1_authenticated_full_access']);

select * from finish();
rollback;
