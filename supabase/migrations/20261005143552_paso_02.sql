create sequence if not exists public.requests_folio_seq;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  idempotency_key uuid not null unique,
  requester_id uuid not null references public.profiles(id),
  sector_id uuid not null references public.sectors(id),
  category text not null check (category in ('insumos','indumentaria','maquinaria')),
  needed_by date,
  priority text not null default 'normal' check (priority in ('normal','alta','urgente')),
  urgency_reason text,
  notes text,
  status text not null default 'draft' check (status in ('draft','pending_review','needs_info','evaluating','approved_pending_purchase','purchasing','purchased_pending_receipt','partially_received','completed','rejected','cancelled')),
  assigned_admin_id uuid references public.profiles(id),
  submitted_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_reason text,
  closed_at timestamptz,
  repeated_from_id uuid references public.requests(id),
  machinery_type text check (machinery_type in ('nueva','reemplazo','reparacion','mejora')),
  equipment_name text,
  problem text,
  expected_benefit text,
  no_purchase_consequence text,
  current_equipment text,
  technical_specs text,
  estimated_price numeric(14,2),
  currency text not null default 'ARS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_sector_idx on public.requests (sector_id);
create index if not exists requests_status_idx on public.requests (status);

create table if not exists public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  line_no integer not null default 1,
  catalog_item_id uuid references public.catalog_items(id),
  name text not null,
  description text,
  specifications jsonb not null default '{}'::jsonb,
  unit text,
  package_content text,
  reported_stock numeric(14,2),
  requested_qty numeric(14,2) not null check (requested_qty > 0),
  approved_qty numeric(14,2) not null default 0 check (approved_qty >= 0),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  unit_price_estimate numeric(14,2),
  currency text not null default 'ARS',
  suggested_url text,
  purchase_url text,
  notes text,
  photo_path text,
  item_status text not null default 'pending' check (item_status in ('pending','needs_info','approved','rejected','purchasing','purchased','partially_received','received','cancelled')),
  reason text,
  change_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, line_no)
);
create index if not exists request_items_request_idx on public.request_items (request_id);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  request_item_id uuid not null references public.request_items(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  field text not null,
  old_value text,
  new_value text,
  reason text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists change_requests_request_idx on public.change_requests (request_id);

-- ============ HELPERS DE ACCESO A SOLICITUDES ============
create or replace function public.can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
     where r.id = p_request_id
       and (public.is_admin() or (public.has_app_access() and r.sector_id = public.app_sector()))
  );
$$;

create or replace function public.can_edit_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
     where r.id = p_request_id
       and (public.is_admin() or (r.requester_id = auth.uid() and r.status in ('draft','needs_info')))
  );
$$;

-- ============ ESCRITURA DE SOLICITUDES ============
create or replace function public.requests_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.folio is null then
    new.folio := 'PED-' || to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY') || '-' || lpad(nextval('public.requests_folio_seq')::text, 6, '0');
  end if;
  if new.priority = 'urgente' and coalesce(btrim(new.urgency_reason), '') = '' then
    raise exception 'La justificacion es obligatoria para prioridad urgente.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.sector_id is distinct from old.sector_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.folio is distinct from old.folio then
    raise exception 'El solicitante, el sector y el numero de solicitud no se pueden modificar.' using errcode = '42501';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.requester_id <> auth.uid() then
    raise exception 'Solo el creador de la solicitud puede modificarla.' using errcode = '42501';
  end if;
  if new.assigned_admin_id is distinct from old.assigned_admin_id then
    raise exception 'Solo un administrador puede asignar o reasignar la solicitud.' using errcode = '42501';
  end if;
  if new.closed_reason is distinct from old.closed_reason
     or new.closed_by is distinct from old.closed_by
     or new.closed_at is distinct from old.closed_at then
    raise exception 'Solo un administrador puede cerrar el saldo de la solicitud.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status in ('draft','pending_review','cancelled'))
         or (old.status = 'needs_info' and new.status in ('draft','pending_review','cancelled'))
         or (old.status = 'pending_review' and new.status = 'draft')) then
      raise exception 'El encargado no puede pasar la solicitud a ese estado.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_item_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
begin
  select * into v_req from public.requests where id = coalesce(new.request_id, old.request_id);
  if v_req.id is null then
    raise exception 'Solicitud inexistente.' using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    if not (public.is_admin() or (v_req.requester_id = auth.uid() and v_req.status = 'draft')) then
      raise exception 'No se pueden eliminar articulos de esta solicitud.' using errcode = '42501';
    end if;
    return old;
  end if;

  if public.is_admin() then
    if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
      raise exception 'El articulo no se puede mover a otra solicitud.' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' and new.request_id is distinct from old.request_id then
    raise exception 'El articulo no se puede mover a otra solicitud.' using errcode = '42501';
  end if;
  if v_req.requester_id <> auth.uid() then
    raise exception 'Solo el creador de la solicitud puede modificar sus articulos.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.approved_qty, 0) <> 0 or new.item_status not in ('pending','needs_info') or new.approved_by is not null then
      raise exception 'Un encargado no puede aprobar articulos.' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if v_req.status not in ('draft','needs_info') then
    if (to_jsonb(new) - 'change_pending' - 'updated_at') is distinct from (to_jsonb(old) - 'change_pending' - 'updated_at') then
      raise exception 'La solicitud ya fue enviada. Usa "Solicitar cambio" para proponer una modificacion.' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.approved_qty is distinct from old.approved_qty
     or new.item_status is distinct from old.item_status
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'Solo un administrador puede aprobar, rechazar o modificar cantidades aprobadas.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_before_write_trg
  before insert or update on public.requests
  for each row execute function public.requests_before_write();

create trigger requests_guard_update_trg
  before update on public.requests
  for each row execute function public.guard_request_update();

create trigger request_items_guard_trg
  before insert or update or delete on public.request_items
  for each row execute function public.guard_item_write();

create or replace function public.on_change_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.request_items
     set change_pending = true, updated_at = now()
   where id = new.request_item_id
     and item_status not in ('received','cancelled');
  return new;
end;
$$;

create or replace function public.guard_change_request_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.requested_by <> auth.uid() then
      raise exception 'La propuesta de cambio debe registrarse a nombre del usuario que la solicita.' using errcode = '42501';
    end if;
    if coalesce(btrim(new.reason), '') = '' then
      raise exception 'El motivo del cambio es obligatorio.' using errcode = '23514';
    end if;
    if new.status <> 'pending' or new.resolved_by is not null then
      raise exception 'Una propuesta de cambio nueva debe quedar pendiente de revision.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'Solo un administrador o el Propietario puede resolver las solicitudes de cambio.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.request_item_id is distinct from old.request_item_id
     or new.requested_by is distinct from old.requested_by
     or new.field is distinct from old.field
     or new.old_value is distinct from old.old_value
     or new.new_value is distinct from old.new_value
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'La propuesta registrada no se puede alterar; solo resolverla.' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'Esta propuesta ya fue resuelta.' using errcode = '23514';
  end if;
  if new.status = old.status then
    raise exception 'La propuesta debe resolverse como aceptada o rechazada.' using errcode = '23514';
  end if;
  new.resolved_by := auth.uid();
  new.resolved_at := now();
  return new;
end;
$$;

create trigger change_requests_guard_trg
  before insert or update on public.change_requests
  for each row execute function public.guard_change_request_write();

create trigger change_requests_after_insert_trg
  after insert on public.change_requests
  for each row execute function public.on_change_request_created();

-- ============ OPERACIONES ATOMICAS ============
create or replace function public.submit_request(p_request_id uuid)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud inexistente.' using errcode = '23503';
  end if;
  if v_req.requester_id <> auth.uid() and not public.is_admin() then
    raise exception 'No tenes permiso sobre esta solicitud.' using errcode = '42501';
  end if;
  if v_req.status not in ('draft','needs_info') then
    return v_req;
  end if;
  if not exists (select 1 from public.request_items i where i.request_id = p_request_id) then
    raise exception 'La solicitud necesita al menos un articulo.' using errcode = '23514';
  end if;
  if v_req.priority = 'urgente' and coalesce(btrim(v_req.urgency_reason), '') = '' then
    raise exception 'La justificacion es obligatoria para prioridad urgente.' using errcode = '23514';
  end if;
  update public.requests
     set status = 'pending_review', submitted_at = coalesce(submitted_at, now()), updated_at = now()
   where id = p_request_id
   returning * into v_req;
  return v_req;
end;
$$;

create or replace function public.assign_request(p_request_id uuid, p_admin_id uuid default null, p_reassign boolean default false)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_target uuid := coalesce(p_admin_id, auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar pedidos.' using errcode = '42501';
  end if;
  if v_target <> auth.uid() then
    if not exists (select 1 from public.profiles p where p.id = v_target and p.role in ('admin','owner') and p.active) then
      raise exception 'El destinatario no es un administrador activo.' using errcode = '23514';
    end if;
  end if;
  update public.requests
     set assigned_admin_id = v_target, updated_at = now()
   where id = p_request_id
     and (p_reassign or assigned_admin_id is null)
   returning * into v_req;
  if v_req.id is null then
    select * into v_req from public.requests where id = p_request_id;
    if v_req.id is null then
      raise exception 'Solicitud inexistente.' using errcode = '23503';
    end if;
    raise exception 'La solicitud ya esta asignada a otro administrador.' using errcode = '23505';
  end if;
  return v_req;
end;
$$;

-- ============ RLS ============
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.change_requests enable row level security;

create policy requests_select on public.requests for select to authenticated using (public.can_view_request(id));
create policy requests_insert on public.requests for insert to authenticated with check (
  public.has_app_access()
  and requester_id = auth.uid()
  and status = 'draft'
  and (sector_id = public.app_sector() or public.is_admin())
);
create policy requests_update on public.requests for update to authenticated
  using (public.is_admin() or requester_id = auth.uid())
  with check (public.is_admin() or requester_id = auth.uid());

create policy request_items_select on public.request_items for select to authenticated using (public.can_view_request(request_id));
create policy request_items_insert on public.request_items for insert to authenticated with check (public.can_edit_request(request_id));
create policy request_items_update on public.request_items for update to authenticated
  using (public.is_admin() or public.can_edit_request(request_id)) with check (public.is_admin() or public.can_edit_request(request_id));
create policy request_items_delete on public.request_items for delete to authenticated using (public.can_edit_request(request_id));

create policy change_requests_select on public.change_requests for select to authenticated using (public.can_view_request(request_id));
create policy change_requests_insert on public.change_requests for insert to authenticated with check (
  public.can_view_request(request_id) and requested_by = auth.uid()
);
create policy change_requests_update on public.change_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
