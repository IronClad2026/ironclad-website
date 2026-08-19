import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "首页",
    tournaments: "锦标赛",
    players: "玩家",
    rules: "规则",
    leaderboardAndRankings: "排行榜与排名",
    about: "关于",
    dashboard: "控制面板",
    admin: "管理",
    primaryNavigation: "主导航",
    mobileNavigation: "移动端导航",
    openMenu: "打开导航菜单",
    closeMenu: "关闭导航菜单",
  },
  footer: {
    copyright: "© {year} IronClad。保留所有权利。",
    legalAndRules: "法律与规则",
    rules: "规则",
    rulebook: "规则手册",
    participationAgreement: "玩家参与协议",
    participationAgreementShort: "PPA",
    terms: "服务条款",
    privacy: "隐私政策",
    opensInNewTab: "{label}（在新标签页中打开）",
  },
  actions: {
    loading: "正在加载…",
    retry: "重试",
    close: "关闭",
    cancel: "取消",
    back: "返回",
    save: "保存",
    continue: "继续",
    success: "成功",
    error: "错误",
  },
  selector: {
    language: "语言",
    triggerAriaLabel: "选择语言。当前语言：{language}",
    languageRowLabel: "语言",
    title: "选择您的语言",
    description: "选择 IronClad 玩家体验所使用的语言。",
    closeLabel: "关闭语言选择器",
    selectedLabel: "已选择",
    savingLabel: "正在保存语言…",
    saveError: "无法保存您的语言偏好。请重试。",
    privacyHeading: "语言偏好",
    privacyCookie:
      "IronClad 会将您的明确语言选择保存在第一方功能性 Cookie 中，期限最长约为一年。",
    privacyClerk:
      "如果您已登录，该选择也可能会私密存储在 Clerk 中，以便 IronClad 发送的服务通知邮件使用相应语言。",
    privacyNoTracking: "此偏好不会用于广告或跨站跟踪。",
    privacyNotEvidence:
      "它不能作为您的所在地、法律管辖地、同意或理解程度的证明。",
    privacyChange: "您可以随时在此更改该偏好。",
    privacyPolicyLink: "阅读隐私政策",
  },
  install: {
    mobile: "IronClad 移动版", title: "安装 IronClad", close: "关闭安装说明", description: "将 IronClad 添加到主屏幕，以便更快访问并获得类似应用的全屏体验。", now: "立即安装", promptHelp: "浏览器将打开安全的安装提示。", iosMenuTitle: "打开菜单", iosMenuText: "在 Safari 中轻点 ⋯（更多）按钮。", shareTitle: "共享", shareText: "轻点“共享”。", homeTitle: "添加到主屏幕", homeText: "选择“添加到主屏幕”。如果没有看到，请轻点“更多”并在列表中查找。", addTitle: "安装", addText: "轻点“添加”。", browserMenuTitle: "打开浏览器菜单", browserMenuText: "轻点 Chrome、Edge 或当前浏览器中的菜单按钮。", appTitle: "安装应用", appText: "选择“安装应用”或“添加到主屏幕”。", confirmTitle: "确认", confirmText: "出现提示时确认安装。", download: "下载我们的应用", step: "第 {number} 步",
  },
  music: { playerLabel: "IronClad 主题音乐播放器", pause: "暂停 IronClad 主题音乐", play: "播放 IronClad 主题音乐", unavailable: "音乐暂不可用" },
  legal: {
    effectiveEnglishNotice:
      "现行且具有约束力的文本为英文。目前不提供官方译文。",
    read: "阅读",
    download: "下载",
    continueInEnglish: "切换为英文并继续",
    goBack: "返回",
  },
  errors: {
    notFoundEyebrow: "404 · 未找到",
    notFoundTitle: "找不到此页面。",
    notFoundDescription: "链接可能已失效，或页面已被移动。",
    returnHome: "返回首页",
    unexpectedTitle: "出现错误。",
    unexpectedDescription: "IronClad 无法加载此玩家页面。请重试。",
    retry: "重试",
    loading: "正在加载…",
  },
} satisfies CommonDictionary;

export default dictionary;
