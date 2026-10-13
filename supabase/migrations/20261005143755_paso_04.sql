create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) > 0),
  kind text not null default 'comment' check (kind in ('comment','info_request')),
  created_at timestamptz not null default now()
);
create index if not exists request_comments_request_idx on public.request_comments (request_id);

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists request_events_request_idx on public.request_events (request_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.requests(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'info',
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at);

create table if not exists public.admin_notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notify_new_requests boolean not null default true,
  sector_ids uuid[] not null default '{}'::uuid[],
  categories text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  kind text not null default 'new_request',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','pending_config')),
  attempts integer not null default 0,
  error text,
  provider_message_id text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, recipient_email, kind)
);
create index if not exists email_messages_status_idx on public.email_messages (request_id, status);

-- ============ ALTA DE SOLICITUD: AVISOS Y ENCOLADO DE CORREO ============
create or replace function public.on_request_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sector text;
  v_requester text;
  v_admin record;
  v_subject text;
  v_body text;
begin
  if new.submitted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    return new;
  end if;

  select s.name into v_sector from public.sectors s where s.id = new.sector_id;
  select p.full_name into v_requester from public.profiles p where p.id = new.requester_id;

  v_subject := 'Nueva solicitud ' || coalesce(new.folio, '') || ' - ' || coalesce(v_sector, 'Sin sector');
  v_body := 'Solicitud: ' || coalesce(new.folio, '') ||
            E'\nSector: ' || coalesce(v_sector, '-') ||
            E'\nSolicitante: ' || coalesce(v_requester, '-') ||
            E'\nCategoria: ' || new.category ||
            E'\nPrioridad: ' || new.priority ||
            E'\nFecha necesaria: ' || coalesce(to_char(new.needed_by, 'DD/MM/YYYY'), '-') ||
            E'\n\nAbrir la solicitud: /pedidos/' || new.id::text;

  for v_admin in
    select p.id, p.email
      from public.profiles p
      left join public.admin_notification_prefs ap on ap.user_id = p.id
     where p.role in ('admin','owner')
       and p.active
       and p.email is not null
       and coalesce(ap.notify_new_requests, true)
       and (ap.user_id is null or cardinality(ap.sector_ids) = 0 or new.sector_id = any(ap.sector_ids))
       and (ap.user_id is null or cardinality(ap.categories) = 0 or new.category = any(ap.categories))
  loop
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (v_admin.id, new.id, v_subject, v_body, 'new_request', 'new_request:' || new.id::text)
    on conflict (user_id, dedupe_key) do nothing;

    insert into public.email_messages (request_id, recipient_user_id, recipient_email, subject, body, kind)
    values (new.id, v_admin.id, v_admin.email, v_subject, v_body, 'new_request')
    on conflict (request_id, recipient_email, kind) do nothing;
  end loop;

  return new;
end;
$$;

create trigger requests_notify_submitted_trg
  after insert or update on public.requests
  for each row execute function public.on_request_submitted();

-- ============ HISTORIAL ============
create or replace function public.log_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_event text;
  v_msg text;
begin
  if tg_table_name = 'requests' then
    v_request_id := new.id;
    if tg_op = 'INSERT' then
      v_event := 'created';
      v_msg := case when new.status = 'draft' then 'Solicitud creada como borrador' else 'Solicitud creada' end;
    elsif new.submitted_at is distinct from old.submitted_at and new.submitted_at is not null then
      v_event := 'submitted';
      v_msg := 'Solicitud enviada';
    elsif new.status is distinct from old.status then
      v_event := 'status_changed';
      v_msg := 'Estado: ' || old.status || ' -> ' || new.status;
    elsif new.assigned_admin_id is distinct from old.assigned_admin_id then
      v_event := 'assigned';
      v_msg := case when new.assigned_admin_id is null then 'Responsable quitado' else 'Responsable asignado' end;
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
  values (v_request_id, auth.uid(), v_event, v_msg, jsonb_build_object('op', tg_op, 'table', tg_table_name));
  return null;
end;
$$;

create trigger requests_log_trg
  after insert or update on public.requests
  for each row execute function public.log_request_event();

create trigger request_items_log_trg
  after insert or update or delete on public.request_items
  for each row execute function public.log_request_event();

-- ============ AVISOS AL ENCARGADO ============
create or replace function public.notify_item_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req public.requests;
  v_body text;
begin
  if new.item_status is not distinct from old.item_status then
    return null;
  end if;
  if new.item_status not in ('approved','rejected','needs_info') then
    return null;
  end if;
  select * into v_req from public.requests where id = new.request_id;
  if v_req.id is null then return null; end if;
  v_body := case new.item_status
    when 'approved' then 'Se aprobo "' || new.name || '" (cantidad aprobada: ' || new.approved_qty || ')'
    when 'rejected' then 'Se rechazo "' || new.name || '"' || coalesce(': ' || new.reason, '')
    else 'Se solicito mas informacion sobre "' || new.name || '"' || coalesce(': ' || new.reason, '')
  end;
  insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
  values (v_req.requester_id, new.request_id, 'Solicitud ' || v_req.folio, v_body, 'item_' || new.item_status,
          'item:' || new.id::text || ':' || new.item_status)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;

create trigger request_items_notify_trg
  after update on public.request_items
  for each row execute function public.notify_item_status();

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
  values (v_req.requester_id, v_req.request_id, 'Solicitud ' || v_req.folio,
          'Se registro la compra ' || v_purchase.folio || coalesce(' (' || v_purchase.vendor_name || ')', '') ||
          coalesce('. Entrega estimada: ' || to_char(v_purchase.estimated_delivery_date, 'DD/MM/YYYY'), ''),
          'purchase', 'purchase:' || v_purchase.id::text)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;

create trigger purchase_items_notify_trg
  after insert on public.purchase_items
  for each row execute function public.notify_purchase_item();

create or replace function public.notify_receipt_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_receipt public.receipts;
begin
  select * into v_receipt from public.receipts where id = new.receipt_id;
  select r.id as request_id, r.requester_id, r.folio into v_req
    from public.request_items ri join public.requests r on r.id = ri.request_id
   where ri.id = new.request_item_id;
  if v_req.request_id is null then return null; end if;
  if v_receipt.created_by = v_req.requester_id then return null; end if;
  insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
  values (v_req.requester_id, v_req.request_id, 'Solicitud ' || v_req.folio,
          'Se registro una entrega (' || v_receipt.folio || ')' ||
          coalesce('. Entrego: ' || v_receipt.received_by_name, '') || E'\nRecibidas: ' || new.qty_accepted ||
          case when new.qty_damaged > 0 or new.qty_wrong > 0 or new.qty_missing > 0
               then E'\nCon problemas - incorrectas: ' || new.qty_wrong || ', danadas: ' || new.qty_damaged || ', faltantes: ' || new.qty_missing
               else '' end,
          'receipt', 'receipt:' || v_receipt.id::text)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;

create trigger receipt_items_notify_trg
  after insert on public.receipt_items
  for each row execute function public.notify_receipt_item();

create or replace function public.notify_change_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin record;
  v_req public.requests;
  v_item public.request_items;
begin
  select * into v_req from public.requests where id = new.request_id;
  select * into v_item from public.request_items where id = new.request_item_id;
  for v_admin in
    select p.id from public.profiles p where p.role in ('admin','owner') and p.active
  loop
    insert into public.notifications (user_id, request_id, title, body, kind, dedupe_key)
    values (v_admin.id, new.request_id, 'Cambio pendiente de revision - ' || coalesce(v_req.folio, ''),
            'Articulo "' || coalesce(v_item.name, '') || '": ' || new.field || ' pasa de "' || coalesce(new.old_value, '-') ||
            '" a "' || coalesce(new.new_value, '-') || '". Motivo: ' || coalesce(new.reason, '-'),
            'change_request', 'change_request:' || new.id::text)
    on conflict (user_id, dedupe_key) do nothing;
  end loop;
  return null;
end;
$$;

create trigger change_requests_notify_trg
  after insert on public.change_requests
  for each row execute function public.notify_change_request();

-- ============ COLA DE CORREO: RECLAMO ATOMICO ============
create or replace function public.claim_email_messages(p_request_id uuid)
returns setof public.email_messages language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (
    select 1 from public.requests r where r.id = p_request_id and r.requester_id = auth.uid()
  )) then
    raise exception 'No tenes permiso para procesar los avisos de esta solicitud.' using errcode = '42501';
  end if;

  return query
  update public.email_messages m
     set status = 'sending', claimed_at = now(), attempts = m.attempts + 1
   where m.request_id = p_request_id
     and m.status in ('pending','failed','pending_config')
     and (m.claimed_at is null or m.claimed_at < now() - interval '2 minutes')
   returning m.*;
end;
$$;

create or replace function public.mark_email_message(
  p_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
) returns public.email_messages language plpgsql security definer set search_path = public as $$
declare
  v_msg public.email_messages;
begin
  if p_status not in ('sent','failed','pending_config') then
    raise exception 'Estado de envio invalido.' using errcode = '23514';
  end if;
  select * into v_msg from public.email_messages where id = p_id;
  if v_msg.id is null then
    raise exception 'Aviso inexistente.' using errcode = '23503';
  end if;
  if not (public.is_admin() or exists (
    select 1 from public.requests r where r.id = v_msg.request_id and r.requester_id = auth.uid()
  )) then
    raise exception 'No tenes permiso para actualizar este aviso.' using errcode = '42501';
  end if;

  update public.email_messages
     set status = p_status,
         provider_message_id = case when p_status = 'sent' then p_provider_message_id else provider_message_id end,
         error = case when p_status = 'sent' then null else p_error end,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         claimed_at = case when p_status = 'sent' then claimed_at else null end
   where id = p_id
   returning * into v_msg;
  return v_msg;
end;
$$;

-- ============ RLS ============
alter table public.request_comments enable row level security;
alter table public.request_events enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_notification_prefs enable row level security;
alter table public.email_messages enable row level security;

create policy request_comments_select on public.request_comments for select to authenticated using (public.can_view_request(request_id));
create policy request_comments_insert on public.request_comments for insert to authenticated with check (
  public.can_contribute_request(request_id) and author_id = auth.uid() and kind in ('comment','info_request')
);

create policy request_events_select on public.request_events for select to authenticated using (public.can_view_request(request_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy prefs_select on public.admin_notification_prefs for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy prefs_insert on public.admin_notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update on public.admin_notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy email_messages_select on public.email_messages for select to authenticated using (public.is_admin() or recipient_user_id = auth.uid());
