// 데모 모드용 샘플 데이터
export const SAMPLE_RECORDS = [
  { category: 'career', title: '서울한빛초등학교', position: '교사', employment: '정규', role: '6학년 담임, 정보부장', startDate: '2023-03-01', ongoing: true, desc: 'AI·디지털 선도학교 운영 총괄', tags: ['디지털'] },
  { category: 'career', title: '서울푸른초등학교', position: '교사', employment: '정규', role: '4학년 담임, 과학 전담', startDate: '2018-03-01', endDate: '2023-02-28', tags: [] },
  { category: 'career', title: '경기새솔초등학교', position: '기간제교사', employment: '기간제', role: '3학년 담임', startDate: '2017-03-01', endDate: '2018-02-28', tags: [] },

  { category: 'award', title: '교육감 표창', grade: '교육감', awardType: '개인', org: '서울특별시교육청', date: '2025-12-20', desc: '디지털 기반 수업 혁신 유공', tags: ['디지털', '수업혁신'] },
  { category: 'award', title: '전국 교육자료전 2등급', grade: '교육부장관', awardType: '단체', org: '한국교원단체총연합회', date: '2024-11-08', tags: ['연구'] },
  { category: 'award', title: '교육장 표창', grade: '교육장', awardType: '개인', org: '서울동부교육지원청', date: '2021-02-15', desc: '학생 생활 지도 유공', tags: [] },

  { category: 'training', trainingCategory: '학교 관련', title: 'AI 디지털교과서 활용 수업 설계', trainingType: '직무연수', method: '원격', org: '서울특별시교육연수원', startDate: '2026-03-02', endDate: '2026-04-10', hours: 30, credits: 2, score: '96점', tags: ['디지털', 'AI'] },
  { category: 'training', trainingCategory: '학교 관련', title: '학교폭력 예방 및 대응 역량 강화', trainingType: '직무연수', method: '집합', org: '서울동부교육지원청', startDate: '2026-07-21', endDate: '2026-07-23', hours: 15, credits: 1, tags: ['생활지도'] },
  { category: 'training', trainingCategory: '학교 관련', title: '1급 정교사 자격연수', trainingType: '자격연수', method: '혼합(블렌디드)', org: '서울교육대학교 교육연수원', startDate: '2021-07-26', endDate: '2021-08-20', hours: 180, credits: 12, score: '92.5점', tags: [] },
  { category: 'training', trainingCategory: '학교 외', title: '글로벌 에듀테크 & AI 컨퍼런스 워크숍', trainingType: '컨설팅·워크숍', method: '원격', org: '한국에듀테크산업협회', startDate: '2025-08-12', endDate: '2025-08-14', hours: 16, tags: ['글로벌', '에듀테크'] },
  { category: 'training', trainingCategory: '학교 관련', title: '하이러닝 플랫폼 기초', trainingType: '맞춤형 직무연수', method: '원격', org: '경기도교육연수원', startDate: '2025-05-01', endDate: '2025-05-31', hours: 15, credits: 1, tags: ['디지털'] },
  { category: 'training', trainingCategory: '학교 관련', title: '프로젝트 기반 학습(PBL) 실천', trainingType: '직무연수', method: '집합', org: '서울특별시교육연수원', startDate: '2025-01-06', endDate: '2025-01-10', hours: 30, credits: 2, tags: ['수업혁신'] },
  { category: 'training', trainingCategory: '학교 외', title: '데이터 분석 & 파이썬 기초 역량 강화', trainingType: '기타', method: '원격', org: '패스트캠퍼스', startDate: '2024-07-01', endDate: '2024-07-31', hours: 40, tags: ['자기개발', '코딩'] },

  { category: 'education', title: '서울교육대학교', degree: '학사', major: '초등교육', status: '졸업', startDate: '2012-03-02', endDate: '2016-02-19', tags: [] },
  { category: 'education', title: '한국교원대학교 교육대학원', degree: '석사', major: '컴퓨터교육', status: '졸업', startDate: '2021-03-02', endDate: '2023-02-17', desc: '초등 AI 교육 프로그램 개발 연구', tags: ['AI'] },

  { category: 'license', title: '초등학교 정교사(1급)', grade: '1급', org: '교육부', date: '2021-09-01', tags: [] },
  { category: 'license', title: '정보처리기사', grade: '국가기술', org: '한국산업인력공단', date: '2020-06-12', tags: ['디지털'] },
  { category: 'license', title: '생활스포츠지도사 2급', grade: '국가', org: '국민체육진흥공단', date: '2019-10-10', expiryDate: '2026-12-31', tags: [] },

  { category: 'research', title: '생성형 AI를 활용한 초등 글쓰기 수업 모형 개발', researchType: '연구대회', role: '단독', org: '서울특별시교육청', date: '2025-10-30', grade: '1등급', tags: ['AI', '연구'] },
  { category: 'research', title: '초등 AI 교육 프로그램 개발 연구', researchType: '논문', role: '주저자', org: '한국교원대학교', date: '2023-02-17', tags: ['AI'] },

  { category: 'volunteer', title: '지역 아동센터 코딩 교육 봉사', actType: '교육 봉사', org: '해솔지역아동센터', startDate: '2024-03-01', ongoing: true, hours: 48, tags: ['디지털'] },
  { category: 'volunteer', title: '서울 초등 AI 교육 연구회', actType: '연구회·동아리', org: '서울특별시교육청', startDate: '2022-03-01', ongoing: true, tags: ['AI', '연구'] },

  { category: 'committee', title: '디지털 수업 컨설팅 위원', role: '컨설턴트', org: '서울동부교육지원청', startDate: '2025-03-01', endDate: '2027-02-28', docNo: '제2025-112호', tags: ['디지털'] },
  { category: 'committee', title: '학업성취도 평가 문항 검토위원', role: '검토위원', org: '서울특별시교육청', startDate: '2024-06-10', endDate: '2024-06-14', tags: [] },

  { category: 'language', title: 'TOEIC', score: '905', org: 'YBM', date: '2024-12-15', expiryDate: '2026-12-14', tags: [] },
  { category: 'language', title: 'OPIc', score: 'IH', org: 'ACTFL', date: '2023-05-20', expiryDate: '2025-05-19', tags: [] },

  { category: 'dailylog', title: '생성형 AI 프롬프트 엔지니어링 실습 1시간', date: '2026-11-01', effortTime: '1시간', desc: '초등 수준 맞춤형 질문 생성 프롬프트 테스트 완료. 다음 주 사회과 수업에 도입해보기로 함.', tags: ['AI', '수업설계'] },
  { category: 'dailylog', title: '디지털 교육 트렌드 칼럼 2편 정독 및 핵심 메모', date: '2026-10-31', effortTime: '30분', desc: '에듀테크 도구 활용 시 학생 주의집중 유지 전략 정리.', tags: ['독서', '에듀테크'] },
  { category: 'dailylog', title: '동학년 교과 연구회 11월 수업 아이디어 나눔', date: '2026-10-28', effortTime: '1시간', desc: '프로젝트 수업 평가 루브릭 공유받고 내 학급용으로 수정.', tags: ['수업나눔'] },

  {
    category: 'health',
    title: '운동 40분 완료 및 비타민 복용',
    date: '2026-11-01',
    healthItems: [
      { name: '운동', value: '조깅 30분, 스트레칭 10분' },
      { name: '영양제', value: '종합비타민, 오메가3, 유산균 복용' },
      { name: '음주', value: '금주 (무음주)' },
      { name: '수면', value: '7시간 30분 숙면' },
    ],
    desc: '아침 조깅 후 활력이 넘침. 물 2L 충분히 섭취함.',
    tags: ['유산소', '금주'],
  },
  {
    category: 'health',
    title: '헬스 상체 웨이트 및 영양제 복용',
    date: '2026-10-30',
    healthItems: [
      { name: '운동', value: '헬스 상체 웨이트 트레이닝 50분' },
      { name: '영양제', value: '단백질 쉐이크, 마그네슘, 비타민D' },
      { name: '음주', value: '금주 (무음주)' },
    ],
    desc: '어깨 및 가슴 운동 집중 루틴 진행.',
    tags: ['웨이트', '건강'],
  },

  { category: 'hospital', title: '서울튼튼내과', date: '2026-11-05', department: '내과', reason: '목감기', nextVisit: '2026-11-19', nextTime: '오후 3시', desc: '약 5일분 처방, 증상 지속 시 재방문.' },
  { category: 'hospital', title: '맑은눈안과', date: '2026-10-20', department: '안과', reason: '정기 검진', desc: '이상 없음.' },

  { category: 'etc', title: '교육 신문 인터뷰 – AI 수업 사례', etcType: '언론 보도', org: '한국교육신문', date: '2025-11-12', tags: ['AI'] },
];
