import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";

const dictionary = {
  metadata: {
    rootTitle: "Torneos IronClad | Company of Heroes 3 competitivo",
    rootDescription: "Participa en torneos estructurados de Company of Heroes 3 con divisiones verificadas, juego limpio y clasificaciones oficiales.",
    aboutTitle: "Acerca de IronClad | Torneos de Company of Heroes 3",
    aboutDescription: "Descubre cómo IronClad organiza torneos justos y estructurados de Company of Heroes 3 y clasificaciones competitivas duraderas.",
    manifestName: "Torneos IronClad",
    manifestDescription: "Torneos competitivos de Company of Heroes 3, perfiles de jugadores, partidas y clasificaciones.",
  },
  regions: { europe: "Europa", northAmerica: "Norteamérica", southAmerica: "Sudamérica", oceania: "Oceanía", asia: "Asia", middleEast: "Oriente Medio", africa: "África", global: "Global" },
  home: {
    hero: {
      eyebrow: "Eventos competitivos de Company of Heroes 3",
      title: "Torneos IronClad",
      description:
        "Compite en 1v1 con divisiones verificadas, juego limpio, clasificaciones permanentes de carrera y temporadas Main / Pro de seis eventos.",
      viewTournaments: "Ver torneos",
      joinDiscord: "Unirse a Discord (opcional)",
      launchFormat: "Formato de lanzamiento",
      divisionSize: "Tamaño de la división",
      integrityModel: "Modelo de integridad",
      fairPlay: "Juego limpio",
    },
    command: {
      label: "Resumen de mando de IronClad",
      online: "Operaciones activas",
      integrityTitle: "Integridad competitiva",
      integrityText:
        "Las reglas claras y la revisión de los administradores respaldan una competición justa y estructurada.",
      tournamentsTitle: "Torneos estructurados",
      tournamentsText:
        "Los cuadros, calendarios y novedades de los torneos son fáciles de seguir.",
      choiceTitle: "Elección del jugador",
      choiceText:
        "Los perfiles públicos y el contacto de Discord solo aparecen cuando el jugador decide compartirlos.",
      ready: "LISTO",
      readyText:
        "Torneos, perfiles, jugadores y reglas conectados para el próximo evento competitivo.",
    },
    players: {
      eyebrow: "Jugadores de IronClad",
      title: "Descubre la plantilla pública",
      description:
        "Explora a los jugadores que han decidido mostrarse, compara su ELO, consulta perfiles públicos y usa Discord cuando hayan activado el contacto.",
      directory: "Directorio de jugadores",
      privacy:
        "Los perfiles públicos solo muestran campos aprobados por cada jugador.",
      browse: "Explorar jugadores",
    },
    path: {
      eyebrow: "RUTA COMPETITIVA",
      title: "CÓMO FUNCIONA LA COMPETICIÓN DE IRONCLAD",
      description:
        "Verifica tu división, juega en un cuadro estructurado de ocho jugadores y crea un historial competitivo oficial.",
      verifyTitle: "1V1 VERIFICADO",
      verifyText:
        "Conecta Steam y verifica tu ELO 1v1 actual de Relic. IronClad te asigna a Academy, Challenge o Main / Pro y bloquea esa instantánea de elegibilidad para el evento.",
      verifyCta: "VER TORNEOS",
      reportTitle: "JUEGA E INFORMA",
      reportText:
        "Juega con la selección de mapas publicada de la División, usa Dice autenticado en los desempates de los juegos impares e informa del resultado de la serie con una repetición .rec privada por cada juego disputado. Tu rival podrá confirmar o impugnar el informe.",
      reportCta: "LEER REGLAS 1V1",
      progressTitle: "COMPITE Y PROGRESA",
      progressText:
        "Suma puntos mediante la participación y el progreso válidos. Academy y Challenge mantienen clasificaciones permanentes de carrera; Main / Pro se disputa en temporadas de seis eventos.",
      progressCta: "VER CLASIFICACIONES",
    },
  },
  about: {
    heroEyebrow: "Creado para la competición de Company of Heroes 3",
    heroTitle: "Torneos IronClad",
    heroDescription:
      "Una plataforma de torneos impulsada por la comunidad que ofrece a los jugadores de Company of Heroes 3 un lugar estructurado, competitivo y justo.",
    joinTournament: "Unirse a un torneo",
    viewRankings: "Ver clasificaciones",
    joinDiscord: "Unirse a Discord",
    tacticalSystem: "SISTEMA TÁCTICO DE EVENTOS",
    seasonReady: "TEMPORADA LISTA",
    seasonReadyText:
      "Cuadros, verificación, informes de partidas y clasificaciones preparados para competir.",
    missionEyebrow: "Misión",
    missionTitle: "Un hogar competitivo para jugadores de CoH3",
    missionText:
      "IronClad apoya la escena competitiva de Company of Heroes 3 con torneos organizados, reglas claras, cuadros justos, clasificaciones de carrera y temporada y un entorno comunitario serio.",
    clearRules: "Reglas claras",
    clearRulesText: "Cada evento comienza con expectativas visibles.",
    fairBrackets: "Cuadros justos",
    fairBracketsText: "Los jugadores compiten en rangos ELO definidos.",
    competitiveProgress: "Progreso competitivo",
    competitiveProgressText:
      "Los resultados crean clasificaciones permanentes de carrera o una temporada Main / Pro de seis eventos.",
    structureEyebrow: "Estructura de torneos",
    structureTitle: "Eventos estructurados. Progreso claro.",
    structureText:
      "Organizamos torneos comunitarios para distintos niveles, desde nuevos competidores hasta jugadores de élite. Cada evento se basa en reglas claras, integridad del cuadro, informes de partidas y progreso competitivo.",
    academyRange: "Menos de 1100 ELO",
    academyText:
      "Para jugadores que desarrollan sus fundamentos competitivos en un rango protegido.",
    challengeRange: "1100–1399 ELO",
    challengeText:
      "Para competidores en ascenso que buscan cuadros más exigentes y rivales más fuertes.",
    mainRange: "1400+ ELO",
    mainText:
      "Para los mejores competidores que luchan por los puestos más altos de IronClad.",
    integrityEyebrow: "Integridad",
    integrityTitle: "La competición justa es lo primero",
    integrityText:
      "IronClad usa verificación de ELO, comprobaciones de perfil, revisión de los administradores, informes estructurados, pruebas y controles de clasificación para proteger la integridad del torneo.",
    eloVerification: "Verificación de ELO",
    adminApproval: "Aprobación del administrador",
    proofResults: "Resultados respaldados por pruebas",
    careerStandings: "Clasificaciones de carrera y temporada",
    impersonationChecks: "Controles contra suplantaciones",
    clearTournamentRules: "Reglas de torneo claras",
    communityEyebrow: "Comunidad",
    communityTitle: "Creado por la comunidad. Para la comunidad.",
    communityText:
      "IronClad se construye en torno a jugadores, administradores, comentaristas y toda la comunidad de Company of Heroes 3. Queremos un entorno donde mejorar, competir y recibir reconocimiento.",
    players: "Jugadores",
    playersText: "Un lugar para medir tu habilidad, progresar y ganar reconocimiento.",
    staff: "Equipo competitivo",
    staffText:
      "Administradores y comentaristas que favorecen resultados claros y mejores eventos.",
    futureEyebrow: "Visión de futuro",
    futureTitle: "Construyendo el futuro de la competición de CoH3",
    futureText:
      "IronClad es más que una web de torneos. Es un proyecto a largo plazo para hacer crecer la escena competitiva de Company of Heroes 3 con mejores eventos, herramientas comunitarias, clasificaciones de carrera y temporada y experiencias profesionales.",
    betterEvents: "Mejores eventos",
    strongerTools: "Mejores herramientas comunitarias",
    careerRankings: "Clasificaciones de carrera y temporada",
    professionalExperiences: "Experiencias profesionales de torneo",
    enterBattlefield: "Entra en el campo de batalla",
    registerTournament: "Inscribirse en un torneo",
    viewLeaderboard: "Ver clasificación",
  },
  players: {
    metadataTitle: "Directorio de jugadores | IronClad",
    metadataDescription:
      "Explora perfiles públicos de jugadores de Company of Heroes 3 y sus puntuaciones competitivas en IronClad.",
    eyebrow: "Plantilla de IronClad",
    title: "Directorio de jugadores",
    description:
      "Explora comandantes públicos de IronClad, puntuaciones ELO, regiones y disponibilidad opcional en Discord.",
    privacy:
      "Solo se muestran campos aprobados por el jugador. Los perfiles privados no aparecen.",
    commanders: "Comandantes públicos",
    directorySafe:
      "Los datos del directorio se limitan a los campos del perfil autorizados para mostrarse públicamente.",
    search: "Buscar jugador",
    searchPlaceholder: "Buscar por nombre",
    eloFilter: "ELO",
    eloPlaceholder: "Filtrar por ELO",
    countryFilter: "País",
    countryPlaceholder: "Buscar países",
    playerOne: "Jugador",
    playerMany: "Jugadores",
    noPlayers: "Aún no hay jugadores públicos.",
    noMatches: "Ningún jugador público coincide con los filtros.",
    emptyHelp:
      "Las tarjetas aparecerán cuando haya perfiles de IronClad aptos y configurados como públicos.",
    allCountries: "Todos los países",
    allElo: "Todas las puntuaciones ELO",
    unrated: "Sin puntuación",
    unknown: "Desconocido",
    regionUnknown: "Región desconocida",
    viewProfile: "Perfil público",
    avatarLabel: "Avatar de {name}",
    back: "Volver a Jugadores",
    profileEyebrow: "Perfil público de IronClad",
    currentElo: "ELO actual",
    country: "País",
    region: "Región",
    division: "División",
    discordAvailable: "Contacto de Discord disponible",
    unknownCountry: "País desconocido",
    competitiveRecord: "Historial competitivo",
    publicStats: "Estadísticas públicas",
    publicStatsText:
      "Información competitiva que el jugador ha autorizado a mostrar públicamente en IronClad.",
    tournamentHistory: "Historial de torneos",
    tournamentHistoryText:
      "El historial público de torneos aparecerá cuando haya un resumen apto para publicación.",
    matchStatistics: "Estadísticas de partidas",
    matchStatisticsText:
      "Las estadísticas públicas aparecerán cuando las victorias, las derrotas y el historial de partidas estén disponibles para su publicación.",
    comingLater: "Próximamente",
    discordUnavailable: "Contacto de Discord no disponible.",
    discordUnavailableText:
      "Este jugador no ha activado el contacto público de Discord.",
    discordContact: "Contacto de Discord",
    discordOptedIn: "Este jugador ha activado el contacto público de Discord.",
    contactPlayer: "Contactar al jugador",
    discordUsername: "Usuario de Discord",
    copied: "Copiado al portapapeles.",
    copyFailed:
      "No se pudo acceder al portapapeles. Copia el usuario manualmente.",
    notFoundTitle: "Jugador no encontrado | IronClad",
    profileMetadataTitle: "{name} | Perfil de jugador de IronClad",
    profileMetadataDescription: "Perfil público de IronClad de {name}.",
  },
  rankings: {
    metadataTitle: "Clasificación general | IronClad",
    metadataDescription:
      "Sigue la temporada Main / Pro de seis eventos y las clasificaciones permanentes de carrera de Academy y Challenge.",
    mainSeason: "Temporada Main / Pro",
    academyCareer: "Carrera de Academy",
    challengeCareer: "Carrera de Challenge",
    loadWarning:
      "No se pudieron cargar algunos datos de clasificación. Esta página pública muestra todos los conjuntos de datos autorizados que están disponibles.",
    publicLeaderboard: "Clasificación pública",
    dynamicStandings: "Clasificación dinámica",
    mainDescription:
      "Clasificación oficial Main / Pro de la temporada destacada de seis eventos válidos.",
    academyDescription:
      "Los puntos y resultados de Academy permanecen en esta vista permanente de carrera.",
    challengeDescription:
      "Los puntos y resultados de Challenge permanecen en esta vista permanente de carrera.",
    safeData: "Todas las filas proceden de vistas de clasificación autorizadas para su publicación.",
    visibleCompetitors: "Competidores visibles",
    rankingModel: "Modelo de clasificación",
    sixEventSeason: "Temporada de seis eventos",
    permanentCareer: "Carrera permanente",
    seasonState: "Estado de temporada",
    division: "División",
    heroEyebrow: "Mando competitivo de IronClad",
    heroTitle: "Clasificación general",
    heroDescription:
      "Main / Pro es la temporada oficial de seis eventos válidos. Academy y Challenge mantienen clasificaciones permanentes separadas.",
    featuredSeason: "Temporada Main / Pro destacada",
    careerStandings: "Clasificación de carrera",
    seasonNotStarted: "Temporada no iniciada",
    noSeason:
      "No hay una temporada clasificatoria en curso. La clasificación empieza con el primer evento Main / Pro válido.",
    careerRecord:
      "Los puntos forman parte del historial competitivo permanente de esta División.",
    validEvents: "Eventos clasificatorios válidos",
    underReviewNotice:
      "Los resultados están en revisión. La clasificación mostrada no es definitiva mientras siga abierta.",
    careerNoReset:
      "Los puntos de carrera no se reinician al terminar una temporada Main / Pro y permanecen separados de la otra División de carrera.",
    competitors: "Competidores",
    season: "Temporada",
    state: "Estado",
    scope: "Ámbito",
    permanent: "Permanente",
    reset: "Reinicio",
    never: "Nunca",
    tba: "Por confirmar",
    careerTitle: "{division} es una clasificación permanente de carrera.",
    careerSeparation:
      "Los puntos no se reinician al acabar una temporada Main / Pro. El historial Academy sigue en Academy, el de Challenge en Challenge y ninguno pasa a Main / Pro.",
    entrantBonus:
      "Los nuevos participantes pueden recibir +5 puntos por evento elegible anterior, una vez por División, hasta +25.",
    notStarted: "No iniciada",
    notStartedDescription: "La temporada no ha comenzado.",
    underReview: "En revisión",
    underReviewDescription:
      "La clasificación histórica congelada sigue visible durante la revisión de la temporada finalizada.",
    finalized: "Finalizada",
    finalizedDescription: "Finalizada. Esta clasificación Main / Pro está congelada.",
    finalizationPending: "Finalización pendiente",
    finalizationPendingDescription:
      "Finalización pendiente. La puntuación y finalización automáticas deberían completarse tras el sexto evento válido.",
    inProgress: "En curso",
    inProgressDescription: "Temporada en curso.",
    topUnavailable: "Primeros puestos de Main / Pro no disponibles",
    topUnavailableText:
      "Los rangos oficiales aparecerán tras publicarse resultados Main / Pro válidos.",
    topAria: "Primeros puestos Main / Pro",
    finalStandings: "Clasificación final Main / Pro",
    currentStandings: "Clasificación actual Main / Pro",
    topStandings: "Primeros puestos",
    tieNotice:
      "Se muestra a cada competidor que comparte oficialmente los puestos 1, 2 o 3 de Main / Pro. El orden visual no cambia el puesto oficial. Cada Evento con premios se rige por sus Condiciones de Premios publicadas.",
    rank: "Posición",
    player: "Jugador",
    country: "País",
    elo: "ELO",
    points: "Puntos",
    played: "Jugados",
    rounds: "Rondas",
    wins: "Victorias",
    winRate: "% victorias",
    lastPoints: "Últ. pts",
    movement: "Movimiento",
    new: "NUEVO",
    noStandings: "Aún no hay clasificación publicada",
    noStandingsText:
      "Las filas aparecerán cuando se recalcule automáticamente un torneo válido completado.",
    history: "Historial de torneos",
    historyTitle: "Impacto publicado del torneo",
    historyEmpty:
      "El historial aparecerá tras publicarse los recálculos de clasificación.",
    dateTba: "Fecha por confirmar",
    pointsShort: "{points} pts",
    topScorer: "Mayor puntuación publicada: {name}",
    championArchive: "Archivo de campeones Main / Pro",
    latestFinalized: "Últimos resultados finalizados",
    championsEmpty: "Los campeones aparecerán al cerrarse una temporada.",
    rankNumber: "Puesto {rank}",
    unknown: "Desconocido",
    unrated: "Sin puntuación",
    academyBracket: "Cuadro Academy",
    challengeBracket: "Cuadro Challenge",
    aggregate: "Total",
  },
  announcements: {
    metadataTitle: "Anuncios oficiales | IronClad",
    metadataDescription:
      "Consulta las últimas noticias y actualizaciones oficiales de IronClad.",
    eyebrow: "Canal de IronClad",
    title: "Anuncios oficiales",
    description:
      "Noticias, avisos de Torneos y actualizaciones de la plataforma que publica IronClad.",
    feedLabel: "Lista de anuncios oficiales",
    emptyTitle: "Todavía no hay anuncios",
    emptyDescription:
      "Las actualizaciones oficiales de IronClad aparecerán aquí cuando se publiquen.",
    published: "Publicado",
    publicationTimeUnavailable:
      "Fecha y hora de publicación no disponibles",
    imageAltFallback: "Imagen de «{title}»",
    videoLabelFallback: "Vídeo de «{title}»",
    videoUnsupported: "Tu navegador no admite la reproducción de vídeo.",
    loadErrorTitle: "Anuncios no disponibles",
    loadErrorDescription:
      "IronClad no ha podido cargar los anuncios oficiales. Inténtalo de nuevo.",
    retry: "Reintentar",
  },
  select: { noOptions: "No se encontraron opciones." },
  playerCount: { one: "Jugador", few: "Jugadores", many: "Jugadores" },
} satisfies PublicDictionary;
export default dictionary;
