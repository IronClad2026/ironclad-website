import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "최근 등록 순으로 표시합니다. 기록은 페이지로 나뉩니다.",
  "empty": "공개 대회 기록이 아직 없습니다.",
  "emptyPage": "이 페이지에는 공개 대회 기록이 없습니다.",
  "unavailable": "대회 기록을 불러오지 못했습니다. 나중에 다시 시도하세요.",
  "division": "디비전: {division}",
  "eventIncomplete": "대회 미완료",
  "withdrawn": "참가 철회",
  "champion": "디비전 우승",
  "placement": "최종 순위: {rank}",
  "noPlacement": "디비전 완료 · 순위 미기록",
  "noFinalOutcome": "최종 경기 결과 없음",
  "resultPending": "최종 결과 대기 중",
  "entryRecord": "공식 시리즈: {played}회 진행 · {wins}승 · {losses}패",
  "pagination": "대회 기록 페이지",
  "previous": "최근 기록",
  "next": "이전 기록",
  "page": "{page}페이지",
  "limit": "이전 기록이 현재 조회 한도를 초과합니다.",
  "scope": "이 페이지 대회의 합계",
  "played": "공식 시리즈 진행 수",
  "wins": "시리즈 승리",
  "losses": "시리즈 패배",
  "winRate": "시리즈 승률",
  "notAvailable": "—",
  "rules": "개별 게임이 아닌 완료된 공식 매치/시리즈입니다. 대기 중인 결과, 부전승, 불참 및 관리자 승급은 진행한 경기로 계산하지 않습니다. 기권은 공식 경기 집계 규칙을 따릅니다. 합계는 이 페이지만 포함합니다.",
  "states": {
    "disabled": "디비전 사용 불가",
    "filling": "경기 시작 전",
    "ready": "시작 준비 완료",
    "in_progress": "디비전 진행 중",
    "completed": "디비전 완료",
    "not_held": "디비전 미개최",
    "cancelled": "대회 취소",
    "voided": "대회 무효"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;
