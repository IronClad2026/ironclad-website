import type { DictionaryShape } from "@/lib/i18n/types";

const dictionary = {
  metadata: {
    rulesTitle: "Rules | IronClad Tournaments",
    rulesDescription:
      "Read the IronClad competition guide and access the Effective English governing documents.",
    termsTitle: "Terms of Service | IronClad Tournaments",
    termsDescription:
      "Read the Effective English IronClad Tournaments Terms of Service and download the versioned PDF.",
    privacyTitle: "Privacy Policy | IronClad Tournaments",
    privacyDescription:
      "Read the Effective English IronClad Tournaments Privacy Policy and download the versioned PDF.",
  },
  legalPage: {
    corpusEyebrow: "IronClad Tournaments legal corpus",
    effectiveEnglishNotice:
      "The Effective governing text is in English. No official translation is currently provided.",
    version: "Version",
    status: "Status",
    effectiveDate: "Effective date",
    downloadVersion: "Download version {version} PDF",
    readCompanion: "Read the {document}",
    contents: "Contents",
    contentsAria: "{document} contents",
    namedOperators: "Named operators",
    section: "Section {number}",
    terms: "Privacy Policy",
    privacy: "Terms of Service",
  },
  rules: {
    hero: {
      eyebrow: "Official Rules Hub",
      title: "IronClad Competition Rules",
      description:
        "Start with the plain-language briefing, then use the versioned Rulebook and Player Participation Agreement for the governing text.",
      effective: "Document set updated · {date}",
      summaryAria: "Rules operations summary",
      operations: "Tournament Operations",
      corpus: "Governing Corpus",
      corpusText:
        "Four approved, versioned documents are current. Each document shows its own Effective date.",
    },
    category: {
      eyebrow: "Choose Rule Set",
      title: "Start with the rules that apply to your event.",
      description:
        "The selector controls the detailed rule explorer below and keeps the page focused on the competition format you need.",
      resetHelp:
        "Active categories reset the rule explorer to the first item so the briefing starts from the top each time.",
      aria: "Rule categories",
      selected: "Selected",
      primaryDraft: "Primary draft: {document}",
    },
    tabs: {
      oneVOne: {
        eyebrow: "Solo Competition",
        title: "1V1 RULES",
        description:
          "IronClad launch Tournaments are free CoH3 1v1 Events with separate eight-Player Academy, Challenge and Main / Pro Divisions. Quarterfinals and semifinals are BO3; the grand final is BO5.",
        document: "Rulebook v3.0",
      },
      rankings: {
        eyebrow: "Competitive Record",
        title: "RANKINGS & SEASONS",
        description:
          "Academy and Challenge maintain permanent Career standings. Main / Pro uses six-valid-Event seasons. Only genuine played competition creates played statistics.",
        document: "Rulebook sections 13-14",
      },
      conduct: {
        eyebrow: "Player Agreement",
        title: "PPA & CONDUCT",
        description:
          "The PPA governs eligibility, account ownership, conduct, evidence cooperation, privacy-facing obligations, sanctions, media and conditional prizes. Detailed Game procedure remains in the Rulebook.",
        document: "PPA v3.0",
      },
    },
    quick: {
      eyebrow: "Quick Briefing",
      title: "Read the selected briefing before the detailed rules.",
      description:
        "The category summary gives you the launch facts without duplicating the full governing documents.",
      selected: "Selected Briefing",
      documentStatusLabel: "Document Status",
      documentStatusTitle: "Approved governing corpus",
      documentStatusText:
        "The current Rulebook, PPA, Terms and Privacy Policy each show their own Effective date. Registration uses their exact versioned records.",
      navigationLabel: "Navigation",
      navigationTitle: "Start with your rule set",
      navigationText:
        "Choose the active category before reading details so the page stays focused on your Event.",
      integrityLabel: "Integrity",
      integrityTitle: "Plain language, exact boundaries",
      integrityText:
        "This guide summarises current native 1v1 competition and clearly separates platform-enforced features from player-managed rules.",
    },
    explorer: {
      eyebrow: "Rule Explorer",
      title: "Detailed rules without the wall of text.",
      description:
        "Accordion sections keep the active category readable while preserving access to every existing rule summary.",
      active: "Active Ruleset",
    },
    sections: {
      oneVOne: {
        eligibilityTitle: "Eligibility & Native Registration",
        eligibilityText:
          "Registration is free and native to IronClad. Players must be 18 or older, use their own authenticated IronClad and linked Steam accounts, complete fresh Relic 1v1 verification, and accept the exact governing-document versions presented. Discord is not required.",
        eloTitle: "ELO Snapshot & Division",
        eloText:
          "The highest valid current Relic 1v1 faction ELO determines Academy (0–1099), Challenge (1100–1399), or Main / Pro (1400+). IronClad stores that eligibility as an immutable Event registration snapshot, so later live ELO changes do not move the Player for that Event.",
        reviewTitle: "Review, Waitlist & Launch",
        reviewText:
          "The first eight valid registrations enter the Active Review Cohort; later eligible Players may join the FIFO Waitlist. A vacancy offer uses the exact deadline shown by IronClad and returns an accepting Player to review. A Division launches only with exactly eight approved Players, a ready bracket, and its required published map pool.",
        seriesTitle: "Series & Lobby Settings",
        seriesText:
          "Each Division is an eight-Player single-elimination bracket. Quarterfinals and semifinals are BO3; the grand final is BO5. Players manually configure 1v1, 575 Victory Points, Standard Resources, Random starting positions, and Cheats disabled. IronClad does not configure or validate the CoH3 lobby.",
        mapTitle: "Published Map Pool",
        mapText:
          "Each Division uses a published pool of at least five active 1v1 Maps. It may be republished before launch and freezes when the Division launches. After launch, only an audited technical-issue, exploit, game-update, or competitive-integrity correction may replace a Map. Poll finalisation does not change the pool automatically.",
        diceTitle: "Dice & Manual Side/Map",
        diceText:
          "Each Player initiates their own authenticated 2d6 for Games 1, 3, and 5; Games 3 and 5 may be pre-rolled, and a tie requires both Players to complete another authenticated round. The winner chooses Side or an eligible unused Map, and the opponent chooses the remaining item. Each Player may use any permitted faction within the assigned Side. In even Games, Players swap Sides and the preceding Game loser chooses a new Map. Maps normally do not repeat. IronClad records Dice history, not Side or Map choices.",
        scheduleTitle: "Scheduling & Communication",
        scheduleText:
          "Make reasonable first contact as soon as practicable, normally within 24 hours after the Match becomes available; missing that target alone is not an automatic forfeit. Request Admin Assistance after 48 hours without a response, or earlier if the deadline may be jeopardised. IronClad notifications and Admin Assistance are platform fallbacks; Discord is optional, and Steam may be used where reasonably available outside IronClad.",
        pauseTitle: "Pauses & Disconnects",
        pauseText:
          "Each Player may take one reasonable pause per Game for a genuine technical or urgent issue, normally for up to five minutes; another or longer pause needs opponent agreement or Admin approval. A genuine disconnect before 10:00 normally means restart, subject to the approved fairness exceptions. At or after 10:00 there is no automatic winner: preserve the replay and request an Admin ruling.",
        resultTitle: "Results & Replay Proof",
        resultText:
          "Report the Series winner and final score through IronClad with one unique CoH3 `.rec` for every Game actually played, up to 10 MiB each. Replays are private. Screenshots are not accepted as substitute Match-result proof; separate supplemental material may be requested only for a dispute or integrity investigation.",
        confirmationTitle: "Confirmation, Disputes & No-Shows",
        confirmationText:
          "The opponent may confirm or dispute a report before the displayed deadline, after which an undisputed report may be confirmed automatically. Disputes go to Admin review. A no-show is not self-awarded, and a bye, walkover, no-show, empty feeder, or double forfeit does not create fake played statistics.",
      },
      rankings: {
        pointsTitle: "Points by Division",
        pointsText:
          "Academy and Challenge award 10 participation points, 2 points per round passed, and 3 points for a Tournament win. Main / Pro awards 10 participation points, 5 points per round passed, and 5 points for a Tournament win.",
        playTitle: "Genuine Play",
        playText:
          "Played-Match totals, wins, losses, and win rate include only genuine completed Series between two Players. No-shows, automatic byes, walkovers, empty feeders, and double forfeits do not create played statistics, although legitimate non-played advancement may still earn approved round-passed points.",
        careerTitle: "Career Standings",
        careerText:
          "Academy and Challenge maintain separate permanent Career standings. They do not reset when a Main / Pro season ends.",
        catchupTitle: "Career Catch-Up",
        catchupText:
          "Academy and Challenge may award +5 points for each prior eligible missed completed Event in the same Division, up to +25. The award is available once per Player per Division and never applies to Main / Pro.",
        seasonTitle: "Main / Pro Season",
        seasonText:
          "A Main / Pro season consists of exactly six valid qualifying Events. Event seven begins the next season, and the standings freeze after the sixth valid Event is scored unless a later integrity review places the season under review.",
        rankingTitle: "Ranking & True Ties",
        rankingText:
          "Ranking order is total points, Tournament wins, rounds passed, exact genuine-Match win rate, then genuine Match wins. Players still equal on every competitive key share the same official rank. Names, display order, or internal IDs do not break a true tie.",
        prizesTitle: "Conditional Prizes",
        prizesText:
          "A leaderboard rank is not automatically a prize position. Any prize-bearing Event is governed separately by Prize Terms published before registration. If a true tie crosses prize positions and no different fair method was published before registration, the crossed allocations are combined and divided equally among the tied Players. No unpublished leaderboard tie-break may be invented.",
      },
      conduct: {
        accountsTitle: "Eligibility & Own Accounts",
        accountsText:
          "Players must be at least 18, use their own IronClad and linked Steam accounts, provide accurate eligibility information, and complete the presented declarations. Account sharing, impersonation, unauthorised substitution, smurfing for bracket manipulation, and duplicate registration are prohibited.",
        discordTitle: "Optional Discord & Coordination",
        discordText:
          "Discord is optional but recommended. IronClad notifications and the match-scoped Admin Assistance feature are the guaranteed platform fallbacks; Steam may be used where reasonably available outside IronClad. Public Discord visibility is a separate opt-in.",
        integrityTitle: "Conduct & Integrity",
        integrityText:
          "Players must compete honestly and respectfully. Cheating, match manipulation, exploit abuse, stream sniping, harassment, evidence destruction, fraudulent voting, and deliberate scheduling or technical obstruction may result in proportionate sanctions.",
        pollTitle: "Poll Participation",
        pollText:
          "A Tournament Poll declares its scope and Advisory or Binding status before voting, and its eligible audience freezes at publication. Each eligible Player may revise one authenticated current ballot, with selections up to the published limit, until close. Advisory voting informs the final Admin decision. Binding voting determines the configured top-K outcome with no quorum but requires at least one valid ballot; a zero-ballot Poll is cancelled or replaced, and a cutoff tie is resolved only among the tied cutoff options. Individual ballot attribution is private. Eligible Players may see aggregates according to configured live or after-close visibility; anonymous public totals exist only when explicitly enabled. The final Published Decision may be public, but finalisation does not automatically alter another subsystem.",
        evidenceTitle: "Evidence & Admin Review",
        evidenceText:
          "Players must use reporting and dispute tools honestly and cooperate with proportionate evidence requests. Admins may review private replays, Match metadata, submitted communications, and other reliable material, but do not require account passwords, authentication codes, or unrestricted access to personal devices.",
        privacyTitle: "Privacy & Public History",
        privacyText:
          "Optional public-profile visibility is separate from factual competition history. Private replays, Poll records, disputes, and Admin-review material remain access-controlled. Account closure may pseudonymise a history-bearing account rather than erase official brackets, results, and standings.",
        mediaTitle: "Streaming & Media",
        mediaText:
          "A permitted personal live stream uses at least a two-minute delay unless a published Event or broadcast instruction requires longer or expressly waives the default. Official broadcast and integrity requirements take priority. Final media and privacy obligations remain subject to the approved governing documents.",
        prizesTitle: "Event Prizes",
        prizesText:
          "Participation is free and not every Event has prizes. A prize-bearing Event must publish its gross amount, currency, allocation, material eligibility, fees, supported payout method, and expected timeframe before registration. Payout may be administered manually.",
        acceptanceTitle: "Versioned Acceptance",
        acceptanceText:
          "Registration records the exact accepted Rulebook, PPA, and Terms versions; the acknowledged Privacy Policy version; authenticated identity; server acceptance time; the 18+ declaration; and own-account confirmations. Registration is available only while one complete approved document set is Effective.",
      },
    },
    documents: {
      eyebrow: "Official Documents",
      title: "Governing-document status.",
      description:
        "The approved current versions are the governing source of truth. Each card shows its own Effective date.",
      immutable:
        "Download the immutable versioned PDFs used by Tournament registration.",
      version: "Version {version}",
      effective: "Effective {date}",
      readOnline: "Read Online",
      read: "Read",
      opensNewTab: "(opens in a new tab)",
      download: "Download PDF",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Answers to the launch questions players ask most.",
      description:
        "These concise answers follow the approved competition model without replacing the governing documents.",
      registerQuestion: "How do I register?",
      registerAnswer:
        "Registration is free and native to IronClad. Sign in, complete the required profile fields, link your own Steam account, complete fresh Relic 1v1 verification, choose the eligible open Division, confirm that you are 18 or older and using your own accounts, and accept the exact Effective governing-document versions shown.",
      divisionQuestion: "How is my Division determined?",
      divisionAnswer:
        "IronClad uses the highest valid current 1v1 faction ELO returned by the authoritative Relic lookup: Academy is 0–1099, Challenge is 1100–1399, and Main / Pro is 1400+. The server stores an immutable registration snapshot, so later live ELO changes do not move that Event entry.",
      discordQuestion: "Is Discord required?",
      discordAnswer:
        "No. Discord is optional but recommended. IronClad notifications and the match-scoped Admin Assistance feature provide platform fallbacks. Steam may be used where reasonably available. Public Discord visibility is a separate opt-in.",
      fullQuestion: "What happens if a Division is full?",
      fullAnswer:
        "Later eligible Players may join the FIFO Waitlist after the eight Active Review places are occupied. If a place opens before launch, IronClad offers it to the oldest eligible waitlisted Player until the exact displayed deadline. Acceptance returns the Player to review; it does not guarantee approval. A Division launches only with exactly eight approved Players.",
      mapQuestion: "How does the map pool work?",
      mapAnswer:
        "Each Division has a published pool of at least five active 1v1 Maps. It may be republished before launch and freezes at launch. After launch, only an audited correction for a technical issue, exploit, game update, or competitive-integrity reason may replace a Map. A Poll decision does not change the pool automatically.",
      diceQuestion: "How do Dice, Side and Map choices work?",
      diceAnswer:
        "Each Player initiates their own authenticated 2d6 for Games 1, 3, and 5; Games 3 and 5 may be pre-rolled, and tied totals require another authenticated round. The higher total chooses Side or an eligible unused Map, and the opponent chooses the remaining item. Each Player may use any permitted faction within the assigned Side. For Games 2 and 4, Players swap Sides and the preceding Game loser chooses a new Map. Maps normally do not repeat. IronClad stores Dice history, not Side or Map choices.",
      scheduleQuestion: "What are the scheduling and technical expectations?",
      scheduleAnswer:
        "Make reasonable first contact as soon as practicable, normally within 24 hours; missing that target alone is not an automatic forfeit. Request Admin Assistance after 48 hours without a response or earlier if the deadline is at risk. Each Player may normally take one genuine pause per Game for up to five minutes. A genuine pre-10:00 disconnect normally restarts subject to the approved exceptions; at or after 10:00 there is no automatic winner, so preserve the replay and request an Admin ruling.",
      replayQuestion: "Which replay files are required?",
      replayAnswer:
        "Upload one unique CoH3 `.rec` for every Game actually played, up to 10 MiB each. Replays are private. Screenshots are not accepted as substitute Match-result proof; separate supplemental material may be requested only for a dispute or integrity investigation.",
      resultQuestion: "What happens after a result or no-show report?",
      resultAnswer:
        "The opponent may confirm or dispute before the displayed deadline. An undisputed report may then confirm automatically; a dispute goes to Admin review. A no-show is never self-awarded. Confirmed no-shows and other non-played advancement do not create fake played-Match statistics.",
      standingsQuestion: "How do standings work?",
      standingsAnswer:
        "Academy and Challenge build permanent Career standings; Main / Pro uses exactly six valid qualifying Events per season. Rankings use total points, Tournament wins, rounds passed, exact genuine-Match win rate, then genuine Match wins. Players still equal on every key share the same official rank.",
      pollQuestion: "What is Advisory versus Binding?",
      pollAnswer:
        "An Advisory Poll informs the final Admin decision. A Binding Poll has no quorum and determines its configured top-K outcome once at least one valid ballot exists; a zero-ballot Binding Poll is cancelled or replaced. Individual ballot attribution is private. Eligible Players see aggregate totals according to the configured live or after-close visibility, while anonymous public totals exist only when explicitly enabled. The final Published Decision may be public, but finalisation does not automatically change another subsystem.",
      prizesQuestion: "Does every Tournament have prizes?",
      prizesAnswer:
        "No. Participation is free, and a leaderboard rank is not automatically a prize position. Before registration opens for a prize-bearing Event, its Tournament Page or Prize Terms must publish the gross amount, currency, allocation, eligibility, fees, supported payout method, and expected timeframe. Payout may be administered manually.",
    },
    disclaimer: {
      eyebrow: "Governing Status",
      title: "Plain-language guide",
      text:
        "This page is a plain-language guide. The governing-document hierarchy and exact accepted versions control. Tournament Pages, Published Decisions and Event Prize Terms supplement them only within their stated scope.",
      effective:
        "Each current Rulebook, PPA, Terms and Privacy Policy shows its own Effective date. Registration records the exact version presented for each document.",
      english:
        "The Effective governing text is in English. No official translation is currently provided.",
    },
  },
} as const;

export type HelpLegalUiDictionary = DictionaryShape<typeof dictionary>;

export default dictionary;
