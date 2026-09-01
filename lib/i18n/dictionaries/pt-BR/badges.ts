import english from "@/lib/i18n/dictionaries/en/badges";
import type { BadgesDictionary } from "@/lib/i18n/dictionaries/en/badges";

const dictionary = {
  ...english,
  metadata: {
    pageTitle: "Coleção de medalhas | IronClad",
    pageDescription: "Consulte sua coleção de medalhas do IronClad.",
    artworkAlt: "Arte da medalha {name}",
  },
  rarity: {
    common: "Comum",
    uncommon: "Incomum",
    rare: "Rara",
    epic: "Épica",
    legendary: "Lendária",
  },
  states: {
    earned: "Conquistada",
    locked: "Bloqueada",
    new: "Nova",
  },
  dashboard: {
    eyebrow: "Medalhas",
    title: "Coleção de medalhas do IronClad",
    earnedWithBadges: "Suas conquistas mais recentes do IronClad aparecem aqui.",
    empty:
      "Conquiste medalhas competindo, vencendo e alcançando marcos nos torneios do IronClad.",
    earnedLabel: "Conquistadas",
    viewCollection: "Ver coleção de medalhas",
    inspect: "Abra a coleção completa para ver todas as medalhas conquistadas e bloqueadas.",
    explore: "Explore todas as medalhas e descubra como desbloqueá-las.",
    featuredAria: "Medalhas em destaque no painel",
    progressAria: "{earned} de {total} medalhas conquistadas",
    loadErrorTitle: "Coleção de medalhas indisponível",
    loadErrorDescription:
      "Não foi possível carregar sua coleção. As medalhas conquistadas estão seguras.",
    retry: "Tentar novamente",
  },
  collection: {
    back: "Voltar ao painel",
    eyebrow: "Arquivo de conquistas",
    title: "Coleção de medalhas",
    description:
      "Consulte cada medalha do IronClad, sua raridade e a conquista necessária para obtê-la.",
    earnedLabel: "Conquistadas",
    showing: "Mostrando {shown} de {total} medalhas",
    filters: {
      all: "Todas",
      earned: "Conquistadas",
      locked: "Bloqueadas",
    },
    filtersAria: "Filtros da coleção de medalhas",
    slotsAria: "Espaços da coleção de medalhas do IronClad",
    empty: "Nenhuma medalha corresponde a este filtro.",
  },
  detail: {
    eyebrow: "Conquista do IronClad",
    badgeNumber: "Medalha {number}",
    unlockMeaning: "Requisito de desbloqueio",
    status: "Status",
    originalAwarded: "Conquistada originalmente",
    close: "Fechar detalhes da medalha",
    dismiss: "Dispensar detalhes da medalha",
  },
  reveal: {
    unlocked: "Medalha desbloqueada",
    continue: "Concluir revelação",
    notNow: "Agora não",
    saving: "Salvando revelação…",
    queuePosition: "Medalha {current} de {total}",
    ackError:
      "A revelação da sua medalha não foi salva. Verifique sua conexão e tente novamente.",
    retry: "Tentar confirmação novamente",
    transferUnavailable:
      "O espaço na coleção mudou. A revelação será concluída sem movimento.",
  },
  definitions: {
    "ironclad-recruit": {
      name: "Recruta do IronClad",
      unlockMeaning:
        "Conclua a verificação de identidade e ELO e torne-se um jogador elegível do IronClad.",
    },
    "first-deployment": {
      name: "Primeiro destacamento",
      unlockMeaning: "Conclua sua primeira partida oficial do IronClad.",
    },
    "first-victory": {
      name: "Primeira vitória",
      unlockMeaning: "Vença sua primeira partida oficial do IronClad.",
    },
    "battle-tested": {
      name: "Testado em batalha",
      unlockMeaning: "Conclua 10 partidas oficiais do IronClad.",
    },
    "rising-through-the-ranks": {
      name: "Subindo nas fileiras",
      unlockMeaning:
        "Conclua um torneio válido em uma divisão superior à primeira divisão na qual você concluiu um torneio do IronClad.",
    },
    "first-campaign": {
      name: "Primeira campanha",
      unlockMeaning: "Conclua seu primeiro torneio completo do IronClad.",
    },
    "iron-regular": {
      name: "Presença de ferro",
      unlockMeaning: "Conclua 3 torneios do IronClad.",
    },
    "tournament-veteran": {
      name: "Veterano de torneios",
      unlockMeaning: "Conclua 10 torneios do IronClad.",
    },
    "season-campaigner": {
      name: "Combatente da temporada",
      unlockMeaning:
        "Conclua pelo menos 4 torneios válidos em uma temporada finalizada do IronClad.",
    },
    "reliable-competitor": {
      name: "Competidor confiável",
      unlockMeaning:
        "Conclua 10 participações agendadas sem ausência confirmada causada por você ou ausência dupla.",
    },
    "five-victories": {
      name: "Cinco vitórias",
      unlockMeaning: "Vença 5 partidas oficiais do IronClad.",
    },
    "ten-victories": {
      name: "Dez vitórias",
      unlockMeaning: "Vença 10 partidas oficiais do IronClad.",
    },
    "twenty-five-victories": {
      name: "Vinte e cinco vitórias",
      unlockMeaning: "Vença 25 partidas oficiais do IronClad.",
    },
    "iron-streak": {
      name: "Sequência de ferro",
      unlockMeaning: "Vença 3 partidas oficiais jogadas consecutivas.",
    },
    unbroken: {
      name: "Inabalável",
      unlockMeaning: "Vença 5 partidas oficiais jogadas consecutivas.",
    },
    "clean-sweep": {
      name: "Varredura total",
      unlockMeaning: "Vença uma MD3 por 2–0 ou uma MD5 por 3–0.",
    },
    "comeback-commander": {
      name: "Comandante da virada",
      unlockMeaning: "Perca o Jogo 1 e depois vença a série oficial.",
    },
    "giant-slayer": {
      name: "Matador de gigantes",
      unlockMeaning:
        "Derrote um adversário cujo ELO verificado no torneio seja pelo menos 200 pontos maior.",
    },
    "giant-hunter": {
      name: "Caçador de gigantes",
      unlockMeaning: "Conquiste o feito Matador de Gigantes 3 vezes distintas.",
    },
    "flawless-campaign": {
      name: "Campanha impecável",
      unlockMeaning:
        "Vença um torneio do IronClad após jogar pelo menos uma série oficial sem perder nenhum jogo individual.",
    },
    "first-advance": {
      name: "Primeiro avanço",
      unlockMeaning: "Vença sua primeira rodada jogada na chave de um torneio.",
    },
    semifinalist: {
      name: "Semifinalista",
      unlockMeaning: "Chegue a uma semifinal oficial de torneio do IronClad.",
    },
    finalist: {
      name: "Finalista",
      unlockMeaning: "Chegue a uma final oficial de torneio do IronClad.",
    },
    "academy-champion": {
      name: "Campeão da Academia",
      unlockMeaning: "Vença um torneio oficial da divisão Academy.",
    },
    "challenge-champion": {
      name: "Campeão do Desafio",
      unlockMeaning: "Vença um torneio oficial da divisão Challenge.",
    },
    "elite-champion": {
      name: "Campeão da Elite",
      unlockMeaning: "Vença um torneio oficial da divisão Main/Elite.",
    },
    "double-champion": {
      name: "Bicampeão",
      unlockMeaning: "Vença 2 torneios distintos do IronClad.",
    },
    "triple-crown": {
      name: "Tríplice coroa",
      unlockMeaning:
        "Vença pelo menos uma vez torneios das divisões Academy, Challenge e Main/Elite.",
    },
    "season-podium": {
      name: "Pódio da temporada",
      unlockMeaning: "Termine uma temporada oficial finalizada entre os 3 melhores.",
    },
    "season-champion": {
      name: "Campeão da temporada",
      unlockMeaning: "Termine em 1º na classificação oficial de uma temporada finalizada.",
    },
  },
} satisfies BadgesDictionary;

export default dictionary;
