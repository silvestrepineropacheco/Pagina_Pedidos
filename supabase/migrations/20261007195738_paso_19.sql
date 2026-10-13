-- 1) El resumen de compras pendientes ya no descarta pedidos por el sector
--    (union estricta -> union opcional: los sectores dejaron de usarse).
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
  where public.is_admin()
    and ri.item_status not in ('rejected','cancelled')
    and ri.approved_qty > 0
    and r.status not in ('draft','cancelled','rejected','needs_info')
    and greatest(ri.approved_qty - public.item_purchased_qty(ri.id), 0) > 0
  order by r.folio, ri.line_no;
$$;

-- 2) Un articulo ya revisado no se vuelve a aprobar ni rechazar.
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
    -- Revision de una sola vez: lo ya aprobado o rechazado no se vuelve a decidir.
    if tg_op = 'UPDATE' and old.item_status in ('approved','rejected')
       and (new.item_status is distinct from old.item_status
            or new.approved_qty is distinct from old.approved_qty) then
      raise exception 'Este articulo ya fue revisado (%). Solo el Propietario puede reabrir la revision.',
        case old.item_status when 'approved' then 'aprobado' else 'rechazado' end using errcode = '42501';
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