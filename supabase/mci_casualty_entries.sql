-- MCI 다수사상자 이송 기록 — Supabase SQL Editor에서 한 번에 실행 가능
-- 앱 폼 필드: name, ageInfo, loc, provider, provideTime, triage, symptom, transferStatus, startTime, hospital, transferVehicle

-- ---------------------------------------------------------------------------
-- 1) 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.mci_casualty_entries (
  id uuid primary key default gen_random_uuid(),

  -- 사상자·발견
  patient_name text not null default '',
  age_info text,
  discovery_location text,

  -- 인계·중증도
  provider_name text,
  handoff_time time,
  triage_level text,
  symptom text,

  -- 이송
  transfer_status text not null default '미이송',
  departure_time time,
  destination_hospital text,
  transfer_vehicle text,

  -- 같은 사고를 묶고 싶을 때(선택). 앱에서 uuid 넣거나 나중에 컬럼 활용
  incident_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mci_casualty_entries_triage_level_check
    check (triage_level is null or triage_level in ('긴급', '응급', '비응급', '사망')),
  constraint mci_casualty_entries_transfer_status_check
    check (transfer_status in ('이송', '미이송'))
);

comment on table public.mci_casualty_entries is '다수사상자 이송 현황 기록 (MCI-Linker)';
comment on column public.mci_casualty_entries.patient_name is '성명(국적)';
comment on column public.mci_casualty_entries.age_info is '성별(연령)';
comment on column public.mci_casualty_entries.discovery_location is '발견 장소';
comment on column public.mci_casualty_entries.provider_name is '인계자(진압/구조대)';
comment on column public.mci_casualty_entries.handoff_time is '인계(구조)시각';
comment on column public.mci_casualty_entries.triage_level is '중증도: 긴급/응급/비응급/사망';
comment on column public.mci_casualty_entries.symptom is '주증상(손상원인)';
comment on column public.mci_casualty_entries.transfer_status is '이송 여부';
comment on column public.mci_casualty_entries.departure_time is '출발 시각';
comment on column public.mci_casualty_entries.destination_hospital is '이송 병원';
comment on column public.mci_casualty_entries.transfer_vehicle is '이송수단(앰뷸런스 등)';

-- 목록: 최신순
create index if not exists mci_casualty_entries_created_at_idx
  on public.mci_casualty_entries (created_at desc);

create index if not exists mci_casualty_entries_incident_id_idx
  on public.mci_casualty_entries (incident_id)
  where incident_id is not null;

-- ---------------------------------------------------------------------------
-- 2) updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create or replace function public.mci_casualty_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mci_casualty_entries_set_updated_at on public.mci_casualty_entries;
create trigger mci_casualty_entries_set_updated_at
  before update on public.mci_casualty_entries
  for each row
  execute function public.mci_casualty_entries_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.mci_casualty_entries enable row level security;

-- 기존 정책 재실행 시 중복 방지(이름 고정)
drop policy if exists "mci_entries_select_anon" on public.mci_casualty_entries;
drop policy if exists "mci_entries_insert_anon" on public.mci_casualty_entries;
drop policy if exists "mci_entries_update_anon" on public.mci_casualty_entries;
drop policy if exists "mci_entries_delete_anon" on public.mci_casualty_entries;

-- ⚠️ 개발/내부망용: 익명(anon) 키로 브라우저에서 읽기/쓰기 허용
-- 운영·인터넷 공개 전에는 로그인(auth.uid())·역할·incident_id 조건 등으로 반드시 좁히세요.
create policy "mci_entries_select_anon"
  on public.mci_casualty_entries
  for select
  to anon, authenticated
  using (true);

create policy "mci_entries_insert_anon"
  on public.mci_casualty_entries
  for insert
  to anon, authenticated
  with check (true);

create policy "mci_entries_update_anon"
  on public.mci_casualty_entries
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "mci_entries_delete_anon"
  on public.mci_casualty_entries
  for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) 선택: Realtime 구독 (여러 단말 동시 갱신용)
-- ---------------------------------------------------------------------------
-- 대시보드 → Database → Replication → supabase_realtime 에 테이블 추가하거나:
-- alter publication supabase_realtime add table public.mci_casualty_entries;
