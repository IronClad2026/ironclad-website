import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  nav: {
    home: "Home",
    tournaments: "Tournaments",
    players: "Players",
    rules: "Rules",
    leaderboardAndRankings: "Leaderboard & Rankings",
    about: "About",
    dashboard: "Dashboard",
    admin: "Admin",
    primaryNavigation: "Primary navigation",
    mobileNavigation: "Mobile navigation",
    openMenu: "Open navigation menu",
    closeMenu: "Close navigation menu",
  },
  footer: {
    copyright: "© {year} IronClad. All rights reserved.",
    legalAndRules: "Legal and rules",
    rules: "Rules",
    rulebook: "Rulebook",
    participationAgreement: "Player Participation Agreement",
    participationAgreementShort: "PPA",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    opensInNewTab: "{label} (opens in a new tab)",
  },
  actions: {
    loading: "Loading…",
    retry: "Retry",
    close: "Close",
    cancel: "Cancel",
    back: "Back",
    save: "Save",
    continue: "Continue",
    success: "Success",
    error: "Error",
  },
  selector: {
    language: "Language",
    triggerAriaLabel: "Choose language. Current language: {language}",
    languageRowLabel: "Language",
    title: "Choose your language",
    description: "Select the language used for the IronClad player experience.",
    closeLabel: "Close language selector",
    selectedLabel: "Selected",
    savingLabel: "Saving language…",
    saveError: "We couldn't save your language preference. Try again.",
    privacyHeading: "Language preference",
    privacyCookie:
      "IronClad stores your explicit choice in a first-party functional cookie for up to approximately one year.",
    privacyClerk:
      "If you are signed in, the choice may also be stored privately with Clerk so app-owned transactional emails can use it.",
    privacyNoTracking:
      "This preference is not used for advertising or cross-site tracking.",
    privacyNotEvidence:
      "It is not evidence of location, legal jurisdiction, consent, or comprehension.",
    privacyChange: "You can change the preference here at any time.",
    privacyPolicyLink: "Read the Privacy Policy",
  },
  install: {
    mobile: "IronClad Mobile", title: "Install IronClad", close: "Close installation instructions",
    description: "Add IronClad to your Home Screen for faster access and an app-like full-screen experience.",
    now: "Install now", promptHelp: "Your browser will open the secure installation prompt.",
    iosMenuTitle: "Open the menu", iosMenuText: "Tap the ⋯ (More) button in Safari.", shareTitle: "Share", shareText: "Tap Share.",
    homeTitle: "Add to Home Screen", homeText: "Select “Add to Home Screen”. If you don’t see it, tap “More” and look for it in the list.", addTitle: "Install", addText: "Tap “Add”.",
    browserMenuTitle: "Open the browser menu", browserMenuText: "Tap the menu button in Chrome, Edge, or your browser.", appTitle: "Install the app", appText: "Choose “Install app” or “Add to Home screen”.",
    confirmTitle: "Confirm", confirmText: "Confirm the installation when prompted.", download: "Download our app", step: "Step {number}",
  },
  music: { playerLabel: "IronClad theme music player", pause: "Pause IronClad theme", play: "Play IronClad theme", unavailable: "Music unavailable" },
  legal: {
    effectiveEnglishNotice:
      "The Effective governing text is in English. No official translation is currently provided.",
    read: "Read",
    download: "Download",
    continueInEnglish: "Continue in English",
    goBack: "Go back",
  },
  errors: {
    notFoundEyebrow: "404 · Not found",
    notFoundTitle: "This page could not be found.",
    notFoundDescription: "The link may be outdated, or the page may have moved.",
    returnHome: "Return home",
    unexpectedTitle: "Something went wrong.",
    unexpectedDescription:
      "IronClad could not load this player experience. Please try again.",
    retry: "Try again",
    loading: "Loading…",
  },
} as const;

export type CommonDictionary = DictionaryShape<typeof dictionary>;

export default dictionary;
