import { firebaseConfig } from './firebase-config.js';
import { CATEGORIES, CATEGORY_MAP, fieldsOf, getField } from './schema.js';
import {
  esc, primaryDate, fmtDate, fmtPeriod, yearOf, yearSpan, trainingYear, daysUntil, careerMonths, fmtMonths,
  fmtNum, sumBy, tsOf, fmtValue, toCSV, download, todayStr, todayKorean,
} from './utils.js';
import { createFirebaseStore, createDemoStore } from './store.js';
import { SAMPLE_RECORDS } from './sample.js';

/* ───────────────────────── 상태 ───────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const DEFAULT_SETTINGS = { name: '', position: '', school: '', subject: '', email: '', phone: '', trainingGoal: 60, alertDays: 90, trainingCategories: ['학교 관련', '학교 외'] };
const THIS_YEAR = new Date().getFullYear();

const state = {
  user: null,
  records: [],
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  route: { view: 'dashboard', cat: null },
  search: '',
  filterYear: '',
  hospitalView: 'visits',
  growthView: 'dailylog',
  reportUnit: 'week',
  reportOffset: 0,
  filterTag: '',
  filterCat: '',
  trainingFilterCat: '',
  sort: 'desc',
  goalYear: THIS_YEAR,
  resume: { cats: CATEGORIES.filter((c) => !['dailylog', 'health', 'hospital', 'reservation'].includes(c.id)).map((c) => c.id), from: '', to: '', desc: false, profile: true },
  modal: { cat: null, record: null, fromPicker: false },
};

function getTrainingCategories() {
  const cats = state.settings?.trainingCategories;
  if (Array.isArray(cats) && cats.length > 0) return cats;
  return ['학교 관련', '학교 외'];
}

let store = null;
let unsubscribe = null;

/* ───────────────────────── 테마 (다크/라이트) ───────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('careernote-theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(saved);
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('careernote-theme', t);
  const btn = $('#btn-theme');
  if (btn) btn.textContent = t === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  applyTheme(next);
  toast(`${next === 'light' ? '라이트' : '다크'} 모드로 전환되었어요.`);
}

/* ───────────────────────── 부트 ───────────────────────── */
const isConfigured = () => firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('YOUR');

async function boot() {
  initTheme();
  bindEvents();
  renderNavCats();
  const demo = new URLSearchParams(location.search).has('demo');
  try {
    if (demo) {
      store = createDemoStore(SAMPLE_RECORDS);
    } else if (isConfigured()) {
      // Firebase CDN 로딩에 최대 6초 타임아웃 적용 (네트워크 지연 시 무한 로딩 방지)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase SDK 연결 시간이 초과되었습니다. 네트워크 연결 상태를 확인해 주세요.')), 6000)
      );
      store = await Promise.race([createFirebaseStore(firebaseConfig), timeoutPromise]);
    } else {
      return showScreen('setup');
    }
  } catch (err) {
    console.error('초기화 실패:', err);
    showScreen('setup');
    const el = $('#setup-error');
    el.innerHTML = `⚠️ <b>초기화 실패:</b> ${esc(err.message)}<br><small style="margin-top:6px;display:inline-block">우선 아래 [샘플 데이터로 미리보기] 버튼을 누르시면 로컬에서 즉시 모든 기능을 체험하실 수 있습니다.</small>`;
    el.hidden = false;
    return;
  }
  document.body.classList.toggle('is-demo', demo);
  store.onAuth((user) => (user ? onLogin(user) : onLogout()));
}

function showScreen(name) {
  ['loading', 'setup', 'login'].forEach((n) => ($(`#screen-${n}`).hidden = n !== name));
  $('#app').hidden = name !== 'app';
}

function onLogin(user) {
  state.user = user;
  state.route = parseHash();
  showScreen('app');
  renderUser();
  render();
  unsubscribe?.();
  unsubscribe = store.subscribe(
    (records) => {
      state.records = records;
      state.loaded = true;
      renderCounts();
      render();
    },
    (settings) => {
      state.settings = { ...DEFAULT_SETTINGS, ...settings };
      renderUser();
      if (state.route.view !== 'settings') render();
    },
    handleError
  );
}

function onLogout() {
  unsubscribe?.();
  unsubscribe = null;
  Object.assign(state, { user: null, records: [], loaded: false, settings: { ...DEFAULT_SETTINGS } });
  showScreen('login');
}

function handleError(err) {
  console.error(err);
  if (err?.code === 'permission-denied') toast('권한이 없어요. Firestore 보안 규칙을 확인해 주세요.', 'error');
  else toast(`오류가 발생했어요: ${err?.message || err}`, 'error');
}

/* ───────────────────────── 라우팅 ───────────────────────── */
function parseHash() {
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (view === 'c' && arg === 'health') { state.growthView = 'health'; return { view: 'category', cat: 'dailylog' }; }
  if (view === 'c' && CATEGORY_MAP[arg]) return { view: 'category', cat: arg };
  if (['dashboard', 'timeline', 'resume', 'settings', 'apps'].includes(view)) return { view, cat: null };
  return { view: 'dashboard', cat: null };
}

const PAGE_TITLES = { dashboard: '대시보드', timeline: '타임라인', resume: '이력서 출력', settings: '설정', apps: '내 웹앱' };

/* ───────────────────────── 내 웹앱 (외부 링크) ───────────────────────── */
const APPS_KEY = 'careernote.apps';
function loadApps() {
  try { const a = JSON.parse(localStorage.getItem(APPS_KEY)); return Array.isArray(a) ? a : []; } catch { return []; }
}
function saveApps(list) {
  try { localStorage.setItem(APPS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
function viewApps() {
  const apps = loadApps();
  const cards = apps.length
    ? apps.map((a, i) => `
      <div class="card" style="display:flex;align-items:center;gap:12px;justify-content:space-between">
        <a class="link" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:0">
          <strong>${esc(a.icon || '🌐')} ${esc(a.name)}</strong>
          <div class="muted sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.url)}</div>
        </a>
        <a class="btn btn-primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>
        <button class="btn btn-ghost" data-action="delete-app" data-idx="${i}" aria-label="삭제">🗑</button>
      </div>`).join('')
    : '<p class="muted">아직 등록된 웹앱이 없어요. 아래에서 추가해 보세요.</p>';
  return `
  <header class="page-head">
    <div class="ph-icon">🔗</div>
    <div class="ph-text"><h1>내 웹앱</h1><p>다른 웹앱으로 바로 이동할 수 있는 링크 모음입니다.</p></div>
  </header>
  <div class="stack">${cards}</div>
  <form class="card" id="app-form" autocomplete="off" style="margin-top:16px">
    <h2>➕ 웹앱 추가</h2>
    <div class="form-grid">
      <div class="field"><label for="app-name">이름</label><input class="input" id="app-name" name="name" required placeholder="출결 관리"></div>
      <div class="field"><label for="app-icon">아이콘 (이모지)</label><input class="input" id="app-icon" name="icon" maxlength="4" placeholder="📚"></div>
      <div class="field"><label for="app-url">주소 (URL)</label><input class="input" id="app-url" name="url" type="url" required placeholder="https://..."></div>
    </div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">추가</button></div>
  </form>`;
}

function render() {
  if (!state.user) return;
  const { view, cat } = state.route;
  $$('.nav-item').forEach((a) => {
    const active = a.dataset.view === view && (view !== 'category' || a.dataset.cat === cat);
    a.classList.toggle('active', active);
  });
  $('#page-title').textContent = view === 'category' ? (cat === 'dailylog' ? GROWTH_PAGE.name : CATEGORY_MAP[cat].name) : PAGE_TITLES[view];

  const v = $('#view');
  if (!state.loaded) { v.innerHTML = skeleton(); return; }
  const html = {
    dashboard: viewDashboard,
    timeline: viewTimeline,
    category: () => viewCategory(cat),
    resume: viewResume,
    settings: viewSettings,
    apps: viewApps,
  }[view]();
  v.innerHTML = `<div class="view-inner">${html}</div>`;
  if (view === 'dashboard') runCountUps();
}

const skeleton = () =>
  `<div class="view-inner"><div class="skel skel-hero"></div><div class="stats">${'<div class="skel skel-card"></div>'.repeat(4)}</div><div class="skel skel-block"></div></div>`;

/* ───────────────────────── 사이드바 ───────────────────────── */
function renderNavCats() {
  $('#nav-cats').innerHTML = CATEGORIES.filter((c) => !['dailylog', 'health', 'hospital', 'reservation'].includes(c.id)).map(
    (c) => `<a href="#/c/${c.id}" class="nav-item" data-view="category" data-cat="${c.id}" style="--c:${c.color}">
      <span class="ni-icon">${c.icon}</span><span class="ni-text">${c.name}</span><span class="ni-count" data-count="${c.id}">0</span></a>`
  ).join('');
}

function renderCounts() {
  CATEGORIES.forEach((c) => {
    const el = $(`[data-count="${c.id}"]`);
    if (el) el.textContent = state.records.filter((r) => r.category === c.id).length;
  });
  const growthEl = $('[data-count="growth"]');
  if (growthEl) growthEl.textContent = state.records.filter((r) => r.category === 'dailylog' || r.category === 'health').length;
  const n = expiringList().length;
  const badge = $('#nav-alert');
  badge.textContent = n;
  badge.hidden = !n;
}

function renderUser() {
  const u = state.user;
  if (!u) return;
  const name = state.settings.name || u.name || '사용자';
  $('#user-box').innerHTML = `
    <div class="ub-profile" data-action="edit-nickname" title="클릭하여 닉네임 변경">
      ${avatar(u, name)}
      <div class="ub-text"><strong>${esc(name)}</strong><span>${esc(u.email)}</span></div>
    </div>
    <button class="icon-btn" data-action="logout" title="로그아웃" aria-label="로그아웃">⏻</button>`;
}

const avatar = (u, name, cls = 'avatar') =>
  u.photo
    ? `<img class="${cls}" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="${cls}">${esc((name || '?').slice(0, 1))}</span>`;

/* ───────────────────────── 공통 헬퍼 ───────────────────────── */
const sortKey = (r) => primaryDate(r) || '';

function searchText(r) {
  return [
    CATEGORY_MAP[r.category]?.name,
    ...Object.entries(r)
      .filter(([k]) => !['id', 'createdAt', 'updatedAt', 'category'].includes(k))
      .map(([, v]) => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' || typeof v === 'number' ? v : '')),
  ].join(' ').toLowerCase();
}

function applyFilters(list) {
  const q = state.search.trim().toLowerCase();
  return list
    .filter((r) => {
      if (state.filterYear) {
        const span = yearSpan(r);
        const y = Number(state.filterYear);
        if (!span || y < span[0] || y > span[1]) return false;
      }
      if (state.filterCat && r.category !== state.filterCat) return false;
      if (state.filterTag && !(r.tags || []).includes(state.filterTag)) return false;
      if (state.trainingFilterCat && r.category === 'training') {
        const itemCat = r.trainingCategory || '학교 관련';
        if (itemCat !== state.trainingFilterCat) return false;
      }
      if (q && !searchText(r).includes(q)) return false;
      return true;
    })
    .sort((a, b) => (state.sort === 'asc' ? sortKey(a).localeCompare(sortKey(b)) : sortKey(b).localeCompare(sortKey(a))));
}

function detailText(r, c) {
  return (c.detailKeys || []).map((k) => fmtValue(getField(c, k), r[k])).filter(Boolean).join(' · ');
}

function expiringList() {
  const days = Number(state.settings.alertDays) || 90;
  return state.records
    .filter((r) => r.expiryDate)
    .map((r) => ({ r, d: daysUntil(r.expiryDate) }))
    .filter((x) => x.d <= days)
    .sort((a, b) => a.d - b.d);
}

function expiryBadge(r) {
  if (!r.expiryDate) return '';
  const d = daysUntil(r.expiryDate);
  const days = Number(state.settings.alertDays) || 90;
  if (d < 0) return `<span class="badge badge-danger">만료됨</span>`;
  if (d <= days) return `<span class="badge badge-warn">${d === 0 ? 'D-Day' : `D-${d}`}</span>`;
  return `<span class="badge badge-muted">~${fmtDate(r.expiryDate)}</span>`;
}

function visitBadge(r) {
  if (r.category === 'reservation') {
    if (r.status === '예약 완료') return `<span class="badge badge-muted">✅ 예약 완료${r.bookedDate ? ' ' + fmtDate(r.bookedDate) : ''}</span>`;
    const d = daysUntil(r.date);
    if (d < 0) return `<span class="badge badge-danger">예약 필요 · ${-d}일 지남</span>`;
    return `<span class="badge badge-visit">예약 필요 · ${d === 0 ? '오늘' : `D-${d}`}</span>`;
  }
  if (r.category !== 'hospital' || !r.nextVisit) return '';
  const d = daysUntil(r.nextVisit);
  if (d < 0) return '';
  return `<span class="badge badge-visit">🗓 다음 예약 ${d === 0 ? 'D-Day' : `D-${d}`} · ${fmtDate(r.nextVisit)}${r.nextTime ? ' ' + esc(r.nextTime) : ''}</span>`;
}

function upcomingVisits() {
  const visits = state.records
    .filter((r) => r.category === 'hospital' && r.nextVisit && daysUntil(r.nextVisit) >= 0)
    .map((r) => ({ r, d: daysUntil(r.nextVisit), sub: `${fmtDate(r.nextVisit)}${r.nextTime ? ' ' + r.nextTime : ''}${r.department ? ' · ' + r.department : ''}` }));
  const needed = state.records
    .filter((r) => r.category === 'reservation' && r.status !== '예약 완료' && r.date)
    .map((r) => ({ r, d: daysUntil(r.date), sub: `예약 필요 · ${fmtDate(r.date)}${r.reason ? ' · ' + r.reason : ''}` }));
  return [...visits, ...needed].sort((a, b) => a.d - b.d);
}

const catPill = (c) => `<span class="cat-pill" style="--c:${c.color}">${c.icon} ${c.name}</span>`;

/* ───────────────────────── 대시보드 ───────────────────────── */
function viewDashboard() {
  const R = state.records;
  const s = state.settings;
  const name = s.name || state.user.name;
  const months = careerMonths(R.filter((r) => r.category === 'career'));
  const tr = R.filter((r) => r.category === 'training');
  const gy = state.goalYear;
  const trY = tr.filter((r) => trainingYear(r) === gy);
  const hours = sumBy(trY, 'hours');
  const credits = sumBy(trY, 'credits');
  const goal = Number(s.trainingGoal) || 0;
  const pct = goal ? Math.min(100, Math.round((hours / goal) * 100)) : 0;
  const C = 2 * Math.PI * 52;
  const thisYearHours = sumBy(tr.filter((r) => trainingYear(r) === THIS_YEAR), 'hours');
  const years = [4, 3, 2, 1, 0].map((i) => gy - i);
  const yh = years.map((y) => sumBy(tr.filter((r) => trainingYear(r) === y), 'hours'));
  const maxH = Math.max(goal, ...yh, 1);
  const exp = expiringList();
  const visits = upcomingVisits();
  const recent = [...R].sort((a, b) => tsOf(b.updatedAt) - tsOf(a.updatedAt)).slice(0, 6);
  const thisYearCount = R.filter((r) => yearOf(r) === THIS_YEAR).length;
  const awards = R.filter((r) => r.category === 'award').length;

  const stat = (icon, label, value, unit, color, countUp = true) => `
    <article class="stat-card" style="--c:${color}">
      <span class="stat-icon">${icon}</span>
      <p class="stat-label">${label}</p>
      <p class="stat-value">${countUp ? `<span data-countup="${value}">0</span>` : esc(value)}<small>${unit}</small></p>
    </article>`;

  return `
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">${todayKorean()}</p>
      <h1>안녕하세요, <span class="grad-text">${esc(name ? `${name} ` : '')}선생님</span> 👋</h1>
      <p class="hero-sub">지금까지 <b>${R.length}건</b>의 이력을 기록했어요. 올해 새로 쌓은 이력은 <b>${thisYearCount}건</b>입니다.</p>
    </div>
    <button class="btn btn-primary btn-lg" data-action="add">＋ 새 이력 기록</button>
  </section>

  <section class="stats">
    ${stat('📁', '전체 이력', R.length, '건', '#a78bfa')}
    ${stat('💼', '총 경력', fmtMonths(months), '', '#60a5fa', false)}
    ${stat('📚', `${THIS_YEAR}년 연수`, Math.round(thisYearHours * 10) / 10, '시간', '#34d399')}
    ${stat('🏆', '수상', awards, '건', '#fbbf24')}
  </section>

  <section class="dash-grid">
    <article class="card goal-card">
      <header class="card-head">
        <h2>🎯 연간 연수 목표</h2>
        <div class="year-switch">
          <button class="icon-btn sm" data-action="goal-prev" aria-label="이전 연도">‹</button>
          <span>${gy}</span>
          <button class="icon-btn sm" data-action="goal-next" aria-label="다음 연도">›</button>
        </div>
      </header>
      <div class="goal-body">
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs>
            <circle class="ring-bg" cx="60" cy="60" r="52"/>
            <circle class="ring-fg" cx="60" cy="60" r="52" style="--len:${C};--off:${C * (1 - pct / 100)}"/>
          </svg>
          <div class="ring-label"><strong>${pct}%</strong><span>${fmtNum(hours)} / ${fmtNum(goal)}시간</span></div>
        </div>
        <ul class="goal-stats">
          <li><span>이수 시간</span><b>${fmtNum(hours)}시간</b></li>
          <li><span>취득 학점</span><b>${fmtNum(credits)}학점</b></li>
          <li><span>연수 건수</span><b>${trY.length}건</b></li>
          <li><span>남은 시간</span><b class="${hours >= goal ? 'ok' : ''}">${hours >= goal ? '달성 🎉' : `${fmtNum(goal - hours)}시간`}</b></li>
        </ul>
      </div>
      <div class="bars" style="--goal:${(goal / maxH) * 100}">
        ${goal ? '<div class="bars-goal"><span>목표</span></div>' : ''}
        ${years.map((y, i) => `
          <div class="bar ${y === gy ? 'current' : ''}">
            <span class="bar-val">${fmtNum(yh[i])}</span>
            <div class="bar-track"><div class="bar-fill" style="--h:${(yh[i] / maxH) * 100}%"></div></div>
            <span class="bar-year">${y}</span>
          </div>`).join('')}
      </div>
    </article>

    <article class="card alert-card">
      <header class="card-head">
        <h2>⏰ 만료 알림</h2>
        <span class="muted sm">${Number(s.alertDays) || 90}일 이내</span>
      </header>
      ${exp.length ? `<ul class="alert-list">${exp.map(({ r, d }) => {
        const c = CATEGORY_MAP[r.category];
        return `<li class="${d < 0 ? 'expired' : 'soon'}" data-action="edit" data-id="${r.id}">
          <span class="al-icon">${c?.icon || '📌'}</span>
          <div class="al-text"><b>${esc(r.title)}</b><small>${fmtDate(r.expiryDate)} ${d < 0 ? '만료됨' : '만료 예정'}</small></div>
          <span class="dday">${d < 0 ? `+${-d}일` : d === 0 ? 'D-Day' : `D-${d}`}</span></li>`;
      }).join('')}</ul>` : `<div class="empty-mini"><span>✅</span>다가오는 만료 일정이 없어요</div>`}
      <p class="hint">자격증·어학 성적에 만료일을 입력하면 자동으로 알려드려요.</p>
    </article>

    <article class="card alert-card visit-card">
      <header class="card-head">
        <h2>📅 병원 예약</h2>
        <a class="muted sm" href="#/c/hospital" data-action="hospital-view" data-view="reservations">전체 보기</a>
      </header>
      ${visits.length ? `<ul class="alert-list">${visits.map(({ r, d, sub }) => `<li class="visit ${d < 0 ? 'expired' : ''}" data-action="edit" data-id="${r.id}">
          <span class="al-icon">${r.category === 'reservation' ? '📅' : '🏥'}</span>
          <div class="al-text"><b>${esc(r.title)}</b><small>${esc(sub)}</small></div>
          <span class="dday">${d < 0 ? `+${-d}일` : d === 0 ? 'D-Day' : `D-${d}`}</span></li>`).join('')}</ul>` : `<div class="empty-mini"><span>🩺</span>예정된 병원 예약이 없어요</div>`}
    </article>
  </section>

  <section>
    <h2 class="section-title">카테고리</h2>
    <div class="cat-grid">
      ${CATEGORIES.map((c) => {
        const list = R.filter((r) => r.category === c.id).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
        return `<a class="cat-card" href="#/c/${c.id}" style="--c:${c.color}">
          <div class="cc-top"><span class="cc-icon">${c.icon}</span><strong class="cc-count">${list.length}</strong></div>
          <span class="cc-name">${c.name}</span>
          <p class="cc-latest">${list[0] ? esc(list[0].title) : '아직 기록이 없어요'}</p></a>`;
      }).join('')}
    </div>
  </section>

  <section class="card">
    <header class="card-head"><h2>🕘 최근 기록</h2><a class="link" href="#/timeline">타임라인 보기 →</a></header>
    ${recent.length ? `<ul class="recent-list">${recent.map((r) => {
      const c = CATEGORY_MAP[r.category];
      if (!c) return '';
      return `<li data-action="edit" data-id="${r.id}">${catPill(c)}<b>${esc(recTitle(r))}</b><time>${esc(fmtPeriod(r))}</time></li>`;
    }).join('')}</ul>` : `<div class="empty-mini"><span>🌱</span>첫 이력을 기록해 보세요</div>`}
  </section>`;
}

function runCountUps() {
  $$('[data-countup]').forEach((el) => {
    const to = Number(el.dataset.countup) || 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(to * e);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmtNum(to);
    };
    requestAnimationFrame(tick);
  });
}

/* ───────────────────────── 필터 바 ───────────────────────── */
function filterBar(scope, { csvCat = '', showCat = false, extra = '' } = {}) {
  const years = new Set();
  scope.forEach((r) => {
    const sp = yearSpan(r);
    if (sp) for (let y = sp[0]; y <= sp[1]; y++) years.add(y);
  });
  const tags = [...new Set(scope.flatMap((r) => r.tags || []))].sort();
  const active = state.filterYear || state.filterTag || state.filterCat || state.search;
  return `
  <div class="filter-bar">
    <div class="filter-row">
      ${showCat ? `<select id="f-cat" class="select" aria-label="구분 필터"><option value="">전체 구분</option>
        ${CATEGORIES.map((c) => `<option value="${c.id}" ${state.filterCat === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>` : ''}
      <select id="f-year" class="select" aria-label="연도 필터"><option value="">전체 연도</option>
        ${[...years].sort((a, b) => b - a).map((y) => `<option value="${y}" ${state.filterYear === String(y) ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      <select id="f-sort" class="select" aria-label="정렬">
        <option value="desc" ${state.sort === 'desc' ? 'selected' : ''}>최신순</option>
        <option value="asc" ${state.sort === 'asc' ? 'selected' : ''}>오래된순</option>
      </select>
      ${extra}
      ${active ? '<button class="btn btn-ghost sm" data-action="reset-filters">필터 초기화</button>' : ''}
      <span class="spacer"></span>
      <button class="btn btn-ghost sm" data-action="csv" data-cat="${csvCat}" id="btn-csv">⬇ CSV 내보내기</button>
    </div>
    ${tags.length ? `<div class="tag-row">${tags.map((t) => `<button class="chip ${state.filterTag === t ? 'active' : ''}" data-action="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
  </div>`;
}

/* ───────────────────────── 카테고리 ───────────────────────── */
function categorySummary(c, scope) {
  if (c.id === 'career') return ` · 총 경력 <b>${fmtMonths(careerMonths(scope))}</b>`;
  if (c.id === 'training') return ` · 누적 <b>${fmtNum(sumBy(scope, 'hours'))}시간 / ${fmtNum(sumBy(scope, 'credits'))}학점</b>`;
  if (c.id === 'volunteer') return ` · 누적 <b>${fmtNum(sumBy(scope, 'hours'))}시간</b>`;
  return '';
}

const GROWTH_PAGE = { name: '성장 건강', icon: '🌿', color: '#10b981', desc: '실천과 배움, 운동 · 영양제 · 음주 등 건강 기록' };

function growthToggle(active) {
  const n = (id) => state.records.filter((r) => r.category === id).length;
  return `<div class="view-toggle" role="tablist">
      <button type="button" class="vt-btn ${active === 'dailylog' ? 'active' : ''}" data-action="growth-view" data-view="dailylog">🌱 성장일지 <span>${n('dailylog')}</span></button>
      <button type="button" class="vt-btn ${active === 'health' ? 'active' : ''}" data-action="growth-view" data-view="health">💪 건강 <span>${n('health')}</span></button>
      <button type="button" class="vt-btn ${active === 'report' ? 'active' : ''}" data-action="growth-view" data-view="report">📊 리포트</button>
    </div>`;
}

/* ───────────────────────── 성장 건강 리포트 (주간 / 월간) ───────────────────────── */
const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const DOW = ['월', '화', '수', '목', '금', '토', '일'];

function reportRange(unit, offset) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let start; let end; let label;
  if (unit === 'week') {
    start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    end = new Date(start); end.setDate(start.getDate() + 6);
    label = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
  }
  return { start: ymdOf(start), end: ymdOf(end), startD: start, endD: end, label };
}

const isDryValue = (v = '') => /금주|무음주|안\s*마|없|0\s*(잔|병|캔)?$/.test(String(v));
const isDrinkName = (n = '') => /음주|술|맥주|소주|와인|금주/.test(n);

function reportStats(start, end) {
  const inRange = (r) => r.date && r.date >= start && r.date <= end;
  const g = state.records.filter((r) => r.category === 'dailylog' && inRange(r));
  const h = state.records.filter((r) => r.category === 'health' && inRange(r));
  const byItem = new Map();
  const byDay = new Map();
  let total = 0;
  g.forEach((r) => growthMinutesOf(r).forEach((v, k) => {
    byItem.set(k, (byItem.get(k) || 0) + v);
    byDay.set(r.date, (byDay.get(r.date) || 0) + v);
    total += v;
  }));
  const healthDays = new Map(); // 항목명 → 기록한 날짜 Set
  const drink = { drink: new Set(), dry: new Set() };
  h.forEach((r) => (Array.isArray(r.healthItems) ? r.healthItems : []).forEach((it) => {
    if (!it?.name || !it.value) return;
    if (isDrinkName(it.name)) {
      (isDryValue(it.value) ? drink.dry : drink.drink).add(r.date);
      return;
    }
    if (!healthDays.has(it.name)) healthDays.set(it.name, new Set());
    healthDays.get(it.name).add(r.date);
  }));
  return {
    g, h, total, byItem, byDay, healthDays, drink,
    gDays: new Set(g.map((r) => r.date)),
    hDays: new Set(h.map((r) => r.date)),
  };
}

function viewGrowthReport() {
  const unit = state.reportUnit;
  const off = Math.min(0, state.reportOffset);
  const range = reportRange(unit, off);
  const prev = reportRange(unit, off - 1);
  const s = reportStats(range.start, range.end);
  const p = reportStats(prev.start, prev.end);
  const today = todayStr();
  const lastDay = range.end < today ? range.end : today;
  const elapsed = Math.max(1, Math.round((new Date(lastDay) - new Date(range.start)) / 86400000) + 1);
  const unitName = unit === 'week' ? '지난주' : '지난달';

  const delta = s.total - p.total;
  const deltaHTML = p.total || s.total
    ? `<small class="rp-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${unitName} 대비 ${delta === 0 ? '변화 없음' : `${delta > 0 ? '▲' : '▼'} ${fmtMinutes(Math.abs(delta))}`}</small>`
    : '';
  const avg = s.gDays.size ? Math.round(s.total / s.gDays.size) : 0;

  const items = [...s.byItem.entries()].sort((a, b) => b[1] - a[1]);
  const maxItem = items[0]?.[1] || 1;
  const itemBars = items.length
    ? items.map(([name, m]) => `
      <div class="rp-row"><span class="rp-name">${growthIconByName(name)} ${esc(name)}</span>
        <div class="rp-bar"><i style="width:${Math.max(4, (m / maxItem) * 100)}%"></i></div>
        <span class="rp-val">${fmtMinutes(m)} <em>${s.total ? Math.round((m / s.total) * 100) : 0}%</em></span></div>`).join('')
    : '<p class="rp-empty">이 기간에 시간이 기록된 성장 항목이 없어요.</p>';

  // 주간: 요일별 막대 / 월간: 주차별 표
  let trendHTML = '';
  if (unit === 'week') {
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(range.startD); d.setDate(d.getDate() + i);
      const key = ymdOf(d);
      return { key, label: DOW[i], m: s.byDay.get(key) || 0, health: s.hDays.has(key), future: key > today };
    });
    const maxDay = Math.max(1, ...days.map((d) => d.m));
    trendHTML = `<div class="rp-days">${days.map((d) => `
      <div class="rp-day ${d.future ? 'future' : ''}">
        <span class="rp-day-val">${d.m ? fmtMinutes(d.m) : ''}</span>
        <div class="rp-day-bar"><i style="height:${d.m ? Math.max(6, (d.m / maxDay) * 100) : 0}%"></i></div>
        <b>${d.label}</b><span class="rp-day-h">${d.health ? '💪' : ''}</span>
      </div>`).join('')}</div>`;
  } else {
    const rows = [];
    const cur = new Date(range.startD);
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
    while (cur <= range.endD) {
      const ws = new Date(cur); const we = new Date(cur); we.setDate(we.getDate() + 6);
      const a = ymdOf(ws) < range.start ? range.start : ymdOf(ws);
      const b = ymdOf(we) > range.end ? range.end : ymdOf(we);
      const ws2 = reportStats(a, b);
      rows.push(`<tr><td>${Number(a.slice(5, 7))}/${Number(a.slice(8))} ~ ${Number(b.slice(5, 7))}/${Number(b.slice(8))}</td>
        <td><b>${ws2.total ? fmtMinutes(ws2.total) : '-'}</b></td><td>${ws2.gDays.size}일</td><td>${ws2.hDays.size}일</td></tr>`);
      cur.setDate(cur.getDate() + 7);
    }
    trendHTML = `<table class="rp-table"><thead><tr><th>주차</th><th>노력 시간</th><th>성장 기록</th><th>건강 기록</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  const hRows = [...s.healthDays.entries()].sort((a, b) => b[1].size - a[1].size).map(([name, set]) => `
    <div class="rp-row"><span class="rp-name">${healthItemIcon(name)} ${esc(name)}</span>
      <div class="rp-bar health"><i style="width:${Math.max(4, (set.size / elapsed) * 100)}%"></i></div>
      <span class="rp-val">${set.size}일 <em>${Math.round((set.size / elapsed) * 100)}%</em></span></div>`);
  if (s.drink.drink.size || s.drink.dry.size) {
    hRows.push(`<div class="rp-row"><span class="rp-name">🍺 음주</span>
      <div class="rp-bar health warn"><i style="width:${Math.max(4, (s.drink.drink.size / elapsed) * 100)}%"></i></div>
      <span class="rp-val">${s.drink.drink.size}일 음주 · ${s.drink.dry.size}일 금주</span></div>`);
  }
  const healthHTML = hRows.length ? hRows.join('') : '<p class="rp-empty">이 기간에 건강 항목 기록이 없어요.</p>';

  const highlights = [...s.g].filter((r) => r.title || r.desc).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const hlHTML = highlights.length
    ? `<ul class="rp-hl">${highlights.map((r) => `<li data-action="edit" data-id="${r.id}"><time>${esc(fmtDate(r.date))}</time><div><b>${esc(recTitle(r))}</b>${r.desc ? `<p>${esc(r.desc)}</p>` : ''}</div></li>`).join('')}</ul>`
    : '';

  const empty = !s.g.length && !s.h.length;
  return `
  <header class="page-head" style="--c:${GROWTH_PAGE.color}">
    <div class="ph-icon">${GROWTH_PAGE.icon}</div>
    <div class="ph-text"><h1>${GROWTH_PAGE.name}</h1><p>${GROWTH_PAGE.desc}</p></div>
  </header>
  <div class="rp-controls">
    ${growthToggle('report')}
    <div class="view-toggle">
      <button type="button" class="vt-btn ${unit === 'week' ? 'active' : ''}" data-action="report-unit" data-unit="week">주간</button>
      <button type="button" class="vt-btn ${unit === 'month' ? 'active' : ''}" data-action="report-unit" data-unit="month">월간</button>
    </div>
    <div class="rp-nav">
      <button type="button" class="icon-btn sm" data-action="report-nav" data-dir="-1" aria-label="이전">‹</button>
      <b>${range.label}</b>
      <button type="button" class="icon-btn sm" data-action="report-nav" data-dir="1" aria-label="다음" ${off >= 0 ? 'disabled' : ''}>›</button>
      ${off < 0 ? `<button type="button" class="btn btn-ghost sm" data-action="report-nav" data-dir="0">${unit === 'week' ? '이번 주' : '이번 달'}</button>` : ''}
    </div>
  </div>
  <div class="rp-summary">
    <div class="rp-card"><span>총 노력 시간</span><b>${s.total ? fmtMinutes(s.total) : '0분'}</b>${deltaHTML}</div>
    <div class="rp-card"><span>하루 평균</span><b>${avg ? fmtMinutes(avg) : '-'}</b><small>기록한 날 기준</small></div>
    <div class="rp-card"><span>🌱 성장 기록일</span><b>${s.gDays.size}일</b><small>${s.g.length}건</small></div>
    <div class="rp-card"><span>💪 건강 기록일</span><b>${s.hDays.size}일</b><small>${s.h.length}건</small></div>
  </div>
  ${empty ? `<div class="empty"><div class="empty-icon">📊</div><h3>이 기간에는 기록이 없어요</h3><p>성장일지나 건강 기록을 추가하면 리포트가 자동으로 만들어져요.</p></div>` : `
  <div class="rp-grid">
    <section class="card rp-sec"><h2>🌱 성장 — 항목별 시간</h2>${itemBars}</section>
    <section class="card rp-sec"><h2>${unit === 'week' ? '📅 요일별 노력 시간' : '🗓 주차별 요약'}</h2>${trendHTML}</section>
    <section class="card rp-sec"><h2>💪 건강 — 항목별 실천일</h2>${healthHTML}</section>
    ${hlHTML ? `<section class="card rp-sec"><h2>✨ 이 기간의 기록</h2>${hlHTML}</section>` : ''}
  </div>`}`;
}

function viewCategory(pageCat) {
  const isHospital = pageCat === 'hospital';
  const isGrowth = pageCat === 'dailylog';
  const growthView = isGrowth ? state.growthView : '';
  if (isGrowth && growthView === 'report') return viewGrowthReport();
  const catId = isHospital && state.hospitalView === 'reservations' ? 'reservation'
    : isGrowth && growthView === 'health' ? 'health'
    : pageCat;
  const c = CATEGORY_MAP[catId];
  const hc = isGrowth ? GROWTH_PAGE : CATEGORY_MAP[pageCat];
  const allInCat = state.records.filter((r) => r.category === catId);
  const countOf = (id) => state.records.filter((r) => r.category === id).length;
  const hospitalToggle = isHospital
    ? `<div class="view-toggle" role="tablist">
        <button type="button" class="vt-btn ${catId === 'hospital' ? 'active' : ''}" data-action="hospital-view" data-view="visits">방문 기록 <span>${countOf('hospital')}</span></button>
        <button type="button" class="vt-btn ${catId === 'reservation' ? 'active' : ''}" data-action="hospital-view" data-view="reservations">예약 <span>${countOf('reservation')}</span></button>
      </div>`
    : isGrowth ? growthToggle(catId)
    : '';
  const isTraining = catId === 'training';
  const scope = isTraining && state.trainingFilterCat
    ? allInCat.filter((r) => (r.trainingCategory || '학교 관련') === state.trainingFilterCat)
    : allInCat;
  const list = applyFilters(scope);

  let subcatBarHTML = '';
  if (isTraining) {
    const cats = getTrainingCategories();
    subcatBarHTML = `
      <div class="subcat-bar">
        <div class="subcat-tabs">
          <button type="button" class="subcat-tab ${!state.trainingFilterCat ? 'active' : ''}" data-action="training-subcat" data-subcat="">
            전체 <span class="subcat-count">${allInCat.length}</span>
          </button>
          ${cats.map((catName) => {
            const cnt = allInCat.filter((r) => (r.trainingCategory || '학교 관련') === catName).length;
            const icon = catName === '학교 관련' ? '🏫' : (catName === '학교 외' ? '🌐' : '🏷️');
            return `
              <button type="button" class="subcat-tab ${state.trainingFilterCat === catName ? 'active' : ''}" data-action="training-subcat" data-subcat="${esc(catName)}">
                ${icon} ${esc(catName)} <span class="subcat-count">${cnt}</span>
              </button>
            `;
          }).join('')}
        </div>
        <button type="button" class="btn btn-ghost sm subcat-manage-btn" data-action="manage-training-cats" title="연수 분류 추가 및 삭제">
          ⚙️ 분류 관리
        </button>
      </div>
    `;
  }

  const countDesc = isTraining && state.trainingFilterCat
    ? `[${esc(state.trainingFilterCat)}] <b>${scope.length}건</b> (전체 ${allInCat.length}건)`
    : `총 <b>${scope.length}건</b>`;

  return `
  <header class="page-head" style="--c:${hc.color}">
    <div class="ph-icon">${hc.icon}</div>
    <div class="ph-text"><h1>${hc.name}</h1><p>${hc.desc} · ${countDesc}${categorySummary(c, scope)}</p></div>
    <div class="ph-actions" style="display:flex;gap:8px;align-items:center;">
      ${isTraining ? `<button class="btn btn-ghost" data-action="upload-excel" title="나이스(NEIS) 또는 교육연수원 엑셀 파일 바로 불러오기">📊 엑셀 가져오기</button>` : ''}
      <button class="btn btn-primary" data-action="add" data-cat="${c.id}">＋ ${c.name} 추가</button>
    </div>
  </header>
  ${subcatBarHTML}
  ${scope.length || isHospital || isGrowth ? filterBar(scope, { csvCat: c.id, extra: hospitalToggle }) : ''}
  ${list.length ? `<div class="record-grid">${list.map(recordCard).join('')}</div>` : emptyState(c, scope.length)}`;
}

function healthItemIcon(name = '') {
  const n = String(name).trim();
  if (n.includes('운동') || n.includes('헬스') || n.includes('러닝') || n.includes('조깅') || n.includes('걷기') || n.includes('수영')) return '🏃';
  if (n.includes('영양제') || n.includes('비타민') || n.includes('약') || n.includes('유산균') || n.includes('오메가')) return '💊';
  if (n.includes('음주') || n.includes('술') || n.includes('맥주') || n.includes('소주') || n.includes('와인') || n.includes('금주')) return '🍺';
  if (n.includes('수면') || n.includes('잠') || n.includes('취침')) return '💤';
  if (n.includes('식단') || n.includes('식사') || n.includes('밥') || n.includes('칼로리')) return '🥗';
  if (n.includes('물') || n.includes('수분')) return '💧';
  if (n.includes('몸무게') || n.includes('체중') || n.includes('인바디')) return '⚖️';
  if (n.includes('혈압') || n.includes('혈당')) return '🩺';
  if (n.includes('스트레칭') || n.includes('요가')) return '🧘';
  return '✨';
}

function getHealthPlaceholder(name = '') {
  const n = String(name).trim();
  if (n.includes('운동')) return '예: 조깅 30분, 헬스 가슴 5세트, 만보 걷기 등';
  if (n.includes('영양제')) return '예: 종합비타민, 오메가3, 유산균, 루테인 복용 등';
  if (n.includes('음주')) return '예: 금주(무음주), 맥주 1캔, 와인 2잔 등';
  if (n.includes('수면')) return '예: 7시간 숙면, 밤 11시 취침 등';
  if (n.includes('식단')) return '예: 샐러드 점심, 과식 안 함, 단백질 위주 등';
  if (n.includes('물')) return '예: 1.5L 섭취 등';
  if (n.includes('몸무게')) return '예: 68.5kg 등';
  return '내용을 입력하세요';
}

/* ───────────────────────── 성장 항목 ───────────────────────── */
const GROWTH_DEFAULT_ITEMS = ['독서', '수업 연구', '연수·강의'];
/** 새 기록을 열 때 기본으로 나오는 성장 항목 — 사용자가 저장한 값이 있으면 그것을, 없으면 처음 구성을 사용 */
function getGrowthDefaults() {
  const saved = state.settings?.growthDefaultItems;
  const list = Array.isArray(saved)
    ? saved.filter((it) => it && String(it.name || '').trim()).map((it) => ({ name: String(it.name).trim(), ...(it.icon ? { icon: it.icon } : {}) }))
    : null;
  // 저장된 값이 없으면(null) 처음 구성. 저장된 빈 목록은 "기본 항목 없음"으로 존중
  return Array.isArray(saved) ? list : GROWTH_DEFAULT_ITEMS.map((name) => ({ name }));
}

const GROWTH_SUGGESTIONS = ['독서', '수업 연구', '연수·강의', '자격증 공부', '영어', '글쓰기', '에듀테크', '연구회·나눔', '영상 시청', '팟캐스트', '자기계발'];

// 위에서부터 먼저 맞는 규칙이 적용돼요. 구체적인 단어(영어, 영상 등)를 앞에 둡니다.
const GROWTH_ICON_RULES = [
  [/영어|외국어|회화|일본어|중국어|토익|토플/, '🔤'],
  [/영상|동영상|유튜브|youtube|강연|ted|다큐|영화|시청/i, '🎬'],
  [/팟캐스트|오디오북|오디오|라디오|듣기/, '🎧'],
  [/독서|책|칼럼|논문|읽기|필사|도서/, '📚'],
  [/연구회|나눔|협의|멘토|동료|토론|스터디|모임|공동체/, '🤝'],
  [/에듀테크|ai|코딩|디지털|프로그램|프로그래밍|엑셀|ppt|앱|웹|컴퓨터/i, '💻'],
  [/수업|교재|교육과정|평가|교안|지도안|학습지/, '🧑‍🏫'],
  [/연수|강의|수강|세미나|워크숍|워크샵|특강|온라인 강좌/, '🎓'],
  [/자격|시험|임용|검정|기출|문제/, '📝'],
  [/글쓰기|블로그|집필|기록|일기|성찰|저널/, '✍️'],
  [/연구|분석|실험|조사|통계|데이터/, '🔬'],
  [/수학|계산|연산/, '🔢'],
  [/과학/, '🧪'],
  [/미술|그림|디자인|만들기|공예/, '🎨'],
  [/음악|악기|노래|피아노|기타|합창/, '🎵'],
  [/체육|운동|스포츠|걷기|달리기/, '🏃'],
  [/사진|촬영|편집/, '📷'],
  [/상담|코칭|대화|면담/, '💬'],
  [/명상|마음|심리|힐링|휴식/, '🧘'],
  [/봉사|나눔활동|기부/, '🙌'],
  [/여행|답사|견학|체험|현장/, '🧭'],
  [/업무|행정|정리|문서|공문/, '🗂️'],
  [/자기계발|계발|성장|습관|목표/, '🚀'],
  [/공부|학습|복습|예습/, '📖'],
];

function growthItemIcon(name = '') {
  const n = String(name).trim();
  if (!n) return '🌱';
  for (const [re, icon] of GROWTH_ICON_RULES) if (re.test(n)) return icon;
  return '🌱';
}

/** 직접 고를 수 있는 아이콘 50개 (이력·성장 기록용) */
const GROWTH_ICON_CHOICES = [
  '📚', '📖', '📝', '✍️', '🧑‍🏫', '🎓', '🏫', '💻', '🤖', '🎬',
  '🎧', '🎤', '🔬', '🧪', '🔢', '🌏', '🔤', '🎨', '🎵', '🏃',
  '🧘', '💬', '🤝', '👥', '🧭', '🗂️', '📊', '📈', '🏆', '🥇',
  '🎯', '💡', '🚀', '🌱', '🧠', '📷', '🛠️', '📅', '⏰', '📌',
  '📎', '🏅', '📜', '🔖', '🙌', '❤️', '⭐', '🔥', '🧩', '🗣️',
];

/** 직접 고른 아이콘이 있으면 그것을, 없으면 이름으로 자동 선택 */
function growthIconOf(it = {}) {
  return it.icon || growthItemIcon(it.name);
}

/** 항목명 → 직접 고른 아이콘 (최근 기록 우선). 리포트처럼 이름만 아는 곳에서 사용 */
function growthIconByName(name = '') {
  const recs = state.records || [];
  for (let i = recs.length - 1; i >= 0; i--) {
    const items = recs[i]?.category === 'dailylog' && Array.isArray(recs[i].growthItems) ? recs[i].growthItems : [];
    const hit = items.find((it) => it && it.icon && it.name === name);
    if (hit) return hit.icon;
  }
  return growthItemIcon(name);
}

/* 아이콘 선택 팝오버 (모듈 전역 1개) */
let iconPop = null;
let iconPopBtn = null;
let iconPopBound = false;

function closeIconPicker() {
  iconPop?.remove();
  iconPop = null;
  iconPopBtn = null;
}

function openIconPicker(btn) {
  closeIconPicker();
  if (!iconPopBound) {
    iconPopBound = true;
    document.addEventListener('click', (e) => {
      if (iconPop && !iconPop.contains(e.target) && !e.target.closest('.hir-icon-btn')) closeIconPicker();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && iconPop) { e.stopPropagation(); closeIconPicker(); }
    }, true);
    document.addEventListener('scroll', () => closeIconPicker(), true);
    window.addEventListener('resize', closeIconPicker);
  }
  const current = btn.dataset.icon || '';
  iconPopBtn = btn;
  iconPop = document.createElement('div');
  iconPop.className = 'icon-pop';
  iconPop.setAttribute('role', 'dialog');
  iconPop.setAttribute('aria-label', '아이콘 선택');
  iconPop.innerHTML = `
    <button type="button" class="icon-pop-auto ${current ? '' : 'on'}">✨ 자동 (제목에 맞게)</button>
    <div class="icon-pop-grid">${GROWTH_ICON_CHOICES.map((ic) =>
      `<button type="button" class="icon-pop-item ${ic === current ? 'on' : ''}" data-ic="${ic}" aria-label="${ic}">${ic}</button>`).join('')}</div>`;
  iconPop.addEventListener('click', (e) => {
    const auto = e.target.closest('.icon-pop-auto');
    const item = e.target.closest('.icon-pop-item');
    if (!auto && !item) return;
    const b = iconPopBtn;
    if (!b) return;
    if (auto) {
      b.dataset.icon = '';
      const name = b.closest('.health-item-row')?.querySelector('.hir-name-input')?.value || '';
      b.textContent = growthItemIcon(name);
    } else {
      b.dataset.icon = item.dataset.ic;
      b.textContent = item.dataset.ic;
    }
    closeIconPicker();
    b.focus();
  });
  document.body.appendChild(iconPop);
  const r = btn.getBoundingClientRect();
  const w = iconPop.offsetWidth;
  const h = iconPop.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  iconPop.style.left = `${left}px`;
  iconPop.style.top = `${top}px`;
}

function getGrowthPlaceholder(name = '') {
  const n = String(name).trim();
  if (/독서|책/.test(n)) return '예: 교육 칼럼 2편, 「수업 설계」 3장';
  if (/수업/.test(n)) return '예: 사회과 프로젝트 수업안 1차시 구상';
  if (/연수|강의/.test(n)) return '예: AI 디지털교과서 직무연수 3강';
  if (/자격|시험/.test(n)) return '예: 한국사능력검정 기출 1회분';
  if (/영어/.test(n)) return '예: 영어 회화 20분, 단어 30개';
  if (/글쓰기|블로그/.test(n)) return '예: 수업 성찰 일지 작성';
  if (/영상|유튜브|강연|다큐/.test(n)) return '예: 수업 혁신 사례 강연 영상 시청';
  if (/팟캐스트|오디오|듣기/.test(n)) return '예: 교육 팟캐스트 1편 청취';
  if (/에듀테크|AI|코딩|디지털/i.test(n)) return '예: 생성형 AI 활용 수업 자료 만들기';
  if (/연구회|나눔|토론|스터디/.test(n)) return '예: 교과 연구회 협의 참여';
  return '무엇을 했는지 적어 보세요';
}

/** "1시간 30분", "90분", "1.5시간", "2h 10m", "45" → 분 단위 숫자 */
function parseMinutes(str = '') {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return 0;
  let total = 0;
  let matched = false;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:시간|시|hours?|hrs?|h)/);
  if (h) { total += parseFloat(h[1]) * 60; matched = true; }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:분|minutes?|mins?|m)(?!\w)/);
  if (m) { total += parseFloat(m[1]); matched = true; }
  if (!matched) {
    const n = s.match(/^\d+(?:\.\d+)?$/);
    if (n) total = parseFloat(n[0]);
  }
  return Math.round(total);
}

function fmtMinutes(min) {
  const t = Math.round(Number(min) || 0);
  if (!t) return '0분';
  const h = Math.floor(t / 60);
  const m = t % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
}

function growthRowHTML(it = {}) {
  return `
    <div class="health-item-row growth-item-row">
      <div class="hir-head">
        <button type="button" class="hir-icon hir-icon-btn" data-icon="${esc(it.icon || '')}" title="아이콘 선택 (기본은 제목에 맞게 자동)" aria-label="아이콘 선택">${growthIconOf(it)}</button>
        <input type="text" class="input hir-name-input" value="${esc(it.name || '')}" placeholder="항목명 (예: 독서)" list="growth-name-suggestions">
      </div>
      <textarea class="input hir-val-input" rows="1" placeholder="${esc(getGrowthPlaceholder(it.name))}">${esc(it.value || '')}</textarea>
      <input type="text" class="input hir-time-input" value="${esc(it.time || '')}" placeholder="시간 (30분)" inputmode="text" aria-label="소요 시간">
      <button type="button" class="btn-remove-hir" title="이 항목 삭제" aria-label="이 항목 삭제">✕</button>
    </div>`;
}

/** 성장일지 한 건의 항목별 분 단위 집계 — 구버전(항목 없음)은 '기타'로 합산 */
function growthMinutesOf(r) {
  const items = Array.isArray(r.growthItems) ? r.growthItems : [];
  const out = new Map();
  let attributed = 0;
  items.forEach((it) => {
    const mins = Number(it.minutes) || parseMinutes(it.time);
    if (!mins) return;
    out.set(it.name || '기타', (out.get(it.name || '기타') || 0) + mins);
    attributed += mins;
  });
  if (!attributed) {
    const legacy = parseMinutes(r.effortTime);
    if (legacy) out.set('기타', legacy);
  }
  return out;
}

/** 제목이 비어 있는 기록(성장/건강 항목 전용)의 표시용 이름 */
function recTitle(r) {
  if (r.title) return r.title;
  const items = r.growthItems || r.healthItems;
  const first = Array.isArray(items) ? items.find((it) => it && (it.value || it.name)) : null;
  if (first) return `${first.name}${first.value ? `: ${first.value}` : ''}${items.length > 1 ? ` 외 ${items.length - 1}건` : ''}`;
  return CATEGORY_MAP[r.category]?.name || '기록';
}

function recordCard(r) {
  const c = CATEGORY_MAP[r.category];
  if (!c) return '';
  const detail = (c.detailKeys || [])
    .filter((k) => k !== 'trainingCategory')
    .map((k) => fmtValue(getField(c, k), r[k]))
    .filter(Boolean)
    .map((v) => `<span class="chip-sm">${esc(v)}</span>`).join('');

  const healthBadges = r.category === 'health' && Array.isArray(r.healthItems) && r.healthItems.length
    ? `<div class="health-badges-grid">
        ${r.healthItems.filter((it) => it && it.name && it.value).map((it) => `
          <div class="health-badge-item">
            <span class="hbi-tag">${healthItemIcon(it.name)} ${esc(it.name)}</span>
            <span class="hbi-desc">${esc(it.value)}</span>
          </div>
        `).join('')}
       </div>`
    : '';

  const growthBadges = r.category === 'dailylog' && Array.isArray(r.growthItems) && r.growthItems.length
    ? `<div class="health-badges-grid growth-badges-grid">
        ${r.growthItems.filter((it) => it && it.name).map((it) => `
          <div class="health-badge-item">
            <span class="hbi-tag">${growthIconOf(it)} ${esc(it.name)}</span>
            <span class="hbi-desc">${esc(it.value || '')}</span>
            ${it.time ? `<span class="hbi-time">${esc(it.time)}</span>` : ''}
          </div>
        `).join('')}
       </div>`
    : '';

  const isHealth = r.category === 'health';
  const showTitle = r.title && r.title !== '오늘의 건강 기록' && !(isHealth && r.title.includes(' · '));

  let trainingCatBadge = '';
  if (r.category === 'training') {
    const tCat = r.trainingCategory || '학교 관련';
    const isSchool = tCat === '학교 관련';
    const isNonSchool = tCat === '학교 외';
    const cls = isSchool ? 'badge-school' : (isNonSchool ? 'badge-nonschool' : 'badge-other');
    const icon = isSchool ? '🏫 ' : (isNonSchool ? '🌐 ' : '🏷️ ');
    trainingCatBadge = `<span class="badge-training-cat ${cls}">${icon}${esc(tCat)}</span>`;
  }

  return `
  <article class="record-card" style="--c:${c.color}" data-action="edit" data-id="${r.id}" tabindex="0">
    <div class="rc-top">
      <span class="rc-period">${esc(fmtPeriod(r)) || '날짜 미입력'}</span>
      ${trainingCatBadge}
      ${r.ongoing ? '<span class="badge badge-live">진행 중</span>' : ''}
      ${expiryBadge(r)}
      ${visitBadge(r)}
    </div>
    ${showTitle ? `<h3 class="rc-title">${esc(r.title)}</h3>` : ''}
    ${healthBadges}
    ${growthBadges}
    ${r.org ? `<p class="rc-org">${esc(r.org)}</p>` : ''}
    ${detail ? `<div class="rc-chips">${detail}</div>` : ''}
    ${r.desc ? `<p class="rc-desc">${esc(r.desc)}</p>` : ''}
    ${r.tags?.length ? `<div class="rc-tags">${r.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="rc-actions">
      ${r.link ? `<a class="icon-btn sm" href="${esc(r.link)}" target="_blank" rel="noopener" title="링크 열기" data-stop>🔗</a>` : ''}
      <button class="icon-btn sm" data-action="dup" data-id="${r.id}" title="복제" aria-label="복제">⧉</button>
      <button class="icon-btn sm danger" data-action="delete" data-id="${r.id}" title="삭제" aria-label="삭제">🗑</button>
    </div>
  </article>`;
}

function emptyState(c, total) {
  if (total) {
    return `<div class="empty"><div class="empty-icon">🔍</div><h3>조건에 맞는 이력이 없어요</h3>
      <p>검색어나 필터를 바꿔 보세요.</p><button class="btn btn-ghost" data-action="reset-filters">필터 초기화</button></div>`;
  }
  const isTraining = c?.id === 'training';
  return `<div class="empty" style="--c:${c?.color || '#8b5cf6'}"><div class="empty-icon">${c?.icon || '🌱'}</div>
    <h3>첫 번째 ${c ? c.name : '이력'} 기록을 추가해 보세요</h3><p>${c ? c.desc : '수상, 경력, 연수 등 모든 이력을 한 곳에서 관리하세요.'}</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      ${isTraining ? `<button class="btn btn-ghost" data-action="upload-excel">📊 엑셀 파일로 일괄 가져오기</button>` : ''}
      <button class="btn btn-primary" data-action="add" ${c ? `data-cat="${c.id}"` : ''}>＋ 직접 기록 추가</button>
    </div></div>`;
}

/* ───────────────────────── 타임라인 ───────────────────────── */
function viewTimeline() {
  const list = applyFilters(state.records);
  const groups = new Map();
  list.forEach((r) => {
    const y = yearOf(r) ?? '날짜 미입력';
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(r);
  });
  return `
  <header class="page-head">
    <div class="ph-icon">🕒</div>
    <div class="ph-text"><h1>타임라인</h1><p>모든 이력을 시간순으로 한눈에 살펴보세요. ${state.search ? `· 검색어 <b>“${esc(state.search)}”</b>` : ''}</p></div>
    <button class="btn btn-primary" data-action="add">＋ 새 이력</button>
  </header>
  ${state.records.length ? filterBar(state.records, { showCat: true }) : ''}
  ${list.length ? `<div class="timeline">${[...groups].map(([y, items]) => `
    <section class="tl-year">
      <header class="tl-year-head"><h2>${y}</h2><span>${items.length}건</span></header>
      <ol class="tl-list">${items.map((r) => {
        const c = CATEGORY_MAP[r.category];
        if (!c) return '';
        const det = detailText(r, c);
        return `<li class="tl-item" style="--c:${c.color}">
          <span class="tl-dot"></span>
          <div class="tl-card" data-action="edit" data-id="${r.id}" tabindex="0">
            <div class="tl-meta">${catPill(c)}<time>${esc(fmtPeriod(r))}</time>${expiryBadge(r)}</div>
            <h3>${esc(recTitle(r))}</h3>
            <p>${[r.org, det].filter(Boolean).map(esc).join(' · ')}</p>
          </div></li>`;
      }).join('')}</ol>
    </section>`).join('')}</div>` : emptyState(null, state.records.length)}`;
}

/* ───────────────────────── 이력서 출력 ───────────────────────── */
function inRange(r, from, to) {
  const sp = yearSpan(r);
  if (!sp) return !from && !to;
  return sp[0] <= (to || 9999) && sp[1] >= (from || 0);
}

function viewResume() {
  const o = state.resume;
  return `
  <header class="page-head no-print">
    <div class="ph-icon">📄</div>
    <div class="ph-text"><h1>이력서 출력</h1><p>원하는 항목만 골라 인쇄하거나 PDF로 저장하세요.</p></div>
    <button class="btn btn-primary" data-action="print">🖨 인쇄 / PDF 저장</button>
  </header>
  <div class="resume-layout">
    <aside class="card resume-opts no-print" id="resume-opts">
      <h2>포함할 항목</h2>
      <div class="check-list">
        ${CATEGORIES.map((c) => `<label class="check">
          <input type="checkbox" name="rcat" value="${c.id}" ${o.cats.includes(c.id) ? 'checked' : ''}>
          <span class="check-box"></span><span class="check-text">${c.icon} ${c.name}</span>
          <em>${state.records.filter((r) => r.category === c.id).length}</em></label>`).join('')}
      </div>
      <div class="opt-btns">
        <button class="btn btn-ghost sm" data-action="rcat-all">전체 선택</button>
        <button class="btn btn-ghost sm" data-action="rcat-none">선택 해제</button>
      </div>
      <h2>기간 (연도)</h2>
      <div class="range-row">
        <input class="input" type="number" name="rfrom" placeholder="시작" min="1950" max="2100" value="${esc(o.from)}">
        <span>~</span>
        <input class="input" type="number" name="rto" placeholder="종료" min="1950" max="2100" value="${esc(o.to)}">
      </div>
      <h2>옵션</h2>
      <label class="switch-row"><span>인적 사항 표시</span><input type="checkbox" name="rprofile" class="switch" ${o.profile ? 'checked' : ''}></label>
      <label class="switch-row"><span>상세 내용 포함</span><input type="checkbox" name="rdesc" class="switch" ${o.desc ? 'checked' : ''}></label>
      <p class="hint">💡 인쇄 창에서 대상을 <b>‘PDF로 저장’</b>으로 바꾸면 PDF 파일이 됩니다. 인적 사항은 <a class="link" href="#/settings">설정</a>에서 수정할 수 있어요.</p>
    </aside>
    <div class="resume-preview" id="resume-preview">${resumeDoc()}</div>
  </div>`;
}

function resumeDoc() {
  const o = state.resume;
  const s = state.settings;
  const from = Number(o.from) || 0;
  const to = Number(o.to) || 0;
  const name = s.name || state.user?.name || '';
  const sections = CATEGORIES.filter((c) => o.cats.includes(c.id)).map((c) => {
    const list = state.records
      .filter((r) => r.category === c.id && inRange(r, from, to))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    if (!list.length) return '';
    return `<section class="rd-section">
      <h3>${c.name}</h3>
      <table><thead><tr><th class="w-date">${c.period ? '기간' : '일자'}</th><th>내용</th><th class="w-org">기관</th><th class="w-note">비고</th></tr></thead>
      <tbody>${list.map((r) => `<tr>
        <td>${esc(fmtPeriod(r))}</td>
        <td><b>${esc(r.title)}</b>${o.desc && r.desc ? `<div class="rd-desc">${esc(r.desc)}</div>` : ''}</td>
        <td>${esc(r.org || '')}</td>
        <td>${esc(detailText(r, c))}</td></tr>`).join('')}</tbody></table>
    </section>`;
  }).join('');

  const prof = [
    ['성명', name], ['직위', s.position], ['소속', s.school], ['담당 교과', s.subject], ['이메일', s.email], ['연락처', s.phone],
  ].filter(([, v]) => v);

  return `<div class="resume-doc" id="resume-doc">
    <header class="rd-head">
      <h2>이 력 서</h2>
      ${o.profile && prof.length ? `<table class="rd-profile"><tbody>${prof.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
    </header>
    ${sections || '<p class="rd-empty">선택한 조건에 해당하는 이력이 없습니다.</p>'}
    <footer class="rd-foot">
      <p>위 기재 사항은 사실과 다름이 없음을 확인합니다.</p>
      <p>${todayKorean()}</p>
      <p class="rd-sign">작성자 <b>${esc(name)}</b> (인)</p>
    </footer>
  </div>`;
}

/* ───────────────────────── 설정 ───────────────────────── */
function viewSettings() {
  const s = state.settings;
  const u = state.user;
  const inp = (key, label, type = 'text', ph = '', extra = '') =>
    `<div class="field"><label for="s-${key}">${label}</label><input class="input" id="s-${key}" name="${key}" type="${type}" placeholder="${ph}" value="${esc(s[key])}" ${extra}></div>`;
  return `
  <header class="page-head">
    <div class="ph-icon">⚙️</div>
    <div class="ph-text"><h1>설정</h1><p>인적 사항, 목표, 데이터를 관리합니다.</p></div>
  </header>
  <div class="settings-grid">
    <form class="card" id="settings-form" autocomplete="off">
      <h2>👤 인적 사항</h2>
      <p class="muted sm">대시보드 인사말과 이력서 출력에 사용됩니다.</p>
      <div class="form-grid">
        ${inp('name', '이름', 'text', '홍길동')}
        ${inp('position', '직위', 'text', '교사')}
        ${inp('school', '소속 학교·기관', 'text', '○○초등학교')}
        ${inp('subject', '담당 교과', 'text', '국어 / 초등 전 교과')}
        ${inp('email', '이메일', 'email', 'name@example.com')}
        ${inp('phone', '연락처', 'tel', '010-0000-0000')}
      </div>
      <h2>🎯 목표 및 알림</h2>
      <div class="form-grid">
        ${inp('trainingGoal', '연간 연수 목표 (시간)', 'number', '60', 'min="0" step="1"')}
        ${inp('alertDays', '만료 알림 기준 (일 전)', 'number', '90', 'min="1" step="1"')}
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit" id="settings-save">변경 사항 저장</button></div>
    </form>

    <div class="settings-side">
      <section class="card">
        <h2>💾 데이터 관리</h2>
        <p class="muted sm">총 ${state.records.length}건의 이력이 ${store.mode === 'demo' ? '이 브라우저(데모)' : 'Firebase 클라우드'}에 저장되어 있어요.</p>
        <div class="stack">
          <button class="btn btn-ghost block" data-action="csv" data-cat="">⬇ 전체 이력 CSV (엑셀)</button>
          <button class="btn btn-ghost block" data-action="export-json">⬇ JSON 백업 저장</button>
          <button class="btn btn-ghost block" data-action="import-json">⬆ JSON 백업 불러오기</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
      </section>
      <section class="card">
        <h2>🔐 계정</h2>
        <div class="account">
          ${avatar(u, s.name || u.name, 'avatar lg')}
          <div><strong>${esc(u.name || s.name || '사용자')}</strong><span>${esc(u.email)}</span>
          <em class="mode ${store.mode}">${store.mode === 'demo' ? '데모 모드' : 'Google 계정 · 클라우드 동기화'}</em></div>
        </div>
        <button class="btn btn-danger-ghost block" data-action="logout">${store.mode === 'demo' ? '데모 종료' : '로그아웃'}</button>
      </section>
    </div>
  </div>`;
}

/* ───────────────────────── 모달 (추가/수정) ───────────────────────── */
function openModal({ cat = null, record = null, prefill = null } = {}) {
  state.modal = { cat: cat || record?.category || null, record, fromPicker: !cat && !record };
  state.modalDirty = false;
  if (state.modal.cat) renderForm(record || prefill);
  else renderPicker();
  const m = $('#record-modal');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  growHirInputs($('#modal-body')); // 모달이 보인 뒤에야 높이를 잴 수 있음
}

let overlayDownTarget = null;

let hirGrowBound = false;
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}
function growHirInputs(scope) {
  scope?.querySelectorAll('.hir-val-input').forEach((el) => {
    if (el.tagName === 'TEXTAREA') autoGrow(el);
  });
}

function closeModal() {
  state.modalDirty = false;
  closeIconPicker();
  const m = $('#record-modal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function renderPicker() {
  $('#modal-icon').textContent = '✨';
  $('#modal-title').textContent = '어떤 이력을 기록할까요?';
  $('#modal-body').innerHTML = `<div class="cat-picker">${CATEGORIES.map((c) => `
    <button type="button" class="pick" data-action="pick-cat" data-cat="${c.id}" style="--c:${c.color}">
      <span class="pick-icon">${c.icon}</span><b>${c.name}</b><small>${c.desc}</small></button>`).join('')}</div>`;
}

function normalizeDateStr(str) {
  if (!str) return '';
  const trimmed = String(str).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const parts = trimmed.split(/[./-]/).filter(Boolean);
  if (parts.length === 3) {
    const y = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (parts.length === 2 && digits.length <= 6) {
    const y = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
    const m = parts[1].padStart(2, '0');
    return `${y}-${m}`;
  }
  return trimmed;
}

function fieldHTML(f, val) {
  const id = `fld-${f.key}`;
  const req = f.required ? 'required' : '';
  const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <em class="req">*</em>' : ''}</label>`;
  let control;
  switch (f.type) {
    case 'textarea':
      control = `<textarea class="input" id="${id}" name="${f.key}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
      break;
    case 'select': {
      const opts = [...f.options];
      const isCustomVal = f.allowCustom && val && !opts.includes(val) && val !== '직접 입력…' && val !== '직접 입력';
      const isCustomSelected = f.allowCustom && (isCustomVal || val === '직접 입력…' || val === '직접 입력');
      if (val && !opts.includes(val) && !f.allowCustom) opts.push(val);

      control = `
        <div class="select-custom-wrap">
          <select class="input ${f.allowCustom ? 'select-with-custom' : ''}" id="${id}" name="${f.key}" ${f.allowCustom ? `data-custom-target="${id}-custom"` : ''} ${req}>
            <option value="">선택</option>
            ${opts.map((o) => {
              const selected = o === val || (isCustomSelected && (o === '직접 입력…' || o === '직접 입력'));
              return `<option value="${esc(o)}" ${selected ? 'selected' : ''}>${esc(o)}</option>`;
            }).join('')}
          </select>
          ${f.allowCustom ? `
            <input class="input custom-text-input" id="${id}-custom" type="text" placeholder="${esc(f.placeholder || '직접 입력 (예: 1시간 30분, 4시간)')}" value="${esc(isCustomVal ? val : '')}" style="margin-top: 8px; display: ${isCustomSelected ? 'block' : 'none'};">
          ` : ''}
        </div>`;
      break;
    }
    case 'training-cat': {
      const cats = getTrainingCategories();
      const cur = val || state.trainingFilterCat || cats[0] || '학교 관련';
      control = `
        <div class="training-cat-selector">
          <div class="cat-radio-group">
            ${cats.map((catName) => {
              const isChecked = catName === cur;
              const icon = catName === '학교 관련' ? '🏫' : (catName === '학교 외' ? '🌐' : '🏷️');
              return `
                <label class="cat-radio-chip ${isChecked ? 'active' : ''}">
                  <input type="radio" name="${f.key}" value="${esc(catName)}" ${isChecked ? 'checked' : ''}>
                  <span>${icon} ${esc(catName)}</span>
                </label>
              `;
            }).join('')}
          </div>
          <button type="button" class="btn btn-ghost sm btn-add-inline-cat" id="btn-quick-add-training-cat" title="새 분류 추가">
            ＋ 새 분류 추가
          </button>
        </div>`;
      break;
    }
    case 'checkbox':
      return `<div class="field field-check"><label class="switch-row"><span>${esc(f.label)}</span><input type="checkbox" class="switch" id="${id}" name="${f.key}" ${val ? 'checked' : ''}></label></div>`;
    case 'date':
      control = `
        <div class="input-date-wrap">
          <input class="input date-input" id="${id}" name="${f.key}" type="text" inputmode="numeric" placeholder="${esc(f.placeholder || '예: 2024-03-01 또는 20240301')}" value="${esc(val || '')}" maxlength="10" ${req}>
          <input type="date" class="date-picker-helper" tabindex="-1" aria-hidden="true" value="${esc(val || '')}">
          <button type="button" class="btn-date-picker" data-for="${id}" title="달력에서 선택" aria-label="달력 열기">📅</button>
        </div>`;
      break;
    case 'health-items': {
      const defaultItems = [
        { name: '운동', value: '' },
        { name: '영양제', value: '' },
        { name: '음주', value: '' },
      ];
      const items = Array.isArray(val) && val.length ? val : defaultItems;
      control = `
        <div class="health-items-builder" id="health-items-builder">
          <datalist id="health-name-suggestions">
            <option value="운동">
            <option value="영양제">
            <option value="음주">
            <option value="수면">
            <option value="식단">
            <option value="물 섭취">
            <option value="몸무게">
            <option value="스트레칭">
          </datalist>
          <div class="health-items-list" id="health-items-list">
            ${items.map((it, idx) => `
              <div class="health-item-row" data-idx="${idx}">
                <div class="hir-head">
                  <span class="hir-icon">${healthItemIcon(it.name)}</span>
                  <input type="text" class="input hir-name-input" value="${esc(it.name)}" placeholder="항목명" list="health-name-suggestions">
                </div>
                <textarea class="input hir-val-input" rows="1" placeholder="${esc(getHealthPlaceholder(it.name))}">${esc(it.value || '')}</textarea>
                <button type="button" class="btn-remove-hir" title="이 항목 삭제" aria-label="이 항목 삭제">✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-ghost sm add-health-item-btn" id="btn-add-health-item">
            ＋ 새 항목 추가 (예: 수면, 식단 등)
          </button>
        </div>`;
      break;
    }
    case 'growth-items': {
      const items = Array.isArray(val) && val.length ? val : getGrowthDefaults().map((d) => ({ ...d, value: '', time: '' }));
      control = `
        <div class="health-items-builder" id="growth-items-builder">
          <datalist id="growth-name-suggestions">
            ${GROWTH_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join('')}
          </datalist>
          <div class="health-items-list growth-items-list" id="growth-items-list">
            ${items.map((it) => growthRowHTML(it)).join('')}
          </div>
          <div class="growth-total" id="growth-total"></div>
          <button type="button" class="btn btn-ghost sm add-health-item-btn" id="btn-add-growth-item">
            ＋ 새 항목 추가 (예: 글쓰기, 영어 등)
          </button>
          <div class="growth-defaults-bar">
            <button type="button" class="btn btn-ghost sm" id="btn-save-growth-defaults" title="지금 보이는 항목 이름과 아이콘을 앞으로 새 기록의 기본 항목으로 저장해요">⭐ 지금 항목을 기본으로 저장</button>
            <button type="button" class="btn btn-ghost sm" id="btn-reset-growth-defaults" title="독서·수업 연구·연수·강의로 되돌려요">↺ 처음 구성으로</button>
          </div>
          <p class="muted sm growth-defaults-hint">항목을 추가·삭제·수정한 뒤 ‘기본으로 저장’을 누르면, 다음 새 기록부터 그 항목들이 기본으로 나와요.</p>
        </div>`;
      break;
    }
    case 'tags':
      control = `<input class="input" id="${id}" name="${f.key}" type="text" placeholder="${esc(f.placeholder || '')}" value="${esc((val || []).join(', '))}">`;
      break;
    case 'number':
      control = `<div class="input-unit"><input class="input" id="${id}" name="${f.key}" type="number" min="0" step="${f.step || 'any'}" value="${val ?? ''}" ${req}>${f.unit ? `<span>${f.unit}</span>` : ''}</div>`;
      break;
    default:
      control = `<input class="input" id="${id}" name="${f.key}" type="${f.type}" placeholder="${esc(f.placeholder || '')}" value="${esc(val)}" ${req}>`;
  }
  return `<div class="field ${f.full ? 'full' : ''}">${label}${control}</div>`;
}

function renderForm(data) {
  const c = CATEGORY_MAP[state.modal.cat];
  const editing = !!state.modal.record;
  const formData = data ? { ...data } : null;
  // 건강 탭: 이전에 자동 저장되었던 요약 문구(운동: ... · 영양제: ...)는 제목 입력창에 채우지 않고 빈칸으로 유지
  if (formData && c.id === 'health') {
    if (formData.title === '오늘의 건강 기록' || (formData.healthItems && formData.title.includes(' · '))) {
      formData.title = '';
    }
  }
  $('#modal-icon').textContent = c.icon;
  $('#modal-icon').style.setProperty('--c', c.color);
  $('#modal-title').textContent = `${c.name} ${editing ? '수정' : '추가'}`;
  $('#modal-body').innerHTML = `
    <form id="record-form" data-cat="${c.id}" autocomplete="off">
      <div class="form-grid">${fieldsOf(c).filter((f) => !f.hidden).map((f) => fieldHTML(f, formData?.[f.key])).join('')}</div>
      <footer class="modal-foot">
        ${editing ? '<button type="button" class="btn btn-danger-ghost" data-action="delete-current">삭제</button>' : ''}
        ${state.modal.fromPicker ? '<button type="button" class="btn btn-ghost" data-action="back-picker">← 다른 항목</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-action="close-modal">취소</button>
        <button type="submit" class="btn btn-primary" id="record-save">저장</button>
      </footer>
    </form>`;

  // 연수 분류 라디오 칩 인터랙션
  $$('.cat-radio-chip', $('#modal-body')).forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.cat-radio-chip', $('#modal-body')).forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const radio = chip.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  $('#btn-quick-add-training-cat', $('#modal-body'))?.addEventListener('click', async () => {
    const name = prompt('새 연수 분류명을 입력해 주세요 (예: 자율 연수, 대학원 등):');
    if (name && name.trim()) {
      await addTrainingCategory(name.trim());
      const form = $('#record-form');
      const currentVals = form ? Object.fromEntries(new FormData(form)) : {};
      currentVals.trainingCategory = name.trim();
      renderForm(currentVals);
    }
  });

  // 날짜 입력 인터랙션 (숫자 입력 자동 포맷 + 달력 헬퍼 연동)
  $$('.input-date-wrap', $('#modal-body')).forEach((wrap) => {
    const textInput = wrap.querySelector('.date-input');
    const helper = wrap.querySelector('.date-picker-helper');
    const calBtn = wrap.querySelector('.btn-date-picker');

    textInput.addEventListener('input', (e) => {
      if (e.inputType === 'deleteContentBackward') return;
      const digits = textInput.value.replace(/\D/g, '');
      if (digits.length >= 8 && !textInput.value.includes('-') && !textInput.value.includes('.')) {
        textInput.value = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      }
    });

    textInput.addEventListener('blur', () => {
      if (textInput.value) {
        textInput.value = normalizeDateStr(textInput.value);
        if (helper) helper.value = textInput.value;
      }
    });

    if (calBtn && helper) {
      calBtn.addEventListener('click', () => {
        try {
          if (typeof helper.showPicker === 'function') helper.showPicker();
          else helper.click();
        } catch {
          helper.click();
        }
      });
      helper.addEventListener('change', () => {
        if (helper.value) {
          textInput.value = helper.value;
          textInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }
  });

  // 직접 입력 지원 select 연동
  $$('.select-with-custom', $('#modal-body')).forEach((sel) => {
    const targetId = sel.dataset.customTarget;
    const customInput = $(`#${targetId}`, $('#modal-body'));
    if (!customInput) return;
    sel.addEventListener('change', () => {
      if (sel.value === '직접 입력…' || sel.value === '직접 입력') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
      }
    });
  });

  // 건강 항목 동적 추가/삭제/아이콘 연동
  const healthListEl = $('#health-items-list', $('#modal-body'));
  const addHealthBtn = $('#btn-add-health-item', $('#modal-body'));
  if (healthListEl && addHealthBtn) {
    healthListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-remove-hir');
      if (!btn) return;
      const row = btn.closest('.health-item-row');
      if (row) row.remove();
    });

    healthListEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('hir-name-input')) {
        const row = e.target.closest('.health-item-row');
        const iconEl = row?.querySelector('.hir-icon');
        const valInput = row?.querySelector('.hir-val-input');
        if (iconEl) iconEl.textContent = healthItemIcon(e.target.value);
        if (valInput && !valInput.value) valInput.placeholder = getHealthPlaceholder(e.target.value);
      }
    });

    addHealthBtn.addEventListener('click', () => {
      const newRow = document.createElement('div');
      newRow.className = 'health-item-row';
      newRow.innerHTML = `
        <div class="hir-head">
          <span class="hir-icon">✨</span>
          <input type="text" class="input hir-name-input" value="" placeholder="항목명 (예: 수면)" list="health-name-suggestions">
        </div>
        <textarea class="input hir-val-input" rows="1" placeholder="내용을 입력하세요"></textarea>
        <button type="button" class="btn-remove-hir" title="이 항목 삭제" aria-label="이 항목 삭제">✕</button>
      `;
      healthListEl.appendChild(newRow);
      newRow.querySelector('.hir-name-input')?.focus();
    });
  }

  // 성장 항목 동적 추가/삭제/아이콘·총 시간 연동
  const growthListEl = $('#growth-items-list', $('#modal-body'));
  const addGrowthBtn = $('#btn-add-growth-item', $('#modal-body'));
  if (growthListEl && addGrowthBtn) {
    const updateTotal = () => {
      const total = [...growthListEl.querySelectorAll('.hir-time-input')].reduce((a, el) => a + parseMinutes(el.value), 0);
      const t = $('#growth-total', $('#modal-body'));
      if (t) t.innerHTML = total ? `⏱ 오늘 총 노력 시간 <b>${fmtMinutes(total)}</b>` : '';
    };
    growthListEl.addEventListener('click', (e) => {
      const iconBtn = e.target.closest('.hir-icon-btn');
      if (iconBtn) {
        if (iconPopBtn === iconBtn) closeIconPicker(); else openIconPicker(iconBtn);
        return;
      }
      const btn = e.target.closest('.btn-remove-hir');
      if (!btn) return;
      btn.closest('.health-item-row')?.remove();
      updateTotal();
    });
    growthListEl.addEventListener('input', (e) => {
      const row = e.target.closest('.health-item-row');
      if (e.target.classList.contains('hir-name-input')) {
        const iconEl = row?.querySelector('.hir-icon');
        const valInput = row?.querySelector('.hir-val-input');
        if (iconEl && !iconEl.dataset.icon) iconEl.textContent = growthItemIcon(e.target.value);
        if (valInput && !valInput.value) valInput.placeholder = getGrowthPlaceholder(e.target.value);
      }
      if (e.target.classList.contains('hir-time-input')) updateTotal();
    });
    addGrowthBtn.addEventListener('click', () => {
      growthListEl.insertAdjacentHTML('beforeend', growthRowHTML({ name: '', value: '', time: '' }));
      growthListEl.lastElementChild.querySelector('.hir-name-input')?.focus();
    });
    $('#btn-save-growth-defaults', $('#modal-body'))?.addEventListener('click', async () => {
      const seen = new Set();
      const list = [...growthListEl.querySelectorAll('.health-item-row')].map((row) => {
        const name = row.querySelector('.hir-name-input')?.value.trim() || '';
        const icon = row.querySelector('.hir-icon-btn')?.dataset.icon || '';
        return { name, ...(icon ? { icon } : {}) };
      }).filter((it) => it.name && !seen.has(it.name) && seen.add(it.name));
      state.settings = state.settings || {};
      state.settings.growthDefaultItems = list;
      try {
        await store.saveSettings(state.settings);
        toast(list.length ? `기본 항목 ${list.length}개를 저장했어요. (${list.map((it) => it.name).join(', ')})` : '기본 항목을 비웠어요. 새 기록은 빈 목록으로 시작해요.');
      } catch (err) {
        handleError(err);
      }
    });
    $('#btn-reset-growth-defaults', $('#modal-body'))?.addEventListener('click', async () => {
      state.settings = state.settings || {};
      state.settings.growthDefaultItems = null;
      try {
        await store.saveSettings(state.settings);
        toast('기본 항목을 처음 구성(독서·수업 연구·연수·강의)으로 되돌렸어요.');
      } catch (err) {
        handleError(err);
      }
    });
    updateTotal();
  }

  // 항목 설명 입력칸: 줄바꿈 가능, 내용 길이에 맞춰 높이 자동 조절
  growHirInputs($('#modal-body'));
  if (!hirGrowBound) {
    hirGrowBound = true;
    document.addEventListener('input', (e) => {
      if (e.target.classList?.contains('hir-val-input')) autoGrow(e.target);
    });
  }

  syncOngoing();
  setTimeout(() => $('#fld-title')?.focus(), 60);
}

function syncOngoing() {
  const on = $('#fld-ongoing');
  const end = $('#fld-endDate');
  if (on && end) {
    end.disabled = on.checked;
    if (on.checked) end.value = '';
  }
}

async function saveRecord(form) {
  const c = CATEGORY_MAP[form.dataset.cat];
  const data = { category: c.id };
  for (const f of fieldsOf(c).filter((x) => !x.hidden)) {
    if (f.type === 'growth-items') {
      const listEl = form.querySelector('#growth-items-list');
      if (listEl) {
        data.growthItems = [...listEl.querySelectorAll('.health-item-row')].map((row) => {
          const time = row.querySelector('.hir-time-input')?.value.trim() || '';
          const icon = row.querySelector('.hir-icon-btn')?.dataset.icon || '';
          return {
            name: row.querySelector('.hir-name-input')?.value.trim() || '기타',
            value: row.querySelector('.hir-val-input')?.value.trim() || '',
            time,
            minutes: parseMinutes(time),
            ...(icon ? { icon } : {}),
          };
        }).filter((it) => it.value || it.minutes);
        const total = data.growthItems.reduce((a, it) => a + it.minutes, 0);
        // 항목별 시간이 없으면 기존(구버전) 총 노력 시간 값을 보존
        data.effortTime = total ? fmtMinutes(total) : (state.modal.record?.effortTime || '');
      }
      continue;
    }
    if (f.type === 'training-cat') {
      const checked = form.querySelector(`input[name="${f.key}"]:checked`);
      data[f.key] = checked ? checked.value.trim() : (getTrainingCategories()[0] || '학교 관련');
      continue;
    }
    const el = form.elements[f.key];
    if (f.type === 'health-items') {
      const listEl = form.querySelector('#health-items-list');
      if (listEl) {
        const rows = [...listEl.querySelectorAll('.health-item-row')];
        data.healthItems = rows.map((row) => ({
          name: row.querySelector('.hir-name-input')?.value.trim() || '기타',
          value: row.querySelector('.hir-val-input')?.value.trim() || '',
        })).filter((it) => it.name && (it.value || rows.length <= 3));
      }
      continue;
    }
    if (!el) continue;
    if (f.type === 'checkbox') data[f.key] = el.checked;
    else if (f.type === 'select' && f.allowCustom) {
      const customEl = form.querySelector(`#fld-${f.key}-custom`);
      if (el.value === '직접 입력…' || el.value === '직접 입력') {
        data[f.key] = customEl?.value.trim() || '직접 입력';
      } else {
        data[f.key] = el.value.trim();
      }
    }
    else if (f.type === 'date') data[f.key] = normalizeDateStr(el.value);
    else if (f.type === 'number') data[f.key] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'tags') data[f.key] = [...new Set(el.value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean))];
    else data[f.key] = el.value.trim();
  }
  if (data.ongoing) data.endDate = '';
  if (c.id === 'dailylog' && !data.title && !data.growthItems?.length && !data.desc) {
    toast('성장 항목의 내용이나 시간을 하나 이상 입력해 주세요.', 'error');
    return;
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    toast('종료일이 시작일보다 빠를 수 없어요.', 'error');
    $('#fld-endDate')?.focus();
    return;
  }
  const btn = $('#record-save');
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    if (state.modal.record) await store.update(state.modal.record.id, data);
    else await store.add(data);
    closeModal();
    toast(`${c.name} 이력을 ${state.modal.record ? '수정' : '저장'}했어요.`);
  } catch (err) {
    handleError(err);
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

async function deleteRecord(id) {
  const r = state.records.find((x) => x.id === id);
  if (!r) return;
  const ok = await confirmDialog('이력을 삭제할까요?', `“${recTitle(r)}” 기록이 영구적으로 삭제됩니다.`);
  if (!ok) return;
  try {
    await store.remove(id);
    closeModal();
    toast('삭제했어요.');
  } catch (err) { handleError(err); }
}

function confirmDialog(title, msg, okText = '삭제') {
  return new Promise((resolve) => {
    const m = $('#confirm-modal');
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = msg;
    $('#confirm-ok').textContent = okText;
    m.classList.add('open');
    const done = (v) => {
      m.classList.remove('open');
      $('#confirm-ok').onclick = $('#confirm-cancel').onclick = null;
      resolve(v);
    };
    $('#confirm-ok').onclick = () => done(true);
    $('#confirm-cancel').onclick = () => done(false);
    setTimeout(() => $('#confirm-cancel').focus(), 50);
  });
}

/* ───────────────────────── 내보내기 / 가져오기 ───────────────────────── */
function csvCell(f, v) {
  if (v == null || v === false) return '';
  if (v === true) return 'Y';
  if (Array.isArray(v)) {
    return v.map((x) => (x && typeof x === 'object'
      ? `${x.name || ''}${x.value ? `: ${x.value}` : ''}${x.time ? ` (${x.time})` : ''}`
      : x)).join(' / ');
  }
  return v;
}

function exportCSV(catId) {
  const fname = (state.settings.name || '내') + '_이력';
  if (catId) {
    const c = CATEGORY_MAP[catId];
    const list = applyFilters(state.records.filter((r) => r.category === catId));
    const fs = fieldsOf(c);
    const rows = [fs.map((f) => f.label), ...list.map((r) => fs.map((f) => csvCell(f, r[f.key])))];
    download(`${fname}_${c.name}_${todayStr()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    return toast(`${c.name} ${list.length}건을 CSV로 내보냈어요.`);
  }
  const list = state.route.view === 'timeline' ? applyFilters(state.records) : [...state.records].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const rows = [
    ['구분', '제목', '기관', '일자/기간', '상세', '태그', '메모'],
    ...list.map((r) => {
      const c = CATEGORY_MAP[r.category];
      return [c?.name, recTitle(r), r.org, fmtPeriod(r), c ? detailText(r, c) : '', (r.tags || []).join(', '), r.memo];
    }),
  ];
  download(`${fname}_전체_${todayStr()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  toast(`${list.length}건을 CSV로 내보냈어요.`);
}

function exportJSON() {
  const records = state.records.map(({ id, createdAt, updatedAt, ...rest }) => rest);
  const payload = { app: 'careernote', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, records };
  download(`CareerNote_backup_${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('백업 파일을 저장했어요.');
}
async function importJSON(file) {
  try {
    const json = JSON.parse(await file.text());
    const list = (Array.isArray(json) ? json : json.records || []).filter((r) => r && CATEGORY_MAP[r.category] && (r.title || r.healthItems || r.growthItems));
    if (!list.length) return toast('불러올 수 있는 이력이 없어요.', 'error');
    const ok = await confirmDialog('백업을 불러올까요?', `${list.length}건의 이력이 기존 데이터에 추가됩니다.`, '불러오기');
    if (!ok) return;
    const clean = list.map(({ id, createdAt, updatedAt, ...rest }) => rest);
    await store.importMany(clean);
    if (json.settings && !state.settings.name) await store.saveSettings({ ...state.settings, ...json.settings });
    toast(`${clean.length}건을 불러왔어요.`);
  } catch (err) {
    console.error(err);
    toast('파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해 주세요.', 'error');
  }
}

let parsedExcelRecords = [];

function openExcelModal(list, filename) {
  parsedExcelRecords = list;
  const totalHours = sumBy(list, 'hours');
  const totalCredits = sumBy(list, 'credits');
  $('#excel-modal-title').textContent = `연수 이력 ${list.length}건 확인 (${filename})`;
  $('#excel-modal-body').innerHTML = `
    <div style="margin-bottom:14px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;font-size:13.5px;">
      💡 파일에서 <b>총 ${list.length}건</b>의 연수 이력을 찾았습니다. (합계: <b>${fmtNum(totalHours)}시간</b> / <b>${fmtNum(totalCredits)}학점</b>)<br>
      아래 내용을 확인하신 후 [가져오기 실행]을 누르시면 내 연수 이력에 바로 등록됩니다.
    </div>
    <div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
        <thead>
          <tr style="background:var(--surface-2);border-bottom:1px solid var(--border);position:sticky;top:0;">
            <th style="padding:8px 10px;">연수명</th>
            <th style="padding:8px 10px;width:120px;">기관</th>
            <th style="padding:8px 10px;width:140px;">기간/이수일</th>
            <th style="padding:8px 10px;width:80px;text-align:right;">시간/학점</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 10px;"><b>${esc(r.title)}</b><div style="font-size:11.5px;color:var(--muted);">${esc(r.trainingType || '')} ${r.certNo ? `· ${esc(r.certNo)}` : ''}</div></td>
              <td style="padding:8px 10px;color:var(--text-2);">${esc(r.org || '-')}</td>
              <td style="padding:8px 10px;font-family:var(--font-num);font-size:12px;">${esc(fmtPeriod(r))}</td>
              <td style="padding:8px 10px;text-align:right;font-family:var(--font-num);font-weight:600;">${r.hours ? `${r.hours}h` : ''} ${r.credits ? `(${r.credits}점)` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  $('#excel-modal').classList.add('open');
  document.body.classList.add('modal-open');
}

function closeExcelModal() {
  $('#excel-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
  parsedExcelRecords = [];
}

async function handleExcelFile(file) {
  if (typeof XLSX === 'undefined') {
    return toast('엑셀 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
  }
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return toast('엑셀 파일에 유효한 데이터가 없습니다.', 'error');
    }

    // 헤더 행 찾기 (제목, 과정명, 연수명 등이 있는 행 탐색)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c).trim()).join(' ');
      if (/(연수명|과정명|연수과정|연수종별|이수시간|이수일)/.test(rowStr)) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) headerIdx = 0;
    const headers = rows[headerIdx].map((c) => String(c).trim());

    // 컬럼 인덱스 매핑 (나이스 NEIS 및 교육청 연수원 양식 유연 매칭)
    const findCol = (...regexes) => headers.findIndex((h) => regexes.some((r) => r.test(h)));
    const titleCol = findCol(/연수명/, /과정명/, /연수과정/, /교과목/, /과목명/, /제목/);
    const orgCol = findCol(/연수기관/, /주관기관/, /기관명/, /시행기관/, /교육기관/);
    const typeCol = findCol(/연수종별/, /연수구분/, /종별/, /구분/);
    const methodCol = findCol(/연수방법/, /방식/, /형태/);
    const startCol = findCol(/시작일/, /연수시작/, /시작일자/);
    const endCol = findCol(/종료일/, /이수일자/, /이수일/, /연수종료/, /연수기간/);
    const hoursCol = findCol(/이수시간/, /연수시간/, /시간/);
    const creditsCol = findCol(/학점/);
    const certCol = findCol(/이수번호/, /증서번호/, /등록번호/);
    const scoreCol = findCol(/성적/, /점수/, /평가결과/);

    if (titleCol === -1) {
      return toast('엑셀에서 [연수명] 또는 [과정명] 열을 찾을 수 없습니다. 파일 서식을 확인해 주세요.', 'error');
    }

    const cleanDate = (val) => {
      if (!val) return '';
      if (val instanceof Date && !isNaN(val)) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      const s = String(val).trim();
      const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
      return s;
    };

    const results = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const title = String(row[titleCol] || '').trim();
      if (!title || /^(합계|소계|총계)/.test(title)) continue;

      let startDate = startCol !== -1 ? cleanDate(row[startCol]) : '';
      let endDate = endCol !== -1 ? cleanDate(row[endCol]) : '';

      // 기간 열이 "2026.03.01 ~ 2026.03.15" 형태인 경우 분리
      if (!startDate && endDate && endDate.includes('~')) {
        const parts = endDate.split('~');
        startDate = cleanDate(parts[0]);
        endDate = cleanDate(parts[1]);
      } else if (!startDate && endDate) {
        startDate = endDate;
      }

      const hoursRaw = hoursCol !== -1 ? parseFloat(String(row[hoursCol]).replace(/[^0-9.]/g, '')) : null;
      const creditsRaw = creditsCol !== -1 ? parseFloat(String(row[creditsCol]).replace(/[^0-9.]/g, '')) : null;

      results.push({
        category: 'training',
        trainingCategory: '학교 관련',
        title,
        org: orgCol !== -1 ? String(row[orgCol] || '').trim() : '',
        trainingType: typeCol !== -1 ? String(row[typeCol] || '').trim() : '직무연수',
        method: methodCol !== -1 ? String(row[methodCol] || '').trim() : '',
        startDate: startDate || todayStr(),
        endDate: endDate || '',
        hours: isNaN(hoursRaw) ? null : hoursRaw,
        credits: isNaN(creditsRaw) ? null : creditsRaw,
        certNo: certCol !== -1 ? String(row[certCol] || '').trim() : '',
        score: scoreCol !== -1 ? String(row[scoreCol] || '').trim() : '',
        tags: ['엑셀가져오기'],
      });
    }

    if (!results.length) {
      return toast('엑셀에서 가져올 수 있는 연수 행이 없습니다.', 'error');
    }

    openExcelModal(results, file.name);
  } catch (err) {
    console.error('엑셀 파싱 오류:', err);
    toast(`엑셀 파일을 읽는 중 오류가 발생했습니다: ${err.message}`, 'error');
  }
}

/* ───────────────────────── 토스트 ───────────────────────── */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span><p>${esc(msg)}</p>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

/* ───────────────────────── 이벤트 ───────────────────────── */
function resetFilters() {
  Object.assign(state, { filterYear: '', filterTag: '', filterCat: '', trainingFilterCat: '', search: '' });
  $('#search').value = '';
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    state.route = parseHash();
    Object.assign(state, { filterYear: '', filterTag: '', filterCat: '' });
    if (state.route.cat !== 'training') state.trainingFilterCat = '';
    document.body.classList.remove('nav-open');
    render();
    $('#main').scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  });

  $('#btn-login').addEventListener('click', async () => {
    const btn = $('#btn-login');
    btn.disabled = true;
    try {
      await store.signIn();
    } catch (err) {
      console.error(err);
      const msg = {
        'auth/unauthorized-domain': '이 도메인은 승인되지 않았어요. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가해 주세요.',
        'auth/operation-not-allowed': 'Google 로그인이 비활성화되어 있어요. Firebase 콘솔에서 Google 제공업체를 사용 설정해 주세요.',
        'auth/popup-closed-by-user': '로그인 창이 닫혔어요.',
        'auth/popup-blocked': '팝업이 차단되었어요. 브라우저에서 팝업을 허용해 주세요.',
      }[err.code] || `로그인 실패: ${err.message}`;
      toast(msg, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    if (state.search && !['timeline', 'category'].includes(state.route.view)) location.hash = '#/timeline';
    else render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#confirm-modal').classList.contains('open')) $('#confirm-cancel').click();
      else if ($('#training-cat-modal').classList.contains('open')) closeTrainingCatModal();
      // 작성 창(record-modal)은 Esc로 닫지 않음 — ✕·취소 버튼으로만 닫힘
      document.body.classList.remove('nav-open');
    }
    // 백스페이스: 입력칸이 아닌 곳에서는 브라우저 기본 동작(뒤로가기 등)을 막아 창이 꺼지지 않게 함
    if (e.key === 'Backspace') {
      const t = e.target;
      const editable = t && (t.isContentEditable ||
        (t.tagName === 'TEXTAREA' && !t.readOnly && !t.disabled) ||
        (t.tagName === 'INPUT' && !t.readOnly && !t.disabled &&
          !/^(button|checkbox|radio|submit|reset|file|image|range|color)$/i.test(t.type)));
      if (!editable) e.preventDefault();
    }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing && state.user) { e.preventDefault(); $('#search').focus(); }
    if (e.key === 'Enter' && document.activeElement?.matches('.record-card, .tl-card')) document.activeElement.click();
  });

  // 모달 보호: 입력칸에서 드래그하다 바깥에서 마우스를 놓아도 닫히지 않게, 누른 곳도 바깥일 때만 닫음
  document.addEventListener('pointerdown', (e) => { overlayDownTarget = e.target; }, true);
  document.addEventListener('input', (e) => {
    if (e.target.closest?.('#record-modal')) state.modalDirty = true;
  });
  // 작성 중에 탭을 닫거나 새로고침·뒤로가기 하면 확인
  window.addEventListener('beforeunload', (e) => {
    if (state.modalDirty && $('#record-modal').classList.contains('open')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    if (e.target.classList.contains('modal-overlay')) {
      if (overlayDownTarget !== e.target) return;
      if (e.target.id === 'record-modal') { /* 작성 창은 바깥을 눌러도 닫지 않음 */ }
      else if (e.target.id === 'training-cat-modal') closeTrainingCatModal();
      else $('#confirm-cancel').click();
      return;
    }
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const { action, id, cat, tag, subcat, catName } = t.dataset;
    const rec = id ? state.records.find((r) => r.id === id) : null;
    switch (action) {
      case 'add': openModal({ cat: cat || null }); break;
      case 'edit': if (rec) openModal({ record: rec }); break;
      case 'dup': if (rec) { const { id: _, createdAt, updatedAt, ...copy } = rec; openModal({ cat: rec.category, prefill: copy }); } break;
      case 'delete': deleteRecord(id); break;
      case 'delete-current': if (state.modal.record) deleteRecord(state.modal.record.id); break;
      case 'pick-cat': state.modal.cat = cat; renderForm(null); break;
      case 'back-picker': state.modal.cat = null; renderPicker(); break;
      case 'close-modal': closeModal(); break;
      case 'growth-view': state.growthView = ['health', 'report'].includes(t.dataset.view) ? t.dataset.view : 'dailylog'; render(); break;
      case 'report-unit': state.reportUnit = t.dataset.unit === 'month' ? 'month' : 'week'; state.reportOffset = 0; render(); break;
      case 'report-nav': {
        const dir = Number(t.dataset.dir);
        state.reportOffset = dir === 0 ? 0 : Math.min(0, state.reportOffset + dir);
        render();
        break;
      }
      case 'hospital-view': state.hospitalView = t.dataset.view === 'reservations' ? 'reservations' : 'visits'; render(); break;
      case 'training-subcat': state.trainingFilterCat = subcat || ''; render(); break;
      case 'manage-training-cats': openTrainingCatModal(); break;
      case 'close-training-cat-modal': closeTrainingCatModal(); break;
      case 'delete-training-cat': deleteTrainingCategory(catName); break;
      case 'tag': state.filterTag = state.filterTag === tag ? '' : tag; render(); break;
      case 'reset-filters': resetFilters(); render(); break;
      case 'csv': exportCSV(cat); break;
      case 'goal-prev': state.goalYear--; render(); break;
      case 'goal-next': state.goalYear++; render(); break;
      case 'delete-app': { const l = loadApps(); l.splice(Number(t.dataset.idx), 1); saveApps(l); render(); break; }
      case 'print': window.print(); break;
      case 'rcat-all': state.resume.cats = CATEGORIES.map((c) => c.id); render(); break;
      case 'rcat-none': state.resume.cats = []; render(); break;
      case 'export-json': exportJSON(); break;
      case 'import-json': $('#import-file').click(); break;
      case 'upload-excel': $('#excel-file-input').click(); break;
      case 'close-excel-modal': closeExcelModal(); break;
      case 'edit-nickname': openNicknameModal(); break;
      case 'close-nickname-modal': closeNicknameModal(); break;
      case 'toggle-theme': toggleTheme(); break;
      case 'toggle-nav': document.body.classList.toggle('nav-open'); break;
      case 'reload-app': e.preventDefault(); location.hash = '#/dashboard'; location.reload(); break;
      case 'logout': store.signOut(); break;
    }
  });

  $('#btn-confirm-import-excel')?.addEventListener('click', async () => {
    if (!parsedExcelRecords || !parsedExcelRecords.length) return;
    const btn = $('#btn-confirm-import-excel');
    btn.disabled = true;
    btn.textContent = '가져오는 중…';
    try {
      await store.importMany(parsedExcelRecords);
      const count = parsedExcelRecords.length;
      closeExcelModal();
      toast(`연수 이력 ${count}건을 성공적으로 등록했어요! 🎉`);
    } catch (err) {
      handleError(err);
      btn.disabled = false;
      btn.textContent = '가져오기 실행';
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'f-year') { state.filterYear = el.value; render(); }
    else if (el.id === 'f-sort') { state.sort = el.value; render(); }
    else if (el.id === 'f-cat') { state.filterCat = el.value; render(); }
    else if (el.id === 'fld-ongoing') syncOngoing();
    else if (el.id === 'excel-file-input' && el.files[0]) { handleExcelFile(el.files[0]); el.value = ''; }
    else if (el.id === 'import-file' && el.files[0]) { importJSON(el.files[0]); el.value = ''; }
    else if (el.closest('#resume-opts')) updateResumeOpts();
  });

  document.addEventListener('input', (e) => {
    if (e.target.closest('#resume-opts') && e.target.type === 'number') updateResumeOpts();
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'record-form') saveRecord(e.target);
    if (e.target.id === 'app-form') {
      const fd = Object.fromEntries(new FormData(e.target));
      if (!/^https?:\/\//i.test(fd.url)) return toast('주소는 http:// 또는 https:// 로 시작해야 해요.', 'error');
      saveApps([...loadApps(), { name: fd.name.trim(), icon: fd.icon.trim(), url: fd.url.trim() }]);
      render();
      toast('웹앱을 추가했어요.');
    }
    if (e.target.id === 'settings-form') {
      const fd = Object.fromEntries(new FormData(e.target));
      fd.trainingGoal = Number(fd.trainingGoal) || 0;
      fd.alertDays = Number(fd.alertDays) || 90;
      const btn = $('#settings-save');
      btn.disabled = true;
      try {
        await store.saveSettings({ ...state.settings, ...fd });
        state.settings = { ...state.settings, ...fd };
        renderUser();
        renderCounts();
        toast('설정을 저장했어요.');
      } catch (err) { handleError(err); }
      btn.disabled = false;
    }
    if (e.target.id === 'nickname-form') {
      const val = $('#nickname-input').value.trim();
      if (!val) return;
      const btn = $('#nickname-save');
      btn.disabled = true;
      try {
        await store.saveSettings({ ...state.settings, name: val });
        state.settings.name = val;
        closeNicknameModal();
        renderUser();
        render();
        toast('닉네임이 변경되었어요.');
      } catch (err) { handleError(err); }
      btn.disabled = false;
    }
  });
}

function openNicknameModal() {
  const cur = state.settings.name || state.user?.name || '';
  const inp = $('#nickname-input');
  inp.value = cur;
  $('#nickname-modal').classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}

function closeNicknameModal() {
  $('#nickname-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
}

/* ───────────────────── 연수 분류(카테고리) 관리 ───────────────────── */
function openTrainingCatModal() {
  renderTrainingCatModalBody();
  $('#training-cat-modal').classList.add('open');
  document.body.classList.add('modal-open');
}

function closeTrainingCatModal() {
  $('#training-cat-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
}

function renderTrainingCatModalBody() {
  const cats = getTrainingCategories();
  const allTraining = state.records.filter((r) => r.category === 'training');

  $('#training-cat-modal-body').innerHTML = `
    <p class="muted sm" style="margin-bottom:12px;line-height:1.5;">
      연수를 목적과 성격에 맞게 분류해 보세요. (기본: 학교 관련, 학교 외)<br>
      분류를 삭제하면 해당 연수들은 자동으로 <b>'학교 관련'</b>으로 이동됩니다.
    </p>
    <div class="training-cat-list">
      ${cats.map((catName) => {
        const cnt = allTraining.filter((r) => (r.trainingCategory || '학교 관련') === catName).length;
        const icon = catName === '학교 관련' ? '🏫' : (catName === '학교 외' ? '🌐' : '🏷️');
        return `
          <div class="training-cat-item">
            <div class="tci-info">
              <span>${icon}</span>
              <strong>${esc(catName)}</strong>
              <span class="tci-count">${cnt}건</span>
            </div>
            <div class="tci-actions">
              <button type="button" class="icon-btn sm danger" data-action="delete-training-cat" data-cat-name="${esc(catName)}" title="“${esc(catName)}” 분류 삭제" aria-label="삭제">
                🗑
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <form id="add-training-cat-form" autocomplete="off" style="margin-top:12px;">
      <div class="new-cat-row">
        <input type="text" class="input" id="new-training-cat-input" placeholder="새 분류명 (예: 대학원, 자율연수)" maxlength="20" required>
        <button type="submit" class="btn btn-primary sm" id="btn-add-training-cat-submit" style="white-space:nowrap;height:40px;padding:0 16px;">＋ 추가</button>
      </div>
    </form>
    <div class="modal-foot" style="margin-top:16px;">
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-action="close-training-cat-modal">닫기</button>
    </div>
  `;

  $('#add-training-cat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $('#new-training-cat-input');
    const val = inp?.value.trim();
    if (!val) return;
    await addTrainingCategory(val);
    inp.value = '';
    inp.focus();
  });
}

async function addTrainingCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const cats = getTrainingCategories();
  if (cats.includes(trimmed)) {
    return toast('이미 존재하는 분류 이름이에요.', 'error');
  }
  const next = [...cats, trimmed];
  state.settings.trainingCategories = next;
  try {
    await store.saveSettings(state.settings);
    renderTrainingCatModalBody();
    render();
    toast(`“${trimmed}” 분류를 추가했어요.`);
  } catch (err) {
    handleError(err);
  }
}

async function deleteTrainingCategory(catName) {
  const cats = getTrainingCategories();
  if (cats.length <= 1) {
    return toast('최소 1개 이상의 분류를 유지해야 합니다.', 'error');
  }
  const affected = state.records.filter((r) => r.category === 'training' && (r.trainingCategory || '학교 관련') === catName);
  const msg = affected.length > 0
    ? `“${catName}” 분류를 사용하는 연수가 ${affected.length}건 있습니다.\n삭제 시 해당 연수들은 '학교 관련'으로 자동 이동됩니다. 삭제할까요?`
    : `“${catName}” 분류를 삭제할까요?`;

  const ok = await confirmDialog('연수 분류 삭제', msg, '삭제');
  if (!ok) return;

  try {
    if (affected.length > 0) {
      for (const r of affected) {
        await store.update(r.id, { trainingCategory: '학교 관련' });
      }
    }
    const next = cats.filter((c) => c !== catName);
    state.settings.trainingCategories = next;
    await store.saveSettings(state.settings);

    if (state.trainingFilterCat === catName) {
      state.trainingFilterCat = '';
    }
    renderTrainingCatModalBody();
    render();
    toast(`“${catName}” 분류를 삭제했어요.`);
  } catch (err) {
    handleError(err);
  }
}

function updateResumeOpts() {
  const box = $('#resume-opts');
  state.resume = {
    cats: $$('input[name="rcat"]:checked', box).map((i) => i.value),
    from: box.querySelector('[name="rfrom"]').value,
    to: box.querySelector('[name="rto"]').value,
    profile: box.querySelector('[name="rprofile"]').checked,
    desc: box.querySelector('[name="rdesc"]').checked,
  };
  $('#resume-preview').innerHTML = resumeDoc();
}

boot();
