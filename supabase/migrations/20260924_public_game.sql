create table if not exists public.question_banks (
  id uuid primary key default gen_random_uuid(), data jsonb not null, source_name text not null, source_path text,
  active boolean not null default false, is_default boolean not null default false, created_at timestamptz not null default now()
);
create unique index if not exists one_active_question_bank on public.question_banks (active) where active;
create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('Pharmacist', 'Pharmacy Technician/Executive/Assistant', 'Storekeeper/Health Assistant', 'Retail Staff')),
  nickname text not null check (char_length(nickname) between 1 and 16), score integer not null check (score between 0 and 5000), created_at timestamptz not null default now()
);
create index if not exists leaderboard_role_score on public.leaderboard_entries (role, score desc, created_at asc);
alter table public.question_banks enable row level security;
alter table public.leaderboard_entries enable row level security;
revoke all on public.question_banks from anon, authenticated;
revoke all on public.leaderboard_entries from anon, authenticated;
insert into storage.buckets (id, name, public) values ('question-banks', 'question-banks', false) on conflict (id) do nothing;
