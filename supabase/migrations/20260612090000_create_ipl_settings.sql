create table if not exists public.ipl_settings (
  id text primary key default 'default',
  default_amount numeric not null default 0 check (default_amount >= 0),
  bank_name text not null default '',
  bank_account_number text not null default '',
  bank_account_name text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint ipl_settings_singleton check (id = 'default')
);

insert into public.ipl_settings (id, default_amount, bank_name, bank_account_number, bank_account_name)
values ('default', 0, '', '', '')
on conflict (id) do nothing;

alter table public.ipl_settings enable row level security;

drop policy if exists "Authenticated users can view IPL settings" on public.ipl_settings;
create policy "Authenticated users can view IPL settings"
on public.ipl_settings
for select
to authenticated
using (true);

drop policy if exists "Admin and pengurus can insert IPL settings" on public.ipl_settings;
create policy "Admin and pengurus can insert IPL settings"
on public.ipl_settings
for insert
to authenticated
with check (
  public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
  or public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)
);

drop policy if exists "Admin and pengurus can update IPL settings" on public.ipl_settings;
create policy "Admin and pengurus can update IPL settings"
on public.ipl_settings
for update
to authenticated
using (
  public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
  or public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)
)
with check (
  public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
  or public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)
);
