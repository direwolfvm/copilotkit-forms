-- Seed/Migration: Add tenant support to canonical Supabase schema
--
-- Apply after:
--   1) resources/01_supabase_schema.sql
--   2) resources/02_seed_pic_core_rows.sql
--
-- Purpose:
-- - Create a canonical tenant registry table
-- - Add tenant_id to all current public domain tables
-- - Backfill existing rows to the current tenant (helppermitme)
-- - Add FK constraints + indexes for tenant filtering
--
-- Notes:
-- - This script is designed to be idempotent.
-- - It does NOT add RLS policies yet. Tenant enforcement in app/API logic and RLS can be layered next.

begin;

create table if not exists public.tenant (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.tenant is 'Tenant registry for the canonical multi-tenant Supabase instance.';
comment on column public.tenant.slug is 'Stable tenant identifier used by apps/services (e.g., helppermitme).';

insert into public.tenant (slug, name, is_default)
values ('helppermitme', 'HelpPermit.me', true)
on conflict (slug) do update
set
  name = excluded.name,
  is_default = true,
  updated_at = now();

update public.tenant
set
  is_default = (slug = 'helppermitme'),
  updated_at = now()
where is_default is distinct from (slug = 'helppermitme');

alter table public.project add column if not exists tenant_id uuid;
alter table public.case_event add column if not exists tenant_id uuid;
alter table public.comment add column if not exists tenant_id uuid;
alter table public.decision_element add column if not exists tenant_id uuid;
alter table public.document add column if not exists tenant_id uuid;
alter table public.engagement add column if not exists tenant_id uuid;
alter table public.gis_data add column if not exists tenant_id uuid;
alter table public.gis_data_element add column if not exists tenant_id uuid;
alter table public.legal_structure add column if not exists tenant_id uuid;
alter table public.process_decision_payload add column if not exists tenant_id uuid;
alter table public.process_instance add column if not exists tenant_id uuid;
alter table public.process_model add column if not exists tenant_id uuid;
alter table public.user_role add column if not exists tenant_id uuid;

update public.project set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.case_event set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.comment set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.decision_element set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.document set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.engagement set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.gis_data set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.gis_data_element set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.legal_structure set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.process_decision_payload set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.process_instance set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.process_model set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;
update public.user_role set tenant_id = (select id from public.tenant where slug = 'helppermitme') where tenant_id is null;

alter table public.project alter column tenant_id set not null;
alter table public.case_event alter column tenant_id set not null;
alter table public.comment alter column tenant_id set not null;
alter table public.decision_element alter column tenant_id set not null;
alter table public.document alter column tenant_id set not null;
alter table public.engagement alter column tenant_id set not null;
alter table public.gis_data alter column tenant_id set not null;
alter table public.gis_data_element alter column tenant_id set not null;
alter table public.legal_structure alter column tenant_id set not null;
alter table public.process_decision_payload alter column tenant_id set not null;
alter table public.process_instance alter column tenant_id set not null;
alter table public.process_model alter column tenant_id set not null;
alter table public.user_role alter column tenant_id set not null;

create index if not exists project_tenant_id_idx on public.project (tenant_id);
create index if not exists case_event_tenant_id_idx on public.case_event (tenant_id);
create index if not exists comment_tenant_id_idx on public.comment (tenant_id);
create index if not exists decision_element_tenant_id_idx on public.decision_element (tenant_id);
create index if not exists document_tenant_id_idx on public.document (tenant_id);
create index if not exists engagement_tenant_id_idx on public.engagement (tenant_id);
create index if not exists gis_data_tenant_id_idx on public.gis_data (tenant_id);
create index if not exists gis_data_element_tenant_id_idx on public.gis_data_element (tenant_id);
create index if not exists legal_structure_tenant_id_idx on public.legal_structure (tenant_id);
create index if not exists process_decision_payload_tenant_id_idx on public.process_decision_payload (tenant_id);
create index if not exists process_instance_tenant_id_idx on public.process_instance (tenant_id);
create index if not exists process_model_tenant_id_idx on public.process_model (tenant_id);
create index if not exists user_role_tenant_id_idx on public.user_role (tenant_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_tenant_id_fkey'
  ) then
    alter table public.project
      add constraint project_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_event_tenant_id_fkey'
  ) then
    alter table public.case_event
      add constraint case_event_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comment_tenant_id_fkey'
  ) then
    alter table public.comment
      add constraint comment_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decision_element_tenant_id_fkey'
  ) then
    alter table public.decision_element
      add constraint decision_element_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_tenant_id_fkey'
  ) then
    alter table public.document
      add constraint document_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'engagement_tenant_id_fkey'
  ) then
    alter table public.engagement
      add constraint engagement_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gis_data_tenant_id_fkey'
  ) then
    alter table public.gis_data
      add constraint gis_data_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gis_data_element_tenant_id_fkey'
  ) then
    alter table public.gis_data_element
      add constraint gis_data_element_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'legal_structure_tenant_id_fkey'
  ) then
    alter table public.legal_structure
      add constraint legal_structure_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'process_decision_payload_tenant_id_fkey'
  ) then
    alter table public.process_decision_payload
      add constraint process_decision_payload_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'process_instance_tenant_id_fkey'
  ) then
    alter table public.process_instance
      add constraint process_instance_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'process_model_tenant_id_fkey'
  ) then
    alter table public.process_model
      add constraint process_model_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_role_tenant_id_fkey'
  ) then
    alter table public.user_role
      add constraint user_role_tenant_id_fkey
      foreign key (tenant_id) references public.tenant(id) on update cascade on delete restrict;
  end if;
end $$;

commit;
