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
