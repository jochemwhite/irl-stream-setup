-- OBS WebSocket integration — add columns to existing tables

alter table obs_path_config
  add column if not exists fallback_trigger_type  text    not null default 'immediate',
  add column if not exists fallback_trigger_value integer not null default 3,
  add column if not exists recover_trigger_type   text    not null default 'immediate',
  add column if not exists recover_trigger_value  integer not null default 5,
  add column if not exists health_min_score       integer;
