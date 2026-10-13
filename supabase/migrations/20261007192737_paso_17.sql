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
    -- Llego todo: se recibe el saldo pendiente de cada articulo aprobado.
    select coalesce(jsonb_agg(jsonb_build_object(
             'request_item_id', ri.id,
             'qty_accepted', greatest(ri.approved_qty - public.item_accepted_qty(ri.id), 0),
             'qty_wrong', 0,
             'qty_damaged', 0,
             'qty_missing', 0)), '[]'::jsonb)
      into v_items
      from public.request_items ri
     where ri.request_id = p_request_id
       and ri.approved_qty > 0
       and ri.item_status not in ('rejected','cancelled')
       and greatest(ri.approved_qty - public.item_accepted_qty(ri.id), 0) > 0;
  else
    v_items := coalesce(p_items, '[]'::jsonb);
    if jsonb_array_length(v_items) = 0 then
      raise exception 'Indica que articulos y cantidades llegaron.' using errcode = '23514';
    end if;
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Este pedido no tiene cantidades pendientes de recibir.' using errcode = '23514';
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