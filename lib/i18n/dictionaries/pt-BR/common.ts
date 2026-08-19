import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";

const dictionary = {
  nav: {
    home: "Início",
    tournaments: "Torneios",
    players: "Jogadores",
    rules: "Regras",
    leaderboardAndRankings: "Classificação geral",
    about: "Sobre",
    dashboard: "Painel",
    admin: "Administração",
    primaryNavigation: "Navegação principal",
    mobileNavigation: "Navegação móvel",
    openMenu: "Abrir o menu de navegação",
    closeMenu: "Fechar o menu de navegação",
  },
  footer: {
    copyright: "© {year} IronClad. Todos os direitos reservados.",
    legalAndRules: "Informações legais e regras",
    rules: "Regras",
    rulebook: "Livro de Regras",
    participationAgreement: "Contrato de Participação do Jogador",
    participationAgreementShort: "PPA",
    terms: "Termos de Serviço",
    privacy: "Política de Privacidade",
    opensInNewTab: "{label} (abre em uma nova guia)",
  },
  actions: {
    loading: "Carregando…",
    retry: "Tentar novamente",
    close: "Fechar",
    cancel: "Cancelar",
    back: "Voltar",
    save: "Salvar",
    continue: "Continuar",
    success: "Sucesso",
    error: "Erro",
  },
  selector: {
    language: "Idioma",
    triggerAriaLabel: "Escolher idioma. Idioma atual: {language}",
    languageRowLabel: "Idioma",
    title: "Escolha seu idioma",
    description: "Selecione o idioma da experiência do jogador no IronClad.",
    closeLabel: "Fechar o seletor de idioma",
    selectedLabel: "Selecionado",
    savingLabel: "Salvando idioma…",
    saveError: "Não foi possível salvar sua preferência de idioma. Tente novamente.",
    translationReviewNotice:
      "As traduções são fornecidas por conveniência e foram revisadas com cuidado, mas podem não ter sido revisadas por um falante nativo. O inglês continua sendo o idioma de origem.",
    privacyHeading: "Preferência de idioma",
    privacyCookie:
      "O IronClad armazena sua escolha explícita em um cookie funcional próprio por até aproximadamente um ano.",
    privacyClerk:
      "Se você estiver conectado, a escolha também poderá ser armazenada de forma privada no Clerk para que os e-mails transacionais do próprio IronClad usem esse idioma.",
    privacyNoTracking:
      "Essa preferência não é usada para publicidade nem rastreamento entre sites.",
    privacyNotEvidence:
      "Ela não comprova sua localização, jurisdição legal, consentimento ou compreensão.",
    privacyChange: "Você pode alterar a preferência aqui a qualquer momento.",
    privacyPolicyLink: "Ler a Política de Privacidade",
  },
  install: {
    mobile: "IronClad Mobile", title: "Instalar o IronClad", close: "Fechar instruções de instalação", description: "Adicione o IronClad à tela inicial para acessar mais rápido e usar uma experiência em tela cheia semelhante a um aplicativo.", now: "Instalar agora", promptHelp: "O navegador abrirá a solicitação segura de instalação.", iosMenuTitle: "Abra o menu", iosMenuText: "Toque no botão ⋯ (Mais) no Safari.", shareTitle: "Compartilhar", shareText: "Toque em Compartilhar.", homeTitle: "Adicionar à tela inicial", homeText: "Selecione “Adicionar à tela inicial”. Se não aparecer, toque em “Mais” e procure na lista.", addTitle: "Instalar", addText: "Toque em “Adicionar”.", browserMenuTitle: "Abra o menu do navegador", browserMenuText: "Toque no botão de menu do Chrome, Edge ou do seu navegador.", appTitle: "Instale o aplicativo", appText: "Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.", confirmTitle: "Confirmar", confirmText: "Confirme a instalação quando solicitado.", download: "Baixar nosso aplicativo", step: "Etapa {number}",
  },
  music: { playerLabel: "Reprodutor da música tema do IronClad", pause: "Pausar tema do IronClad", play: "Reproduzir tema do IronClad", unavailable: "Música indisponível" },
  legal: {
    effectiveEnglishNotice:
      "O texto normativo em vigor e que prevalece está em inglês. No momento, não há tradução oficial.",
    read: "Ler",
    download: "Baixar",
    continueInEnglish: "Continuar em inglês",
    goBack: "Voltar",
  },
  errors: {
    notFoundEyebrow: "404 · Não encontrado",
    notFoundTitle: "Esta página não foi encontrada.",
    notFoundDescription: "O link pode estar desatualizado ou a página pode ter sido movida.",
    returnHome: "Voltar ao início",
    unexpectedTitle: "Algo deu errado.",
    unexpectedDescription:
      "O IronClad não conseguiu carregar esta experiência do jogador. Tente novamente.",
    retry: "Tentar novamente",
    loading: "Carregando…",
  },
} satisfies CommonDictionary;

export default dictionary;
