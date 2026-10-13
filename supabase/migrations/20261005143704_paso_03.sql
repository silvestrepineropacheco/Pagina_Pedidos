create or replace function public.can_contribute_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
     where r.id = p_request_id
       and (public.is_admin() or (public.has_app_access() and r.sector_id = public.app_sector()))
  );
$$;

create sequence if not exists public.purchases_folio_seq;
create sequence if not exists public.receipts_folio_seq;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  idempotency_key uuid not null unique,
  created_by uuid not null references public.profiles(id),
  channel text not null check (channel in ('proveedor','mercado_libre','otro')),
  vendor_name text,
  purchase_date date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  shipping_cost numeric(14,2) not null default 0,
  currency text not null default 'ARS',
  total numeric(14,2) not null default 0,
  order_number text,
  estimated_delivery_date date,
  tracking text,
  invoice_path text,
  notes text,
  status text not null default 'purchased' check (status in ('purchasing','purchased')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  request_item_id uuid not null references public.request_items(id),
  qty numeric(14,2) not null check (qty > 0),
  unit_price numeric(14,2),
  currency text not null default 'ARS',
  product_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists purchase_items_request_item_idx on public.purchase_items (request_item_id);
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  idempotency_key uuid not null unique,
  request_id uuid not null references public.requests(id),
  purchase_id uuid references public.purchases(id),
  received_at date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  received_by_name text,
  created_by uuid not null references public.profiles(id),
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  request_item_id uuid not null references public.request_items(id),
  qty_accepted numeric(14,2) not null default 0 check (qty_accepted >= 0),
  qty_wrong numeric(14,2) not null default 0 check (qty_wrong >= 0),
  qty_damaged numeric(14,2) not null default 0 check (qty_damaged >= 0),
  qty_missing numeric(14,2) not null default 0 check (qty_missing >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists receipt_items_request_item_idx on public.receipt_items (request_item_id);

create or replace function public.item_purchased_qty(p_item uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(pi.qty), 0) from public.purchase_items pi where pi.request_item_id = p_item;
$$;

create or replace function public.item_accepted_qty(p_item uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(ri.qty_accepted), 0) from public.receipt_items ri where ri.request_item_id = p_item;
$$;

create or replace function public.request_pending_balance(p_request uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(ri.approved_qty - public.item_accepted_qty(ri.id), 0)), 0)
    from public.request_items ri
   where ri.request_id = p_request
     and ri.approved_qty > 0
     and ri.item_status not in ('rejected','cancelled');
$$;

create or replace function public.guard_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.internal_op', true), '') = 'true' then
    return new;
  end if;
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
  if coalesce(current_setting('app.internal_op', true), '') = 'true' then
    if tg_op <> 'DELETE' then new.updated_at := now(); return new; else return old; end if;
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

create or replace function public.recalc_request_status(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_approved numeric := 0;
  v_accepted numeric := 0;
  v_purchased numeric := 0;
  v_eventual text;
begin
  select * into v_req from public.requests where id = p_request;
  if v_req.id is null then return; end if;
  if v_req.status in ('draft','needs_info','pending_review','cancelled','rejected','evaluating') then
    return;
  end if;

  select coalesce(sum(ri.approved_qty), 0),
         coalesce(sum(public.item_accepted_qty(ri.id)), 0),
         coalesce(sum(public.item_purchased_qty(ri.id)), 0)
    into v_approved, v_accepted, v_purchased
    from public.request_items ri
   where ri.request_id = p_request
     and ri.item_status not in ('rejected','cancelled');

  if v_approved > 0 and v_accepted >= v_approved then
    v_eventual := 'completed';
  elsif v_approved > 0 and v_req.closed_at is not null then
    v_eventual := 'completed';
  elsif v_accepted > 0 then
    v_eventual := 'partially_received';
  elsif v_purchased > 0 then
    v_eventual := 'purchased_pending_receipt';
  elsif v_approved > 0 then
    v_eventual := 'approved_pending_purchase';
  elsif not exists (select 1 from public.request_items ri where ri.request_id = p_request and ri.item_status not in ('rejected','cancelled')) then
    v_eventual := 'rejected';
  else
    v_eventual := v_req.status;
  end if;

  if v_eventual is distinct from v_req.status then
    perform set_config('app.internal_op', 'true', true);
    update public.requests set status = v_eventual, updated_at = now() where id = p_request;
    perform set_config('app.internal_op', '', true);
  end if;
end;
$$;

create or replace function public.guard_request_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.internal_op', true), '') = 'true' then
    return new;
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if public.request_pending_balance(new.id) > 0
       and (new.closed_at is null or coalesce(btrim(new.closed_reason), '') = '') then
      raise exception 'La solicitud tiene cantidades aprobadas pendientes. Un administrador debe cerrar el saldo con un motivo.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger requests_completion_guard_trg
  before update on public.requests
  for each row execute function public.guard_request_completion();

create or replace function public.register_purchase(p_payload jsonb, p_idempotency_key uuid)
returns public.purchases language plpgsql security definer set search_path = public as $$
declare
  v_purchase public.purchases;
  v_items jsonb;
  v_line jsonb;
  v_item public.request_items;
  v_qty numeric;
  v_total numeric := 0;
  v_shipping numeric := coalesce((p_payload->>'shipping_cost')::numeric, 0);
  v_currency text := coalesce(nullif(p_payload->>'currency',''), 'ARS');
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede registrar compras.' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('purchase:' || p_idempotency_key::text));

  select * into v_purchase from public.purchases where idempotency_key = p_idempotency_key;
  if v_purchase.id is not null then
    return v_purchase;
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La compra necesita al menos un articulo.' using errcode = '23514';
  end if;

  perform 1 from public.request_items ri
   where ri.id in (select (value->>'request_item_id')::uuid from jsonb_array_elements(v_items))
   order by ri.id for update;

  for v_line in select * from jsonb_array_elements(v_items) loop
    if coalesce(btrim(v_line->>'request_item_id'), '') = '' then
      raise exception 'Cada linea de compra necesita un articulo solicitado.' using errcode = '23514';
    end if;
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'La cantidad comprada debe ser mayor a cero.' using errcode = '23514';
    end if;
    select * into v_item from public.request_items where id = (v_line->>'request_item_id')::uuid;
    if v_item.id is null then
      raise exception 'Articulo inexistente.' using errcode = '23503';
    end if;
    if v_item.item_status in ('rejected','cancelled') then
      raise exception 'No se puede comprar un articulo rechazado o cancelado.' using errcode = '23514';
    end if;
    if v_item.approved_qty <= 0 then
      raise exception 'El articulo % no tiene cantidad aprobada.', v_item.name using errcode = '23514';
    end if;
    if public.item_purchased_qty(v_item.id) + v_qty > v_item.approved_qty then
      raise exception 'La cantidad ya esta comprada o supera lo aprobado para %.', v_item.name using errcode = '23514';
    end if;
    v_total := v_total + (v_qty * coalesce((v_line->>'unit_price')::numeric, 0));
  end loop;

  insert into public.purchases (
    folio, idempotency_key, created_by, channel, vendor_name, purchase_date, shipping_cost, currency,
    total, order_number, estimated_delivery_date, tracking, invoice_path, notes, status
  ) values (
    'CMP-' || to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY') || '-' || lpad(nextval('public.purchases_folio_seq')::text, 6, '0'),
    p_idempotency_key,
    auth.uid(),
    coalesce(nullif(p_payload->>'channel',''), 'proveedor'),
    p_payload->>'vendor_name',
    coalesce((p_payload->>'purchase_date')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
    v_shipping,
    v_currency,
    v_total + v_shipping,
    p_payload->>'order_number',
    (p_payload->>'estimated_delivery_date')::date,
    p_payload->>'tracking',
    p_payload->>'invoice_path',
    p_payload->>'notes',
    coalesce(nullif(p_payload->>'status',''), 'purchased')
  ) returning * into v_purchase;

  perform set_config('app.internal_op', 'true', true);

  for v_line in select * from jsonb_array_elements(v_items) loop
    insert into public.purchase_items (purchase_id, request_item_id, qty, unit_price, currency, product_url, notes)
    values (
      v_purchase.id,
      (v_line->>'request_item_id')::uuid,
      (v_line->>'qty')::numeric,
      (v_line->>'unit_price')::numeric,
      coalesce(nullif(v_line->>'currency',''), v_currency),
      v_line->>'product_url',
      v_line->>'notes'
    );

    select * into v_item from public.request_items where id = (v_line->>'request_item_id')::uuid;
    update public.request_items
       set item_status = case when v_item.approved_qty > 0 and public.item_accepted_qty(v_item.id) >= v_item.approved_qty then 'received' else 'purchased' end,
           purchase_url = coalesce(nullif(v_line->>'product_url',''), purchase_url),
           updated_at = now()
     where id = v_item.id;

    perform public.recalc_request_status(v_item.request_id);
  end loop;

  perform set_config('app.internal_op', '', true);
  return v_purchase;
end;
$$;

create or replace function public.register_receipt(p_payload jsonb, p_idempotency_key uuid)
returns public.receipts language plpgsql security definer set search_path = public as $$
declare
  v_receipt public.receipts;
  v_request_id uuid := nullif(p_payload->>'request_id','')::uuid;
  v_items jsonb;
  v_line jsonb;
  v_item public.request_items;
  v_accepted numeric;
  v_already numeric;
begin
  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia.' using errcode = '23514';
  end if;
  if v_request_id is null then
    raise exception 'Falta la solicitud.' using errcode = '23514';
  end if;
  if not public.can_contribute_request(v_request_id) then
    raise exception 'No tenes permiso para registrar la recepcion de esta solicitud.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('receipt:' || p_idempotency_key::text));

  select * into v_receipt from public.receipts where idempotency_key = p_idempotency_key;
  if v_receipt.id is not null then
    return v_receipt;
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La recepcion necesita al menos un articulo.' using errcode = '23514';
  end if;

  perform 1 from public.request_items ri
   where ri.id in (select (value->>'request_item_id')::uuid from jsonb_array_elements(v_items))
   order by ri.id for update;

  for v_line in select * from jsonb_array_elements(v_items) loop
    select * into v_item from public.request_items where id = (v_line->>'request_item_id')::uuid;
    if v_item.id is null or v_item.request_id <> v_request_id then
      raise exception 'El articulo no pertenece a la solicitud.' using errcode = '23514';
    end if;
    v_accepted := coalesce((v_line->>'qty_accepted')::numeric, 0);
    v_already := public.item_accepted_qty(v_item.id);
    if v_accepted < 0 or coalesce((v_line->>'qty_wrong')::numeric, 0) < 0
       or coalesce((v_line->>'qty_damaged')::numeric, 0) < 0
       or coalesce((v_line->>'qty_missing')::numeric, 0) < 0 then
      raise exception 'Las cantidades no pueden ser negativas.' using errcode = '23514';
    end if;
    if v_item.approved_qty <= 0 then
      raise exception 'El articulo % no tiene cantidad aprobada.', v_item.name using errcode = '23514';
    end if;
    if v_already + v_accepted > v_item.approved_qty then
      raise exception 'La cantidad aceptada supera el saldo pendiente de %.', v_item.name using errcode = '23514';
    end if;
  end loop;

  insert into public.receipts (
    folio, idempotency_key, request_id, purchase_id, received_at, received_by_name, created_by, notes, photo_path
  ) values (
    'REC-' || to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY') || '-' || lpad(nextval('public.receipts_folio_seq')::text, 6, '0'),
    p_idempotency_key,
    v_request_id,
    nullif(p_payload->>'purchase_id','')::uuid,
    coalesce(nullif(p_payload->>'received_at','')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
    p_payload->>'received_by_name',
    auth.uid(),
    p_payload->>'notes',
    p_payload->>'photo_path'
  ) returning * into v_receipt;

  perform set_config('app.internal_op', 'true', true);

  for v_line in select * from jsonb_array_elements(v_items) loop
    insert into public.receipt_items (receipt_id, request_item_id, qty_accepted, qty_wrong, qty_damaged, qty_missing, notes)
    values (
      v_receipt.id,
      (v_line->>'request_item_id')::uuid,
      coalesce((v_line->>'qty_accepted')::numeric, 0),
      coalesce((v_line->>'qty_wrong')::numeric, 0),
      coalesce((v_line->>'qty_damaged')::numeric, 0),
      coalesce((v_line->>'qty_missing')::numeric, 0),
      v_line->>'notes'
    );

    select * into v_item from public.request_items where id = (v_line->>'request_item_id')::uuid;
    update public.request_items
       set item_status = case
             when public.item_accepted_qty(v_item.id) >= v_item.approved_qty then 'received'
             when public.item_accepted_qty(v_item.id) > 0 then 'partially_received'
             else item_status end,
           updated_at = now()
     where id = v_item.id;

    perform public.recalc_request_status(v_item.request_id);
  end loop;

  perform set_config('app.internal_op', '', true);
  return v_receipt;
end;
$$;

create or replace function public.close_request_balance(p_request_id uuid, p_reason text)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cerrar el saldo de una solicitud.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'El motivo del cierre es obligatorio.' using errcode = '23514';
  end if;
  perform set_config('app.internal_op', 'true', true);
  update public.requests
     set closed_by = auth.uid(), closed_reason = p_reason, closed_at = now(), status = 'completed', updated_at = now()
   where id = p_request_id
   returning * into v_req;
  perform set_config('app.internal_op', '', true);
  if v_req.id is null then
    raise exception 'Solicitud inexistente.' using errcode = '23503';
  end if;
  return v_req;
end;
$$;

create or replace function public.pending_purchase_summary()
returns table (
  request_item_id uuid,
  request_id uuid,
  folio text,
  sector_id uuid,
  sector_name text,
  group_key text,
  catalog_item_id uuid,
  name text,
  variant text,
  unit text,
  presentation text,
  requested_qty numeric,
  approved_qty numeric,
  purchased_qty numeric,
  pending_qty numeric
) language sql stable security definer set search_path = public as $$
  select
    ri.id,
    r.id,
    r.folio,
    r.sector_id,
    s.name,
    coalesce(ri.catalog_item_id::text, ri.id::text),
    ri.catalog_item_id,
    ri.name,
    ci.variant,
    coalesce(ri.unit, ci.unit),
    ci.presentation,
    ri.requested_qty,
    ri.approved_qty,
    public.item_purchased_qty(ri.id),
    greatest(ri.approved_qty - public.item_purchased_qty(ri.id), 0)
  from public.request_items ri
  join public.requests r on r.id = ri.request_id
  join public.sectors s on s.id = r.sector_id
  left join public.catalog_items ci on ci.id = ri.catalog_item_id
  where public.is_admin()
    and ri.item_status not in ('rejected','cancelled')
    and ri.approved_qty > 0
    and r.status not in ('draft','cancelled','rejected','needs_info')
    and greatest(ri.approved_qty - public.item_purchased_qty(ri.id), 0) > 0
  order by s.name, r.folio;
$$;

create or replace function public.can_view_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.purchase_items pi
      join public.request_items ri on ri.id = pi.request_item_id
      join public.requests r on r.id = ri.request_id
     where pi.purchase_id = p_purchase
       and public.has_app_access()
       and r.sector_id = public.app_sector()
  );
$$;

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy purchases_select on public.purchases for select to authenticated using (public.can_view_purchase(id));
create policy purchases_insert on public.purchases for insert to authenticated with check (public.is_admin());
create policy purchases_update on public.purchases for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy purchase_items_select on public.purchase_items for select to authenticated using (public.can_view_purchase(purchase_id));
create policy purchase_items_insert on public.purchase_items for insert to authenticated with check (public.is_admin());
create policy purchase_items_update on public.purchase_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy receipts_select on public.receipts for select to authenticated using (public.can_view_request(request_id));
create policy receipts_insert on public.receipts for insert to authenticated with check (public.can_contribute_request(request_id) and created_by = auth.uid());
create policy receipts_update on public.receipts for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy receipt_items_select on public.receipt_items for select to authenticated using (
  exists (select 1 from public.receipts rc where rc.id = receipt_id and public.can_view_request(rc.request_id))
);
create policy receipt_items_insert on public.receipt_items for insert to authenticated with check (
  exists (select 1 from public.receipts rc where rc.id = receipt_id and rc.created_by = auth.uid() and public.can_contribute_request(rc.request_id))
);
