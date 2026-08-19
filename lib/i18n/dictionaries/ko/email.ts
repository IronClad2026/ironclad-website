import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "IronClad Tournaments에서 발송한 대회 관련 알림입니다." },
  labels: {
    tournament: "토너먼트",
    division: "디비전",
    round: "라운드",
    opponent: "상대",
    deadline: "마감 시각",
  },
  registrationApproved: {
    subject: "등록 승인: {tournamentName}",
    heading: "등록이 승인되었습니다",
    intro: "토너먼트 등록이 승인되었습니다.",
    action: "등록 보기",
  },
  divisionStarted: {
    subject: "디비전 시작 — 첫 대진 준비 완료: {tournamentName}",
    heading: "디비전이 시작되었습니다",
    intro: "첫 대진을 진행할 수 있습니다.",
    action: "대진 보기",
  },
  laterRound: {
    subject: "{roundName} 대진 준비 완료: {tournamentName}",
    heading: "다음 대진이 준비되었습니다",
    intro: "이 대진의 공식 참가자 두 명이 모두 확정되었습니다.",
    action: "대진 보기",
  },
  deadline72h: {
    subject: "경기 마감까지 72시간 남음: {tournamentName}",
    heading: "경기 마감 알림",
    intro: "현재 경기의 마감 시각이 72시간 이내입니다.",
    action: "대진 보기",
  },
  deadline24h: {
    subject: "경기 마감까지 24시간 남음: {tournamentName}",
    heading: "최종 경기 마감 알림",
    intro: "현재 경기의 마감 시각이 24시간 이내입니다.",
    action: "대진 보기",
  },
} satisfies EmailDictionary;
export default dictionary;
