-- 성별·연령 별도 컬럼 (결과 표에 분리 표시용)
-- SQL Editor에서 실행. 기존 행은 age_info 만 있으면 앱에서 파싱해 표시합니다.

alter table public.mci_casualty_entries
  add column if not exists patient_gender text;

alter table public.mci_casualty_entries
  add column if not exists patient_age text;

comment on column public.mci_casualty_entries.patient_gender is '성별: 남성/여성';
comment on column public.mci_casualty_entries.patient_age is '연령(입력값)';
