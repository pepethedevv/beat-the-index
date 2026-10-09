-- Run this once in Supabase > SQL Editor

create table if not exists participants (
  wallet        text primary key,
  session_token text not null,
  x_id          text unique,
  x_handle      text,
  x_avatar      text,
  joined_at     timestamptz not null default now(),
  last_computed timestamptz
);

create table if not exists scores (
  wallet      text not null references participants(wallet) on delete cascade,
  period      text not null check (period in ('day','week','month')),
  ret         numeric not null,
  vs          numeric not null,
  trades      int not null,
  volume      numeric not null,
  qualified   boolean not null,
  computed_at timestamptz not null default now(),
  primary key (wallet, period)
);
create index if not exists scores_board on scores (period, qualified, vs desc);

create table if not exists oauth_states (
  state      text primary key,
  verifier   text not null,
  wallet     text not null references participants(wallet) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists meta (
  key   text primary key,
  value jsonb not null
);

-- Only the server (service role key) may read or write. Browsers go through /api.
alter table participants enable row level security;
alter table scores       enable row level security;
alter table oauth_states enable row level security;
alter table meta         enable row level security;
