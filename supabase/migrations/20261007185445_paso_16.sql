-- La politica de lectura de requests ya no se consulta a si misma.
-- Al insertar con RETURNING, la fila nueva todavia no es visible para una
-- subconsulta sobre la misma tabla, y por eso la politica la rechazaba.
-- La regla vigente es: cualquier usuario habilitado ve todos los pedidos.
alter policy requests_select on public.requests
  using (public.is_admin() or public.has_app_access());

-- Se mantiene el alcance para las tablas relacionadas (ahi la fila padre ya existe).
create or replace function public.can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.has_app_access()
          and exists (select 1 from public.requests r where r.id = p_request_id));
$$;