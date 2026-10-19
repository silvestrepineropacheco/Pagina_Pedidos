-- Registrar compras queda para Finanzas y el Propietario.
--
-- Los administradores autorizan pedidos, hacen pedidos y confirman recepciones,
-- pero ya no registran compras. Siguen viendo las compras de los pedidos.

create or replace function public.can_purchase()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.active and p.role in ('owner','finanzas')
      from public.profiles p where p.id = auth.uid()
  ), false);
$$;

-- Ver compras: administradores, Propietario, Finanzas y quien hizo el pedido.
create or replace function public.can_view_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.can_purchase() or exists (
    select 1
      from public.purchase_items pi
      join public.request_items ri on ri.id = pi.request_item_id
      join public.requests r on r.id = ri.request_id
     where pi.purchase_id = p_purchase
       and public.has_app_access()
       and r.requester_id = auth.uid()
  );
$$;

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
    raise exception 'Solo Finanzas o el Propietario pueden registrar compras.' using errcode = '42501';
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
