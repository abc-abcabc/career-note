// 공통 유틸리티

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const todayKorean = () => {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export const primaryDate = (r) => r.date || r.startDate || '';

export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return d ? `${y}.${m}.${d}` : s;
}

export function fmtPeriod(r) {
  if (r.date) return fmtDate(r.date);
  if (!r.startDate) return r.endDate ? `~ ${fmtDate(r.endDate)}` : '';
  const s = fmtDate(r.startDate);
  if (r.ongoing) return `${s} ~ 현재`;
  if (r.endDate) return r.endDate === r.startDate ? s : `${s} ~ ${fmtDate(r.endDate)}`;
  return `${s} ~`;
}

export const yearOf = (r) => {
  const d = primaryDate(r);
  return d ? Number(d.slice(0, 4)) : null;
};

/** 기간형 이력의 [시작연도, 종료연도] */
export function yearSpan(r) {
  const s = yearOf(r);
  if (s == null) return null;
  const e = r.ongoing ? new Date().getFullYear() : r.endDate ? Number(r.endDate.slice(0, 4)) : s;
  return [s, Math.max(s, e)];
}

/** 연수 실적 귀속 연도 (이수일 기준) */
export const trainingYear = (r) => {
  const d = r.endDate || r.startDate || r.date;
  return d ? Number(d.slice(0, 4)) : null;
};

export function daysUntil(s) {
  const t = new Date(`${s}T00:00:00`);
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}

/** 겹치는 기간을 병합해 총 경력 개월 수 계산 */
export function careerMonths(list) {
  const DAY = 86400000;
  const iv = list
    .filter((r) => r.startDate)
    .map((r) => {
      const s = new Date(`${r.startDate}T00:00:00`).getTime();
      const e = !r.ongoing && r.endDate ? new Date(`${r.endDate}T00:00:00`).getTime() + DAY : Date.now();
      return [s, Math.max(s, e)];
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur = null;
  for (const [s, e] of iv) {
    if (!cur) { cur = [s, e]; continue; }
    if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else { total += cur[1] - cur[0]; cur = [s, e]; }
  }
  if (cur) total += cur[1] - cur[0];
  return Math.floor(total / DAY / 30.4375);
}

export function fmtMonths(m) {
  if (!m) return '0개월';
  const y = Math.floor(m / 12);
  const mm = m % 12;
  return `${y ? `${y}년 ` : ''}${mm ? `${mm}개월` : ''}`.trim();
}

export const fmtNum = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('ko-KR');

export const sumBy = (list, key) => list.reduce((a, r) => a + (Number(r[key]) || 0), 0);

/** Firestore Timestamp / number → millis */
export const tsOf = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

export function fmtValue(f, v) {
  if (!f || v == null || v === '' || v === false) return '';
  if (Array.isArray(v)) return v.join(', ');
  switch (f.type) {
    case 'date': return fmtDate(v);
    case 'number': return `${fmtNum(v)}${f.unit || ''}`;
    case 'checkbox': return f.label;
    default: return String(v);
  }
}

export function toCSV(rows) {
  const cell = (c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM: 엑셀에서 한글이 깨지지 않도록
  return '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
