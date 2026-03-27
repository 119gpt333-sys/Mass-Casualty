-- 이송수단 컬럼 — SQL Editor에서 실행

alter table public.mci_casualty_entries
  add column if not exists transfer_vehicle text;

comment on column public.mci_casualty_entries.transfer_vehicle is '이송수단(앰뷸런스 등)';
