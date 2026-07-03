create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_key_account boolean not null default false,
  cnpj text,
  contact_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table return_reasons (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  label text not null,
  active boolean not null default true
);

create table feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text
);

insert into feature_flags (key, description) values
  ('confirmacao_chegada_filial', 'Fase 2: confirmação de chegada na filial'),
  ('assinatura_baixa', 'Fase 2: assinatura na baixa'),
  ('roteirizacao_coleta', 'Fase 2: roteirização de coleta'),
  ('batch_mode', 'Fase 3: e-mail de alerta sempre em lote, nunca item a item'),
  ('email_devolucao_programada', 'Fase 3: e-mail de devolução programada');
