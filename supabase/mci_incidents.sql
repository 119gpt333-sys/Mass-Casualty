-- =============================================================================
-- MCI 사건 분류 테이블 (Supabase → SQL Editor 에 붙여넣어 실행)
-- 앱: 사건 생성 → 탭 표시 → 이송 기록은 incident_id 로 사건과 연결
-- 선행 권장: supabase/mci_casualty_entries.sql (이송 테이블)
-- =============================================================================

create table if not exists public.mci_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_date date not null,
  incident_time time,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mci_incidents_created_at_idx
  on public.mci_incidents (created_at desc);

comment on table public.mci_incidents is 'MCI 사건 분류(날짜·시간·요약)';

alter table public.mci_incidents enable row level security;

drop policy if exists "mci_incidents_select_anon" on public.mci_incidents;
drop policy if exists "mci_incidents_insert_anon" on public.mci_incidents;
drop policy if exists "mci_incidents_update_anon" on public.mci_incidents;
drop policy if exists "mci_incidents_delete_anon" on public.mci_incidents;

create policy "mci_incidents_select_anon"
  on public.mci_incidents for select to anon, authenticated using (true);

create policy "mci_incidents_insert_anon"
  on public.mci_incidents for insert to anon, authenticated with check (true);

create policy "mci_incidents_update_anon"
  on public.mci_incidents for update to anon, authenticated using (true) with check (true);

create policy "mci_incidents_delete_anon"
  on public.mci_incidents for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- (선택) 이송 행 incident_id → 사건 id 참조 무결성
-- mci_casualty_entries 가 있고, 잘못된 incident_id 행이 없을 때만 주석 해제 후 실행.
-- 실패 시: 유효하지 않은 incident_id 를 null 로 바꾼 뒤 다시 실행.
-- ---------------------------------------------------------------------------
-- alter table public.mci_casualty_entries
--   drop constraint if exists mci_casualty_entries_incident_id_fkey;
-- alter table public.mci_casualty_entries
--   add constraint mci_casualty_entries_incident_id_fkey
--   foreign key (incident_id) references public.mci_incidents (id)
--   on delete set null;
