import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "홈",
    tournaments: "토너먼트",
    players: "선수",
    rules: "규정",
    leaderboardAndRankings: "리더보드 및 랭킹",
    about: "소개",
    dashboard: "대시보드",
    admin: "관리자",
    primaryNavigation: "기본 탐색 메뉴",
    mobileNavigation: "모바일 탐색 메뉴",
    openMenu: "탐색 메뉴 열기",
    closeMenu: "탐색 메뉴 닫기",
  },
  footer: {
    copyright: "© {year} IronClad. 모든 권리 보유.",
    legalAndRules: "법률 문서 및 규정",
    rules: "규정",
    rulebook: "규정집",
    participationAgreement: "선수 참가 계약",
    participationAgreementShort: "PPA",
    terms: "서비스 이용약관",
    privacy: "개인정보 처리방침",
    opensInNewTab: "{label}(새 탭에서 열림)",
  },
  actions: {
    loading: "불러오는 중…",
    retry: "다시 시도",
    close: "닫기",
    cancel: "취소",
    back: "뒤로",
    save: "저장",
    continue: "계속",
    success: "완료",
    error: "오류",
  },
  selector: {
    language: "언어",
    triggerAriaLabel: "언어 선택. 현재 언어: {language}",
    languageRowLabel: "언어",
    title: "언어를 선택하세요",
    description: "IronClad 선수 환경에서 사용할 언어를 선택하세요.",
    closeLabel: "언어 선택기 닫기",
    selectedLabel: "선택됨",
    savingLabel: "언어 저장 중…",
    saveError: "언어 환경설정을 저장하지 못했습니다. 다시 시도하세요.",
    translationReviewNotice:
      "번역은 편의를 위해 제공되며 꼼꼼히 검토되었지만, 원어민의 검수를 거치지 않았을 수 있습니다. 영어가 원문 언어입니다.",
    privacyHeading: "언어 환경설정",
    privacyCookie:
      "IronClad는 사용자가 명시적으로 선택한 언어를 자사 기능성 쿠키에 최대 약 1년 동안 저장합니다.",
    privacyClerk:
      "로그인한 경우 IronClad가 직접 보내는 서비스 알림 이메일에 해당 언어를 사용할 수 있도록 이 선택이 Clerk의 비공개 메타데이터에도 저장될 수 있습니다.",
    privacyNoTracking:
      "이 환경설정은 광고나 사이트 간 추적에 사용되지 않습니다.",
    privacyNotEvidence:
      "이 정보는 사용자의 위치, 법적 관할권, 동의 또는 이해를 입증하지 않습니다.",
    privacyChange: "언제든지 여기에서 환경설정을 변경할 수 있습니다.",
    privacyPolicyLink: "개인정보 처리방침 읽기",
  },
  install: {
    mobile: "IronClad 모바일", title: "IronClad 설치", close: "설치 안내 닫기", description: "IronClad를 홈 화면에 추가해 더 빠르게 접속하고 앱과 같은 전체 화면 환경을 이용하세요.", now: "지금 설치", promptHelp: "브라우저에서 안전한 설치 안내를 엽니다.", iosMenuTitle: "메뉴 열기", iosMenuText: "Safari에서 ⋯(더 보기) 버튼을 누르세요.", shareTitle: "공유", shareText: "공유를 누르세요.", homeTitle: "홈 화면에 추가", homeText: "‘홈 화면에 추가’를 선택하세요. 보이지 않으면 ‘더 보기’를 눌러 목록에서 찾으세요.", addTitle: "설치", addText: "‘추가’를 누르세요.", browserMenuTitle: "브라우저 메뉴 열기", browserMenuText: "Chrome, Edge 또는 사용 중인 브라우저에서 메뉴 버튼을 누르세요.", appTitle: "앱 설치", appText: "‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.", confirmTitle: "확인", confirmText: "안내가 표시되면 설치를 확인하세요.", download: "앱 다운로드", step: "{number}단계",
  },
  music: { playerLabel: "IronClad 테마 음악 플레이어", pause: "IronClad 테마 일시 정지", play: "IronClad 테마 재생", unavailable: "음악을 사용할 수 없음" },
  legal: {
    effectiveEnglishNotice:
      "현재 효력이 있는 준거 문서는 영어로 작성되어 있습니다. 현재 공식 번역본은 제공되지 않습니다.",
    read: "읽기",
    download: "다운로드",
    continueInEnglish: "영어로 계속",
    goBack: "돌아가기",
  },
  errors: {
    notFoundEyebrow: "404 · 찾을 수 없음",
    notFoundTitle: "페이지를 찾을 수 없습니다.",
    notFoundDescription: "링크가 오래되었거나 페이지가 이동되었을 수 있습니다.",
    returnHome: "홈으로 돌아가기",
    unexpectedTitle: "문제가 발생했습니다.",
    unexpectedDescription:
      "IronClad에서 이 선수 화면을 불러오지 못했습니다. 다시 시도하세요.",
    retry: "다시 시도",
    loading: "불러오는 중…",
  },
} satisfies CommonDictionary;

export default dictionary;
