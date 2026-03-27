# Mass-Casualty

다수사상자 (이송)현황 기록. [Vite](https://vitejs.dev/) + [Supabase](https://supabase.com/) 로 목록 조회·저장합니다. 이송 기록 화면에서 **엑셀(.xlsx) 저장**으로 선택한 사건의 사상자 목록을 보낼 수 있습니다.

## Supabase DB

SQL Editor에서 아래를 실행합니다.

1. `supabase/mci_casualty_entries.sql`  
2. `supabase/mci_incidents.sql` (사건 분류·탭용)  
3. `supabase/mci_add_patient_sex_age.sql` (성별·연령 별도 컬럼 — 선택, 표 분리 표시용)  
4. `supabase/mci_add_transfer_vehicle.sql` (이송수단 컬럼)
5. `supabase/mci_add_serial_no.sql` (연번 수동 입력 컬럼)

## 환경 변수

프로젝트 루트에 `.env` (Git 무시):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

`VITE_SUPABASE_*` 이름도 `vite.config.js`에서 같이 읽습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 표시되는 주소(보통 `http://localhost:5173`)로 엽니다.  
`python -m http.server` 만으로는 `.env`가 주입되지 않아 Supabase가 동작하지 않습니다.

## 배포 (Vercel)

1. 프로젝트 **Settings → Environment Variables**에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 등록  
2. **Build Command:** `npm run build`  
3. **Output Directory:** `dist`  

Vercel이 Vite를 자동 감지하면 위 설정이 잡힐 수 있습니다.
