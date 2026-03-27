-- 저장된 사상자 목록 "연번" 수동 입력용 컬럼
alter table public.mci_casualty_entries
  add column if not exists serial_no integer;

comment on column public.mci_casualty_entries.serial_no is '사건 내 수동 연번(선택)';

-- 사건별 조회에서 연번 정렬/검색 보조 인덱스
create index if not exists mci_casualty_entries_incident_serial_no_idx
  on public.mci_casualty_entries (incident_id, serial_no)
  where serial_no is not null;
