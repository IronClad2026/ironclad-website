import type { DictionaryShape } from "@/lib/i18n/types";
import type english from "@/lib/i18n/dictionaries/en/public-player-history";

const dictionary = {
  "order": "按报名时间从新到旧排列。历史记录分页显示。",
  "empty": "暂无公开赛事记录。",
  "emptyPage": "此页没有公开赛事记录。",
  "unavailable": "无法加载赛事记录，请稍后重试。",
  "division": "组别：{division}",
  "eventIncomplete": "赛事尚未结束",
  "withdrawn": "已退赛",
  "champion": "组别冠军",
  "placement": "最终名次：{rank}",
  "noPlacement": "组别已结束 · 未记录名次",
  "noFinalOutcome": "无最终竞赛结果",
  "resultPending": "最终结果待定",
  "entryRecord": "正式系列赛：已赛 {played} 场 · {wins} 胜 · {losses} 负",
  "pagination": "赛事历史分页",
  "previous": "较新记录",
  "next": "较早记录",
  "page": "第 {page} 页",
  "limit": "较早记录超出当前查看上限。",
  "scope": "此页赛事合计",
  "played": "已完成正式系列赛",
  "wins": "系列赛胜场",
  "losses": "系列赛负场",
  "winRate": "系列赛胜率",
  "notAvailable": "—",
  "rules": "统计已完成的正式对阵／系列赛，而非单局。待确认结果、轮空、缺席和管理性晋级不计为已赛。弃权依照正式已赛对阵规则统计。合计仅涵盖此页。",
  "states": {
    "disabled": "组别不可用",
    "filling": "比赛开始前",
    "ready": "即将开始",
    "in_progress": "组别进行中",
    "completed": "组别已结束",
    "not_held": "组别未举办",
    "cancelled": "赛事已取消",
    "voided": "赛事已作废"
  }
} satisfies DictionaryShape<typeof english>;

export default dictionary;
