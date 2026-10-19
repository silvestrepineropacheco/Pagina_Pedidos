-- Rol "Finanzas" y avisos del circuito de compras.
--
-- Circuito: el gerente crea el pedido -> el responsable lo autoriza o rechaza
-- -> Finanzas registra la compra -> el gerente (o un administrador) confirma
-- la recepción. Finanzas no autoriza pedidos, no gestiona usuarios y no ve Ventas.

select set_config('app.internal_op', 'true', false);

/* ----------------------------------- El rol ----------------------------------- */

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner','admin','encargado','finanzas','pending'));

-- Quién puede registrar compras: Finanzas, administradores y Propietario.
create or replace function public.can_purchase()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.active and p.role in ('admin','owner','finanzas')
      from public.profiles p where p.id = auth.uid()
  ), false);
$$;

/* ------------------------------ Registrar compras ------------------------------ */

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
  if not public.can_purchase() then
    raise exception 'Solo Finanzas o un administrador pueden registrar compras.' using errcode = '42501';
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
  left join public.sectors s on s.id = r.sector_id
  left join public.catalog_items ci on ci.id = ri.catalog_item_id
  where public.can_purchase()
    and ri.item_status not in ('rejected','cancelled')
    and ri.approved_qty > 0
    and r.status not in ('draft','cancelled','rejected','needs_info')
    and r.closed_at is null
    and greatest(ri.approved_qty - public.item_purchased_qty(ri.id), 0) > 0
  order by r.folio, ri.line_no;
$$;

create or replace function public.can_view_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_purchase() or exists (
    select 1
      from public.purchase_items pi
      join public.request_items ri on ri.id = pi.request_item_id
      join public.requests r on r.id = ri.request_id
     where pi.purchase_id = p_purchase
       and public.has_app_access()
       and r.requester_id = auth.uid()
  );
$$;

alter policy purchases_insert on public.purchases with check (public.can_purchase());
alter policy purchases_update on public.purchases using (public.can_purchase()) with check (public.can_purchase());
alter policy purchase_items_insert on public.purchase_items with check (public.can_purchase());
alter policy purchase_items_update on public.purchase_items using (public.can_purchase()) with check (public.can_purchase());

-- Comprobantes de compra (carpeta purchases/{id}): Finanzas también puede subirlos y verlos.
create policy attachments_purchases_select on storage.objects for select to authenticated using (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = 'purchases'
  and public.can_purchase()
);
create policy attachments_purchases_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = 'purchases'
  and public.can_purchase()
);

/* ------------------------------------ Avisos ------------------------------------ */

-- Pedido autorizado: aviso a Finanzas para que registre la compra.
create or replace function public.on_request_authorized()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user record;
  v_subject text;
  v_body text;
begin
  if new.status is not distinct from old.status or new.status <> 'approved_pending_purchase' then
    return null;
  end if;
  v_subject := 'Pedido ' || coalesce(new.folio, '') || ' autorizado: listo para comprar';
  v_body := 'Solicitante: ' || coalesce(public.person_label(new.requester_id), '-') ||
            E'
Autorizó: ' || coalesce(public.person_label(new.assigned_admin_id), '-') ||
            E'
Prioridad: ' || new.priority ||
            E'
Fecha necesaria: ' || coalesce(to_char(new.needed_by, 'DD/MM/YYYY'), '-') ||
            E'

Registrá la compra (proveedor, importe y fecha estimada de entrega) desde Compras pendientes.';
  for v_user in
    select p.id, p.email from public.profiles p where p.role = 'finanzas' and p.active
  loop
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (v_user.id, new.id, v_subject, v_body, 'to_purchase', 'to_purchase:' || new.id::text)
    on conflict (user_id, dedupe_key) do nothing;
    if v_user.email is not null then
      insert into public.email_messages (request_id, recipient_user_id, recipient_email, subject, body, kind)
      values (new.id, v_user.id, v_user.email, v_subject, v_body || E'

Abrir la solicitud: /pedidos/' || new.id::text, 'to_purchase')
      on conflict (request_id, recipient_email, kind) do nothing;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists requests_notify_authorized_trg on public.requests;
create trigger requests_notify_authorized_trg
  after update of status on public.requests
  for each row execute function public.on_request_authorized();

-- Compra registrada: aviso al solicitante con la acción concreta que le toca.
create or replace function public.notify_purchase_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_purchase public.purchases;
begin
  select * into v_purchase from public.purchases where id = new.purchase_id;
  select r.id as request_id, r.requester_id, r.folio into v_req
    from public.request_items ri join public.requests r on r.id = ri.request_id
   where ri.id = new.request_item_id;
  if v_req.request_id is null then return null; end if;
  insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
  values (v_req.requester_id, v_req.request_id, 'Se compró tu pedido ' || coalesce(v_req.folio, ''),
          'Compra ' || coalesce(v_purchase.folio, '') || coalesce(' a ' || v_purchase.vendor_name, '') ||
          coalesce('. Entrega estimada: ' || to_char(v_purchase.estimated_delivery_date, 'DD/MM/YYYY'), '') ||
          E'.
Cuando llegue, abrí el pedido y confirmá la recepción: "Llegó completo" o indicá qué llegó y qué problemas hubo.',
          'purchase', 'purchase:' || v_purchase.id::text)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;

select set_config('app.internal_op', '', false);
