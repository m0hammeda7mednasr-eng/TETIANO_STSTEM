create extension if not exists pgcrypto;

create table if not exists public.meta_integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  meta_access_token text default '',
  meta_business_id text default '',
  meta_ad_account_ids jsonb not null default '[]'::jsonb,
  meta_page_id text default '',
  meta_pixel_id text default '',
  openrouter_api_key text default '',
  openrouter_model text not null default 'openai/gpt-4o-mini',
  openrouter_site_url text default '',
  openrouter_site_name text default '',
  is_meta_connected boolean not null default false,
  is_openrouter_connected boolean not null default false,
  last_meta_sync_at timestamptz null,
  last_meta_sync_status text not null default 'idle'
    check (last_meta_sync_status in ('idle', 'running', 'completed', 'failed')),
  last_meta_sync_error text default '',
  last_ai_analysis_at timestamptz null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.meta_integrations(id) on delete cascade,
  store_id uuid not null,
  triggered_by uuid null,
  sync_type text not null default 'manual'
    check (sync_type in ('manual', 'scheduled', 'webhook')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  date_start date null,
  date_stop date null,
  payload_summary jsonb not null default '{}'::jsonb,
  error_message text default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.meta_integrations(id) on delete cascade,
  store_id uuid not null,
  object_type text not null default 'ad'
    check (object_type in ('account', 'campaign', 'adset', 'ad')),
  object_id text not null,
  object_name text default '',
  level text not null default 'ad'
    check (level in ('account', 'campaign', 'adset', 'ad')),
  account_id text default '',
  account_name text default '',
  campaign_id text default '',
  campaign_name text default '',
  adset_id text default '',
  adset_name text default '',
  ad_id text default '',
  ad_name text default '',
  objective text default '',
  currency text default '',
  date_start date null,
  date_stop date null,
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.meta_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.meta_integrations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid null,
  model text not null default 'openai/gpt-4o-mini',
  focus_area text default '',
  prompt_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  recommendation_text text default '',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_meta_integrations_store_unique
  on public.meta_integrations(store_id);
create index if not exists idx_meta_sync_runs_store_id
  on public.meta_sync_runs(store_id);
create index if not exists idx_meta_sync_runs_integration_id
  on public.meta_sync_runs(integration_id);
create index if not exists idx_meta_sync_runs_started_at
  on public.meta_sync_runs(started_at desc);
create index if not exists idx_meta_insight_snapshots_store_id
  on public.meta_insight_snapshots(store_id);
create index if not exists idx_meta_insight_snapshots_integration_id
  on public.meta_insight_snapshots(integration_id);
create index if not exists idx_meta_insight_snapshots_date_start
  on public.meta_insight_snapshots(date_start desc);
create index if not exists idx_meta_insight_snapshots_campaign_id
  on public.meta_insight_snapshots(campaign_id);
create index if not exists idx_meta_insight_snapshots_ad_id
  on public.meta_insight_snapshots(ad_id);
create unique index if not exists idx_meta_insight_snapshots_unique
  on public.meta_insight_snapshots(
    integration_id,
    object_type,
    object_id,
    date_start,
    date_stop
  );
create index if not exists idx_meta_ai_analyses_store_id
  on public.meta_ai_analyses(store_id);
create index if not exists idx_meta_ai_analyses_integration_id
  on public.meta_ai_analyses(integration_id);
create index if not exists idx_meta_ai_analyses_created_at
  on public.meta_ai_analyses(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meta_integrations_set_updated_at on public.meta_integrations;
create trigger meta_integrations_set_updated_at
before update on public.meta_integrations
for each row
execute function public.set_updated_at();

alter table public.meta_integrations enable row level security;
alter table public.meta_sync_runs enable row level security;
alter table public.meta_insight_snapshots enable row level security;
alter table public.meta_ai_analyses enable row level security;

drop policy if exists meta_integrations_service_access on public.meta_integrations;
create policy meta_integrations_service_access
on public.meta_integrations
for all
using (auth.role() in ('service_role', 'authenticated'))
with check (auth.role() in ('service_role', 'authenticated'));

drop policy if exists meta_sync_runs_service_access on public.meta_sync_runs;
create policy meta_sync_runs_service_access
on public.meta_sync_runs
for all
using (auth.role() in ('service_role', 'authenticated'))
with check (auth.role() in ('service_role', 'authenticated'));

drop policy if exists meta_insight_snapshots_service_access on public.meta_insight_snapshots;
create policy meta_insight_snapshots_service_access
on public.meta_insight_snapshots
for all
using (auth.role() in ('service_role', 'authenticated'))
with check (auth.role() in ('service_role', 'authenticated'));

drop policy if exists meta_ai_analyses_service_access on public.meta_ai_analyses;
create policy meta_ai_analyses_service_access
on public.meta_ai_analyses
for all
using (auth.role() in ('service_role', 'authenticated'))
with check (auth.role() in ('service_role', 'authenticated'));
