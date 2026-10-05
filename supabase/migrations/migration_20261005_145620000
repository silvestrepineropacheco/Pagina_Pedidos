alter table public.app_settings add column if not exists owner_setup_code_pending text;
alter table public.app_settings add column if not exists owner_setup_code_hash text;
alter table public.app_settings add column if not exists owner_setup_salt text;

update public.app_settings
   set owner_setup_code_pending = encode(gen_random_bytes(18), 'hex'),
       owner_setup_salt = encode(gen_random_bytes(16), 'hex'),
       updated_at = now()
 where id;