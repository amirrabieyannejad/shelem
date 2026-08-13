-- 002_stats.sql
-- Erweiterungen für: Gewinnwahrscheinlichkeit pro Runde, lebenslange Spieler-
-- Statistik (Level/XP) und Partner-Statistik (wer mit wem).

-- ---------------------------------------------------------------------------
-- 1) Spiel-Ergebnis dauerhaft festhalten
--    Bisher wurde ein Spiel nie als beendet markiert; ohne das lässt sich
--    "gewonnene Spiele" nicht auswerten.
-- ---------------------------------------------------------------------------
alter table games add column if not exists winner_team  text;
alter table games add column if not exists finished_at  timestamptz;
alter table games add column if not exists final_scores jsonb;
alter table games add column if not exists max_points   int;

-- ---------------------------------------------------------------------------
-- 2) Rundenanalyse
--    win_prob:  {"deal":{"p":0.41,...},"hakem":{"p":0.62,...},...}
-- ---------------------------------------------------------------------------
alter table rounds add column if not exists bid_success       boolean;
alter table rounds add column if not exists round_winner_team text;
alter table rounds add column if not exists win_prob          jsonb;
alter table rounds add column if not exists start_hands       jsonb;

create index if not exists rounds_bidder_idx on rounds (bidder_user_id);
create index if not exists game_players_user_idx on game_players (user_id);
create index if not exists games_finished_idx on games (status, finished_at);

-- ---------------------------------------------------------------------------
-- 3) Lebenslange Spielerstatistik (Cache-Tabelle).
--    Die Wahrheit liegt weiterhin in rounds/games - diese Tabelle wird nach
--    jedem Spielende neu berechnet, damit Level/XP ohne teure Aggregation
--    sofort verfügbar sind und dauerhaft bestehen bleiben.
-- ---------------------------------------------------------------------------
create table if not exists player_stats (
  user_id        uuid primary key references users(id) on delete cascade,
  games_played   int    not null default 0,
  games_won      int    not null default 0,
  rounds_played  int    not null default 0,
  rounds_won     int    not null default 0,
  hakem_rounds   int    not null default 0,
  hakem_success  int    not null default 0,
  double_pos     int    not null default 0,
  double_neg     int    not null default 0,
  points_for     bigint not null default 0,
  points_against bigint not null default 0,
  xp             bigint not null default 0,
  level          int    not null default 1,
  level_title    text   not null default 'تازه‌کار',
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) Partner-Statistik: wer hat mit wem gespielt (user_a < user_b)
-- ---------------------------------------------------------------------------
create table if not exists pair_stats (
  user_a         uuid not null references users(id) on delete cascade,
  user_b         uuid not null references users(id) on delete cascade,
  games_played   int    not null default 0,
  games_won      int    not null default 0,
  rounds_played  int    not null default 0,
  rounds_won     int    not null default 0,
  games_as_fire  int    not null default 0,
  games_as_storm int    not null default 0,
  wins_as_fire   int    not null default 0,
  wins_as_storm  int    not null default 0,
  points_for     bigint not null default 0,
  points_against bigint not null default 0,
  last_team      text,
  last_played_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
