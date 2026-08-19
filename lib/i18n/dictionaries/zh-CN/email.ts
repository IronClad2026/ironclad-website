import type { EmailDictionary } from "@/lib/i18n/dictionaries/en/email";

const dictionary = {
  layout: { footer: "这是 IronClad Tournaments 发送的赛事事务通知。" },
  labels: {
    tournament: "锦标赛",
    division: "组别",
    round: "轮次",
    opponent: "对手",
    deadline: "截止时间",
  },
  registrationApproved: {
    subject: "报名已获批准：{tournamentName}",
    heading: "你的报名已获批准",
    intro: "你的锦标赛报名已获批准。",
    action: "查看报名",
  },
  divisionStarted: {
    subject: "组别赛事已开始，你的首场对阵已就绪：{tournamentName}",
    heading: "你的组别赛事已开始",
    intro: "你的首场对阵已可进行。",
    action: "查看对阵",
  },
  laterRound: {
    subject: "{roundName}对阵已就绪：{tournamentName}",
    heading: "你的下一场对阵已就绪",
    intro: "本场对阵的双方正式参赛者均已确定。",
    action: "查看对阵",
  },
  deadline72h: {
    subject: "距离比赛截止时间还有 72 小时：{tournamentName}",
    heading: "比赛截止时间提醒",
    intro: "你当前比赛的截止时间将在 72 小时内到来。",
    action: "查看对阵",
  },
  deadline24h: {
    subject: "距离比赛截止时间还有 24 小时：{tournamentName}",
    heading: "比赛截止时间最终提醒",
    intro: "你当前比赛的截止时间将在 24 小时内到来。",
    action: "查看对阵",
  },
} satisfies EmailDictionary;
export default dictionary;
