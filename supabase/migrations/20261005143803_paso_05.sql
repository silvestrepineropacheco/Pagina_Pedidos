insert into storage.buckets (id, name, public) values ('request-attachments', 'request-attachments', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('catalog-images', 'catalog-images', true) on conflict (id) do nothing;

create policy attachments_select on storage.objects for select to authenticated using (
  bucket_id = 'request-attachments' and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'requests'
      and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
      and public.can_view_request(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy attachments_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'request-attachments' and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'requests'
      and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
      and public.can_contribute_request(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy attachments_update on storage.objects for update to authenticated using (
  bucket_id = 'request-attachments' and (public.is_admin() or public.has_app_access())
) with check (
  bucket_id = 'request-attachments' and (public.is_admin() or public.has_app_access())
);

create policy attachments_delete on storage.objects for delete to authenticated using (
  bucket_id = 'request-attachments' and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'requests'
      and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
      and public.can_edit_request(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy catalog_images_select on storage.objects for select to authenticated using (bucket_id = 'catalog-images');
create policy catalog_images_insert on storage.objects for insert to authenticated with check (bucket_id = 'catalog-images' and public.is_admin());
create policy catalog_images_update on storage.objects for update to authenticated using (bucket_id = 'catalog-images' and public.is_admin()) with check (bucket_id = 'catalog-images' and public.is_admin());
create policy catalog_images_delete on storage.objects for delete to authenticated using (bucket_id = 'catalog-images' and public.is_admin());
