import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "배지 컬렉션 | IronClad",
    pageDescription: "IronClad 배지 컬렉션을 확인하세요.",
    artworkAlt: "{name} 배지 이미지",
  },
  rarity: {
    common: "일반",
    uncommon: "고급",
    rare: "희귀",
    epic: "영웅",
    legendary: "전설",
  },
  states: {
    earned: "획득",
    locked: "잠김",
    new: "신규",
  },
  dashboard: {
    eyebrow: "배지",
    title: "IronClad 배지 컬렉션",
    earnedWithBadges: "최근 달성한 IronClad 업적이 여기에 표시됩니다.",
    empty: "IronClad 토너먼트에서 경쟁하고 승리하며 이정표를 달성해 배지를 획득하세요.",
    earnedLabel: "획득",
    viewCollection: "배지 컬렉션 보기",
    inspect: "전체 컬렉션을 열어 획득한 배지와 잠긴 배지를 모두 확인하세요.",
    explore: "모든 배지와 해제 조건을 살펴보세요.",
    featuredAria: "대시보드 주요 배지",
    progressAria: "배지 {total}개 중 {earned}개 획득",
    loadErrorTitle: "배지 컬렉션을 사용할 수 없음",
    loadErrorDescription: "배지 컬렉션을 불러오지 못했습니다. 획득한 배지는 안전합니다.",
    retry: "다시 시도",
  },
  collection: {
    back: "대시보드로 돌아가기",
    eyebrow: "업적 기록",
    title: "배지 컬렉션",
    description: "모든 IronClad 배지의 희귀도와 획득 조건을 확인하세요.",
    earnedLabel: "획득",
    showing: "배지 {total}개 중 {shown}개 표시",
    filters: {
      all: "전체",
      earned: "획득",
      locked: "잠김",
    },
    filtersAria: "배지 컬렉션 필터",
    slotsAria: "IronClad 배지 컬렉션 슬롯",
    empty: "이 필터에 해당하는 배지가 없습니다.",
  },
  detail: {
    eyebrow: "IronClad 업적",
    badgeNumber: "배지 {number}",
    unlockMeaning: "해제 조건",
    status: "상태",
    originalAwarded: "최초 획득",
    close: "배지 세부 정보 닫기",
    dismiss: "배지 세부 정보 닫기",
  },
  reveal: {
    unlocked: "배지 해제",
    continue: "공개 완료",
    notNow: "나중에",
    saving: "공개 상태 저장 중…",
    queuePosition: "배지 {total}개 중 {current}번째",
    ackError: "배지 공개 상태가 저장되지 않았습니다. 연결을 확인하고 다시 시도하세요.",
    retry: "확인 다시 시도",
    transferUnavailable: "컬렉션 슬롯 위치가 변경되었습니다. 이동 효과 없이 공개를 완료합니다.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "IronClad 신병",
      unlockMeaning: "신원 및 ELO 검증을 완료하고 자격을 갖춘 IronClad 선수가 되세요.",
    },
    "first-deployment": {
      name: "첫 출전",
      unlockMeaning: "첫 번째 IronClad 공식 경기를 완료하세요.",
    },
    "first-victory": {
      name: "첫 승리",
      unlockMeaning: "첫 번째 IronClad 공식 경기에서 승리하세요.",
    },
    "battle-tested": {
      name: "실전 검증",
      unlockMeaning: "IronClad 공식 경기 10회를 완료하세요.",
    },
    "rising-through-the-ranks": {
      name: "승급 행진",
      unlockMeaning:
        "처음 IronClad 토너먼트를 완료한 디비전보다 높은 디비전에서 유효한 토너먼트를 완료하세요.",
    },
    "first-campaign": {
      name: "첫 원정",
      unlockMeaning: "첫 번째 전체 IronClad 토너먼트를 완료하세요.",
    },
    "iron-regular": {
      name: "철의 단골",
      unlockMeaning: "IronClad 토너먼트 3회를 완료하세요.",
    },
    "tournament-veteran": {
      name: "토너먼트 베테랑",
      unlockMeaning: "IronClad 토너먼트 10회를 완료하세요.",
    },
    "season-campaigner": {
      name: "시즌 원정대",
      unlockMeaning: "최종 확정된 한 IronClad 시즌에서 유효한 토너먼트를 4회 이상 완료하세요.",
    },
    "reliable-competitor": {
      name: "신뢰받는 경쟁자",
      unlockMeaning: "본인 귀책 노쇼 또는 양측 노쇼 확정 없이 예정된 출전 10회를 완료하세요.",
    },
    "five-victories": {
      name: "5승",
      unlockMeaning: "IronClad 공식 경기 5회에서 승리하세요.",
    },
    "ten-victories": {
      name: "10승",
      unlockMeaning: "IronClad 공식 경기 10회에서 승리하세요.",
    },
    "twenty-five-victories": {
      name: "25승",
      unlockMeaning: "IronClad 공식 경기 25회에서 승리하세요.",
    },
    "iron-streak": {
      name: "강철 연승",
      unlockMeaning: "실제로 진행된 공식 경기에서 3연승을 달성하세요.",
    },
    unbroken: {
      name: "불패",
      unlockMeaning: "실제로 진행된 공식 경기에서 5연승을 달성하세요.",
    },
    "clean-sweep": {
      name: "완승",
      unlockMeaning: "BO3를 2–0으로 또는 BO5를 3–0으로 승리하세요.",
    },
    "comeback-commander": {
      name: "역전 지휘관",
      unlockMeaning: "1경기를 패한 뒤 공식 시리즈에서 역전 승리하세요.",
    },
    "giant-slayer": {
      name: "거인 처단자",
      unlockMeaning: "검증된 토너먼트 ELO가 200점 이상 높은 상대를 꺾으세요.",
    },
    "giant-hunter": {
      name: "거인 사냥꾼",
      unlockMeaning: "거인 처단자 업적을 서로 다른 경기에서 3회 달성하세요.",
    },
    "flawless-campaign": {
      name: "무결점 원정",
      unlockMeaning:
        "공식 시리즈를 최소 1회 실제로 진행하고 개별 경기를 한 번도 패하지 않은 채 IronClad 토너먼트에서 우승하세요.",
    },
    "first-advance": {
      name: "첫 진출",
      unlockMeaning: "처음 실제로 진행된 토너먼트 대진 라운드에서 승리하세요.",
    },
    semifinalist: {
      name: "준결승 진출자",
      unlockMeaning: "IronClad 공식 토너먼트 준결승에 진출하세요.",
    },
    finalist: {
      name: "결승 진출자",
      unlockMeaning: "IronClad 공식 토너먼트 결승에 진출하세요.",
    },
    "academy-champion": {
      name: "Academy 챔피언",
      unlockMeaning: "Academy 디비전 공식 토너먼트에서 우승하세요.",
    },
    "challenge-champion": {
      name: "Challenge 챔피언",
      unlockMeaning: "Challenge 디비전 공식 토너먼트에서 우승하세요.",
    },
    "elite-champion": {
      name: "Elite 챔피언",
      unlockMeaning: "Main/Elite 디비전 공식 토너먼트에서 우승하세요.",
    },
    "double-champion": {
      name: "2관왕",
      unlockMeaning: "서로 다른 IronClad 토너먼트 2회에서 우승하세요.",
    },
    "triple-crown": {
      name: "트리플 크라운",
      unlockMeaning: "Academy, Challenge, Main/Elite 디비전 토너먼트에서 각각 1회 이상 우승하세요.",
    },
    "season-podium": {
      name: "시즌 포디움",
      unlockMeaning: "최종 확정된 공식 시즌을 3위 이내로 마치세요.",
    },
    "season-champion": {
      name: "시즌 챔피언",
      unlockMeaning: "최종 확정된 공식 시즌 순위표에서 1위를 차지하세요.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
