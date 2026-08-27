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
    account: "Account",
    signIn: "Sign in",
    support: "Support",
    supportTrigger: "Open Support",
    supportMessage: "Open a ticket with us for support on Discord.",
    openDiscordSupport: "Open Discord Support",
    announcements: "Announcements",
    announcementsUnread: "Announcements — new official announcement",
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
  analyticsConsent: {
    label: "Optional analytics",
    title: "Help improve IronClad",
    description:
      "Optional website analytics helps us understand visits and page use. It only loads after you allow it.",
    details:
      "When enabled, Vercel may receive the public page route, referrer, approximate country, device type, browser and operating system. IronClad does not use analytics cookies, advertising or session replay.",
    required:
      "Necessary authentication and security features are not affected by this choice.",
    allow: "Allow analytics",
    decline: "Decline",
    privacyLink: "Read the Privacy Policy",
    choices: "Analytics choices",
    dialogTitle: "Analytics choices",
    dialogDescription:
      "Change this browser's analytics choice at any time. Withdrawal stops future analytics collection.",
    close: "Close analytics choices",
    currentChoice: "Current choice",
    statusGranted: "Analytics allowed",
    statusDeclined: "Analytics off",
    statusUndecided: "No choice saved",
    withdraw: "Withdraw analytics consent",
    saveError:
      "Your choice could not be saved. Analytics is off in this tab, but the change may not persist. Check your browser storage settings and try again.",
    savedGranted: "Analytics allowed for this browser.",
    savedDeclined: "Analytics remains off for this browser.",
  },
  legalUpdate: {
    eyebrow: "Important legal update",
    title: "Review and accept the updated terms",
    description:
      "To continue using signed-in IronClad features, review and accept Terms of Service v{termsVersion} and acknowledge Privacy Policy v{privacyVersion}. Analytics remains optional and is a separate choice.",
    termsLinkLabel: "Read Terms of Service",
    privacyLinkLabel: "Read Privacy Policy",
    termsAgreement: "I accept Terms of Service v{termsVersion}.",
    privacyAcknowledgement:
      "I acknowledge Privacy Policy v{privacyVersion}.",
    continueAction: "Accept and continue",
    savingAction: "Saving acceptance…",
    signOutAction: "Sign out",
    retryAction: "Try again",
    unavailableTitle: "Legal update temporarily unavailable",
    unavailableDescription:
      "IronClad cannot verify the current legal documents right now. No acceptance has been recorded. Try again or sign out.",
    authRequiredError: "Sign in again to continue.",
    acceptanceRequiredError: "Both legal controls are required.",
    unavailableError:
      "IronClad could not record your acceptance. Nothing was saved. Try again.",
    acceptedMessage: "Acceptance recorded. Loading IronClad…",
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
    translationReviewNotice:
      "Translations are provided for convenience and have been carefully reviewed, but may not have been reviewed by a native speaker. English remains the source language.",
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
