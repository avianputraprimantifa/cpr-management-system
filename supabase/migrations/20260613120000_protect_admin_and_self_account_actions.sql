create or replace function public.prevent_protected_profile_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if exists (
      select 1
      from public.user_roles
      where user_id = old.user_id
        and role = 'admin'
    ) then
      raise exception 'Akun Admin tidak dapat dinonaktifkan.';
    end if;

    if auth.uid() = old.user_id then
      raise exception 'Anda tidak dapat mengubah status akun sendiri.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_status_update on public.profiles;

create trigger protect_profile_status_update
before update of status on public.profiles
for each row
execute function public.prevent_protected_profile_status_update();

create or replace function public.prevent_protected_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_roles
    where user_id = old.user_id
      and role = 'admin'
  ) then
    raise exception 'Akun Admin tidak dapat dihapus.';
  end if;

  if auth.uid() = old.user_id then
    raise exception 'Anda tidak dapat menghapus akun sendiri.';
  end if;

  return old;
end;
$$;

drop trigger if exists protect_profile_delete on public.profiles;

create trigger protect_profile_delete
before delete on public.profiles
for each row
execute function public.prevent_protected_profile_delete();
