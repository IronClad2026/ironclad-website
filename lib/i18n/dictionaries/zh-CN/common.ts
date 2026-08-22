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
  analyticsConsent: {
    label: "分析偏好设置",
    title: "帮助改进 IronClad",
    description:
      "可选的网站分析可帮助我们了解访问情况和页面使用方式。只有在您允许后，分析功能才会加载。",
    details:
      "启用后，Vercel 可能会接收公开页面路径、访问来源、大致所在国家或地区、设备类型、浏览器和操作系统信息。IronClad 不使用分析 Cookie、广告或会话重放。",
    required: "必要的身份验证和安全功能不受此选择影响。",
    allow: "允许分析",
    decline: "拒绝",
    privacyLink: "阅读隐私政策",
    choices: "分析选项",
    dialogTitle: "分析偏好设置",
    dialogDescription:
      "您可以随时更改此浏览器的分析选择。撤回许可后，将停止今后的分析数据收集。",
    close: "关闭分析偏好设置",
    currentChoice: "当前选择",
    statusGranted: "已允许分析",
    statusDeclined: "分析已关闭",
    statusUndecided: "尚未保存选择",
    withdraw: "撤回分析许可",
    saveError:
      "无法保存您的选择。此标签页中的分析已关闭，但该更改可能无法保留。请检查浏览器存储设置后重试。",
    savedGranted: "已允许分析。",
    savedDeclined: "分析保持关闭。",
  },
  legalUpdate: {
    eyebrow: "重要法律更新",
    title: "请查看并接受更新后的条款",
    description:
      "要继续使用 IronClad 的登录功能，请查看并接受 Terms of Service v{termsVersion}，并确认知悉 Privacy Policy v{privacyVersion}。分析功能仍为可选项，并需单独选择。",
    termsLinkLabel: "阅读 Terms of Service",
    privacyLinkLabel: "阅读 Privacy Policy",
    termsAgreement: "我接受 Terms of Service v{termsVersion}。",
    privacyAcknowledgement:
      "我确认已知悉 Privacy Policy v{privacyVersion}。",
    continueAction: "接受并继续",
    savingAction: "正在保存接受记录…",
    signOutAction: "退出登录",
    retryAction: "重试",
    unavailableTitle: "法律更新暂时不可用",
    unavailableDescription:
      "IronClad 目前无法验证现行法律文件。尚未记录任何接受信息。请重试或退出登录。",
    authRequiredError: "请重新登录以继续。",
    acceptanceRequiredError: "必须勾选两项法律确认。",
    unavailableError:
      "IronClad 无法记录您的接受信息。未保存任何内容。请重试。",
    acceptedMessage: "接受信息已记录。正在加载 IronClad…",
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
    translationReviewNotice:
      "网站译文旨在方便您使用，且已经过认真审核，但不一定由母语人士审校。英文仍为源语言。",
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
