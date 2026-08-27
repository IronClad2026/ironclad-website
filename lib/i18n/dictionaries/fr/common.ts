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
    account: "Compte",
    signIn: "Se connecter",
    support: "Assistance",
    supportTrigger: "Ouvrir l’assistance",
    supportMessage: "Ouvrez un ticket auprès de nous pour obtenir de l’aide sur Discord.",
    openDiscordSupport: "Ouvrir l’assistance Discord",
    announcements: "Annonces",
    announcementsUnread: "Annonces — nouvelle annonce officielle",
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
  analyticsConsent: {
    label: "Préférences d’analyse",
    title: "Aidez-nous à améliorer IronClad",
    description:
      "L’analyse facultative nous aide à comprendre les visites et l’utilisation des pages. Elle ne se charge que si vous l’autorisez.",
    details:
      "Lorsqu’elle est activée, Vercel peut recevoir le chemin de la page publique, la source de la visite, le pays approximatif, le type d’appareil, le navigateur et le système d’exploitation. IronClad n’utilise ni cookies d’analyse, ni publicité, ni relecture de session.",
    required:
      "Les fonctions nécessaires d’authentification et de sécurité ne sont pas affectées par ce choix.",
    allow: "Autoriser l’analyse",
    decline: "Refuser",
    privacyLink: "Lire la Politique de confidentialité",
    choices: "Choix relatifs à l’analyse",
    dialogTitle: "Préférences d’analyse",
    dialogDescription:
      "Vous pouvez modifier le choix de ce navigateur à tout moment. Le retrait de votre autorisation met fin à la collecte future de données d’analyse.",
    close: "Fermer les préférences d’analyse",
    currentChoice: "Choix actuel",
    statusGranted: "Analyse autorisée",
    statusDeclined: "Analyse désactivée",
    statusUndecided: "Aucun choix enregistré",
    withdraw: "Retirer l’autorisation d’analyse",
    saveError:
      "Nous n’avons pas pu enregistrer votre choix. L’analyse est désactivée dans cet onglet, mais ce changement peut ne pas persister. Vérifiez le stockage du navigateur et réessayez.",
    savedGranted: "Analyse autorisée.",
    savedDeclined: "L’analyse reste désactivée.",
  },
  legalUpdate: {
    eyebrow: "Mise à jour juridique importante",
    title: "Consultez et acceptez les conditions mises à jour",
    description:
      "Pour continuer à utiliser les fonctionnalités d’IronClad après connexion, consultez et acceptez Terms of Service v{termsVersion}, puis confirmez avoir pris connaissance de Privacy Policy v{privacyVersion}. L’analyse reste facultative et fait l’objet d’un choix distinct.",
    termsLinkLabel: "Lire Terms of Service",
    privacyLinkLabel: "Lire Privacy Policy",
    termsAgreement: "J’accepte Terms of Service v{termsVersion}.",
    privacyAcknowledgement:
      "Je confirme avoir pris connaissance de Privacy Policy v{privacyVersion}.",
    continueAction: "Accepter et continuer",
    savingAction: "Enregistrement de l’acceptation…",
    signOutAction: "Se déconnecter",
    retryAction: "Réessayer",
    unavailableTitle: "Mise à jour juridique temporairement indisponible",
    unavailableDescription:
      "IronClad ne peut pas vérifier les documents juridiques en vigueur pour le moment. Aucune acceptation n’a été enregistrée. Réessayez ou déconnectez-vous.",
    authRequiredError: "Reconnectez-vous pour continuer.",
    acceptanceRequiredError:
      "Les deux confirmations juridiques sont obligatoires.",
    unavailableError:
      "IronClad n’a pas pu enregistrer votre acceptation. Aucune information n’a été sauvegardée. Réessayez.",
    acceptedMessage: "Acceptation enregistrée. Chargement d’IronClad…",
  },
  selector: {
    language: "Langue",
    triggerAriaLabel: "Choisir la langue. Langue actuelle : {language}",
    languageRowLabel: "Langue",
    title: "Choisissez votre langue",
    description: "Sélectionnez la langue de votre expérience sur IronClad.",
    closeLabel: "Fermer le sélecteur de langue",
    selectedLabel: "Sélectionné",
    savingLabel: "Enregistrement de la langue…",
    saveError: "Impossible d’enregistrer votre préférence linguistique. Réessayez.",
    translationReviewNotice:
      "Les traductions sont fournies pour faciliter l’utilisation et ont été relues avec soin, mais elles n’ont pas nécessairement été relues par une personne de langue maternelle. L’anglais reste la langue source.",
    privacyHeading: "Préférence linguistique",
    privacyCookie:
      "IronClad conserve votre choix explicite dans un cookie fonctionnel déposé par IronClad pendant une durée maximale d’environ un an.",
    privacyClerk:
      "Si vous êtes connecté, ce choix peut aussi être stocké de manière privée chez Clerk afin que les e-mails transactionnels envoyés par IronClad utilisent cette langue.",
    privacyNoTracking:
      "Cette préférence ne sert ni à la publicité ni au suivi intersite.",
    privacyNotEvidence:
      "Elle ne constitue pas une preuve de votre localisation, du territoire juridique qui vous est applicable, de votre consentement ni de votre compréhension.",
    privacyChange: "Vous pouvez modifier cette préférence ici à tout moment.",
    privacyPolicyLink: "Lire la Politique de confidentialité",
  },
  install: {
    mobile: "IronClad Mobile", title: "Installer IronClad", close: "Fermer les instructions d’installation", description: "Ajoutez IronClad à votre écran d’accueil pour un accès plus rapide et une expérience plein écran proche d’une application.", now: "Installer maintenant", promptHelp: "Votre navigateur ouvrira la fenêtre d’installation sécurisée.", iosMenuTitle: "Ouvrez le menu", iosMenuText: "Touchez le bouton ⋯ (Plus) dans Safari.", shareTitle: "Partager", shareText: "Touchez Partager.", homeTitle: "Ajouter à l’écran d’accueil", homeText: "Sélectionnez « Ajouter à l’écran d’accueil ». Si l’option n’apparaît pas, touchez « Plus » et cherchez-la dans la liste.", addTitle: "Installer", addText: "Touchez « Ajouter ».", browserMenuTitle: "Ouvrez le menu du navigateur", browserMenuText: "Touchez le bouton de menu dans Chrome, Edge ou votre navigateur.", appTitle: "Installez l’application", appText: "Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».", confirmTitle: "Confirmer", confirmText: "Confirmez l’installation lorsque le navigateur vous le demande.", download: "Télécharger notre application", step: "Étape {number}",
  },
  music: { playerLabel: "Lecteur de la musique d’IronClad", pause: "Mettre le thème IronClad en pause", play: "Lire le thème IronClad", unavailable: "Musique indisponible" },
  legal: {
    effectiveEnglishNotice:
      "Le texte applicable faisant foi est en anglais. Aucune traduction officielle n’est actuellement disponible.",
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
