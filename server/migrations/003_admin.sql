-- 003_admin.sql
-- Persistente App-Einstellungen (Key/Value), u.a. fuer die Zielpunktzahlen,
-- die im Admin-Bereich gesetzt werden. Bewusst generisch gehalten.
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Indizes fuer die Admin-Auswertungen (alle basieren auf vorhandenen Spieldaten).
create index if not exists games_created_idx  on games (created_at);
create index if not exists games_finished2_idx on games (finished_at);
