do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admin and pengurus can read payment receipts'
  ) then
    execute $policy$
      create policy "Admin and pengurus can read payment receipts"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'payment-receipts'
        and (
          public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
          or public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)
        )
      )
    $policy$;
  end if;
end $$;
