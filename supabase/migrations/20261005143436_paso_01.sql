create extension if not exists pgcrypto;

-- ============ TABLAS BASE ============
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  owner_email text,
  invite_mode text not null default 'password',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'pending' check (role in ('owner','admin','encargado','pending')),
  sector_id uuid references public.sectors(id),
  active boolean not null default false,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('insumos','indumentaria','maquinaria')),
  description text,
  variant text,
  unit text,
  presentation text,
  image_url text,
  usual_supplier text,
  usual_url text,
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ FUNCIONES DE CONTEXTO (evitan recursion de RLS) ============
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'pending');
$$;

create or replace function public.app_sector()
returns uuid language sql stable security definer set search_path = public as $$
  select p.sector_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.active and p.role <> 'pending' from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role in ('admin','owner') and p.active from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'owner' and p.active from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.has_app_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user();
$$;

create or replace function public.owner_setup_pending()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (s.owner_email is null or length(btrim(s.owner_email)) = 0) from public.app_settings s where s.id), true);
$$;
grant execute on function public.owner_setup_pending() to anon, authenticated;

-- ============ ALTA DE USUARIOS ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_role text := 'pending';
  v_active boolean := false;
begin
  perform pg_advisory_xact_lock(918273645);
  select lower(btrim(coalesce(s.owner_email, ''))) into v_owner from public.app_settings s where s.id;
  if v_owner is not null and v_owner <> '' and lower(new.email) = v_owner then
    v_role := 'owner';
    v_active := true;
  end if;
  insert into public.profiles (id, full_name, email, role, active, email_verified)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_role,
    v_active,
    new.email_confirmed_at is not null
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_owner_profile()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_count integer := 0;
begin
  select lower(btrim(coalesce(s.owner_email, ''))) into v_email from public.app_settings s where s.id;
  if v_email is null or v_email = '' then
    return 0;
  end if;
  update public.profiles
     set role = 'owner', active = true, email_verified = true, updated_at = now()
   where lower(email) = v_email
     and (role is distinct from 'owner' or active is not true);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    if new.role is distinct from old.role
       or new.sector_id is distinct from old.sector_id
       or new.active is distinct from old.active
       or new.email_verified is distinct from old.email_verified then
      raise exception 'Solo el Propietario puede modificar rol, sector o estado de la cuenta.' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============ TRIGGERS ============
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============ RLS ============
alter table public.sectors enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.catalog_items enable row level security;

create policy sectors_select on public.sectors for select to authenticated using (public.has_app_access());
create policy sectors_insert on public.sectors for insert to authenticated with check (public.is_admin());
create policy sectors_update on public.sectors for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.has_app_access());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_owner()) with check (id = auth.uid() or public.is_owner());

create policy catalog_select on public.catalog_items for select to authenticated using (public.has_app_access());
create policy catalog_insert on public.catalog_items for insert to authenticated with check (public.is_admin());
create policy catalog_update on public.catalog_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- app_settings no tiene politicas: solo se accede por funciones security definer.

-- ============ SEMILLA DEMOSTRATIVA (editable, identificada como demostrativa) ============
insert into public.sectors (name, code, is_demo) values
  ('Despostada', 'DES', true),
  ('Envasado', 'ENV', true),
  ('Frio y Camaras', 'FRI', true),
  ('Mantenimiento', 'MAN', true),
  ('Vestuarios y Comedor', 'VES', true),
  ('Expedicion', 'EXP', true)
on conflict (name) do nothing;

insert into public.catalog_items (name, category, description, variant, unit, presentation, is_demo) values
  ('Caja de carton 40x30x30', 'insumos', 'Caja de carton corrugado para envasado', '40x30x30 cm', 'unidad', 'Fardo x 25 unidades', true),
  ('Bolsa de polietileno 30x40', 'insumos', 'Bolsa de polietileno virgen', '30x40 cm', 'paquete', 'Paquete x 100 unidades', true),
  ('Stickers de trazabilidad', 'insumos', 'Etiqueta autoadhesiva para identificacion de lotes', null, 'rollo', 'Rollo x 500 etiquetas', true),
  ('Guante descartable de nitrilo', 'insumos', 'Guante descartable sin polvo, apto contacto con alimentos', 'Talle M', 'caja', 'Caja x 100 unidades', true),
  ('Film stretch 50 cm', 'insumos', 'Film de embalaje para paletizado', '50 cm', 'rollo', 'Rollo 3 kg', true),
  ('Cinta de embalar', 'insumos', 'Cinta adhesiva transparente para cierre de cajas', '48 mm x 100 m', 'rollo', null, true),
  ('Bota de goma de seguridad', 'indumentaria', 'Bota de goma con puntera de acero', 'Talle 42', 'par', null, true),
  ('Delantal impermeable', 'indumentaria', 'Delantal de PVC para sala de desposte', 'Talle unico', 'unidad', null, true),
  ('Campera termica de frio', 'indumentaria', 'Campera de abrigo para camara de congelados', 'Talle L', 'unidad', null, true),
  ('Uniforme de trabajo (camisa y pantalon)', 'indumentaria', 'Ambo de trabajo con logo de la empresa', 'Talle L', 'juego', null, true),
  ('Selladora de bolsas al vacio', 'maquinaria', 'Selladora de mesa para envasado al vacio', 'Doble camara', 'unidad', null, true),
  ('Balanza electronica 300 kg', 'maquinaria', 'Balanza de plataforma para recepcion de mercaderia', '300 kg', 'unidad', null, true);
