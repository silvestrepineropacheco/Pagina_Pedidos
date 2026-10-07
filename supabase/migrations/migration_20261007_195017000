-- Destinos ya resueltos de cada integracion (para reutilizar y no duplicar carpetas ni planillas)
create table if not exists public.integration_targets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('drive_root','drive_year','drive_category','drive_order','sheets_book')),
  name text not null,
  external_id text not null,
  parent_id text,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

-- Registro de sincronizaciones: garantiza que un reintento no repita avisos ni filas
create table if not exists public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  event text not null,
  channel text not null check (channel in ('gmail','drive','sheets')),
  status text not null check (status in ('ok','failed','skipped','pending_config')),
  detail text,
  external_id text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, event, channel)
);

create index if not exists integration_sync_log_request_idx on public.integration_sync_log (request_id);

alter table public.integration_targets enable row level security;
alter table public.integration_sync_log enable row level security;

-- Solo administradores y Propietario ven y mantienen estos registros.
create policy integration_targets_select on public.integration_targets for select to authenticated using (public.is_admin());
create policy integration_targets_insert on public.integration_targets for insert to authenticated with check (public.is_admin());
create policy integration_targets_update on public.integration_targets for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy integration_sync_log_select on public.integration_sync_log for select to authenticated using (public.is_admin());
create policy integration_sync_log_insert on public.integration_sync_log for insert to authenticated with check (public.is_admin());
create policy integration_sync_log_update on public.integration_sync_log for update to authenticated using (public.is_admin()) with check (public.is_admin());