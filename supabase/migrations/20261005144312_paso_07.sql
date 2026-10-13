create policy attachments_drafts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = 'drafts'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.has_app_access()
);

create policy attachments_drafts_select on storage.objects for select to authenticated using (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = 'drafts'
  and (public.is_admin() or (storage.foldername(name))[2] = auth.uid()::text)
);

create policy attachments_drafts_delete on storage.objects for delete to authenticated using (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = 'drafts'
  and (public.is_admin() or (storage.foldername(name))[2] = auth.uid()::text)
);
