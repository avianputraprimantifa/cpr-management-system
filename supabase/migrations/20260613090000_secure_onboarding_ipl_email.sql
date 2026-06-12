alter table public.profiles
add column if not exists must_reset_password boolean not null default false,
add column if not exists password_setup_completed_at timestamptz,
add column if not exists default_password_kept_at timestamptz;

alter table public.ipl_bills
add column if not exists receipt_thumbnail_path text,
add column if not exists payment_submitted_at timestamptz,
add column if not exists verified_by uuid references auth.users(id) on delete set null,
add column if not exists verified_at timestamptz;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  resend_id text,
  error_message text,
  related_bill_id uuid references public.ipl_bills(id) on delete set null,
  triggered_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.email_events enable row level security;

drop policy if exists "Admin and pengurus can view email events" on public.email_events;
create policy "Admin and pengurus can view email events"
on public.email_events
for select
to authenticated
using (
  public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
  or public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)
);
