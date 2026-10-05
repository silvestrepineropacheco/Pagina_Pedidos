create or replace function public.refresh_request_after_review(p_request_id uuid)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_total integer := 0;
  v_decided integer := 0;
  v_approved integer := 0;
  v_needs_info integer := 0;
  v_eventual text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar solicitudes.' using errcode = '42501';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud inexistente.' using errcode = '23503';
  end if;
  if v_req.status not in ('pending_review','needs_info','evaluating') then
    return v_req;
  end if;

  select count(*),
         count(*) filter (where item_status in ('approved','rejected','cancelled')),
         count(*) filter (where item_status = 'approved'),
         count(*) filter (where item_status = 'needs_info')
    into v_total, v_decided, v_approved, v_needs_info
    from public.request_items where request_id = p_request_id;

  if v_total = 0 then
    v_eventual := v_req.status;
  elsif v_decided = v_total then
    v_eventual := case when v_approved > 0 then 'approved_pending_purchase' else 'rejected' end;
  elsif v_needs_info > 0 then
    v_eventual := 'needs_info';
  else
    v_eventual := v_req.status;
  end if;

  if v_eventual is distinct from v_req.status then
    perform set_config('app.internal_op', 'true', true);
    update public.requests set status = v_eventual, updated_at = now() where id = p_request_id returning * into v_req;
    perform set_config('app.internal_op', '', true);
  end if;
  return v_req;
end;
$$;

create or replace function public.apply_change_request(p_change_id uuid, p_note text default null)
returns public.change_requests language plpgsql security definer set search_path = public as $$
declare
  v_change public.change_requests;
  v_item public.request_items;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador o el Propietario puede resolver las solicitudes de cambio.' using errcode = '42501';
  end if;

  select * into v_change from public.change_requests where id = p_change_id for update;
  if v_change.id is null then
    raise exception 'Propuesta inexistente.' using errcode = '23503';
  end if;
  if v_change.status <> 'pending' then
    raise exception 'Esta propuesta ya fue resuelta.' using errcode = '23514';
  end if;

  select * into v_item from public.request_items where id = v_change.request_item_id for update;
  if v_item.id is null then
    raise exception 'Articulo inexistente.' using errcode = '23503';
  end if;

  perform set_config('app.internal_op', 'true', true);

  if v_change.field = 'requested_qty' then
    update public.request_items set requested_qty = (v_change.new_value)::numeric, updated_at = now() where id = v_item.id;
  elsif v_change.field = 'name' then
    update public.request_items set name = v_change.new_value, updated_at = now() where id = v_item.id;
  elsif v_change.field = 'description' then
    update public.request_items set description = v_change.new_value, updated_at = now() where id = v_item.id;
  elsif v_change.field = 'notes' then
    update public.request_items set notes = v_change.new_value, updated_at = now() where id = v_item.id;
  elsif v_change.field = 'unit' then
    update public.request_items set unit = v_change.new_value, updated_at = now() where id = v_item.id;
  elsif v_change.field = 'specifications' then
    update public.request_items
       set specifications = jsonb_set(coalesce(specifications, '{}'::jsonb), '{detalle}', to_jsonb(v_change.new_value)),
           updated_at = now()
     where id = v_item.id;
  else
    perform set_config('app.internal_op', '', true);
    raise exception 'Campo no soportado para aplicacion automatica: %.', v_change.field using errcode = '23514';
  end if;

  update public.request_items set change_pending = false, updated_at = now() where id = v_item.id;

  update public.change_requests
     set status = 'accepted', resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note
   where id = p_change_id
   returning * into v_change;

  perform set_config('app.internal_op', '', true);
  perform public.refresh_request_after_review(v_change.request_id);
  return v_change;
end;
$$;

create or replace function public.reject_change_request(p_change_id uuid, p_note text)
returns public.change_requests language plpgsql security definer set search_path = public as $$
declare
  v_change public.change_requests;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador o el Propietario puede resolver las solicitudes de cambio.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'El motivo del rechazo es obligatorio.' using errcode = '23514';
  end if;

  update public.change_requests
     set status = 'rejected', resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note
   where id = p_change_id and status = 'pending'
   returning * into v_change;

  if v_change.id is null then
    raise exception 'Esta propuesta ya fue resuelta.' using errcode = '23514';
  end if;

  perform set_config('app.internal_op', 'true', true);
  update public.request_items set change_pending = false, updated_at = now() where id = v_change.request_item_id;
  perform set_config('app.internal_op', '', true);
  return v_change;
end;
$$;
