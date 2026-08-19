import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "Accueil",
    tournaments: "Tournois",
    players: "Joueurs",
    rules: "Règlement",
    leaderboardAndRankings: "Classement",
    about: "À propos",
    dashboard: "Tableau de bord",
    admin: "Administration",
    primaryNavigation: "Navigation principale",
    mobileNavigation: "Navigation mobile",
    openMenu: "Ouvrir le menu de navigation",
    closeMenu: "Fermer le menu de navigation",
  },
  footer: {
    copyright: "© {year} IronClad. Tous droits réservés.",
    legalAndRules: "Mentions légales et règlement",
    rules: "Règlement",
    rulebook: "Livre de règles",
    participationAgreement: "Accord de participation du joueur",
    participationAgreementShort: "PPA",
    terms: "Conditions d’utilisation",
    privacy: "Politique de confidentialité",
    opensInNewTab: "{label} (s’ouvre dans un nouvel onglet)",
  },
  actions: {
    loading: "Chargement…",
    retry: "Réessayer",
    close: "Fermer",
    cancel: "Annuler",
    back: "Retour",
    save: "Enregistrer",
    continue: "Continuer",
    success: "Succès",
    error: "Erreur",
  },
  selector: {
    language: "Langue",
    triggerAriaLabel: "Choisir la langue. Langue actuelle : {language}",
    languageRowLabel: "Langue",
    title: "Choisissez votre langue",
    description: "Sélectionnez la langue de l’expérience joueur IronClad.",
    closeLabel: "Fermer le sélecteur de langue",
    selectedLabel: "Sélectionné",
    savingLabel: "Enregistrement de la langue…",
    saveError: "Impossible d’enregistrer votre préférence linguistique. Réessayez.",
    privacyHeading: "Préférence linguistique",
    privacyCookie:
      "IronClad conserve votre choix explicite dans un cookie fonctionnel déposé par IronClad pendant environ un an au maximum.",
    privacyClerk:
      "Si vous êtes connecté, ce choix peut aussi être stocké de manière privée chez Clerk afin que les e-mails transactionnels envoyés par IronClad utilisent cette langue.",
    privacyNoTracking:
      "Cette préférence ne sert ni à la publicité ni au suivi intersite.",
    privacyNotEvidence:
      "Elle ne prouve pas votre localisation, votre juridiction, votre consentement ni votre compréhension.",
    privacyChange: "Vous pouvez modifier cette préférence ici à tout moment.",
    privacyPolicyLink: "Lire la Politique de confidentialité",
  },
  install: {
    mobile: "IronClad Mobile", title: "Installer IronClad", close: "Fermer les instructions d’installation", description: "Ajoutez IronClad à votre écran d’accueil pour un accès plus rapide et une expérience plein écran proche d’une application.", now: "Installer maintenant", promptHelp: "Votre navigateur ouvrira la fenêtre d’installation sécurisée.", iosMenuTitle: "Ouvrez le menu", iosMenuText: "Touchez le bouton ⋯ (Plus) dans Safari.", shareTitle: "Partager", shareText: "Touchez Partager.", homeTitle: "Ajouter à l’écran d’accueil", homeText: "Sélectionnez « Ajouter à l’écran d’accueil ». Si l’option n’apparaît pas, touchez « Plus » et cherchez-la dans la liste.", addTitle: "Installer", addText: "Touchez « Ajouter ».", browserMenuTitle: "Ouvrez le menu du navigateur", browserMenuText: "Touchez le bouton de menu dans Chrome, Edge ou votre navigateur.", appTitle: "Installez l’application", appText: "Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».", confirmTitle: "Confirmer", confirmText: "Confirmez l’installation lorsque le navigateur vous le demande.", download: "Télécharger notre application", step: "Étape {number}",
  },
  music: { playerLabel: "Lecteur de la musique d’IronClad", pause: "Mettre le thème IronClad en pause", play: "Lire le thème IronClad", unavailable: "Musique indisponible" },
  legal: {
    effectiveEnglishNotice:
      "Le texte régissant en vigueur est en anglais. Aucune traduction officielle n’est actuellement fournie.",
    read: "Lire",
    download: "Télécharger",
    continueInEnglish: "Continuer en anglais",
    goBack: "Retour",
  },
  errors: {
    notFoundEyebrow: "404 · Page introuvable",
    notFoundTitle: "Cette page est introuvable.",
    notFoundDescription: "Le lien est peut-être obsolète ou la page a été déplacée.",
    returnHome: "Retour à l’accueil",
    unexpectedTitle: "Une erreur s’est produite.",
    unexpectedDescription:
      "IronClad n’a pas pu charger cette expérience joueur. Veuillez réessayer.",
    retry: "Réessayer",
    loading: "Chargement…",
  },
} satisfies CommonDictionary;

export default dictionary;
