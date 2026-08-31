import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "徽章收藏 | IronClad",
    pageDescription: "查看你的 IronClad 徽章收藏。",
    artworkAlt: "{name}徽章图案",
  },
  rarity: {
    common: "普通",
    uncommon: "优秀",
    rare: "稀有",
    epic: "史诗",
    legendary: "传奇",
  },
  states: {
    earned: "已获得",
    locked: "未解锁",
    new: "新",
  },
  dashboard: {
    eyebrow: "徽章",
    title: "IronClad 徽章收藏",
    earnedWithBadges: "你最近获得的 IronClad 成就会显示在这里。",
    empty: "参加比赛、赢得胜利并达成 IronClad 锦标赛里程碑即可获得徽章。",
    earnedLabel: "已获得",
    viewCollection: "查看徽章收藏",
    inspect: "打开完整收藏，查看所有已获得和未解锁的徽章。",
    explore: "浏览所有徽章并了解解锁条件。",
    featuredAria: "仪表板精选徽章",
    progressAria: "已获得 {earned}/{total} 枚徽章",
    loadErrorTitle: "徽章收藏暂不可用",
    loadErrorDescription: "无法加载你的徽章收藏。你已获得的徽章仍然安全。",
    retry: "重试",
  },
  collection: {
    back: "返回仪表板",
    eyebrow: "成就档案",
    title: "徽章收藏",
    description: "查看每枚 IronClad 徽章、稀有度及其获得条件。",
    earnedLabel: "已获得",
    showing: "正在显示 {shown}/{total} 枚徽章",
    filters: {
      all: "全部",
      earned: "已获得",
      locked: "未解锁",
    },
    filtersAria: "徽章收藏筛选器",
    slotsAria: "IronClad 徽章收藏槽位",
    empty: "没有符合此筛选条件的徽章。",
  },
  detail: {
    eyebrow: "IronClad 成就",
    badgeNumber: "徽章 {number}",
    unlockMeaning: "解锁条件",
    status: "状态",
    originalAwarded: "首次获得时间",
    close: "关闭徽章详情",
    dismiss: "退出徽章详情",
  },
  reveal: {
    unlocked: "徽章已解锁",
    continue: "完成揭晓",
    notNow: "暂不",
    saving: "正在保存揭晓状态…",
    queuePosition: "第 {current}/{total} 枚徽章",
    ackError: "未能保存徽章揭晓状态。请检查网络连接后重试。",
    retry: "重试确认",
    transferUnavailable: "收藏槽位已移动。将以无移动效果完成揭晓。",
  },
  definitions: {
    "ironclad-recruit": {
      name: "铁血新兵",
      unlockMeaning: "完成身份与 ELO 验证，成为符合资格的 IronClad 玩家。",
    },
    "first-deployment": {
      name: "首次部署",
      unlockMeaning: "完成你的第一场 IronClad 官方比赛。",
    },
    "first-victory": {
      name: "首场胜利",
      unlockMeaning: "赢得你的第一场 IronClad 官方比赛。",
    },
    "battle-tested": {
      name: "久经沙场",
      unlockMeaning: "完成 10 场 IronClad 官方比赛。",
    },
    "rising-through-the-ranks": {
      name: "步步高升",
      unlockMeaning:
        "在高于你首次完成 IronClad 锦标赛所在组别的组别中完成一场有效锦标赛。",
    },
    "first-campaign": {
      name: "初次战役",
      unlockMeaning: "完成你的第一届完整 IronClad 锦标赛。",
    },
    "iron-regular": {
      name: "铁血常客",
      unlockMeaning: "完成 3 届 IronClad 锦标赛。",
    },
    "tournament-veteran": {
      name: "赛事老兵",
      unlockMeaning: "完成 10 届 IronClad 锦标赛。",
    },
    "season-campaigner": {
      name: "赛季征战者",
      unlockMeaning: "在一个已结算的 IronClad 赛季中完成至少 4 场有效锦标赛。",
    },
    "reliable-competitor": {
      name: "可靠选手",
      unlockMeaning: "完成 10 次预定出场，且没有确认的本人缺席或双方缺席。",
    },
    "five-victories": {
      name: "五场胜利",
      unlockMeaning: "赢得 5 场 IronClad 官方比赛。",
    },
    "ten-victories": {
      name: "十场胜利",
      unlockMeaning: "赢得 10 场 IronClad 官方比赛。",
    },
    "twenty-five-victories": {
      name: "二十五场胜利",
      unlockMeaning: "赢得 25 场 IronClad 官方比赛。",
    },
    "iron-streak": {
      name: "钢铁连胜",
      unlockMeaning: "连续赢得 3 场实际进行的官方比赛。",
    },
    unbroken: {
      name: "势不可挡",
      unlockMeaning: "连续赢得 5 场实际进行的官方比赛。",
    },
    "clean-sweep": {
      name: "横扫对手",
      unlockMeaning: "以 2–0 赢得 BO3，或以 3–0 赢得 BO5。",
    },
    "comeback-commander": {
      name: "逆转指挥官",
      unlockMeaning: "输掉第 1 局后逆转赢得官方系列赛。",
    },
    "giant-slayer": {
      name: "巨人杀手",
      unlockMeaning: "击败锦标赛验证 ELO 至少高你 200 分的对手。",
    },
    "giant-hunter": {
      name: "巨人猎手",
      unlockMeaning: "在 3 次不同比赛中获得“巨人杀手”成就。",
    },
    "flawless-campaign": {
      name: "完美战役",
      unlockMeaning:
        "在至少实际进行一场官方系列赛且未输掉任何单局的情况下赢得 IronClad 锦标赛。",
    },
    "first-advance": {
      name: "首次晋级",
      unlockMeaning: "赢得你的第一个实际进行的锦标赛对阵轮次。",
    },
    semifinalist: {
      name: "半决赛选手",
      unlockMeaning: "晋级 IronClad 官方锦标赛半决赛。",
    },
    finalist: {
      name: "决赛选手",
      unlockMeaning: "晋级 IronClad 官方锦标赛决赛。",
    },
    "academy-champion": {
      name: "学院组冠军",
      unlockMeaning: "赢得 Academy 组别官方锦标赛。",
    },
    "challenge-champion": {
      name: "挑战组冠军",
      unlockMeaning: "赢得 Challenge 组别官方锦标赛。",
    },
    "elite-champion": {
      name: "精英组冠军",
      unlockMeaning: "赢得 Main/Elite 组别官方锦标赛。",
    },
    "double-champion": {
      name: "双冠王",
      unlockMeaning: "赢得 2 届不同的 IronClad 锦标赛。",
    },
    "triple-crown": {
      name: "三冠王",
      unlockMeaning: "分别至少赢得一次 Academy、Challenge 和 Main/Elite 组别锦标赛。",
    },
    "season-podium": {
      name: "赛季领奖台",
      unlockMeaning: "在一个已结算的官方赛季中获得前三名。",
    },
    "season-champion": {
      name: "赛季冠军",
      unlockMeaning: "在已结算的官方赛季排行榜中获得第 1 名。",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
