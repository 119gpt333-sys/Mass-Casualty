import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabaseUrl = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : ''
const supabaseKey = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : ''

let supabase = null
let currentTriage = ''
let currentSex = ''
/** @type {Array<{ id: string, incident_date: string, incident_time: string | null, summary: string, created_at: string }>} */
let incidentsCache = []
let currentIncidentId = null
/** @type {string | null} */
let editingEntryId = null
/** @type {Array<Record<string, unknown>>} */
let lastLoadedEntries = []

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

function scrollRecordOutputIntoView() {
  requestAnimationFrame(() => {
    $('recordOutputSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function setLandingIncidentStatus(msg, isError) {
  const el = $('landingIncidentStatus')
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

function setSex(v, btn) {
  if (currentSex === v) {
    currentSex = ''
    document.querySelectorAll('.sex-tab').forEach((b) => b.classList.remove('active'))
    return
  }
  currentSex = v
  document.querySelectorAll('.sex-tab').forEach((b) => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}

function buildAgeInfoPayload() {
  const parts = []
  if (currentSex) parts.push(currentSex)
  const age = val('ageInfo')
  if (age) parts.push(age)
  const s = parts.join(' ').trim()
  return s || null
}

/** DB patient_gender / patient_age 우선, 없으면 age_info(레거시) 파싱 */
function displayGenderForEntry(entry) {
  const g =
    entry.patient_gender != null && String(entry.patient_gender).trim() !== ''
      ? String(entry.patient_gender).trim()
      : ''
  if (g) return escapeHtml(g)
  const legacy = (entry.age_info || '').trim()
  if (legacy.startsWith('남성')) return escapeHtml('남성')
  if (legacy.startsWith('여성')) return escapeHtml('여성')
  return '—'
}

function displayAgeForEntry(entry) {
  const a =
    entry.patient_age != null && String(entry.patient_age).trim() !== ''
      ? String(entry.patient_age).trim()
      : ''
  if (a) return escapeHtml(a)
  const legacy = (entry.age_info || '').trim()
  if (!legacy) return '—'
  const m = legacy.match(/^(남성|여성)\s+(.+)$/)
  if (m) return escapeHtml(m[2].trim()) || '—'
  if (legacy === '남성' || legacy === '여성') return '—'
  return escapeHtml(legacy)
}

function entryGenderPlain(entry) {
  const g =
    entry.patient_gender != null && String(entry.patient_gender).trim() !== ''
      ? String(entry.patient_gender).trim()
      : ''
  if (g) return g
  const legacy = (entry.age_info || '').trim()
  if (legacy.startsWith('남성')) return '남성'
  if (legacy.startsWith('여성')) return '여성'
  return ''
}

function entryAgePlain(entry) {
  const a =
    entry.patient_age != null && String(entry.patient_age).trim() !== ''
      ? String(entry.patient_age).trim()
      : ''
  if (a) return a
  const legacy = (entry.age_info || '').trim()
  if (!legacy) return ''
  const m = legacy.match(/^(남성|여성)\s+(.+)$/)
  if (m) return m[2].trim()
  if (legacy === '남성' || legacy === '여성') return ''
  return legacy
}

function formatTimeForInput(t) {
  if (t == null || t === '') return ''
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

function clearRecordForm() {
  const n = $('name')
  if (n) n.value = ''
  const age = $('ageInfo')
  if (age) age.value = ''
  currentSex = ''
  document.querySelectorAll('.sex-tab').forEach((b) => b.classList.remove('active'))
  const loc = $('loc')
  if (loc) loc.value = ''
  const prov = $('provider')
  if (prov) prov.value = ''
  const pt = $('provideTime')
  if (pt) pt.value = ''
  const st = $('startTime')
  if (st) st.value = ''
  currentTriage = ''
  document.querySelectorAll('.triage-btn').forEach((b) => b.classList.remove('active'))
  const sy = $('symptom')
  if (sy) sy.value = ''
  const ts = $('transferStatus')
  if (ts) ts.value = '미이송'
  const h = $('hospital')
  if (h) h.value = ''
  const tv = $('transferVehicle')
  if (tv) tv.value = ''
}

function populateFormFromEntry(entry) {
  const nameEl = $('name')
  if (nameEl) nameEl.value = entry.patient_name || ''

  const pa =
    entry.patient_age != null && String(entry.patient_age).trim() !== ''
      ? String(entry.patient_age).trim()
      : ''
  const ageEl = $('ageInfo')
  if (ageEl) {
    if (pa) {
      ageEl.value = pa
    } else {
      const legacy = (entry.age_info || '').trim()
      const m = legacy.match(/^(남성|여성)\s+(.+)$/)
      ageEl.value = m ? m[2].trim() : legacy === '남성' || legacy === '여성' ? '' : legacy
    }
  }

  document.querySelectorAll('.sex-tab').forEach((b) => b.classList.remove('active'))
  currentSex = ''
  const g = (entry.patient_gender || '').trim()
  if (g === '남성' || g === '여성') {
    const btn = document.querySelector(`.sex-tab[data-sex="${g}"]`)
    setSex(g, btn)
  } else {
    const legacy = (entry.age_info || '').trim()
    if (legacy.startsWith('남성')) {
      setSex('남성', document.querySelector('.sex-tab.sex-m'))
    } else if (legacy.startsWith('여성')) {
      setSex('여성', document.querySelector('.sex-tab.sex-f'))
    }
  }

  const locEl = $('loc')
  if (locEl) locEl.value = entry.discovery_location || ''
  const provEl = $('provider')
  if (provEl) provEl.value = entry.provider_name || ''
  const pTime = $('provideTime')
  if (pTime) pTime.value = formatTimeForInput(entry.handoff_time)
  const sTime = $('startTime')
  if (sTime) sTime.value = formatTimeForInput(entry.departure_time)

  const tl = entry.triage_level || ''
  if (tl) {
    let triBtn = null
    document.querySelectorAll('.triage-btn').forEach((b) => {
      if (b.dataset.triage === tl) triBtn = b
    })
    setTriage(tl, triBtn)
  } else {
    currentTriage = ''
    document.querySelectorAll('.triage-btn').forEach((b) => b.classList.remove('active'))
  }

  const sym = $('symptom')
  if (sym) sym.value = entry.symptom || ''
  const tr = $('transferStatus')
  if (tr) tr.value = entry.transfer_status === '이송' ? '이송' : '미이송'
  const hosp = $('hospital')
  if (hosp) hosp.value = entry.destination_hospital || ''
  const tv = $('transferVehicle')
  if (tv) tv.value = entry.transfer_vehicle || ''
}

function openEditModal(entry) {
  const host = $('editModalFormHost')
  const block = $('recordFormBlock')
  const modal = $('editModal')
  if (!host || !block || !modal) return

  editingEntryId = entry.id
  populateFormFromEntry(entry)
  host.appendChild(block)
  modal.classList.remove('hidden')
  const btn = $('btnSave')
  if (btn) btn.textContent = '수정 저장'
  setDbStatus('수정 후 「수정 저장」, 취소는 「닫기」.', false)
  document.body.style.overflow = 'hidden'
}

function closeEditModal() {
  editingEntryId = null
  clearRecordForm()
  const block = $('recordFormBlock')
  const out = $('recordOutputSection')
  const modal = $('editModal')
  if (block && out?.parentNode) {
    out.parentNode.insertBefore(block, out)
  }
  if (modal) modal.classList.add('hidden')
  const btn = $('btnSave')
  if (btn) btn.textContent = '데이터 저장 및 리스트 추가'
  setDbStatus('', false)
  document.body.style.overflow = ''
}

function handleEntryRowClick(e) {
  const tr = e.target.closest('tr')
  if (!tr?.dataset?.entryId) return
  const entry = lastLoadedEntries.find((r) => r.id === tr.dataset.entryId)
  if (entry) openEditModal(entry)
}

function handleEntryCardClick(e) {
  const card = e.target.closest('.entry-card')
  if (!card?.dataset?.entryId) return
  const entry = lastLoadedEntries.find((r) => r.id === card.dataset.entryId)
  if (entry) openEditModal(entry)
}

async function exportIncidentEntriesToExcel() {
  if (!supabase || !currentIncidentId) {
    setDbStatus('사건을 선택한 뒤 이송 기록 화면에서 다시 시도하세요.', true)
    return
  }

  setDbStatus('엑셀 파일 준비 중…', false)
  const { data, error } = await supabase
    .from('mci_casualty_entries')
    .select('*')
    .eq('incident_id', currentIncidentId)
    .order('created_at', { ascending: false })

  if (error) {
    setDbStatus(`엑셀보내기 실패: ${friendlySupabaseMessage(error)}`, true)
    return
  }
  if (!data?.length) {
    setDbStatus('저장된 사상자 데이터가 없습니다.', true)
    return
  }

  const rows = data.map((entry, i) => ({
    No: i + 1,
    성명: entry.patient_name ?? '',
    성별: entryGenderPlain(entry),
    연령: entryAgePlain(entry),
    주증상: entry.symptom ?? '',
    이송병원: entry.destination_hospital ?? '',
    중증도: entry.triage_level ?? '',
    발견지점: entry.discovery_location ?? '',
    이송수단: entry.transfer_vehicle ?? '',
    출발시간: formatTimeDisplay(entry.departure_time) || '',
    인계자: entry.provider_name ?? '',
    인계시각: formatTimeDisplay(entry.handoff_time) || '',
    이송여부: entry.transfer_status ?? '',
    등록일시: entry.created_at
      ? String(entry.created_at).replace('T', ' ').slice(0, 19)
      : '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '이송현황')

  const d = new Date()
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  const fname = `다수사상자_이송현황_${ds}.xlsx`
  XLSX.writeFile(wb, fname)
  setDbStatus(`엑셀 저장 완료: ${fname} (${data.length}건)`, false)
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

function incidentTabLabel(inc) {
  const d = inc.incident_date || ''
  const s = (inc.summary || '').trim()
  const short = s ? (s.length > 16 ? `${s.slice(0, 16)}…` : s) : '요약없음'
  return d ? `${d} · ${short}` : short
}

function renderIncidentTabs() {
  const containers = [$('incidentTabs'), $('recordIncidentTabs')]
  containers.forEach((container) => {
    if (!container) return
    container.innerHTML = ''
    if (!incidentsCache.length) {
      const span = document.createElement('span')
      span.className = 'incident-tabs-empty'
      span.textContent = '등록된 사건이 없습니다. 아래에서 사건을 생성하세요.'
      container.appendChild(span)
      return
    }
    incidentsCache.forEach((inc) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `incident-tab${inc.id === currentIncidentId ? ' active' : ''}`
      btn.setAttribute('role', 'tab')
      btn.setAttribute('aria-selected', inc.id === currentIncidentId ? 'true' : 'false')
      btn.textContent = incidentTabLabel(inc)
      btn.title = (inc.summary && inc.summary.trim()) || incidentTabLabel(inc)
      btn.addEventListener('click', () => showRecordView(inc.id))
      container.appendChild(btn)
    })
  })
  refreshIncidentDeleteSelect()
}

function refreshIncidentDeleteSelect() {
  const sel = $('incidentDeleteSelect')
  const delBtn = $('btnDeleteIncident')
  if (!sel) return

  const prev = sel.value
  sel.innerHTML = ''

  if (!incidentsCache.length) {
    const o = document.createElement('option')
    o.value = ''
    o.textContent = '삭제할 사건 없음'
    sel.appendChild(o)
    sel.disabled = true
    if (delBtn) delBtn.disabled = true
    return
  }

  sel.disabled = false
  if (delBtn) delBtn.disabled = false

  incidentsCache.forEach((inc) => {
    const o = document.createElement('option')
    o.value = inc.id
    o.textContent = incidentTabLabel(inc)
    sel.appendChild(o)
  })

  if (prev && incidentsCache.some((i) => i.id === prev)) {
    sel.value = prev
  } else if (currentIncidentId && incidentsCache.some((i) => i.id === currentIncidentId)) {
    sel.value = currentIncidentId
  }
}

async function deleteSelectedIncident() {
  if (!supabase) {
    setLandingIncidentStatus('Supabase 설정이 없습니다.', true)
    return
  }
  const sel = $('incidentDeleteSelect')
  const id = sel?.value
  if (!id || !incidentsCache.some((i) => i.id === id)) {
    setLandingIncidentStatus('삭제할 사건을 선택하세요.', true)
    return
  }

  const label = sel.options[sel.selectedIndex]?.textContent || id
  if (
    !confirm(
      `「${label}」사건을 삭제할까요?\n\n이송 기록 행은 DB에 남을 수 있습니다(incident_id만 유지).`
    )
  ) {
    return
  }

  setLandingIncidentStatus('사건 삭제 중…', false)
  const { error } = await supabase.from('mci_incidents').delete().eq('id', id)

  if (error) {
    setLandingIncidentStatus(`삭제 실패: ${friendlySupabaseMessage(error)}`, true)
    return
  }

  if (currentIncidentId === id) {
    currentIncidentId = null
  }

  await loadIncidents()
  setLandingIncidentStatus('사건을 삭제했습니다.', false)
}

async function loadIncidents() {
  if (!supabase) {
    incidentsCache = []
    renderIncidentTabs()
    setLandingIncidentStatus(
      'Supabase URL/키가 없습니다. .env 또는 Vercel 환경 변수를 확인하세요.',
      true
    )
    return
  }
  setLandingIncidentStatus('사건 목록 불러오는 중…', false)
  const { data, error } = await supabase
    .from('mci_incidents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    const hint =
      /relation|does not exist|schema cache/i.test(error.message || '')
        ? ' Supabase SQL Editor에서 supabase/mci_incidents.sql 을 실행했는지 확인하세요.'
        : ''
    setLandingIncidentStatus(`사건 목록 실패: ${friendlySupabaseMessage(error)}${hint}`, true)
    incidentsCache = []
    renderIncidentTabs()
    return
  }

  incidentsCache = data || []
  if (currentIncidentId && !incidentsCache.some((i) => i.id === currentIncidentId)) {
    currentIncidentId = null
  }
  setLandingIncidentStatus('', false)
  renderIncidentTabs()
}

async function createIncident() {
  if (!supabase) {
    setLandingIncidentStatus('Supabase 설정이 없습니다. .env 또는 Vercel 환경 변수를 확인하세요.', true)
    return
  }
  if (!val('incidentDate')) {
    setLandingIncidentStatus('사건 일자를 입력하세요.', true)
    return
  }

  const payload = {
    incident_date: val('incidentDate'),
    incident_time: normalizeTimeInput(val('incidentTime')),
    summary: val('incidentSummary') || '',
  }

  setLandingIncidentStatus('사건 저장 중…', false)
  const { data, error } = await supabase.from('mci_incidents').insert(payload).select().single()

  if (error) {
    const hint =
      /relation|does not exist|schema cache/i.test(error.message || '')
        ? ' supabase/mci_incidents.sql 실행 여부를 확인하세요.'
        : ''
    setLandingIncidentStatus(`사건 생성 실패: ${friendlySupabaseMessage(error)}${hint}`, true)
    return
  }

  currentIncidentId = data.id
  await loadIncidents()
  setLandingIncidentStatus('사건이 추가되었습니다. 위 탭을 눌러 이송 기록으로 들어가세요.', false)
}

function updateRecordContextBarFromIncident(inc) {
  const el = $('recordContextText')
  if (!el) return
  if (!inc) {
    el.textContent = currentIncidentId ? `사건 ID: ${String(currentIncidentId).slice(0, 8)}…` : '—'
    return
  }
  const dateStr = inc.incident_date || '—'
  const timeStr = formatTimeDisplay(inc.incident_time) || '—'
  const sum = (inc.summary || '').trim()
  const sumShort = sum ? (sum.length > 48 ? `${sum.slice(0, 48)}…` : sum) : '—'
  el.textContent = `${dateStr} · ${timeStr} · ${sumShort}`
}

function showRecordView(incidentId) {
  if (!incidentId) {
    setLandingIncidentStatus('사건을 먼저 생성하거나, 위 탭에서 사건을 선택하세요.', true)
    return
  }

  closeEditModal()

  currentIncidentId = incidentId
  const inc = incidentsCache.find((i) => i.id === incidentId)

  $('view-landing')?.classList.add('hidden')
  $('view-record')?.classList.remove('hidden')

  updateRecordContextBarFromIncident(inc)
  renderIncidentTabs()

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
  closeEditModal()
  $('view-record')?.classList.add('hidden')
  $('view-landing')?.classList.remove('hidden')
  loadIncidents()
}

function buildRowHtml(entry, indexFromNewest) {
  const triage = entry.triage_level || ''
  const { color, tColor } = triageStyle(triage)
  const sTime = formatTimeDisplay(entry.departure_time)
  const name = escapeHtml(entry.patient_name)
  const hosp = escapeHtml(entry.destination_hospital)
  const triageEsc = escapeHtml(triage)
  const genDisp = displayGenderForEntry(entry)
  const ageDisp = displayAgeForEntry(entry)
  const locDisp = escapeHtml((entry.discovery_location || '').trim()) || '—'
  const symptomDisp = escapeHtml((entry.symptom || '').trim()) || '—'
  const vehDisp = escapeHtml((entry.transfer_vehicle || '').trim()) || '—'

  return `
    <td data-label="No">${indexFromNewest}</td>
    <td data-label="성명">${name || '—'}</td>
    <td data-label="성별">${genDisp}</td>
    <td data-label="연령">${ageDisp}</td>
    <td data-label="주증상">${symptomDisp}</td>
    <td data-label="이송병원">${hosp || '—'}</td>
    <td data-label="중증도"><span class="status-badge" style="background:${color}; color:${tColor}">${triageEsc || '—'}</span></td>
    <td data-label="발견지점">${locDisp}</td>
    <td data-label="이송수단">${vehDisp}</td>
    <td data-label="출발시간">${escapeHtml(sTime)}</td>
  `
}

function buildMobileCardHtml(entry, indexFromNewest) {
  const triage = entry.triage_level || ''
  const { color, tColor } = triageStyle(triage)
  const sTime = formatTimeDisplay(entry.departure_time)
  const name = escapeHtml(entry.patient_name || '')
  const hosp = escapeHtml(entry.destination_hospital || '')
  const triageEsc = escapeHtml(triage || '—')
  const genDisp = displayGenderForEntry(entry)
  const ageDisp = displayAgeForEntry(entry)
  const loc = escapeHtml((entry.discovery_location || '').trim() || '—')
  const symptom = escapeHtml((entry.symptom || '').trim() || '—')
  const veh = escapeHtml((entry.transfer_vehicle || '').trim() || '—')

  const line2 = `<span class="ec-seg">${hosp || '—'}</span><span class="ec-sep">|</span><span class="ec-seg"><span class="status-badge" style="background:${color};color:${tColor}">${triageEsc}</span></span><span class="ec-sep">|</span><span class="ec-seg">${loc}</span><span class="ec-sep">|</span><span class="ec-seg">${veh}</span><span class="ec-sep">|</span><span class="ec-seg">${escapeHtml(sTime) || '—'}</span>`

  const eid = entry.id != null ? String(entry.id) : ''
  return `<div class="entry-card data-row-clickable" data-entry-id="${eid}">
    <div class="entry-card-line1"><span class="ec-no">${indexFromNewest}</span><span>${name || '—'}</span><span> · </span><span>${genDisp}</span><span> · </span><span>${ageDisp}</span><span> · </span><span class="ec-symptom">${symptom}</span></div>
    <div class="entry-card-line2">${line2}</div>
  </div>`
}

async function loadEntries() {
  if (!supabase) return
  if (!currentIncidentId) {
    setDbStatus('사건이 선택되지 않았습니다. 세이브보드에서 탭을 선택하세요.', true)
    return
  }

  setDbStatus('목록 불러오는 중…')
  const { data, error } = await supabase
    .from('mci_casualty_entries')
    .select('*')
    .eq('incident_id', currentIncidentId)
    .order('created_at', { ascending: false })

  if (error) {
    setDbStatus(`불러오기 실패: ${friendlySupabaseMessage(error)}`, true)
    return
  }

  lastLoadedEntries = data

  const tbody = $('dataTable')?.getElementsByTagName('tbody')[0]
  if (!tbody) return
  tbody.innerHTML = ''

  const cardsEl = $('entryCards')
  if (cardsEl) cardsEl.innerHTML = ''

  data.forEach((row, i) => {
    const idx = i + 1
    const tr = tbody.insertRow()
    tr.classList.add('data-row-clickable')
    if (row.id) tr.dataset.entryId = String(row.id)
    tr.innerHTML = buildRowHtml(row, idx)
    if (cardsEl) cardsEl.insertAdjacentHTML('beforeend', buildMobileCardHtml(row, idx))
  })

  setDbStatus(data.length ? `총 ${data.length}건 (이 사건)` : '이 사건에 저장된 데이터 없음')
}

async function saveEntry() {
  if (!supabase) {
    setDbStatus('Supabase 설정이 없습니다. .env 를 확인하세요.', true)
    return
  }
  if (!currentIncidentId) {
    setDbStatus('사건이 선택되지 않았습니다. ← 세이브보드에서 탭을 선택하세요.', true)
    return
  }

  const btn = $('btnSave')
  if (btn) btn.disabled = true

  const payload = {
    patient_name: val('name') || '',
    age_info: buildAgeInfoPayload(),
    patient_gender: currentSex || null,
    patient_age: val('ageInfo') || null,
    discovery_location: val('loc') || null,
    provider_name: val('provider') || null,
    handoff_time: normalizeTimeInput(val('provideTime')),
    triage_level: currentTriage || null,
    symptom: val('symptom') || null,
    transfer_status: val('transferStatus') || '미이송',
    departure_time: normalizeTimeInput(val('startTime')),
    destination_hospital: val('hospital') || null,
    transfer_vehicle: val('transferVehicle') || null,
    incident_id: currentIncidentId,
  }

  const isEdit = !!editingEntryId
  setDbStatus(isEdit ? '수정 저장 중…' : '저장 중…')

  const hintFn = (msg) => {
    const m = msg || ''
    let h = ''
    if (/patient_gender|patient_age/i.test(m) && /column|schema|does not exist/i.test(m)) {
      h += ' supabase/mci_add_patient_sex_age.sql 실행 여부를 확인하세요.'
    }
    if (/transfer_vehicle/i.test(m)) {
      h += ' supabase/mci_add_transfer_vehicle.sql 실행 여부를 확인하세요.'
    }
    return h
  }

  let error = null
  if (isEdit) {
    const res = await supabase.from('mci_casualty_entries').update(payload).eq('id', editingEntryId)
    error = res.error
  } else {
    const res = await supabase.from('mci_casualty_entries').insert(payload)
    error = res.error
  }

  if (error) {
    setDbStatus(`저장 실패: ${friendlySupabaseMessage(error)}${hintFn(error.message)}`, true)
    if (btn) btn.disabled = false
    return
  }

  if (isEdit) {
    closeEditModal()
  } else {
    clearRecordForm()
  }
  await loadEntries()
  scrollRecordOutputIntoView()
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
  document.querySelectorAll('.sex-tab').forEach((b) => {
    b.addEventListener('click', () => setSex(b.dataset.sex, b))
  })
  const saveBtn = $('btnSave')
  if (saveBtn) saveBtn.addEventListener('click', saveEntry)

  $('btnCancelEdit')?.addEventListener('click', closeEditModal)
  $('editModalBackdrop')?.addEventListener('click', closeEditModal)

  $('dataTable')?.querySelector('tbody')?.addEventListener('click', handleEntryRowClick)
  $('entryCards')?.addEventListener('click', handleEntryCardClick)

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editingEntryId && !$('editModal')?.classList.contains('hidden')) {
      closeEditModal()
    }
  })
}

function init() {
  initLandingDefaults()

  $('btnCreateIncident')?.addEventListener('click', createIncident)
  $('btnDeleteIncident')?.addEventListener('click', deleteSelectedIncident)
  $('btnExportExcel')?.addEventListener('click', exportIncidentEntriesToExcel)

  const back = $('btnBackLanding')
  if (back) back.addEventListener('click', showLandingView)

  wireRecordForm()

  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
  } else {
    supabase = null
  }

  loadIncidents()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
