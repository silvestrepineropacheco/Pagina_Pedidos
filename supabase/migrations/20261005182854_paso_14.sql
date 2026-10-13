update public.requests
   set needed_by = (now() at time zone 'America/Argentina/Buenos_Aires')::date
 where needed_by is null;

alter table public.requests alter column needed_by set not null;

create or replace function public.requests_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.folio is null then
    new.folio := 'PED-' || to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY') || '-' || lpad(nextval('public.requests_folio_seq')::text, 6, '0');
  end if;
  if new.needed_by is null then
    raise exception 'La fecha para la que se necesita es obligatoria.' using errcode = '23514';
  end if;
  if new.priority = 'urgente' and coalesce(btrim(new.urgency_reason), '') = '' then
    raise exception 'La justificacion es obligatoria para prioridad urgente.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;