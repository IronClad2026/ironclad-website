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
  analyticsConsent: {
    label: "Preferencias de analítica",
    title: "Ayúdanos a mejorar IronClad",
    description:
      "La analítica opcional nos ayuda a entender las visitas y el uso de las páginas. Solo se carga si la permites.",
    details:
      "Cuando está activada, Vercel puede recibir la ruta de la página pública, la procedencia de la visita, el país aproximado, el tipo de dispositivo, el navegador y el sistema operativo. IronClad no usa cookies de analítica, publicidad ni reproducción de sesiones.",
    required:
      "Las funciones necesarias de autenticación y seguridad no se ven afectadas por esta elección.",
    allow: "Permitir analítica",
    decline: "Rechazar",
    privacyLink: "Leer la Política de privacidad",
    choices: "Opciones de analítica",
    dialogTitle: "Preferencias de analítica",
    dialogDescription:
      "Puedes cambiar la elección de este navegador en cualquier momento. Retirar el permiso detiene la recopilación futura de datos analíticos.",
    close: "Cerrar las preferencias de analítica",
    currentChoice: "Elección actual",
    statusGranted: "Analítica permitida",
    statusDeclined: "Analítica desactivada",
    statusUndecided: "No hay ninguna elección guardada",
    withdraw: "Retirar el permiso para la analítica",
    saveError:
      "No hemos podido guardar tu elección. La analítica está desactivada en esta pestaña, pero es posible que el cambio no se conserve. Revisa el almacenamiento del navegador e inténtalo de nuevo.",
    savedGranted: "Analítica permitida.",
    savedDeclined: "La analítica sigue desactivada.",
  },
  legalUpdate: {
    eyebrow: "Actualización legal importante",
    title: "Revisa y acepta los términos actualizados",
    description:
      "Para seguir usando las funciones de IronClad con la sesión iniciada, revisa y acepta Terms of Service v1.1 y confirma que has leído Privacy Policy v1.1. La analítica sigue siendo opcional y se elige por separado.",
    termsLinkLabel: "Leer Terms of Service",
    privacyLinkLabel: "Leer Privacy Policy",
    termsAgreement: "Acepto Terms of Service v1.1.",
    privacyAcknowledgement:
      "Confirmo que he leído Privacy Policy v1.1.",
    continueAction: "Aceptar y continuar",
    savingAction: "Guardando la aceptación…",
    signOutAction: "Cerrar sesión",
    retryAction: "Intentarlo de nuevo",
    unavailableTitle:
      "La actualización legal no está disponible temporalmente",
    unavailableDescription:
      "IronClad no puede verificar los documentos legales vigentes en este momento. No se ha registrado ninguna aceptación. Inténtalo de nuevo o cierra sesión.",
    authRequiredError: "Vuelve a iniciar sesión para continuar.",
    acceptanceRequiredError:
      "Es obligatorio marcar las dos casillas legales.",
    unavailableError:
      "IronClad no ha podido registrar tu aceptación. No se ha guardado nada. Inténtalo de nuevo.",
    acceptedMessage: "Aceptación registrada. Cargando IronClad…",
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
    translationReviewNotice:
      "Las traducciones se ofrecen para facilitar el uso y se han revisado cuidadosamente, aunque es posible que no las haya revisado un hablante nativo. El inglés sigue siendo el idioma de origen.",
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
