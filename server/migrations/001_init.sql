create table users (
  id uuid primary key,
  name text not null,
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  phone text,
  avatar_url text,
  role text not null default 'player',
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Für Crash-Recovery reicht ein persistierter Snapshot.
create table games (
  id uuid primary key,
  status text not null default 'active', -- active|finished|archived
  first_user_id uuid references users(id),
  include_jokers boolean not null default false,
  show_round_points boolean not null default true,
  current_bottom_size int not null default 4,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- DER entscheidende Teil:
  current_state jsonb not null
);

create index games_status_idx on games(status);

create table game_players (
  game_id uuid references games(id) on delete cascade,
  user_id uuid references users(id),
  seat_position int check (seat_position between 1 and 4),
  team text check (team in ('Fire','Storm')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,

  primary key (game_id, user_id),
  unique (game_id, seat_position)
);

create table rounds (
  id bigserial primary key,
  game_id uuid references games(id) on delete cascade,
  round_no int not null,
  bidder_user_id uuid references users(id),
  bidder_team text check (bidder_team in ('Fire','Storm')),
  bid int not null,
  trumpf text,
  round_variant text,
  round_points jsonb not null,
  team_scores_after jsonb not null,
  rule_applied text,
  delta_applied jsonb,
  bottom_cards jsonb,
  discarded jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, round_no)
);

create table tricks (
  id bigserial primary key,
  round_id bigint references rounds(id) on delete cascade,
  trick_no int not null,
  lead_suit text,
  trumpf text,
  winner_user_id uuid references users(id),
  winner_team text,
  points int not null,
  plays jsonb not null, -- [{userId,name,team,card}, ...]
  unique (round_id, trick_no)
);
