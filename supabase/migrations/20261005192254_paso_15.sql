-- Los sectores dejan de usarse: la tabla y sus datos se conservan intactos.
alter table public.requests alter column sector_id drop not null;

create or replace function public.can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
     where r.id = p_request_id
       and (public.is_admin() or public.has_app_access())
  );
$$;

create or replace function public.can_contribute_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
     where r.id = p_request_id
       and (public.is_admin() or public.has_app_access())
  );
$$;

create or replace function public.can_view_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.purchase_items pi
      join public.request_items ri on ri.id = pi.request_item_id
      join public.requests r on r.id = ri.request_id
     where pi.purchase_id = p_purchase
       and public.has_app_access()
       and r.requester_id = auth.uid()
  );
$$;

alter policy requests_insert on public.requests with check (
  public.has_app_access()
  and requester_id = auth.uid()
  and status = 'draft'
);

alter policy requests_update on public.requests using (public.is_admin() or requester_id = auth.uid())
  with check (public.is_admin() or requester_id = auth.uid());