create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_hash text;
  v_salt text;
  v_code text;
  v_role text := 'pending';
  v_active boolean := false;
begin
  perform pg_advisory_xact_lock(918273645);

  select lower(btrim(coalesce(s.owner_email, ''))), s.owner_setup_code_hash, coalesce(s.owner_setup_salt, '')
    into v_owner, v_hash, v_salt
    from public.app_settings s
   where s.id;

  v_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'owner_setup_code', '')), '');

  if v_owner <> '' and lower(new.email) = v_owner then
    -- Cuenta autorizada explicitamente por su correo.
    v_role := 'owner';
    v_active := true;
  elsif v_hash is not null and v_code is not null then
    -- El reclamo del codigo es opcional: un problema aca nunca debe impedir el alta.
    begin
      if encode(extensions.digest(v_code || v_salt, 'sha256'), 'hex') = v_hash then
        v_role := 'owner';
        v_active := true;
        update public.app_settings
           set owner_email = lower(new.email),
               owner_setup_code_hash = null,
               owner_setup_salt = null,
               updated_at = now()
         where id;
      end if;
    exception when others then
      raise warning 'No se pudo validar el codigo de configuracion inicial: %', sqlerrm;
    end;
  end if;

  insert into public.profiles (id, full_name, email, role, active, email_verified)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_role,
    v_active,
    new.email_confirmed_at is not null
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();

  return new;
exception when others then
  -- Ultimo recurso: un error inesperado no debe dejar a la persona sin poder registrarse.
  raise warning 'Error creando el perfil de %: %', new.email, sqlerrm;
  begin
    insert into public.profiles (id, email, role, active)
    values (new.id, new.email, 'pending', false)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'Tampoco se pudo crear el perfil minimo de %', new.email;
  end;
  return new;
end;
$$;