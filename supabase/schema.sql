-- Private player identity records for the Express server.
-- Apply this in Supabase Dashboard → SQL Editor.
create table if not exists public.arcade_players (
  id bigint generated always as identity primary key,
  room_key_hash text not null check (length(room_key_hash) = 64),
  device_key_hash text not null check (length(device_key_hash) = 64),
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_key_hash, device_key_hash)
);

alter table public.arcade_players enable row level security;
revoke all on table public.arcade_players from anon, authenticated;
grant select, insert, update on table public.arcade_players to service_role;
grant usage, select on sequence public.arcade_players_id_seq to service_role;
