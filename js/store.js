// 데이터 저장소
// - Firebase: Google 로그인 + Firestore (users/{uid}/records/{id}, users/{uid}.settings)
// - Demo: localStorage 기반 (Firebase 설정 전 미리보기용)

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

// Google 캘린더 (읽기 전용). 접근 토큰은 약 1시간만 유효하므로 이 탭(sessionStorage)에만 잠시 보관합니다.
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const CAL_KEY = 'careernote.calToken';
const readCalToken = () => { try { const t = JSON.parse(sessionStorage.getItem(CAL_KEY)); return t && t.exp > Date.now() ? t.token : null; } catch { return null; } };
const calErr = (code, message) => Object.assign(new Error(message || code), { code });

const mapUser = (u) => (u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null);

export async function createFirebaseStore(config) {
  const [appMod, A, F] = await Promise.all([
    import(`${FB}firebase-app.js`),
    import(`${FB}firebase-auth.js`),
    import(`${FB}firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  let uid = null;
  const recCol = () => F.collection(db, 'users', uid, 'records');

  return {
    mode: 'firebase',
    onAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => {
        uid = u?.uid || null;
        cb(mapUser(u));
      });
    },
    signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return A.signInWithPopup(auth, p);
    },
    signOut: () => A.signOut(auth),
    subscribe(onRecords, onSettings, onError) {
      const u1 = F.onSnapshot(recCol(), (s) => onRecords(s.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
      const u2 = F.onSnapshot(F.doc(db, 'users', uid), (s) => onSettings(s.data()?.settings || {}), onError);
      return () => { u1(); u2(); };
    },
    add: (data) => F.addDoc(recCol(), { ...data, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() }),
    update: (id, data) => F.updateDoc(F.doc(recCol(), id), { ...data, updatedAt: F.serverTimestamp() }),
    remove: (id) => F.deleteDoc(F.doc(recCol(), id)),
    // 전담시간표 앱(noam-timetable)이 저장하는 문서를 읽기 전용으로 가져옵니다.
    async getTimetable() {
      const s = await F.getDoc(F.doc(db, 'timetables', '2026_noam_2nd_semester'));
      return s.exists() ? s.data() : null;
    },
    saveSettings: (settings) =>
      F.setDoc(F.doc(db, 'users', uid), { settings, updatedAt: F.serverTimestamp() }, { merge: true }),
    cal: {
      hasToken: () => !!readCalToken(),
      async connect() {
        const u = auth.currentUser;
        const p = new A.GoogleAuthProvider();
        p.addScope(CAL_SCOPE);
        if (u?.email) p.setCustomParameters({ login_hint: u.email });
        const r = await A.reauthenticateWithPopup(u, p); // 같은 계정이어야만 통과 (다른 계정이면 오류)
        const cred = A.GoogleAuthProvider.credentialFromResult(r);
        if (!cred?.accessToken) throw calErr('cal/no-token', '캘린더 권한을 받지 못했어요.');
        sessionStorage.setItem(CAL_KEY, JSON.stringify({ token: cred.accessToken, exp: Date.now() + 55 * 60 * 1000 }));
      },
      disconnect() { sessionStorage.removeItem(CAL_KEY); },
      async events(date) {
        const token = readCalToken();
        if (!token) throw calErr('cal/expired');
        const [y, m, d] = date.split('-').map(Number);
        const min = new Date(y, m - 1, d).toISOString();
        const max = new Date(y, m - 1, d + 1).toISOString();
        const get = async (url) => {
          const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
          if (res.status === 401) { sessionStorage.removeItem(CAL_KEY); throw calErr('cal/expired'); }
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw calErr('cal/' + res.status, j.error?.message || String(res.status));
          return j;
        };
        const lists = await get('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50');
        const cals = (lists.items || []).filter((c) => c.selected !== false).slice(0, 10);
        const per = await Promise.all(cals.map((c) =>
          get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=50`)
            .then((j) => (j.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
              id: c.id + e.id, title: e.summary || '(제목 없음)', allDay: !!e.start?.date,
              start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
              location: e.location || '', calendar: c.summaryOverride || c.summary || '', link: e.htmlLink || '',
            })))
            .catch((err) => { if (err.code === 'cal/expired') throw err; return []; })));
        return per.flat().sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || String(a.start).localeCompare(String(b.start)));
      },
    },
    async importMany(list) {
      for (let i = 0; i < list.length; i += 400) {
        const batch = F.writeBatch(db);
        list.slice(i, i + 400).forEach((d) =>
          batch.set(F.doc(recCol()), { ...d, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() })
        );
        await batch.commit();
      }
    },
  };
}

export function createDemoStore(sample) {
  const KEY = 'careernote-demo-v1';
  const now = Date.now();
  let data = JSON.parse(localStorage.getItem(KEY) || 'null') || {
    records: sample.map((r, i) => ({ id: `demo${i}`, ...r, createdAt: now - i * 60000, updatedAt: now - i * 60000 })),
    settings: { name: '김하늘', position: '교사', school: '서울한빛초등학교', subject: '초등 전 교과', email: 'haneul@example.com', trainingGoal: 60, alertDays: 90 },
  };
  let listeners = [];
  const gen = () => Math.random().toString(36).slice(2, 12);
  const emit = () => listeners.forEach((l) => { l.r(data.records.map((r) => ({ ...r }))); l.s({ ...data.settings }); });
  const persist = () => { localStorage.setItem(KEY, JSON.stringify(data)); emit(); };

  return {
    mode: 'demo',
    getTimetable: async () => null,
    onAuth(cb) {
      setTimeout(() => cb({ uid: 'demo', name: '데모 사용자', email: 'demo@example.com', photo: '' }), 0);
      return () => {};
    },
    async signIn() {},
    async signOut() { location.href = location.pathname; },
    subscribe(onR, onS) {
      const l = { r: onR, s: onS };
      listeners.push(l);
      setTimeout(emit, 250);
      return () => { listeners = listeners.filter((x) => x !== l); };
    },
    async add(d) { data.records.push({ ...d, id: gen(), createdAt: Date.now(), updatedAt: Date.now() }); persist(); },
    async update(id, d) { data.records = data.records.map((r) => (r.id === id ? { ...r, ...d, updatedAt: Date.now() } : r)); persist(); },
    async remove(id) { data.records = data.records.filter((r) => r.id !== id); persist(); },
    async saveSettings(s) { data.settings = { ...data.settings, ...s }; persist(); },
    cal: {
      hasToken: () => sessionStorage.getItem('careernote.demoCal') === '1',
      async connect() { sessionStorage.setItem('careernote.demoCal', '1'); },
      disconnect() { sessionStorage.removeItem('careernote.demoCal'); },
      async events(date) {
        return [
          { id: 'd1', title: '(데모) 현장체험학습 안내문 발송', allDay: true, start: date, end: date, location: '', calendar: '데모 캘린더', link: '' },
          { id: 'd2', title: '(데모) 학년 협의회', allDay: false, start: date + 'T10:00:00', end: date + 'T11:00:00', location: '교무실', calendar: '데모 캘린더', link: '' },
          { id: 'd3', title: '(데모) 체육대회 준비 회의', allDay: false, start: date + 'T15:30:00', end: date + 'T16:30:00', location: '', calendar: '업무', link: '' },
        ];
      },
    },
    async importMany(list) { list.forEach((d) => data.records.push({ ...d, id: gen(), createdAt: Date.now(), updatedAt: Date.now() })); persist(); },
  };
}
