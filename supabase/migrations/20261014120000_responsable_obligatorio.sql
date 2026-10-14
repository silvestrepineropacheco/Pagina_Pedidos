-- Responsable obligatorio en cada pedido enviado, reasignación con motivo y avisos.
--
-- 1. Al enviar un pedido hay que elegir el administrador responsable.
-- 2. Un pedido enviado nunca queda sin responsable.
-- 3. "Reasignar pedido" pide motivo y queda en el historial.
-- 4. Avisos: al responsable siempre; a todos los administradores si es urgente
--    o de maquinaria; al solicitante cuando su pedido cambia de responsable.

-- Las operaciones de esta migración no pasan por los controles de usuario.
select set_config('app.internal_op', 'true', false);

/* ---------------------------- Personas asignables ---------------------------- */

-- Administradores y Propietario activos: a quienes se les puede enviar un pedido.
create or replace function public.is_assignable_admin(p_admin_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_admin_id and p.active and p.role in ('admin','owner')
  );
$$;

-- Lista para elegir responsable. La pueden consultar todos los usuarios con
-- acceso (un encargado no puede leer la tabla de perfiles completa).
create or replace function public.list_assignable_admins()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) as full_name, p.role
    from public.profiles p
   where public.has_app_access()
     and p.active
     and p.role in ('admin','owner')
   order by 2;
$$;

revoke all on function public.list_assignable_admins() from public, anon;
grant execute on function public.list_assignable_admins() to authenticated;

create or replace function public.person_label(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'sin nombre') from public.profiles p where p.id = p_id;
$$;

/* --------------------- Ningún pedido enviado sin responsable --------------------- */

-- Pedidos ya enviados sin responsable (si los hubiera): pasan al Propietario,
-- o al primer administrador activo si todavía no hay Propietario.
update public.requests r
   set assigned_admin_id = (
         select p.id from public.profiles p
          where p.active and p.role in ('owner','admin')
          order by (p.role = 'owner') desc, p.created_at
          limit 1
       ),
       updated_at = now()
 where r.submitted_at is not null
   and r.assigned_admin_id is null;

-- Se exige para todo lo que se escriba de acá en adelante.
alter table public.requests
  drop constraint if exists requests_submitted_need_admin;
alter table public.requests
  add constraint requests_submitted_need_admin
  check (submitted_at is null or assigned_admin_id is not null) not valid;

/* ------------------------------- Enviar el pedido ------------------------------- */

drop function if exists public.submit_request(uuid);

create or replace function public.submit_request(p_request_id uuid, p_admin_id uuid default null)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_admin uuid;
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

  -- Si ya tenía un responsable activo (por ejemplo, al reenviar después de
  -- "falta información"), se mantiene; si no, se usa el elegido al enviar.
  v_admin := case
    when v_req.assigned_admin_id is not null and public.is_assignable_admin(v_req.assigned_admin_id)
      then v_req.assigned_admin_id
    else p_admin_id
  end;
  if v_admin is null then
    raise exception 'Elegí a qué administrador le enviás el pedido.' using errcode = '23514';
  end if;
  if not public.is_assignable_admin(v_admin) then
    raise exception 'El administrador elegido no está activo. Elegí otro.' using errcode = '23514';
  end if;

  perform set_config('app.internal_op', 'true', true);
  update public.requests
     set status = 'pending_review',
         submitted_at = coalesce(submitted_at, now()),
         assigned_admin_id = v_admin,
         updated_at = now()
   where id = p_request_id
   returning * into v_req;
  perform set_config('app.internal_op', '', true);
  return v_req;
end;
$$;

grant execute on function public.submit_request(uuid, uuid) to authenticated;

/* ------------------------------ Asignar y reasignar ------------------------------ */

-- "Asignarme" queda solo para pedidos sin responsable; cambiar de responsable
-- se hace siempre con "Reasignar pedido", que pide motivo.
create or replace function public.assign_request(p_request_id uuid, p_admin_id uuid default null, p_reassign boolean default false)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_target uuid := coalesce(p_admin_id, auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar pedidos.' using errcode = '42501';
  end if;
  if p_reassign then
    raise exception 'Para pasar el pedido a otra persona usá "Reasignar pedido" e indicá el motivo.' using errcode = '23514';
  end if;
  if not public.is_assignable_admin(v_target) then
    raise exception 'El destinatario no es un administrador activo.' using errcode = '23514';
  end if;
  update public.requests
     set assigned_admin_id = v_target, updated_at = now()
   where id = p_request_id
     and assigned_admin_id is null
   returning * into v_req;
  if v_req.id is null then
    select * into v_req from public.requests where id = p_request_id;
    if v_req.id is null then
      raise exception 'Solicitud inexistente.' using errcode = '23503';
    end if;
    raise exception 'La solicitud ya tiene responsable. Para cambiarlo usá "Reasignar pedido".' using errcode = '23505';
  end if;
  return v_req;
end;
$$;

create or replace function public.reassign_request(p_request_id uuid, p_admin_id uuid, p_reason text)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reasignar pedidos.' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'El motivo de la reasignación es obligatorio.' using errcode = '23514';
  end if;
  if not public.is_assignable_admin(p_admin_id) then
    raise exception 'El administrador elegido no está activo. Elegí otro.' using errcode = '23514';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud inexistente.' using errcode = '23503';
  end if;
  if v_req.assigned_admin_id = p_admin_id then
    raise exception 'El pedido ya está asignado a esa persona.' using errcode = '23514';
  end if;
  if v_req.status in ('completed','rejected','cancelled') then
    raise exception 'El pedido ya está cerrado: no se puede reasignar.' using errcode = '23514';
  end if;

  -- El motivo lo leen el historial y los avisos, dentro de esta misma operación.
  perform set_config('app.reassign_reason', v_reason, true);
  update public.requests
     set assigned_admin_id = p_admin_id, updated_at = now()
   where id = p_request_id
   returning * into v_req;
  perform set_config('app.reassign_reason', '', true);
  return v_req;
end;
$$;

revoke all on function public.reassign_request(uuid, uuid, text) from public, anon;
grant execute on function public.reassign_request(uuid, uuid, text) to authenticated;

/* ---------------------------------- Historial ---------------------------------- */

create or replace function public.log_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_event text;
  v_msg text;
  v_meta jsonb := '{}'::jsonb;
  v_reason text;
begin
  if tg_table_name = 'requests' then
    v_request_id := new.id;
    if tg_op = 'INSERT' then
      v_event := 'created';
      v_msg := case when new.status = 'draft' then 'Solicitud creada como borrador' else 'Solicitud creada' end;
    elsif new.submitted_at is distinct from old.submitted_at and new.submitted_at is not null then
      v_event := 'submitted';
      v_msg := 'Solicitud enviada a ' || coalesce(public.person_label(new.assigned_admin_id), 'sin responsable');
    elsif new.status is distinct from old.status then
      v_event := 'status_changed';
      v_msg := 'Estado: ' || old.status || ' -> ' || new.status;
    elsif new.assigned_admin_id is distinct from old.assigned_admin_id then
      v_reason := nullif(current_setting('app.reassign_reason', true), '');
      v_meta := jsonb_build_object('from', old.assigned_admin_id, 'to', new.assigned_admin_id, 'reason', v_reason);
      if old.assigned_admin_id is null then
        v_event := 'assigned';
        v_msg := 'Responsable asignado: ' || coalesce(public.person_label(new.assigned_admin_id), '-');
      else
        v_event := 'reassigned';
        v_msg := 'Pedido reasignado de ' || coalesce(public.person_label(old.assigned_admin_id), '-') ||
                 ' a ' || coalesce(public.person_label(new.assigned_admin_id), '-') ||
                 coalesce('. Motivo: ' || v_reason, '');
      end if;
    elsif new.closed_at is distinct from old.closed_at and new.closed_at is not null then
      v_event := 'balance_closed';
      v_msg := 'Saldo cerrado: ' || coalesce(new.closed_reason, '');
    else
      v_event := 'updated';
      v_msg := 'Solicitud modificada';
    end if;
  elsif tg_op = 'DELETE' then
    v_request_id := old.request_id;
    v_event := 'item_removed';
    v_msg := 'Articulo eliminado: ' || old.name;
  else
    v_request_id := new.request_id;
    if tg_op = 'INSERT' then
      v_event := 'item_added';
      v_msg := 'Articulo agregado: ' || new.name;
    elsif new.item_status is distinct from old.item_status then
      v_event := 'item_status';
      v_msg := 'Articulo ' || new.name || ': ' || old.item_status || ' -> ' || new.item_status || coalesce(' (' || new.reason || ')', '');
    elsif new.approved_qty is distinct from old.approved_qty then
      v_event := 'item_approved_qty';
      v_msg := 'Articulo ' || new.name || ': cantidad aprobada ' || old.approved_qty || ' -> ' || new.approved_qty;
    elsif new.change_pending is distinct from old.change_pending then
      v_event := 'item_change_pending';
      v_msg := 'Articulo ' || new.name || ': cambio pendiente de revision';
    else
      v_event := 'item_updated';
      v_msg := 'Articulo ' || new.name || ' modificado';
    end if;
  end if;

  insert into public.request_events (request_id, actor_id, event_type, message, metadata)
  values (v_request_id, auth.uid(), v_event, v_msg,
          jsonb_build_object('op', tg_op, 'table', tg_table_name) || v_meta);
  return null;
end;
$$;

/* ------------------------------------ Avisos ------------------------------------ */

-- Al enviar: aviso al responsable siempre; a todos los administradores solo si
-- el pedido es urgente o de maquinaria y mejoras.
create or replace function public.on_request_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_requester text;
  v_admin record;
  v_important boolean;
  v_reason_label text;
  v_subject text;
  v_body text;
begin
  if new.submitted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    return new;
  end if;

  v_requester := public.person_label(new.requester_id);
  v_important := new.priority = 'urgente' or new.category = 'maquinaria';
  v_reason_label := case
    when new.priority = 'urgente' and new.category = 'maquinaria' then 'Urgente y de maquinaria'
    when new.priority = 'urgente' then 'Urgente'
    else 'Maquinaria y mejoras'
  end;

  v_body := 'Solicitud: ' || coalesce(new.folio, '') ||
            E'\nSolicitante: ' || coalesce(v_requester, '-') ||
            E'\nResponsable: ' || coalesce(public.person_label(new.assigned_admin_id), '-') ||
            E'\nCategoria: ' || new.category ||
            E'\nPrioridad: ' || new.priority ||
            coalesce(E'\nMotivo de urgencia: ' || nullif(btrim(new.urgency_reason), ''), '') ||
            E'\nFecha necesaria: ' || coalesce(to_char(new.needed_by, 'DD/MM/YYYY'), '-') ||
            E'\n\nAbrir la solicitud: /pedidos/' || new.id::text;

  -- Responsable
  select p.id, p.email into v_admin from public.profiles p where p.id = new.assigned_admin_id;
  if v_admin.id is not null then
    v_subject := 'Te asignaron el pedido ' || coalesce(new.folio, '') ||
                 case when v_important then ' (' || v_reason_label || ')' else '' end;
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (v_admin.id, new.id, v_subject, v_body, 'assigned', 'assigned:' || new.id::text || ':' || v_admin.id::text)
    on conflict (user_id, dedupe_key) do nothing;
    if v_admin.email is not null then
      insert into public.email_messages (request_id, recipient_user_id, recipient_email, subject, body, kind)
      values (new.id, v_admin.id, v_admin.email, v_subject, v_body, 'assigned')
      on conflict (request_id, recipient_email, kind) do nothing;
    end if;
  end if;

  -- Todos los administradores, si es urgente o importante
  if v_important then
    v_subject := v_reason_label || ': nuevo pedido ' || coalesce(new.folio, '');
    for v_admin in
      select p.id, p.email from public.profiles p
       where p.role in ('admin','owner') and p.active and p.id is distinct from new.assigned_admin_id
    loop
      insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
      values (v_admin.id, new.id, v_subject, v_body, 'important', 'important:' || new.id::text)
      on conflict (user_id, dedupe_key) do nothing;
      if v_admin.email is not null then
        insert into public.email_messages (request_id, recipient_user_id, recipient_email, subject, body, kind)
        values (new.id, v_admin.id, v_admin.email, v_subject, v_body, 'important')
        on conflict (request_id, recipient_email, kind) do nothing;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

-- Al reasignar: aviso al nuevo responsable, al anterior (si no fue quien lo pasó)
-- y al solicitante.
create or replace function public.on_request_reassigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(current_setting('app.reassign_reason', true), '');
  v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  v_to text := coalesce(public.person_label(new.assigned_admin_id), '-');
  v_by text := coalesce(public.person_label(auth.uid()), 'Un administrador');
  v_email text;
  v_body text;
begin
  if old.assigned_admin_id is null or new.assigned_admin_id is null
     or new.assigned_admin_id = old.assigned_admin_id or new.submitted_at is null then
    return null;
  end if;

  v_body := v_by || ' le pasó el pedido a ' || v_to || '.' || coalesce(E'\nMotivo: ' || v_reason, '');

  insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
  values (new.assigned_admin_id, new.id, 'Te reasignaron el pedido ' || coalesce(new.folio, ''), v_body,
          'reassigned', 'reassigned:' || new.id::text || ':' || v_stamp)
  on conflict (user_id, dedupe_key) do nothing;

  select p.email into v_email from public.profiles p where p.id = new.assigned_admin_id;
  if v_email is not null then
    insert into public.email_messages (request_id, recipient_user_id, recipient_email, subject, body, kind)
    values (new.id, new.assigned_admin_id, v_email, 'Te reasignaron el pedido ' || coalesce(new.folio, ''),
            v_body || E'\n\nAbrir la solicitud: /pedidos/' || new.id::text, 'reassigned:' || v_stamp)
    on conflict (request_id, recipient_email, kind) do nothing;
  end if;

  if old.assigned_admin_id is distinct from auth.uid() then
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (old.assigned_admin_id, new.id, 'El pedido ' || coalesce(new.folio, '') || ' pasó a ' || v_to, v_body,
            'reassigned', 'reassigned_from:' || new.id::text || ':' || v_stamp)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  if new.requester_id is distinct from new.assigned_admin_id then
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (new.requester_id, new.id, 'Tu pedido ' || coalesce(new.folio, '') || ' cambió de responsable',
            'Ahora lo gestiona ' || v_to || '.' || coalesce(E'\nMotivo: ' || v_reason, ''),
            'reassigned', 'reassigned_requester:' || new.id::text || ':' || v_stamp)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists requests_notify_reassigned_trg on public.requests;
create trigger requests_notify_reassigned_trg
  after update of assigned_admin_id on public.requests
  for each row execute function public.on_request_reassigned();

select set_config('app.internal_op', '', false);
