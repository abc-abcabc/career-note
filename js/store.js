// 데이터 저장소
// - Firebase: Google 로그인 + Firestore (users/{uid}/records/{id}, users/{uid}.settings)
// - Demo: localStorage 기반 (Firebase 설정 전 미리보기용)

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

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
    saveSettings: (settings) =>
      F.setDoc(F.doc(db, 'users', uid), { settings, updatedAt: F.serverTimestamp() }, { merge: true }),
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
    async importMany(list) { list.forEach((d) => data.records.push({ ...d, id: gen(), createdAt: Date.now(), updatedAt: Date.now() })); persist(); },
  };
}
