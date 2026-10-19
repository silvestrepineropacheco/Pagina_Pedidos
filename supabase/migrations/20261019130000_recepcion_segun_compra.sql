-- Recepción: nunca se recibe más de lo comprado.
--
-- Antes, "Llegó completo" tomaba lo autorizado: si se había comprado solo una
-- parte, el pedido quedaba como recibido entero y el saldo sin comprar se perdía.
-- Ahora se recibe solo lo comprado y lo que falta comprar sigue pendiente.
--
-- Además: al recalcular el estado del pedido se apagaba la operación interna,
-- y una compra o recepción con dos o más artículos del mismo pedido fallaba
-- en el segundo artículo. Ahora se devuelve como estaba.

create or replace function public.recalc_request_status(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_approved numeric := 0;
  v_accepted numeric := 0;
  v_purchased numeric := 0;
  v_eventual text;
  -- Quien llama (registrar compra o recepción) puede tener activa la operación
  -- interna para varios artículos: se respeta y se devuelve como estaba.
  v_previo text := coalesce(current_setting('app.internal_op', true), '');
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
    perform set_config('app.internal_op', v_previo, true);
  end if;
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
    -- No se puede recibir lo que todavía no se compró: así el saldo sin comprar
    -- sigue pendiente de compra y no se pierde.
    if v_already + v_accepted > public.item_purchased_qty(v_item.id) then
      raise exception 'De % se compraron % y con esta recepción se aceptarían %. Registrá primero la compra del resto.',
        v_item.name, trim_scale(public.item_purchased_qty(v_item.id)), trim_scale(v_already + v_accepted) using errcode = '23514';
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

create or replace function public.confirm_receipt(
  p_request_id uuid,
  p_mode text,
  p_received_at date default null,
  p_notes text default null,
  p_photo_path text default null,
  p_items jsonb default null,
  p_idempotency_key uuid default null
) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
begin
  if not public.can_contribute_request(p_request_id) then
    raise exception 'No tenes permiso para confirmar la recepcion de este pedido.' using errcode = '42501';
  end if;
  if p_mode not in ('complete','partial') then
    raise exception 'Modo de recepcion invalido.' using errcode = '23514';
  end if;

  if p_mode = 'complete' then
    -- Llegó todo lo comprado: se recibe lo comprado que todavía no se recibió.
    -- Lo que falta comprar queda pendiente de compra.
    select coalesce(jsonb_agg(jsonb_build_object(
             'request_item_id', ri.id,
             'qty_accepted', greatest(least(ri.approved_qty, public.item_purchased_qty(ri.id)) - public.item_accepted_qty(ri.id), 0),
             'qty_wrong', 0,
             'qty_damaged', 0,
             'qty_missing', 0)), '[]'::jsonb)
      into v_items
      from public.request_items ri
     where ri.request_id = p_request_id
       and ri.approved_qty > 0
       and ri.item_status not in ('rejected','cancelled')
       and greatest(least(ri.approved_qty, public.item_purchased_qty(ri.id)) - public.item_accepted_qty(ri.id), 0) > 0;
  else
    v_items := coalesce(p_items, '[]'::jsonb);
    if jsonb_array_length(v_items) = 0 then
      raise exception 'Indica que articulos y cantidades llegaron.' using errcode = '23514';
    end if;
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'No hay cantidades compradas pendientes de recibir en este pedido.' using errcode = '23514';
  end if;

  v_payload := jsonb_build_object(
    'request_id', p_request_id,
    'received_at', coalesce(p_received_at, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
    'received_by_name', (select p.full_name from public.profiles p where p.id = auth.uid()),
    'notes', p_notes,
    'photo_path', p_photo_path,
    'items', v_items
  );

  -- Reutiliza el registro transaccional ya probado (bloqueo, idempotencia, formulas y recálculo de estado).
  return public.register_receipt(v_payload, v_key);
end;
$$;

grant execute on function public.confirm_receipt(uuid, text, date, text, text, jsonb, uuid) to authenticated;
