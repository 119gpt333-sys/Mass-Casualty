import { createClient } from '@supabase/supabase-js'

const supabaseUrl = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : ''
const supabaseKey = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : ''

let supabase = null
let currentTriage = ''

function $(id) {
  return document.getElementById(id)
}

function val(id) {
  const el = $(id)
  return el ? el.value.trim() : ''
}

function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeTimeInput(v) {
  if (!v || !String(v).trim()) return null
  const t = String(v).trim()
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t
  return t
}

function triageStyle(level) {
  const color =
    level === '긴급'
      ? 'var(--red)'
      : level === '응급'
        ? 'var(--yellow)'
        : level === '비응급'
          ? 'var(--green)'
          : 'var(--black)'
  const tColor = level === '응급' ? '#000' : '#fff'
  return { color, tColor }
}

function formatTimeDisplay(t) {
  if (t == null || t === '') return ''
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

function setDbStatus(msg, isError) {
  const el = $('dbStatus')
  if (!el) return
  el.textContent = msg || ''
  el.style.color = isError ? '#c0392b' : '#555'
}

/** fetch 단계에서 끊길 때( CORS/오프라인/차단/URL 오류 등 ) Supabase가 주는 메시지 */
function friendlySupabaseMessage(error) {
  if (!error) return '알 수 없는 오류'
  const raw = error.message || String(error)
  if (/failed to fetch/i.test(raw) || /networkerror|load failed/i.test(raw)) {
    return (
      '네트워크 연결 실패: 브라우저가 Supabase 서버에 요청을 보내지 못했습니다. ' +
      '인터넷·광고/추적 차단 확장·회사망 방화벽, Vercel 환경 변수(SUPABASE_URL·SUPABASE_ANON_KEY) 누락 후 재배포, Supabase 프로젝트 일시정지 여부를 확인하세요.'
    )
  }
  return raw
}

function setTriage(val, btn) {
  currentTriage = val
  document.querySelectorAll('.triage-btn').forEach((b) => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}

function setCurrentTime(id) {
  const now = new Date()
  const time =
    now.getHours().toString().padStart(2, '0') +
    ':' +
    now.getMinutes().toString().padStart(2, '0')
  const el = $(id)
  if (el) el.value = time
}

function initLandingDefaults() {
  const dateEl = $('incidentDate')
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10)
  }
  const timeEl = $('incidentTime')
  if (timeEl && !timeEl.value) {
    setCurrentTime('incidentTime')
  }
}

function updateRecordContextBar() {
  const el = $('recordContextText')
  if (!el) return
  const dateStr = val('incidentDate') || '—'
  const timeStr = val('incidentTime') || '—'
  const sum = val('incidentSummary')
  const sumShort = sum ? (sum.length > 48 ? `${sum.slice(0, 48)}…` : sum) : '—'
  el.textContent = `${dateStr} · ${timeStr} · ${sumShort}`
}

function showRecordView() {
  $('view-landing')?.classList.add('hidden')
  $('view-record')?.classList.remove('hidden')
  updateRecordContextBar()
  if (supabase) {
    setDbStatus('연결됨')
    loadEntries()
  } else {
    setDbStatus(
      'Supabase URL/키가 비어 있습니다. 로컬: Mass-Casualty 폴더의 .env 확인 후 npm run dev 재시작. 배포(Vercel): 프로젝트 Environment Variables에 SUPABASE_URL·SUPABASE_ANON_KEY 등록 후 Redeploy.',
      true
    )
  }
}

function showLandingView() {
  $('view-record')?.classList.add('hidden')
  $('view-landing')?.classList.remove('hidden')
}

function buildRowHtml(entry, indexFromNewest) {
  const triage = entry.triage_level || ''
  const { color, tColor } = triageStyle(triage)
  const pTime = formatTimeDisplay(entry.handoff_time)
  const sTime = formatTimeDisplay(entry.departure_time)
  const provider = escapeHtml(entry.provider_name)
  const name = escapeHtml(entry.patient_name)
  const hosp = escapeHtml(entry.destination_hospital)
  const status = escapeHtml(entry.transfer_status)
  const triageEsc = escapeHtml(triage)

  return `
    <td>${indexFromNewest}</td>
    <td>${name}</td>
    <td>${provider}<br>(${escapeHtml(pTime)})</td>
    <td><span class="status-badge" style="background:${color}; color:${tColor}">${triageEsc || '—'}</span></td>
    <td>${status}</td>
    <td>${escapeHtml(sTime)}</td>
    <td>${hosp}</td>
  `
}

async function loadEntries() {
  if (!supabase) return

  setDbStatus('목록 불러오는 중…')
  const { data, error } = await supabase
    .from('mci_casualty_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    setDbStatus(`불러오기 실패: ${friendlySupabaseMessage(error)}`, true)
    return
  }

  const tbody = $('dataTable')?.getElementsByTagName('tbody')[0]
  if (!tbody) return
  tbody.innerHTML = ''

  data.forEach((row, i) => {
    const tr = tbody.insertRow()
    tr.innerHTML = buildRowHtml(row, i + 1)
  })

  setDbStatus(data.length ? `총 ${data.length}건 (Supabase)` : '저장된 데이터 없음')
}

async function addEntry() {
  if (!supabase) {
    setDbStatus('Supabase 설정이 없습니다. .env 를 확인하세요.', true)
    return
  }

  const btn = $('btnSave')
  if (btn) btn.disabled = true

  const payload = {
    patient_name: val('name') || '',
    age_info: val('ageInfo') || null,
    discovery_location: val('loc') || null,
    provider_name: val('provider') || null,
    handoff_time: normalizeTimeInput(val('provideTime')),
    triage_level: currentTriage || null,
    symptom: val('symptom') || null,
    transfer_status: val('transferStatus') || '미이송',
    departure_time: normalizeTimeInput(val('startTime')),
    destination_hospital: val('hospital') || null,
    incident_id: null,
  }

  setDbStatus('저장 중…')
  const { error } = await supabase.from('mci_casualty_entries').insert(payload)

  if (error) {
    setDbStatus(`저장 실패: ${friendlySupabaseMessage(error)}`, true)
    if (btn) btn.disabled = false
    return
  }

  $('name').value = ''
  $('provideTime').value = ''
  $('startTime').value = ''
  await loadEntries()
  if (btn) btn.disabled = false
}

function wireRecordForm() {
  document.querySelectorAll('.btn-now').forEach((b) => {
    if (b.id === 'btnIncidentTimeNow') return
    b.addEventListener('click', () => setCurrentTime(b.dataset.timeTarget))
  })
  const incidentNow = $('btnIncidentTimeNow')
  if (incidentNow) {
    incidentNow.addEventListener('click', () => setCurrentTime('incidentTime'))
  }
  document.querySelectorAll('.triage-btn').forEach((b) => {
    b.addEventListener('click', () => setTriage(b.dataset.triage, b))
  })
  const saveBtn = $('btnSave')
  if (saveBtn) saveBtn.addEventListener('click', addEntry)
}

function init() {
  initLandingDefaults()

  document.querySelectorAll('.landing-title-btn').forEach((btn) => {
    btn.addEventListener('click', () => showRecordView())
  })
  $('btnGoRecord')?.addEventListener('click', () => showRecordView())

  const landing = $('view-landing')
  if (landing) {
    landing.addEventListener('click', (e) => {
      const t = e.target
      if (t.closest('input, textarea, select, label, .btn-now, .landing-title-btn, #btnGoRecord')) return
      const card = t.closest('.landing-card')
      if (card) showRecordView()
    })
  }

  const back = $('btnBackLanding')
  if (back) back.addEventListener('click', showLandingView)

  wireRecordForm()

  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
  } else {
    supabase = null
  }
}

/* module 스크립트가 늦게 도착하면 DOMContentLoaded 를 놓칠 수 있음 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
