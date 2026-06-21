create table campus (
  id text primary key,
  name text not null,
  timezone text not null,
  theme text not null,
  layout_version integer not null
);

create table building (
  id text primary key,
  campus_id text not null references campus(id),
  company_id text not null,
  name text not null,
  x integer not null,
  y integer not null,
  style text not null
);

create table floor (
  id text primary key,
  building_id text not null references building(id),
  level integer not null,
  name text not null,
  capacity integer not null,
  width integer not null,
  height integer not null,
  status text not null
);

create table seat (
  id text primary key,
  floor_id text not null references floor(id),
  code text not null,
  zone text not null,
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null,
  type text not null,
  status text not null
);

create table seat_assignment (
  id text primary key,
  seat_id text not null references seat(id),
  employee_id text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  source text not null
);

create table employee_projection (
  id text primary key,
  company_id text not null,
  kind text not null,
  paperclip_agent_id text,
  display_name text not null,
  role text not null,
  title text,
  manager_id text,
  team text not null,
  agent_status text not null,
  privacy_level text not null,
  spent_monthly_cents integer not null,
  budget_monthly_cents integer not null
);

create table task_projection (
  id text primary key,
  company_id text not null,
  paperclip_issue_id text not null,
  identifier text not null,
  title text not null,
  status text not null,
  priority text not null,
  assignee_employee_id text,
  blocked_by jsonb not null,
  paperclip_url text not null,
  updated_at timestamptz not null
);

create table work_state_snapshot (
  id text primary key,
  company_id text not null,
  employee_id text,
  seat_id text,
  task_id text,
  agent_status text,
  issue_status text,
  active_run_id text,
  cost_cents integer not null,
  captured_at timestamptz not null
);

create table timeline_event (
  id text primary key,
  company_id text not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb not null,
  source_event_id text not null,
  created_at timestamptz not null,
  unique (company_id, source_event_id)
);

create table communication_edge (
  id text primary key,
  company_id text not null,
  from_employee_id text not null,
  to_employee_id text not null,
  kind text not null,
  weight integer not null,
  issue_id text,
  created_at timestamptz not null
);

create table layout_version (
  id text primary key,
  campus_id text not null references campus(id),
  version integer not null,
  snapshot_json jsonb not null,
  created_by text not null,
  created_at timestamptz not null,
  unique (campus_id, version)
);

create index idx_building_company on building(company_id);
create index idx_seat_floor on seat(floor_id);
create index idx_assignment_seat_active on seat_assignment(seat_id) where valid_to is null;
create index idx_employee_company on employee_projection(company_id);
create index idx_task_company_assignee on task_projection(company_id, assignee_employee_id);
create index idx_snapshot_company_time on work_state_snapshot(company_id, captured_at desc);
create index idx_timeline_entity_time on timeline_event(company_id, entity_type, entity_id, created_at desc);
