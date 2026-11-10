// 카테고리 및 입력 항목 정의 (교사/교육직 기준)
// type: text | date | number | select | textarea | checkbox | url | tags
// full: 한 줄 전체 차지 / unit: 숫자 단위 / detailKeys: 카드·이력서 비고란에 표시할 항목

const COMMON = [
  { key: 'tags', label: '태그', type: 'tags', placeholder: '쉼표로 구분 (예: 디지털, 수업혁신)', full: true },
  { key: 'memo', label: '메모', type: 'textarea', placeholder: '개인 메모 (이력서에는 출력되지 않아요)', full: true },
];

export const CATEGORIES = [
  {
    id: 'career', name: '경력', icon: '💼', color: '#60a5fa', period: true,
    desc: '근무 기관 · 직위 · 담당 업무',
    detailKeys: ['position', 'employment', 'role'],
    fields: [
      { key: 'title', label: '근무 기관(학교)명', type: 'text', required: true, placeholder: '예: 서울한빛초등학교', full: true },
      { key: 'position', label: '직위', type: 'select', options: ['교사', '부장교사', '수석교사', '교감', '교장', '교육연구사', '교육연구관', '장학사', '장학관', '기간제교사', '강사', '기타'] },
      { key: 'employment', label: '고용 형태', type: 'select', options: ['정규', '기간제', '시간강사', '파견', '겸임', '휴직', '기타'] },
      { key: 'role', label: '담당 업무', type: 'text', placeholder: '예: 6학년 담임, 연구부장', full: true },
      { key: 'startDate', label: '시작일', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date' },
      { key: 'ongoing', label: '현재 재직 중', type: 'checkbox' },
      { key: 'desc', label: '주요 업무 · 성과', type: 'textarea', full: true },
    ],
  },
  {
    id: 'award', name: '수상', icon: '🏆', color: '#fbbf24', period: false,
    desc: '표창 · 상장 · 대회 수상',
    detailKeys: ['grade', 'awardType'],
    fields: [
      { key: 'title', label: '수상명(표창명)', type: 'text', required: true, placeholder: '예: 교육감 표창', full: true },
      { key: 'grade', label: '훈격', type: 'select', options: ['대통령', '국무총리', '교육부장관', '장관(타 부처)', '교육감', '교육장', '시·도지사', '시장·군수·구청장', '학교장', '민간 단체', '기타'] },
      { key: 'awardType', label: '구분', type: 'select', options: ['개인', '단체'] },
      { key: 'org', label: '수여 기관', type: 'text', placeholder: '예: 서울특별시교육청' },
      { key: 'date', label: '수상일', type: 'date', required: true },
      { key: 'certNo', label: '증서 번호', type: 'text' },
      { key: 'desc', label: '공적 내용', type: 'textarea', full: true },
    ],
  },
  {
    id: 'training', name: '연수', icon: '📚', color: '#34d399', period: true,
    desc: '직무 · 자격 · 원격 연수',
    detailKeys: ['trainingCategory', 'trainingType', 'method', 'hours', 'credits'],
    fields: [
      { key: 'trainingCategory', label: '연수 분류', type: 'training-cat', required: true, full: true },
      { key: 'title', label: '연수명', type: 'text', required: true, placeholder: '예: AI 디지털교과서 활용 직무연수', full: true },
      { key: 'trainingType', label: '연수 구분', type: 'select', options: ['직무연수', '자격연수', '특수분야연수', '맞춤형 직무연수', '교과교육연구회', '컨설팅·워크숍', '기타'] },
      { key: 'method', label: '연수 방식', type: 'select', options: ['집합', '원격', '혼합(블렌디드)'] },
      { key: 'org', label: '연수 기관', type: 'text', placeholder: '예: 서울특별시교육연수원', full: true },
      { key: 'startDate', label: '시작일', type: 'date', required: true },
      { key: 'endDate', label: '종료일(이수일)', type: 'date' },
      { key: 'hours', label: '이수 시간', type: 'number', unit: '시간', step: '0.5' },
      { key: 'credits', label: '학점', type: 'number', unit: '학점', step: '0.5' },
      { key: 'certNo', label: '이수 번호', type: 'text' },
      { key: 'score', label: '성적', type: 'text', placeholder: '예: 95점 / 이수' },
    ],
  },
  {
    id: 'education', name: '학력', icon: '🎓', color: '#a78bfa', period: true,
    desc: '학교 · 전공 · 학위',
    detailKeys: ['degree', 'major', 'status'],
    fields: [
      { key: 'title', label: '학교명', type: 'text', required: true, placeholder: '예: 서울교육대학교', full: true },
      { key: 'degree', label: '학위 · 과정', type: 'select', options: ['고등학교', '전문학사', '학사', '석사', '박사', '교육대학원', '기타'] },
      { key: 'status', label: '상태', type: 'select', options: ['졸업', '재학', '수료', '휴학', '중퇴'] },
      { key: 'major', label: '전공', type: 'text', placeholder: '예: 초등교육 / 컴퓨터교육', full: true },
      { key: 'startDate', label: '입학일', type: 'date' },
      { key: 'endDate', label: '졸업일', type: 'date' },
      { key: 'ongoing', label: '재학 중', type: 'checkbox' },
      { key: 'desc', label: '학위 논문 · 비고', type: 'textarea', full: true },
    ],
  },
  {
    id: 'license', name: '자격증', icon: '📜', color: '#f472b6', period: false,
    desc: '교원 자격 · 국가/민간 자격',
    detailKeys: ['grade'], hasExpiry: true,
    fields: [
      { key: 'title', label: '자격명', type: 'text', required: true, placeholder: '예: 초등학교 정교사(1급)', full: true },
      { key: 'grade', label: '등급 · 종류', type: 'text', placeholder: '예: 1급 / 국가공인' },
      { key: 'org', label: '발급 기관', type: 'text', placeholder: '예: 교육부' },
      { key: 'date', label: '취득일', type: 'date', required: true },
      { key: 'expiryDate', label: '만료일 (없으면 비워두기)', type: 'date' },
      { key: 'certNo', label: '자격 번호', type: 'text', full: true },
    ],
  },
  {
    id: 'research', name: '연구·저술', icon: '🔬', color: '#22d3ee', period: false,
    desc: '논문 · 저서 · 연구대회 · 수업발표',
    detailKeys: ['researchType', 'role', 'grade'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, full: true },
      { key: 'researchType', label: '구분', type: 'select', options: ['논문', '저서', '교과서·교재 집필', '연구대회', '수업 발표·공개 수업', '연구학교·선도학교', '정책 연구', '특허', '기타'] },
      { key: 'role', label: '역할', type: 'select', options: ['단독', '주저자', '공동저자', '책임연구자', '공동연구자', '집필자', '발표자', '기타'] },
      { key: 'org', label: '발행처 · 주관 기관', type: 'text' },
      { key: 'date', label: '발표 · 발행일', type: 'date', required: true },
      { key: 'grade', label: '등급 · 결과', type: 'text', placeholder: '예: 1등급, 학술지 게재' },
      { key: 'link', label: '링크', type: 'url', placeholder: 'https://' },
      { key: 'desc', label: '요약', type: 'textarea', full: true },
    ],
  },
  {
    id: 'volunteer', name: '봉사·대외활동', icon: '🤝', color: '#fb923c', period: true,
    desc: '봉사 · 연구회 · 강의 · 멘토링',
    detailKeys: ['actType', 'hours'],
    fields: [
      { key: 'title', label: '활동명', type: 'text', required: true, full: true },
      { key: 'actType', label: '구분', type: 'select', options: ['봉사활동', '교육 봉사', '연구회·동아리', '강의·강사', '멘토링', '대외활동', '기타'] },
      { key: 'org', label: '기관 · 단체', type: 'text' },
      { key: 'startDate', label: '시작일', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date' },
      { key: 'ongoing', label: '활동 중', type: 'checkbox' },
      { key: 'hours', label: '활동 시간', type: 'number', unit: '시간', step: '0.5' },
      { key: 'desc', label: '활동 내용', type: 'textarea', full: true },
    ],
  },
  {
    id: 'committee', name: '위원·위촉', icon: '🏛️', color: '#818cf8', period: true,
    desc: '출제 · 심사 · 자문 · 컨설팅 위원',
    detailKeys: ['role'],
    fields: [
      { key: 'title', label: '위원회 · 위촉명', type: 'text', required: true, placeholder: '예: 교육청 수업 컨설팅 위원', full: true },
      { key: 'role', label: '역할', type: 'select', options: ['위원', '위원장', '부위원장', '출제위원', '검토위원', '심사위원', '컨설턴트', '자문위원', '강사', '기타'] },
      { key: 'org', label: '위촉 기관', type: 'text' },
      { key: 'startDate', label: '위촉 시작일', type: 'date', required: true },
      { key: 'endDate', label: '위촉 종료일', type: 'date' },
      { key: 'ongoing', label: '현재 위촉 중', type: 'checkbox' },
      { key: 'docNo', label: '위촉 번호', type: 'text' },
      { key: 'desc', label: '활동 내용', type: 'textarea', full: true },
    ],
  },
  {
    id: 'language', name: '어학', icon: '🌐', color: '#2dd4bf', period: false,
    desc: '공인 어학 시험 성적',
    detailKeys: ['score'], hasExpiry: true,
    fields: [
      { key: 'title', label: '시험명', type: 'text', required: true, placeholder: '예: TOEIC', full: true },
      { key: 'score', label: '점수 · 등급', type: 'text', required: true, placeholder: '예: 905 / IH' },
      { key: 'org', label: '시행 기관', type: 'text' },
      { key: 'date', label: '응시일', type: 'date', required: true },
      { key: 'expiryDate', label: '유효기간 만료일', type: 'date' },
      { key: 'certNo', label: '수험 번호', type: 'text', full: true },
    ],
  },
  {
    id: 'dailylog', name: '성장일지', icon: '🌱', color: '#10b981', period: false,
    desc: '매일매일 커리어를 위한 실천과 배움 기록',
    detailKeys: ['effortTime', 'mood'],
    fields: [
      { key: 'date', label: '실천 일자', type: 'date', required: true },
      { key: 'effortTime', label: '노력 시간', type: 'select', allowCustom: true, options: ['15분', '30분', '1시간', '1시간 30분', '2시간', '2시간 30분', '3시간', '4시간', '5시간 이상', '직접 입력…'], placeholder: '직접 입력 (예: 4시간 30분, 90분)' },
      { key: 'title', label: '오늘 실천한 내용 (한 줄 요약)', type: 'text', required: true, placeholder: '예: AI 디지털교과서 수업안 1차시 구상 및 독서 30분', full: true },
      { key: 'desc', label: '배운 점 및 느낀 점 (성장 기록)', type: 'textarea', placeholder: '오늘 무엇을 배우거나 깨달았나요? 앞으로 적용해보고 싶은 점은?', full: true },
      { key: 'link', label: '관련 링크/자료', type: 'url', placeholder: 'https://' },
    ],
  },
  {
    id: 'health', name: '건강', icon: '💪', color: '#06b6d4', period: false,
    desc: '운동 · 영양제 · 음주 및 라이프스타일 기록',
    detailKeys: ['healthSummary'],
    fields: [
      { key: 'date', label: '실천 일자', type: 'date', required: true },
      { key: 'title', label: '오늘의 요약 (선택)', type: 'text', placeholder: '적지 않아도 돼요 (제목을 따로 남기고 싶을 때만 입력)', full: true },
      { key: 'healthItems', label: '건강 관리 항목 (운동·영양제·음주 등)', type: 'health-items', full: true },
      { key: 'desc', label: '메모 및 컨디션 (선택)', type: 'textarea', placeholder: '오늘의 몸 상태, 피로도, 식단 등 자유롭게 기록', full: true },
    ],
  },
  {
    id: 'hospital', name: '병원', icon: '🏥', color: '#f43f5e', period: false,
    desc: '병원 방문 기록 · 다음 예약 일정',
    detailKeys: ['department', 'reason'],
    fields: [
      { key: 'title', label: '병원명', type: 'text', required: true, placeholder: '예: 서울튼튼내과', full: true },
      { key: 'date', label: '방문일', type: 'date', required: true },
      { key: 'department', label: '진료과', type: 'select', allowCustom: true, options: ['내과', '정형외과', '이비인후과', '피부과', '안과', '치과', '산부인과', '비뇨기과', '소아과', '신경과', '정신건강의학과', '한의원', '검진센터', '직접 입력…'], placeholder: '직접 입력 (예: 재활의학과)' },
      { key: 'reason', label: '증상 · 진단명', type: 'text', placeholder: '예: 목감기, 정기검진, 허리 통증', full: true },
      { key: 'nextVisit', label: '다음 예약일', type: 'date' },
      { key: 'nextTime', label: '예약 시간', type: 'text', placeholder: '예: 오후 3시 30분' },
      { key: 'desc', label: '진료 내용 · 처방', type: 'textarea', placeholder: '의사 소견, 처방약, 주의사항 등', full: true },
    ],
  },
  {
    id: 'etc', name: '기타', icon: '📝', color: '#94a3b8', period: false,
    desc: '그 밖의 모든 기록',
    detailKeys: ['etcType'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, full: true },
      { key: 'etcType', label: '구분', type: 'text', placeholder: '예: 언론 보도, 특기, 동호회' },
      { key: 'org', label: '관련 기관', type: 'text' },
      { key: 'date', label: '일자', type: 'date' },
      { key: 'desc', label: '내용', type: 'textarea', full: true },
    ],
  },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const fieldsOf = (cat) => [...cat.fields, ...COMMON];

export const getField = (cat, key) => fieldsOf(cat).find((f) => f.key === key);
