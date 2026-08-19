import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "Inicio",
    tournaments: "Torneos",
    players: "Jugadores",
    rules: "Reglas",
    leaderboardAndRankings: "Clasificación general",
    about: "Acerca de",
    dashboard: "Panel",
    admin: "Administración",
    primaryNavigation: "Navegación principal",
    mobileNavigation: "Navegación móvil",
    openMenu: "Abrir el menú de navegación",
    closeMenu: "Cerrar el menú de navegación",
  },
  footer: {
    copyright: "© {year} IronClad. Todos los derechos reservados.",
    legalAndRules: "Aspectos legales y reglas",
    rules: "Reglas",
    rulebook: "Reglamento",
    participationAgreement: "Acuerdo de participación del jugador",
    participationAgreementShort: "PPA",
    terms: "Términos del servicio",
    privacy: "Política de privacidad",
    opensInNewTab: "{label} (se abre en una pestaña nueva)",
  },
  actions: {
    loading: "Cargando…",
    retry: "Reintentar",
    close: "Cerrar",
    cancel: "Cancelar",
    back: "Volver",
    save: "Guardar",
    continue: "Continuar",
    success: "Éxito",
    error: "Error",
  },
  selector: {
    language: "Idioma",
    triggerAriaLabel: "Elegir idioma. Idioma actual: {language}",
    languageRowLabel: "Idioma",
    title: "Elige tu idioma",
    description: "Selecciona el idioma de la experiencia de jugador de IronClad.",
    closeLabel: "Cerrar el selector de idioma",
    selectedLabel: "Seleccionado",
    savingLabel: "Guardando idioma…",
    saveError: "No se pudo guardar tu preferencia de idioma. Inténtalo de nuevo.",
    privacyHeading: "Preferencia de idioma",
    privacyCookie:
      "IronClad guarda tu elección expresa en una cookie funcional propia durante un período de hasta aproximadamente un año.",
    privacyClerk:
      "Si has iniciado sesión, la elección también puede guardarse de forma privada en Clerk para que los correos electrónicos transaccionales de IronClad puedan utilizar ese idioma.",
    privacyNoTracking:
      "Esta preferencia no se usa para publicidad ni seguimiento entre sitios web.",
    privacyNotEvidence:
      "No constituye prueba de tu ubicación, jurisdicción legal, consentimiento ni comprensión.",
    privacyChange: "Puedes cambiar la preferencia aquí en cualquier momento.",
    privacyPolicyLink: "Leer la Política de privacidad",
  },
  install: {
    mobile: "IronClad móvil", title: "Instalar IronClad", close: "Cerrar instrucciones de instalación", description: "Añade IronClad a la pantalla de inicio para acceder más rápido y disfrutar de una experiencia a pantalla completa similar a una aplicación.", now: "Instalar ahora", promptHelp: "El navegador abrirá el aviso seguro de instalación.", iosMenuTitle: "Abre el menú", iosMenuText: "Toca el botón ⋯ (Más) en Safari.", shareTitle: "Compartir", shareText: "Toca Compartir.", homeTitle: "Añadir a la pantalla de inicio", homeText: "Selecciona «Añadir a la pantalla de inicio». Si no aparece, toca «Más» y búscalo en la lista.", addTitle: "Instalar", addText: "Toca «Añadir».", browserMenuTitle: "Abre el menú del navegador", browserMenuText: "Toca el botón de menú en Chrome, Edge o tu navegador.", appTitle: "Instala la aplicación", appText: "Elige «Instalar aplicación» o «Añadir a pantalla de inicio».", confirmTitle: "Confirmar", confirmText: "Confirma la instalación cuando se solicite.", download: "Descargar nuestra aplicación", step: "Paso {number}",
  },
  music: { playerLabel: "Reproductor de música de IronClad", pause: "Pausar tema de IronClad", play: "Reproducir tema de IronClad", unavailable: "Música no disponible" },
  legal: {
    effectiveEnglishNotice:
      "El texto rector vigente está en inglés. Actualmente no se ofrece ninguna traducción oficial.",
    read: "Leer",
    download: "Descargar",
    continueInEnglish: "Continuar en inglés",
    goBack: "Volver",
  },
  errors: {
    notFoundEyebrow: "404 · No encontrado",
    notFoundTitle: "No se encontró esta página.",
    notFoundDescription: "Es posible que el enlace esté desactualizado o que la página se haya movido.",
    returnHome: "Volver al inicio",
    unexpectedTitle: "Algo salió mal.",
    unexpectedDescription:
      "IronClad no pudo cargar esta experiencia de jugador. Inténtalo de nuevo.",
    retry: "Intentar de nuevo",
    loading: "Cargando…",
  },
} satisfies CommonDictionary;

export default dictionary;
