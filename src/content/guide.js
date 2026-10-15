// In-app reference guide: "Create an event & run the tournament".
// SINGLE SOURCE OF TRUTH — keep this in sync whenever event creation, the
// settings steps, the schedule generator, imports, the Live publish flow, the
// súmula flow, officials (Referees), uniforms or plans change.
// Rendered by src/pages/Guide.jsx (language switcher). Inline <b>…</b> allowed.
//
// Shape per language:
//   { title, subtitle, intro, sections: [{ h, blocks: [...] }], summary }
// Block kinds: { t:"p"|"note", text } | { t:"ol", start, items } |
//              { t:"ul", items } | { t:"warn", title, items }

export const LANGS = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
];

export const UI = {
  pt: { menu: "Guia", heading: "Guia", sub: "Criar um evento e conduzir o torneio", back: "‹ Voltar", lang: "Idioma", updated: "Atualizado conforme as mudanças no app." },
  en: { menu: "Guide", heading: "Guide", sub: "Create an event & run the tournament", back: "‹ Back", lang: "Language", updated: "Kept in sync with app changes." },
  es: { menu: "Guía", heading: "Guía", sub: "Crear un evento y llevar el torneo", back: "‹ Volver", lang: "Idioma", updated: "Se mantiene al día con los cambios del app." },
  de: { menu: "Anleitung", heading: "Anleitung", sub: "Event anlegen und Turnier durchführen", back: "‹ Zurück", lang: "Sprache", updated: "Wird mit App-Änderungen aktuell gehalten." },
};

export const GUIDE = {
  /* ------------------------------- PORTUGUÊS ------------------------------- */
  pt: {
    title: "Criar um evento e conduzir o torneio",
    subtitle: "Da criação do evento até as partidas finais — jogos, árbitros, uniformes e planos",
    intro: "Este guia descreve, na ordem correta, como criar um novo evento no Fistball Arena, configurá-lo passo a passo (categorias, times, formato, quadras, tabela de jogos), importar jogadores e árbitros, planejar a arbitragem e os uniformes e publicar tudo no Fistball Live.",
    sections: [
      { h: "Parte A — Criar o evento", blocks: [
        { t: "ol", start: 1, items: [
          'Na lista de eventos, clique em <b>“+ New event”</b> (visível só para org-admins). Preencha <b>Nome</b>, <b>Local</b> e as datas (<b>Starts</b> / <b>Ends</b>) e confirme. O evento abre e começa com status <b>ativo</b>.',
          'Dentro do evento, a <b>barra lateral à esquerda</b> tem as páginas: <b>Games</b>, <b>Standings</b>, <b>Plans</b> e, para admins, <b>Schedule</b>, <b>Players &amp; staff</b>, <b>Referees</b>, <b>Uniforms</b> e <b>Settings</b>. No celular, abra pelo botão <b>☰</b>.',
          'Abra <b>Settings</b>: é uma configuração guiada em <b>9 passos numerados</b>. O passo atual fica aberto, os seguintes vão sendo liberados e os concluídos ficam verdes. As partes B a D seguem esses passos.',
        ] },
        { t: "note", text: 'Para trazer um evento <b>passado</b> com os resultados, os org-admins têm <b>“⬇ Import from Google Sheet”</b> na lista de eventos.' },
      ] },
      { h: "Parte B — Settings: dados, categorias, times, formato (passos 1–4)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event details</b> — nome, local, <b>endereço do ginásio/local</b> (mostrado no Fistball Live com rota) e datas. Clique em <b>Save details</b>.',
          '<b>Categories</b> — marque os chips: <b>Type</b> (National Teams / Clubs), <b>Gender</b> (Men / Women) e, opcional, <b>Ages</b> (U18, U14… ou “+ custom”). O app cria cada categoria (tipo × idade × sexo) e mostra uma prévia. Clique em <b>Save categories</b>.',
          '<b>Teams &amp; categories</b> — adicione cada clube / seleção e marque as categorias em que joga. Opcional por time: um <b>nome curto</b> para a tabela, <b>nação</b> e <b>clube</b> (árbitros dessa nação ou clube nunca apitam o time; vazio = nome do time) e um <b>logo</b> (“+ logo”, aparece no placar da transmissão). Clique em <b>Save teams</b>.',
          '<b>Format</b> — por categoria: escolha a variante de formato, <b>Group best of</b> e <b>Finals best of</b> (1/3/5/7) e o número de <b>Groups</b> (1 = todos contra todos, ou dividir, p. ex. 2 grupos de 6). Com vários grupos, escolha <b>Qualify per group</b> e se há <b>Placement games</b> (5º lugar para baixo); mude times de grupo pela lista ao lado do nome. <b>View bracket</b> / <b>“👁 Review each bracket”</b> mostra e ajusta o mata-mata. Uma etiqueta <b>⚠️ check</b> indica um formato que vale revisar. Depois, <b>“Looks good — continue”</b>.',
        ] },
        { t: "note", text: 'Os nomes de times digitados aqui são a chave para todo o resto (elencos, conflitos de árbitros, uniformes). Use os <b>mesmos nomes</b> dos arquivos Excel que serão importados depois.' },
      ] },
      { h: "Parte C — Quadras, tabela e publicação (passos 5–6)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Courts &amp; schedule</b> — cadastre as <b>quadras</b> e os <b>dias</b>, cada um com horário de início e fim. Por dia dá para definir uma <b>duração de jogo</b> própria (p. ex. dia de finais com melhor de 5), marcar as <b>fases</b> a que se destina (grupos nos primeiros dias, semifinais e finais no último; nenhuma marcada = qualquer jogo) ou marcar <b>“No new games”</b>. Abaixo: <b>Default game duration</b> e <b>Break between games</b>. Clique em <b>Save courts &amp; continue</b>.',
          '<b>Generate &amp; publish schedule</b> — monta todos os jogos a partir de categorias, times, formato e quadras e os distribui em dias, quadras e horários. Ajuste arrastando ou digitando e depois <b>publique</b>: os jogos aparecem na lista e no Fistball Live.',
          'Mudanças depois: a página <b>Schedule</b> (barra lateral) define dia · quadra · horário de cada jogo. Quando terminar, <b>renumere</b> os jogos para que #1…N sigam a ordem cronológica.',
        ] },
        { t: "note", text: '<b>Uma segunda parte depois</b> (p. ex. clubes depois das seleções): <b>“+ Add new categories (keep current)”</b> monta só as categorias ainda sem jogos, numera-as depois das existentes e evita suas quadras e horários. Dias marcados <b>“No new games”</b> ficam reservados para a parte existente.' },
      ] },
      { h: "Parte D — Como as finais são geradas", blocks: [
        { t: "p", text: 'Com um formato com mata-mata, o gerador cria as rodadas finais como uma <b>chave</b> com <b>marcadores de posição</b> (“1st Group A”, “Winner SF1”, “Loser SF2”). O passo Format mostra as rodadas de cada categoria antes de publicar:' },
        { t: "ul", items: [
          '<b>Um grupo</b> (todos contra todos) → um modelo de mata-mata conforme o número de times, ajustável em “View bracket”.',
          '<b>2, 4 ou 8 grupos</b> → mata-mata cruzado (quartas, semifinais, disputa de bronze, final), com jogos de classificação do 5º lugar para baixo se desejado.',
          'Outros números de grupos, ou uma variante “round-robin only” → sem mata-mata; a classificação final vem dos grupos.',
        ] },
        { t: "p", text: '<b>A chave se preenche sozinha:</b> a cada súmula enviada, o app coloca os times classificados em cada jogo do mata-mata cujos times já estão definidos. Se uma vaga ficar vazia (p. ex. após uma falha de rede), os admins clicam em <b>“↻ Advance bracket”</b> na lista de jogos.' },
      ] },
      { h: "Parte E — Importar jogadores, comissão e árbitros", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Settings → Tools (optional) → Import players &amp; staff from Excel</b>: <b>“+ Add file…”</b>, um arquivo por categoria (os arquivos “…DATA.xlsx”). Escolha a categoria de cada arquivo — ou <b>“referees only”</b> para um arquivo só com árbitros. Traz jogadores, comissão e árbitros de uma vez; revise e salve.',
          '<b>Players &amp; staff</b> mostra o cadastro por time. Os números de camisa podem ser editados ali e salvam na hora; numa súmula já aberta, <b>“↻ Load roster”</b> puxa a alteração.',
          'Se aparecer o quadro <b>“⚠️ Teams in the schedule without players”</b>, um nome de time nos jogos não bate com o cadastro (geralmente a grafia): escolha o time cadastrado e clique em <b>Rename in games</b>.',
        ] },
        { t: "note", text: '<b>Legado:</b> a importação da aba “DB” de uma Planilha Google (página Players &amp; staff) serve só para elencos que já estão numa planilha. Para um evento novo, use Excel.' },
      ] },
      { h: "Parte F — Logos, Fistball Live e acesso (passos 7–9)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event logos</b> — envie o logo do evento e os dos promotores. Aparecem na súmula (PDF), na barra superior do app e no Fistball Live.',
          '<b>Publish to Fistball Live</b> — <b>“Publish to Live”</b> coloca o evento no placar público, <b>“Stop showing”</b> o retira. Vários eventos podem estar no ar ao mesmo tempo; o público escolhe o evento no Fistball Live. Abaixo ficam os links do <b>📺 overlay de transmissão</b> (um por quadra) para OBS/vMix.',
          '<b>Access to this event</b> — quem pode pontuar e gerenciar; veja “Acesso” no fim deste guia.',
        ] },
      ] },
      { h: "Parte G — Árbitros e oficiais", blocks: [
        { t: "p", text: 'A página <b>Referees</b> planeja quem trabalha em cada jogo: <b>Referee 1</b>, <b>Referee 2</b>, <b>Clerk</b> (apontador; em algumas quadras um <b>Clerk 2</b>), <b>Assistant 1 / 2</b> (juízes de linha) e o <b>Court manager</b>. Tudo salva na hora e pré-preenche a súmula.' },
        { t: "ol", start: 1, items: [
          '<b>Cadastro de oficiais</b> (preenchido pela importação do Excel ou por “Add official”): por pessoa as <b>funções</b> (vazio = qualquer posição), o <b>nível</b> (Top / Good / Normal, para árbitros e juízes de linha), <b>gênero</b>, <b>nação</b>, <b>clube</b>, um <b>parceiro de linha</b> (os dois sempre trabalham juntos nas linhas), <b>Max/day</b> e a <b>disponibilidade por dia</b>: disponível, reserva ou indisponível — se quiser, só entre dois horários (o jogo inteiro precisa caber).',
          '<b>Assignment settings</b>: Referee 2 <b>em todos os jogos</b> ou <b>só semifinais, bronze e final</b>; no mata-mata, um Referee 2 de uma nação em quadra <b>só se não houver árbitro neutro</b> ou <b>permitido</b>; em quais quadras precisa de um <b>Clerk 2</b>; e se <b>na final os árbitros trabalham nas linhas</b>.',
          '<b>Nível do jogo</b>: ao lado de cada jogo, seu nível (por padrão semifinais, bronze e final são Top). A escala automática dá a ele um Referee 1 de pelo menos esse nível.',
          '<b>“Auto-assign…”</b>: escolha o dia (ou todos); o app preenche as posições vazias — sem conflitos, pares de linha juntos, carga distribuída por igual, com intervalos entre os jogos sempre que possível. A proposta mostra antes/depois; <b>nada é salvo até clicar em Apply</b>. Oficiais definidos à mão sempre ficam. <b>“Clear auto-assigned…”</b> remove só o que a escala automática preencheu.',
          'À mão: digite ou escolha um nome numa posição (marcado <b>✎ manual</b>). Os contadores acima da tabela mostram <b>conflitos</b>, <b>avisos</b> e <b>posições obrigatórias vazias</b>; clique para ver a lista, ou marque <b>Only games with issues</b>.',
          '<b>Load per official</b>: quantos jogos cada pessoa tem por dia e no total.',
        ] },
        { t: "warn", title: "Vermelho = nunca permitido · laranja = permitido com aviso", items: [
          '<b>Vermelho (conflito):</b> árbitro da nação de um dos times (Referee 1 sempre; Referee 2 em jogos de grupo); árbitro, juiz de linha ou apontador do clube de um dos times; a mesma pessoa duas vezes no mesmo horário; indisponível naquele dia ou horário; uma função que a pessoa não pode exercer; 3 ou mais jogos seguidos; posição obrigatória vazia.',
          '<b>Laranja (aviso):</b> 2 jogos seguidos (prefere-se um intervalo após cada jogo); reserva naquele dia; mais jogos que Max/day; árbitro abaixo do nível do jogo; par de linha separado; Referee 2 de uma nação em quadra no mata-mata; em competições de clubes, árbitro da nação de um clube; em semifinal ou final feminina ainda sem árbitra.',
        ] },
      ] },
      { h: "Parte H — Uniformes", blocks: [
        { t: "p", text: 'A página <b>Uniforms</b> define qual camisa cada time usa, para que os dois times — e os árbitros — sejam distinguíveis.' },
        { t: "ol", start: 1, items: [
          '<b>Team uniforms</b>: até <b>dois uniformes</b> por time e categoria, cada um com até <b>3 cores de camisa</b> (p. ex. listras). Clique num quadrado de cor e escolha na paleta.',
          '<b>Referee shirts</b>: as cores de camisa dos árbitros do evento (com nome). Todos os oficiais de um jogo usam uma delas.',
          '<b>Uniform of the day</b>: escolha o time e o dia (ou todos os dias), clique no uniforme — os botões mostram suas cores — e em <b>Apply</b>.',
          '<b>Por jogo</b>: para o time A e o time B, clique no botão do uniforme (suas cores); clique de novo para limpar. A camisa dos árbitros funciona igual.',
          '<b>Verificações</b>: os contadores mostram <b>conflitos de cor</b> (duas camisas parecidas demais), jogos que <b>não têm solução</b> e conflitos com a camisa dos árbitros. <b>Clash below ΔE</b> define a partir de quando as cores contam como parecidas (maior = mais rigoroso). Trocas de uniforme de um time durante o dia também são listadas.',
          '<b>“Suggest uniforms…”</b>: propõe uniformes e camisas de árbitro para um dia ou todos, com o mínimo de trocas; revise e aplique.',
        ] },
      ] },
      { h: "Parte I — Planos", blocks: [
        { t: "p", text: 'A página <b>Plans</b> é aberta a todos os membros do evento e é feita para imprimir:' },
        { t: "ul", items: [
          '<b>Teams — uniforms</b>: por time, seus jogos com quadra, adversário e o uniforme a usar.',
          '<b>Officials — day plan</b>: por pessoa, seus jogos do dia com quadra, função e cor da camisa.',
        ] },
        { t: "p", text: '<b>Imprima</b> ou baixe em <b>PDF</b> — um time ou uma pessoa por página, pronto para entregar.' },
      ] },
      { h: "Parte J — Durante o torneio", blocks: [
        { t: "ol", start: 1, items: [
          'Cada oficial abre um jogo da lista → preenche a <b>súmula</b> (escalações pré-preenchidas do cadastro; <b>“↻ Load roster”</b> puxa alterações), registra rallies/sets e cartões e <b>envia</b>.',
          'A cada salvar/enviar, o placar e os cartões vão automaticamente para o Fistball Live (classificação, chave e a aba <b>Cards</b>), e a chave avança.',
          'Ensaiou a pontuação? <b>Settings → Event status → “Reset all game reports”</b> recomeça limpo (jogos e elencos ficam); um jogo só: <b>“Reset this report”</b> no próprio jogo.',
          'No fim, <b>Settings → Event status → Archive</b>: o evento fica somente leitura (<b>Re-activate</b> desfaz).',
        ] },
      ] },
      { h: "Acesso — cadastrar usuários (quem pontua)", blocks: [
        { t: "p", text: 'O app <b>não cria contas com senha</b>: cada pessoa entra com a <b>própria conta Google</b> (“Sign in with Google”). Você só <b>autoriza o e-mail</b> dela num evento.' },
        { t: "ol", start: 1, items: [
          'Abra o evento → <b>Settings → passo 9 “Access to this event”</b>.',
          'Digite o <b>e-mail exato da conta Google</b> da pessoa, um <b>nome</b> (opcional), e escolha um <b>papel</b>: <b>admin</b> (gerencia o evento) · <b>official</b> (preenche as súmulas) · <b>viewer</b> (só leitura). Clique em <b>Authorize</b>.',
          'Quando ela fizer <b>Sign in with Google</b> com esse e-mail, entra no evento com esse papel.',
        ] },
        { t: "note", text: 'É <b>por evento</b>. <b>“People used in other events”</b> autoriza de novo com um clique, e em <b>Players &amp; staff</b> o cartão de uma pessoa tem <b>“Give access”</b>. O <b>e-mail precisa ser exatamente</b> o da conta Google. Quem criou o evento e os <b>org-admins</b> têm acesso a tudo sem serem adicionados. O evento precisa estar <b>ativo</b> para adicionar/remover membros.' },
      ] },
    ],
    summary: "<b>Resumo do fluxo:</b> Novo evento → Settings: dados → categorias → times → formato → quadras → gerar &amp; publicar → importar Excel (jogadores, comissão, árbitros) → logos → Fistball Live → acesso → Referees (escala automática) → Uniforms → Plans (imprimir) → pontuar as súmulas.",
  },

  /* -------------------------------- ENGLISH -------------------------------- */
  en: {
    title: "Create an event & run the tournament",
    subtitle: "From creating the event to the final matches — games, officials, uniforms and plans",
    intro: "This guide describes, in the right order, how to create a new event in Fistball Arena, set it up step by step (categories, teams, format, courts, schedule), import players and officials, plan referees and uniforms, and publish everything to Fistball Live.",
    sections: [
      { h: "Part A — Create the event", blocks: [
        { t: "ol", start: 1, items: [
          'On the events list, click <b>“+ New event”</b> (visible only to org-admins). Fill in <b>Name</b>, <b>Place</b> and the dates (<b>Starts</b> / <b>Ends</b>) and confirm. The event opens and starts with status <b>active</b>.',
          'Inside the event, the <b>sidebar on the left</b> holds its pages: <b>Games</b>, <b>Standings</b>, <b>Plans</b> and, for admins, <b>Schedule</b>, <b>Players &amp; staff</b>, <b>Referees</b>, <b>Uniforms</b> and <b>Settings</b>. On a phone, open it with the <b>☰</b> button.',
          'Open <b>Settings</b>: it is a guided setup with <b>9 numbered steps</b>. The current step is open, the next ones unlock as you go, and finished steps turn green. Parts B to D below follow these steps.',
        ] },
        { t: "note", text: 'To bring in a <b>past</b> event with its results, org-admins can use <b>“⬇ Import from Google Sheet”</b> on the events list.' },
      ] },
      { h: "Part B — Settings: details, categories, teams, format (steps 1–4)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event details</b> — name, place, <b>venue address</b> (shown on Fistball Live with directions) and dates. Click <b>Save details</b>.',
          '<b>Categories</b> — mark the chips: <b>Type</b> (National Teams / Clubs), <b>Gender</b> (Men / Women) and optional <b>Ages</b> (U18, U14… or “+ custom”). The app creates every category (type × age × sex) and shows them as a preview. Click <b>Save categories</b>.',
          '<b>Teams &amp; categories</b> — add each club / national team and tick the categories it plays. Optional per team: a <b>short name</b> for the schedule, <b>nation</b> and <b>club</b> (officials from that nation or club never officiate the team; empty = the team name) and a <b>logo</b> (“+ logo”, shown on the broadcast scoreboard). Click <b>Save teams</b>.',
          '<b>Format</b> — per category: pick a format variant, <b>Group best of</b> and <b>Finals best of</b> (1/3/5/7), and the number of <b>Groups</b> (1 = all play all, or split e.g. 2 groups of 6). With several groups, choose <b>Qualify per group</b> and whether there are <b>Placement games</b> (5th place and below); move teams between groups with the drop-down next to each name. <b>View bracket</b> / <b>“👁 Review each bracket”</b> shows and fine-tunes the knockout. A <b>⚠️ check</b> tag marks a format worth a second look. Then <b>“Looks good — continue”</b>.',
        ] },
        { t: "note", text: 'The team names you enter here are the key for everything else (rosters, officials’ conflicts, uniforms). Use the <b>same names</b> as in the Excel files you import later.' },
      ] },
      { h: "Part C — Courts, schedule and publish (steps 5–6)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Courts &amp; schedule</b> — add the <b>courts</b> and the <b>days</b>, each with its start and end time. Per day you can set its own <b>game duration</b> (e.g. a finals day with best of 5), tick the <b>phases</b> it is for (groups on the first days, semifinals and finals on the last; none ticked = any game) or mark it <b>“No new games”</b>. Below: <b>Default game duration</b> and <b>Break between games</b>. Click <b>Save courts &amp; continue</b>.',
          '<b>Generate &amp; publish schedule</b> — builds all games from categories, teams, format and courts and places them on days, courts and times. Adjust by dragging or typing, then <b>publish</b>: the games appear on the games list and on Fistball Live.',
          'Later changes: the <b>Schedule</b> page (sidebar) sets each game’s day · court · time. When you are done arranging, <b>renumber</b> the games so #1…N follow the chronological order.',
        ] },
        { t: "note", text: '<b>A second part later</b> (e.g. clubs after the national teams): <b>“+ Add new categories (keep current)”</b> builds only the categories without games yet, numbers them after the existing ones and avoids their courts and times. Mark days as <b>“No new games”</b> to keep them for the existing part.' },
      ] },
      { h: "Part D — How the finals are generated", blocks: [
        { t: "p", text: 'With a knockout format, the generator creates the final rounds as a <b>bracket</b> with <b>placeholders</b> (“1st Group A”, “Winner SF1”, “Loser SF2”). The Format step shows the rounds per category before you publish:' },
        { t: "ul", items: [
          '<b>One group</b> (all play all) → a knockout preset for the number of teams, adjustable with “View bracket”.',
          '<b>2, 4 or 8 groups</b> → a cross-over knockout (quarterfinals, semifinals, bronze match, final), optionally with placement games for 5th place and below.',
          'Other group counts, or a “round-robin only” variant → no knockout; the final standings come from the groups.',
        ] },
        { t: "p", text: '<b>The bracket fills itself:</b> every time a game report is submitted, the app puts the qualified teams into every knockout slot whose teams are known. If a slot stays empty (e.g. after a network error), admins click <b>“↻ Advance bracket”</b> on the games list.' },
      ] },
      { h: "Part E — Import players, staff and officials", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Settings → Tools (optional) → Import players &amp; staff from Excel</b>: <b>“+ Add file…”</b>, one file per category (the “…DATA.xlsx” files). Pick the category for each file — or <b>“referees only”</b> for a file with officials only. It brings players, staff and referees at once; review and save.',
          '<b>Players &amp; staff</b> shows the registry per team. Jersey numbers can be edited there and save automatically; in an already-open game report, use <b>“↻ Load roster”</b> to pull the change.',
          'If the box <b>“⚠️ Teams in the schedule without players”</b> appears, a team name in the games doesn’t match the registry (usually spelling): pick the registered team and click <b>Rename in games</b>.',
        ] },
        { t: "note", text: '<b>Legacy:</b> the import from the “DB” tab of a Google Sheet (Players &amp; staff page) is only for squads that already live in a spreadsheet. For a new event, use Excel.' },
      ] },
      { h: "Part F — Logos, Fistball Live and access (steps 7–9)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event logos</b> — upload the event logo and the promoters’ logos. They appear on the game report (PDF), in the app’s top bar and on Fistball Live.',
          '<b>Publish to Fistball Live</b> — <b>“Publish to Live”</b> puts the event on the public scoreboard, <b>“Stop showing”</b> takes it off. Several events can be on air at once; spectators pick the event in Fistball Live. Below are the <b>📺 broadcast overlay</b> links (one per court) for OBS/vMix.',
          '<b>Access to this event</b> — who may score and manage; see “Access” at the end of this guide.',
        ] },
      ] },
      { h: "Part G — Referees and officials", blocks: [
        { t: "p", text: 'The <b>Referees</b> page plans who officiates each game: <b>Referee 1</b>, <b>Referee 2</b>, <b>Clerk</b> (on some courts a <b>Clerk 2</b>), <b>Assistant 1 / 2</b> (line judges) and the <b>Court manager</b>. Everything saves automatically and pre-fills the game report.' },
        { t: "ol", start: 1, items: [
          '<b>Officials registry</b> (filled by the Excel import, or “Add official”): per official the <b>roles</b> (empty = any slot), the <b>rank</b> (Top / Good / Normal, for referees and assistants), <b>gender</b>, <b>nation</b>, <b>club</b>, an <b>assistant partner</b> (the two always work the lines together), <b>Max/day</b> and the <b>availability per day</b>: available, reserve or unavailable — optionally only between two times (the whole game has to fit).',
          '<b>Assignment settings</b>: Referee 2 <b>in every game</b> or <b>only semifinals, bronze and final</b>; in the knockout, a Referee 2 from a playing nation <b>only if no neutral referee is available</b> or <b>allowed</b>; on which courts a <b>Clerk 2</b> is needed; and whether <b>in the final the referees work the lines</b>.',
          '<b>Game rank</b>: next to each game, its rank (by default semifinals, bronze and final are Top). Auto-assign gives it a Referee 1 of at least that rank.',
          '<b>“Auto-assign…”</b>: pick the day (or all days); the app fills the empty slots — no conflicts, assistant pairs together, load spread evenly, breaks between games where possible. You see the proposal with before/after; <b>nothing is saved until you click Apply</b>. Officials set by hand always stay. <b>“Clear auto-assigned…”</b> removes only what auto-assign filled in.',
          'By hand: type or pick a name in a slot (marked <b>✎ manual</b>). The pills above the table count <b>conflicts</b>, <b>warnings</b> and <b>empty required slots</b>; click them for the list, or tick <b>Only games with issues</b>.',
          '<b>Load per official</b>: how many games each official has per day and in total.',
        ] },
        { t: "warn", title: "Red = never allowed · orange = allowed with a warning", items: [
          '<b>Red (conflict):</b> a referee of a team’s own nation (Referee 1 always; Referee 2 in group games); a referee, assistant or clerk of a team’s own club; the same person twice at the same time; not available that day or time; a role the official may not fill; 3 or more games in a row; a required slot left empty.',
          '<b>Orange (warning):</b> 2 games in a row (a break after every game is preferred); reserve that day; more games than Max/day; a referee below the game’s rank; assistant partners split; a knockout Referee 2 from a playing nation; in club competitions, a referee from a club’s nation; in a women’s semifinal or final no female referee yet.',
        ] },
      ] },
      { h: "Part H — Uniforms", blocks: [
        { t: "p", text: 'The <b>Uniforms</b> page decides which jersey each team wears, so that the two teams — and the referees — can be told apart.' },
        { t: "ol", start: 1, items: [
          '<b>Team uniforms</b>: up to <b>two uniforms</b> per team and category, each with up to <b>3 jersey colours</b> (e.g. stripes). Click a colour square and pick from the palette.',
          '<b>Referee shirts</b>: the event’s referee shirt colours (with a name). All officials of a game wear one of them.',
          '<b>Uniform of the day</b>: pick the team and the day (or every day), click the uniform — the buttons show its jersey colours — and <b>Apply</b>.',
          '<b>Per game</b>: for Team A and Team B, click the button of the uniform (its colours); click it again to clear. The referee shirt works the same way.',
          '<b>Checks</b>: the pills count <b>clashes</b> (two jerseys too similar), games that <b>can’t be resolved</b> and referee shirt clashes. <b>Clash below ΔE</b> sets how similar counts as a clash (higher = stricter). Uniform changes of a team during a day are listed too.',
          '<b>“Suggest uniforms…”</b>: proposes uniforms and referee shirts for one day or all days with as few changes as possible; review and apply.',
        ] },
      ] },
      { h: "Part I — Plans", blocks: [
        { t: "p", text: 'The <b>Plans</b> page is open to every event member and is meant for printing:' },
        { t: "ul", items: [
          '<b>Teams — uniforms</b>: per team, its games with court, opponent and the uniform to wear.',
          '<b>Officials — day plan</b>: per official, their games of the day with court, role and shirt colour.',
        ] },
        { t: "p", text: '<b>Print</b> or download as <b>PDF</b> — one team or official per page, ready to hand out.' },
      ] },
      { h: "Part J — During the tournament", blocks: [
        { t: "ol", start: 1, items: [
          'Each official opens a game from the list → fills in the <b>report</b> (line-ups pre-filled from the registry; <b>“↻ Load roster”</b> pulls changes), logs rallies/sets and cards, and <b>submits</b>.',
          'On every save/submit the score and cards go to Fistball Live automatically (standings, bracket and the <b>Cards</b> tab), and the bracket advances.',
          'Rehearsed the scoring? <b>Settings → Event status → “Reset all game reports”</b> starts clean (games and rosters stay); a single game: <b>“Reset this report”</b> in the game.',
          'At the end, <b>Settings → Event status → Archive</b>: the event becomes read-only (<b>Re-activate</b> undoes it).',
        ] },
      ] },
      { h: "Access — add users (who scores)", blocks: [
        { t: "p", text: 'The app <b>does not create password accounts</b>: each person signs in with their <b>own Google account</b> (“Sign in with Google”). You only <b>authorize their email</b> in an event.' },
        { t: "ol", start: 1, items: [
          'Open the event → <b>Settings → step 9 “Access to this event”</b>.',
          'Type the person’s <b>exact Google-account email</b>, a <b>name</b> (optional), and pick a <b>role</b>: <b>admin</b> (manage the event) · <b>official</b> (fill the match reports) · <b>viewer</b> (read only). Click <b>Authorize</b>.',
          'When they <b>Sign in with Google</b> using that email, they’re in the event with that role.',
        ] },
        { t: "note", text: 'It’s <b>per event</b>. <b>“People used in other events”</b> re-authorizes someone with one click, and on <b>Players &amp; staff</b> a person’s card has <b>“Give access”</b>. The <b>email must exactly match</b> the Google account. The event creator and <b>org-admins</b> have access to everything without being added. The event must be <b>active</b> to add/remove members.' },
      ] },
    ],
    summary: "<b>Flow summary:</b> New event → Settings: details → categories → teams → format → courts → generate &amp; publish → import Excel (players, staff, officials) → logos → Fistball Live → access → Referees (auto-assign) → Uniforms → Plans (print) → score the reports.",
  },

  /* -------------------------------- ESPAÑOL ------------------------------- */
  es: {
    title: "Crear un evento y llevar el torneo",
    subtitle: "Desde la creación del evento hasta las finales — partidos, árbitros, uniformes y planillas",
    intro: "Esta guía describe, en el orden correcto, cómo crear un nuevo evento en Fistball Arena, configurarlo paso a paso (categorías, equipos, formato, canchas, fixture), importar jugadores y árbitros, planificar el arbitraje y los uniformes y publicar todo en Fistball Live.",
    sections: [
      { h: "Parte A — Crear el evento", blocks: [
        { t: "ol", start: 1, items: [
          'En la lista de eventos, haz clic en <b>“+ New event”</b> (visible solo para org-admins). Completa <b>Nombre</b>, <b>Lugar</b> y las fechas (<b>Starts</b> / <b>Ends</b>) y confirma. El evento se abre y empieza con estado <b>activo</b>.',
          'Dentro del evento, la <b>barra lateral izquierda</b> tiene sus páginas: <b>Games</b>, <b>Standings</b>, <b>Plans</b> y, para admins, <b>Schedule</b>, <b>Players &amp; staff</b>, <b>Referees</b>, <b>Uniforms</b> y <b>Settings</b>. En el celular, se abre con el botón <b>☰</b>.',
          'Abre <b>Settings</b>: es una configuración guiada en <b>9 pasos numerados</b>. El paso actual está abierto, los siguientes se van habilitando y los terminados se ponen verdes. Las partes B a D siguen esos pasos.',
        ] },
        { t: "note", text: 'Para traer un evento <b>pasado</b> con sus resultados, los org-admins tienen <b>“⬇ Import from Google Sheet”</b> en la lista de eventos.' },
      ] },
      { h: "Parte B — Settings: datos, categorías, equipos, formato (pasos 1–4)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event details</b> — nombre, lugar, <b>dirección de la sede</b> (se muestra en Fistball Live con indicaciones) y fechas. Haz clic en <b>Save details</b>.',
          '<b>Categories</b> — marca los chips: <b>Type</b> (National Teams / Clubs), <b>Gender</b> (Men / Women) y, opcional, <b>Ages</b> (U18, U14… o “+ custom”). El app crea cada categoría (tipo × edad × sexo) y las muestra como vista previa. Haz clic en <b>Save categories</b>.',
          '<b>Teams &amp; categories</b> — agrega cada club / selección y marca las categorías en que juega. Opcional por equipo: un <b>nombre corto</b> para el fixture, <b>nación</b> y <b>club</b> (los árbitros de esa nación o club nunca dirigen al equipo; vacío = nombre del equipo) y un <b>logo</b> (“+ logo”, aparece en el marcador de la transmisión). Haz clic en <b>Save teams</b>.',
          '<b>Format</b> — por categoría: elige la variante de formato, <b>Group best of</b> y <b>Finals best of</b> (1/3/5/7) y el número de <b>Groups</b> (1 = todos contra todos, o dividir, p. ej. 2 grupos de 6). Con varios grupos, elige <b>Qualify per group</b> y si hay <b>Placement games</b> (5.º puesto hacia abajo); cambia equipos de grupo con la lista junto al nombre. <b>View bracket</b> / <b>“👁 Review each bracket”</b> muestra y ajusta la llave. Una etiqueta <b>⚠️ check</b> marca un formato que conviene revisar. Luego, <b>“Looks good — continue”</b>.',
        ] },
        { t: "note", text: 'Los nombres de equipo que cargas aquí son la clave de todo lo demás (planteles, conflictos de árbitros, uniformes). Usa los <b>mismos nombres</b> que en los archivos Excel que importarás después.' },
      ] },
      { h: "Parte C — Canchas, fixture y publicación (pasos 5–6)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Courts &amp; schedule</b> — carga las <b>canchas</b> y los <b>días</b>, cada uno con hora de inicio y fin. Por día puedes fijar una <b>duración de partido</b> propia (p. ej. día de finales al mejor de 5), marcar las <b>fases</b> para las que es (grupos los primeros días, semifinales y finales el último; ninguna marcada = cualquier partido) o marcar <b>“No new games”</b>. Abajo: <b>Default game duration</b> y <b>Break between games</b>. Haz clic en <b>Save courts &amp; continue</b>.',
          '<b>Generate &amp; publish schedule</b> — arma todos los partidos a partir de categorías, equipos, formato y canchas y los ubica en días, canchas y horarios. Ajusta arrastrando o escribiendo y luego <b>publica</b>: los partidos aparecen en la lista y en Fistball Live.',
          'Cambios después: la página <b>Schedule</b> (barra lateral) fija día · cancha · hora de cada partido. Al terminar, <b>renumera</b> los partidos para que #1…N sigan el orden cronológico.',
        ] },
        { t: "note", text: '<b>Una segunda parte después</b> (p. ej. clubes después de las selecciones): <b>“+ Add new categories (keep current)”</b> arma solo las categorías aún sin partidos, las numera después de las existentes y evita sus canchas y horarios. Los días marcados <b>“No new games”</b> quedan para la parte existente.' },
      ] },
      { h: "Parte D — Cómo se generan las finales", blocks: [
        { t: "p", text: 'Con un formato con eliminatorias, el generador crea las rondas finales como una <b>llave</b> con <b>marcadores de posición</b> (“1st Group A”, “Winner SF1”, “Loser SF2”). El paso Format muestra las rondas de cada categoría antes de publicar:' },
        { t: "ul", items: [
          '<b>Un grupo</b> (todos contra todos) → una plantilla de eliminatoria según el número de equipos, ajustable en “View bracket”.',
          '<b>2, 4 u 8 grupos</b> → eliminatoria cruzada (cuartos, semifinales, partido por el bronce, final), con partidos de clasificación del 5.º puesto hacia abajo si se desea.',
          'Otros números de grupos, o una variante “round-robin only” → sin eliminatorias; la clasificación final sale de los grupos.',
        ] },
        { t: "p", text: '<b>La llave se completa sola:</b> con cada planilla enviada, el app coloca a los equipos clasificados en cada partido de eliminatoria cuyos equipos ya se conocen. Si un lugar queda vacío (p. ej. tras un error de red), los admins hacen clic en <b>“↻ Advance bracket”</b> en la lista de partidos.' },
      ] },
      { h: "Parte E — Importar jugadores, cuerpo técnico y árbitros", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Settings → Tools (optional) → Import players &amp; staff from Excel</b>: <b>“+ Add file…”</b>, un archivo por categoría (los archivos “…DATA.xlsx”). Elige la categoría de cada archivo — o <b>“referees only”</b> para un archivo solo con árbitros. Trae jugadores, cuerpo técnico y árbitros de una vez; revisa y guarda.',
          '<b>Players &amp; staff</b> muestra el registro por equipo. Los números de camiseta se editan ahí y se guardan al instante; en una planilla ya abierta, <b>“↻ Load roster”</b> trae el cambio.',
          'Si aparece el recuadro <b>“⚠️ Teams in the schedule without players”</b>, un nombre de equipo en los partidos no coincide con el registro (casi siempre la ortografía): elige el equipo registrado y haz clic en <b>Rename in games</b>.',
        ] },
        { t: "note", text: '<b>Antiguo:</b> la importación desde la pestaña “DB” de una Hoja de Google (página Players &amp; staff) es solo para planteles que ya están en una planilla. Para un evento nuevo, usa Excel.' },
      ] },
      { h: "Parte F — Logos, Fistball Live y acceso (pasos 7–9)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event logos</b> — sube el logo del evento y los de los organizadores. Aparecen en la planilla (PDF), en la barra superior del app y en Fistball Live.',
          '<b>Publish to Fistball Live</b> — <b>“Publish to Live”</b> pone el evento en el marcador público, <b>“Stop showing”</b> lo quita. Varios eventos pueden estar al aire a la vez; el público elige el evento en Fistball Live. Debajo están los enlaces del <b>📺 overlay de transmisión</b> (uno por cancha) para OBS/vMix.',
          '<b>Access to this event</b> — quién puede cargar y administrar; ver “Acceso” al final de esta guía.',
        ] },
      ] },
      { h: "Parte G — Árbitros y oficiales", blocks: [
        { t: "p", text: 'La página <b>Referees</b> planifica quién trabaja en cada partido: <b>Referee 1</b>, <b>Referee 2</b>, <b>Clerk</b> (planillero; en algunas canchas un <b>Clerk 2</b>), <b>Assistant 1 / 2</b> (jueces de línea) y el <b>Court manager</b>. Todo se guarda al instante y completa la planilla.' },
        { t: "ol", start: 1, items: [
          '<b>Registro de oficiales</b> (cargado por la importación de Excel o con “Add official”): por persona las <b>funciones</b> (vacío = cualquier puesto), el <b>nivel</b> (Top / Good / Normal, para árbitros y jueces de línea), <b>género</b>, <b>nación</b>, <b>club</b>, un <b>compañero de línea</b> (los dos siempre trabajan juntos en las líneas), <b>Max/day</b> y la <b>disponibilidad por día</b>: disponible, reserva o no disponible — si se quiere, solo entre dos horarios (el partido entero tiene que caber).',
          '<b>Assignment settings</b>: Referee 2 <b>en todos los partidos</b> o <b>solo semifinales, bronce y final</b>; en eliminatorias, un Referee 2 de una nación que juega <b>solo si no hay un árbitro neutral</b> o <b>permitido</b>; en qué canchas hace falta un <b>Clerk 2</b>; y si <b>en la final los árbitros trabajan en las líneas</b>.',
          '<b>Nivel del partido</b>: junto a cada partido, su nivel (por defecto semifinales, bronce y final son Top). La asignación automática le da un Referee 1 de al menos ese nivel.',
          '<b>“Auto-assign…”</b>: elige el día (o todos); el app completa los puestos vacíos — sin conflictos, parejas de línea juntas, carga repartida por igual, con pausas entre partidos siempre que se pueda. La propuesta muestra antes/después; <b>no se guarda nada hasta hacer clic en Apply</b>. Los oficiales puestos a mano siempre se mantienen. <b>“Clear auto-assigned…”</b> quita solo lo que completó la asignación automática.',
          'A mano: escribe o elige un nombre en un puesto (marcado <b>✎ manual</b>). Los contadores sobre la tabla muestran <b>conflictos</b>, <b>avisos</b> y <b>puestos obligatorios vacíos</b>; haz clic para ver la lista, o marca <b>Only games with issues</b>.',
          '<b>Load per official</b>: cuántos partidos tiene cada persona por día y en total.',
        ] },
        { t: "warn", title: "Rojo = nunca permitido · naranja = permitido con aviso", items: [
          '<b>Rojo (conflicto):</b> un árbitro de la nación de un equipo (Referee 1 siempre; Referee 2 en partidos de grupo); árbitro, juez de línea o planillero del club de un equipo; la misma persona dos veces a la misma hora; no disponible ese día u horario; una función que la persona no puede cumplir; 3 o más partidos seguidos; un puesto obligatorio vacío.',
          '<b>Naranja (aviso):</b> 2 partidos seguidos (se prefiere una pausa después de cada partido); reserva ese día; más partidos que Max/day; un árbitro por debajo del nivel del partido; pareja de línea separada; un Referee 2 de eliminatoria de una nación que juega; en competiciones de clubes, un árbitro de la nación de un club; en semifinal o final femenina todavía sin árbitra.',
        ] },
      ] },
      { h: "Parte H — Uniformes", blocks: [
        { t: "p", text: 'La página <b>Uniforms</b> define qué camiseta usa cada equipo, para que los dos equipos — y los árbitros — se distingan.' },
        { t: "ol", start: 1, items: [
          '<b>Team uniforms</b>: hasta <b>dos uniformes</b> por equipo y categoría, cada uno con hasta <b>3 colores de camiseta</b> (p. ej. rayas). Haz clic en un cuadrado de color y elige de la paleta.',
          '<b>Referee shirts</b>: los colores de camiseta de los árbitros del evento (con nombre). Todos los oficiales de un partido usan uno de ellos.',
          '<b>Uniform of the day</b>: elige el equipo y el día (o todos los días), haz clic en el uniforme — los botones muestran sus colores — y en <b>Apply</b>.',
          '<b>Por partido</b>: para el equipo A y el B, haz clic en el botón del uniforme (sus colores); otro clic lo quita. La camiseta de los árbitros funciona igual.',
          '<b>Controles</b>: los contadores muestran <b>choques de color</b> (dos camisetas demasiado parecidas), partidos <b>sin solución</b> y choques con la camiseta de los árbitros. <b>Clash below ΔE</b> fija desde cuándo los colores cuentan como parecidos (más alto = más estricto). También se listan los cambios de uniforme de un equipo durante el día.',
          '<b>“Suggest uniforms…”</b>: propone uniformes y camisetas de árbitro para un día o todos, con la menor cantidad de cambios; revisa y aplica.',
        ] },
      ] },
      { h: "Parte I — Planillas para imprimir", blocks: [
        { t: "p", text: 'La página <b>Plans</b> está abierta a todos los miembros del evento y está pensada para imprimir:' },
        { t: "ul", items: [
          '<b>Teams — uniforms</b>: por equipo, sus partidos con cancha, rival y el uniforme a usar.',
          '<b>Officials — day plan</b>: por persona, sus partidos del día con cancha, función y color de camiseta.',
        ] },
        { t: "p", text: '<b>Imprime</b> o descarga en <b>PDF</b> — un equipo o una persona por página, listo para repartir.' },
      ] },
      { h: "Parte J — Durante el torneo", blocks: [
        { t: "ol", start: 1, items: [
          'Cada oficial abre un partido de la lista → completa la <b>planilla</b> (formaciones precargadas del registro; <b>“↻ Load roster”</b> trae cambios), registra rallies/sets y tarjetas y <b>envía</b>.',
          'Con cada guardar/enviar, el marcador y las tarjetas van automáticamente a Fistball Live (tabla, llave y la pestaña <b>Cards</b>), y la llave avanza.',
          '¿Ensayaron la carga? <b>Settings → Event status → “Reset all game reports”</b> empieza de cero (partidos y planteles se mantienen); un solo partido: <b>“Reset this report”</b> en el partido.',
          'Al final, <b>Settings → Event status → Archive</b>: el evento queda de solo lectura (<b>Re-activate</b> lo deshace).',
        ] },
      ] },
      { h: "Acceso — dar de alta usuarios (quién carga)", blocks: [
        { t: "p", text: 'El app <b>no crea cuentas con contraseña</b>: cada persona entra con su <b>propia cuenta de Google</b> (“Sign in with Google”). Tú solo <b>autorizas su e-mail</b> en un evento.' },
        { t: "ol", start: 1, items: [
          'Abre el evento → <b>Settings → paso 9 “Access to this event”</b>.',
          'Escribe el <b>e-mail exacto de la cuenta de Google</b> de la persona, un <b>nombre</b> (opcional), y elige un <b>rol</b>: <b>admin</b> (administra el evento) · <b>official</b> (completa las planillas) · <b>viewer</b> (solo lectura). Haz clic en <b>Authorize</b>.',
          'Cuando haga <b>Sign in with Google</b> con ese e-mail, entra al evento con ese rol.',
        ] },
        { t: "note", text: 'Es <b>por evento</b>. <b>“People used in other events”</b> vuelve a autorizar con un clic, y en <b>Players &amp; staff</b> la tarjeta de una persona tiene <b>“Give access”</b>. El <b>e-mail debe coincidir exactamente</b> con la cuenta de Google. Quien creó el evento y los <b>org-admins</b> tienen acceso a todo sin ser agregados. El evento debe estar <b>activo</b> para agregar/quitar miembros.' },
      ] },
    ],
    summary: "<b>Resumen del flujo:</b> Nuevo evento → Settings: datos → categorías → equipos → formato → canchas → generar &amp; publicar → importar Excel (jugadores, cuerpo técnico, árbitros) → logos → Fistball Live → acceso → Referees (asignación automática) → Uniforms → Plans (imprimir) → cargar las planillas.",
  },

  /* -------------------------------- DEUTSCH -------------------------------- */
  de: {
    title: "Event anlegen und Turnier durchführen",
    subtitle: "Von der Anlage des Events bis zu den Endspielen — Spiele, Schiedsrichter, Trikots und Pläne",
    intro: "Diese Anleitung beschreibt in der richtigen Reihenfolge, wie man in Fistball Arena ein neues Event anlegt, es Schritt für Schritt einrichtet (Kategorien, Teams, Modus, Felder, Spielplan), Spieler und Schiedsrichter importiert, Schiedsrichter und Trikots plant und alles in Fistball Live veröffentlicht.",
    sections: [
      { h: "Teil A — Event anlegen", blocks: [
        { t: "ol", start: 1, items: [
          'In der Eventliste auf <b>„+ New event“</b> klicken (nur für Org-Admins sichtbar). <b>Name</b>, <b>Ort</b> und Daten (<b>Starts</b> / <b>Ends</b>) eingeben und bestätigen. Das Event öffnet sich und hat den Status <b>aktiv</b>.',
          'Im Event enthält die <b>Seitenleiste links</b> seine Seiten: <b>Games</b>, <b>Standings</b>, <b>Plans</b> und für Admins <b>Schedule</b>, <b>Players &amp; staff</b>, <b>Referees</b>, <b>Uniforms</b> und <b>Settings</b>. Auf dem Handy öffnet sie der Knopf <b>☰</b>.',
          '<b>Settings</b> öffnen: Das ist eine geführte Einrichtung in <b>9 nummerierten Schritten</b>. Der aktuelle Schritt ist offen, die nächsten werden nach und nach freigeschaltet, erledigte Schritte werden grün. Die Teile B bis D folgen diesen Schritten.',
        ] },
        { t: "note", text: 'Um ein <b>vergangenes</b> Event mit Ergebnissen zu übernehmen, gibt es für Org-Admins <b>„⬇ Import from Google Sheet“</b> in der Eventliste.' },
      ] },
      { h: "Teil B — Settings: Details, Kategorien, Teams, Modus (Schritte 1–4)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event details</b> — Name, Ort, <b>Adresse der Halle/Anlage</b> (in Fistball Live mit Wegbeschreibung) und Daten. <b>Save details</b> klicken.',
          '<b>Categories</b> — Chips markieren: <b>Type</b> (National Teams / Clubs), <b>Gender</b> (Men / Women) und optional <b>Ages</b> (U18, U14 … oder „+ custom“). Die App erzeugt jede Kategorie (Typ × Alter × Geschlecht) und zeigt sie als Vorschau. <b>Save categories</b> klicken.',
          '<b>Teams &amp; categories</b> — jeden Verein / jedes Nationalteam hinzufügen und die Kategorien ankreuzen, in denen es spielt. Optional pro Team: ein <b>Kurzname</b> für den Spielplan, <b>Nation</b> und <b>Verein</b> (Schiedsrichter dieser Nation oder dieses Vereins pfeifen das Team nie; leer = Teamname) und ein <b>Logo</b> („+ logo“, erscheint auf dem Broadcast-Scoreboard). <b>Save teams</b> klicken.',
          '<b>Format</b> — pro Kategorie: Modus-Variante, <b>Group best of</b> und <b>Finals best of</b> (1/3/5/7) und die Zahl der <b>Groups</b> (1 = jeder gegen jeden, oder aufteilen, z. B. 2 Gruppen à 6). Bei mehreren Gruppen <b>Qualify per group</b> wählen und ob es <b>Placement games</b> (Platz 5 und tiefer) gibt; Teams wechseln die Gruppe über das Auswahlfeld neben dem Namen. <b>View bracket</b> / <b>„👁 Review each bracket“</b> zeigt die K.-o.-Runde und erlaubt Feinanpassungen. Ein <b>⚠️ check</b>-Hinweis markiert einen Modus, den man prüfen sollte. Dann <b>„Looks good — continue“</b>.',
        ] },
        { t: "note", text: 'Die hier eingegebenen Teamnamen sind der Schlüssel für alles Weitere (Kader, Schiri-Konflikte, Trikots). <b>Dieselben Namen</b> wie in den später importierten Excel-Dateien verwenden.' },
      ] },
      { h: "Teil C — Felder, Spielplan und Veröffentlichen (Schritte 5–6)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Courts &amp; schedule</b> — die <b>Felder</b> und die <b>Tage</b> mit Start- und Endzeit anlegen. Pro Tag lässt sich eine eigene <b>Spieldauer</b> setzen (z. B. Finaltag mit Best of 5), die <b>Phasen</b> ankreuzen, für die er gedacht ist (Gruppen an den ersten Tagen, Halbfinale und Finale am letzten; nichts angekreuzt = jedes Spiel), oder <b>„No new games“</b> markieren. Darunter: <b>Default game duration</b> und <b>Break between games</b>. <b>Save courts &amp; continue</b> klicken.',
          '<b>Generate &amp; publish schedule</b> — erzeugt alle Spiele aus Kategorien, Teams, Modus und Feldern und verteilt sie auf Tage, Felder und Zeiten. Per Ziehen oder Eintippen anpassen, dann <b>veröffentlichen</b>: Die Spiele erscheinen in der Spielliste und in Fistball Live.',
          'Spätere Änderungen: Auf der Seite <b>Schedule</b> (Seitenleiste) lässt sich für jedes Spiel Tag · Feld · Zeit setzen. Wenn alles passt, die Spiele <b>neu nummerieren</b>, damit #1…N der zeitlichen Reihenfolge folgen.',
        ] },
        { t: "note", text: '<b>Ein zweiter Teil später</b> (z. B. Vereine nach den Nationalteams): <b>„+ Add new categories (keep current)“</b> erzeugt nur die Kategorien ohne Spiele, nummeriert sie nach den bestehenden und weicht deren Feldern und Zeiten aus. Tage mit <b>„No new games“</b> bleiben dem bestehenden Teil vorbehalten.' },
      ] },
      { h: "Teil D — Wie die Endspiele erzeugt werden", blocks: [
        { t: "p", text: 'Bei einem Modus mit K.-o.-Runde erzeugt der Generator die Endspiele als <b>Turnierbaum</b> mit <b>Platzhaltern</b> („1st Group A“, „Winner SF1“, „Loser SF2“). Der Schritt Format zeigt die Runden pro Kategorie schon vor dem Veröffentlichen:' },
        { t: "ul", items: [
          '<b>Eine Gruppe</b> (jeder gegen jeden) → eine K.-o.-Vorlage passend zur Teamzahl, anpassbar über „View bracket“.',
          '<b>2, 4 oder 8 Gruppen</b> → Überkreuz-K.-o. (Viertelfinale, Halbfinale, Spiel um Platz 3, Finale), auf Wunsch mit Platzierungsspielen ab Platz 5.',
          'Andere Gruppenzahlen oder eine Variante „round-robin only“ → keine K.-o.-Runde; die Endplatzierung ergibt sich aus den Gruppen.',
        ] },
        { t: "p", text: '<b>Der Turnierbaum füllt sich selbst:</b> Bei jedem abgeschickten Spielbericht setzt die App die qualifizierten Teams in jedes K.-o.-Spiel ein, dessen Teams feststehen. Bleibt ein Platz leer (z. B. nach einem Netzwerkfehler), klicken Admins in der Spielliste auf <b>„↻ Advance bracket“</b>.' },
      ] },
      { h: "Teil E — Spieler, Betreuer und Schiedsrichter importieren", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Settings → Tools (optional) → Import players &amp; staff from Excel</b>: <b>„+ Add file…“</b>, eine Datei pro Kategorie (die „…DATA.xlsx“-Dateien). Für jede Datei die Kategorie wählen — oder <b>„referees only“</b> für eine Datei nur mit Schiedsrichtern. Das bringt Spieler, Betreuer und Schiedsrichter auf einmal; prüfen und speichern.',
          '<b>Players &amp; staff</b> zeigt das Register pro Team. Rückennummern lassen sich dort ändern und werden sofort gespeichert; in einem schon geöffneten Spielbericht holt <b>„↻ Load roster“</b> die Änderung.',
          'Erscheint der Kasten <b>„⚠️ Teams in the schedule without players“</b>, passt ein Teamname in den Spielen nicht zum Register (meist Schreibweise): das registrierte Team wählen und <b>Rename in games</b> klicken.',
        ] },
        { t: "note", text: '<b>Alt:</b> Der Import aus dem Tab „DB“ eines Google Sheets (Seite Players &amp; staff) ist nur für Kader gedacht, die schon in einer Tabelle stehen. Für ein neues Event Excel verwenden.' },
      ] },
      { h: "Teil F — Logos, Fistball Live und Zugang (Schritte 7–9)", blocks: [
        { t: "ol", start: 1, items: [
          '<b>Event logos</b> — Event-Logo und Logos der Veranstalter hochladen. Sie erscheinen im Spielbericht (PDF), in der Kopfzeile der App und in Fistball Live.',
          '<b>Publish to Fistball Live</b> — <b>„Publish to Live“</b> bringt das Event auf die öffentliche Anzeige, <b>„Stop showing“</b> nimmt es wieder herunter. Mehrere Events können gleichzeitig live sein; die Zuschauer wählen das Event in Fistball Live. Darunter stehen die Links für das <b>📺 Broadcast-Overlay</b> (einer pro Feld) für OBS/vMix.',
          '<b>Access to this event</b> — wer erfassen und verwalten darf; siehe „Zugang“ am Ende dieser Anleitung.',
        ] },
      ] },
      { h: "Teil G — Schiedsrichter und Officials", blocks: [
        { t: "p", text: 'Auf der Seite <b>Referees</b> wird geplant, wer jedes Spiel leitet: <b>Referee 1</b>, <b>Referee 2</b>, <b>Clerk</b> (Schreiber; auf manchen Feldern ein <b>Clerk 2</b>), <b>Assistant 1 / 2</b> (Linienrichter) und der <b>Court manager</b>. Alles wird sofort gespeichert und füllt den Spielbericht vor.' },
        { t: "ol", start: 1, items: [
          '<b>Officials-Register</b> (gefüllt durch den Excel-Import oder „Add official“): pro Person die <b>Rollen</b> (leer = jede Position), der <b>Rang</b> (Top / Good / Normal, für Schiedsrichter und Linienrichter), <b>Geschlecht</b>, <b>Nation</b>, <b>Verein</b>, ein <b>Linienrichter-Partner</b> (die beiden stehen immer zusammen an den Linien), <b>Max/day</b> und die <b>Verfügbarkeit pro Tag</b>: verfügbar, Reserve oder nicht verfügbar — auf Wunsch nur zwischen zwei Uhrzeiten (das ganze Spiel muss hineinpassen).',
          '<b>Assignment settings</b>: Referee 2 <b>in jedem Spiel</b> oder <b>nur Halbfinale, Spiel um Platz 3 und Finale</b>; im K.-o. ein Referee 2 aus einer spielenden Nation <b>nur wenn kein neutraler verfügbar ist</b> oder <b>erlaubt</b>; auf welchen Feldern ein <b>Clerk 2</b> gebraucht wird; und ob <b>im Finale die Schiedsrichter an den Linien stehen</b>.',
          '<b>Spielrang</b>: neben jedem Spiel sein Rang (standardmäßig sind Halbfinale, Spiel um Platz 3 und Finale Top). Die automatische Einteilung gibt ihm einen Referee 1 mit mindestens diesem Rang.',
          '<b>„Auto-assign…“</b>: Tag wählen (oder alle Tage); die App füllt die leeren Positionen — ohne Konflikte, Linienrichter-Paare zusammen, Einsätze gleichmäßig verteilt, möglichst mit Pausen zwischen den Spielen. Der Vorschlag zeigt vorher/nachher; <b>gespeichert wird erst mit Apply</b>. Von Hand gesetzte Officials bleiben immer. <b>„Clear auto-assigned…“</b> entfernt nur, was die automatische Einteilung eingetragen hat.',
          'Von Hand: einen Namen in eine Position tippen oder auswählen (markiert mit <b>✎ manual</b>). Die Zähler über der Tabelle zeigen <b>Konflikte</b>, <b>Warnungen</b> und <b>leere Pflichtpositionen</b>; ein Klick zeigt die Liste, oder <b>Only games with issues</b> ankreuzen.',
          '<b>Load per official</b>: wie viele Spiele jede Person pro Tag und insgesamt hat.',
        ] },
        { t: "warn", title: "Rot = nie erlaubt · Orange = erlaubt mit Warnung", items: [
          '<b>Rot (Konflikt):</b> ein Schiedsrichter aus der Nation eines Teams (Referee 1 immer; Referee 2 in Gruppenspielen); Schiedsrichter, Linienrichter oder Schreiber aus dem Verein eines Teams; dieselbe Person zweimal zur selben Zeit; an dem Tag oder zu der Zeit nicht verfügbar; eine Rolle, die die Person nicht ausüben darf; 3 oder mehr Spiele am Stück; eine leere Pflichtposition.',
          '<b>Orange (Warnung):</b> 2 Spiele am Stück (eine Pause nach jedem Spiel ist erwünscht); an dem Tag Reserve; mehr Spiele als Max/day; ein Schiedsrichter unter dem Rang des Spiels; Linienrichter-Paar getrennt; ein K.-o.-Referee 2 aus einer spielenden Nation; bei Vereinswettbewerben ein Schiedsrichter aus der Nation eines Vereins; im Halbfinale oder Finale der Frauen noch keine Schiedsrichterin.',
        ] },
      ] },
      { h: "Teil H — Trikots", blocks: [
        { t: "p", text: 'Auf der Seite <b>Uniforms</b> wird festgelegt, welches Trikot jedes Team trägt, damit sich die beiden Teams — und die Schiedsrichter — unterscheiden lassen.' },
        { t: "ol", start: 1, items: [
          '<b>Team uniforms</b>: bis zu <b>zwei Trikots</b> pro Team und Kategorie, jedes mit bis zu <b>3 Farben</b> (z. B. Streifen). Auf ein Farbfeld klicken und aus der Palette wählen.',
          '<b>Referee shirts</b>: die Shirtfarben der Schiedsrichter im Event (mit Namen). Alle Officials eines Spiels tragen eine davon.',
          '<b>Uniform of the day</b>: Team und Tag (oder jeden Tag) wählen, auf das Trikot klicken — die Knöpfe zeigen seine Farben — und <b>Apply</b>.',
          '<b>Pro Spiel</b>: bei Team A und Team B auf den Knopf des Trikots (seine Farben) klicken; ein zweiter Klick hebt die Auswahl auf. Das Schiri-Shirt funktioniert genauso.',
          '<b>Prüfungen</b>: Die Zähler zeigen <b>Farbkonflikte</b> (zwei Trikots zu ähnlich), Spiele, die sich <b>nicht lösen lassen</b>, und Konflikte mit dem Schiri-Shirt. <b>Clash below ΔE</b> legt fest, ab wann Farben als zu ähnlich gelten (höher = strenger). Trikotwechsel eines Teams im Lauf eines Tages werden ebenfalls aufgelistet.',
          '<b>„Suggest uniforms…“</b>: schlägt für einen oder alle Tage Trikots und Schiri-Shirts mit möglichst wenigen Wechseln vor; prüfen und übernehmen.',
        ] },
      ] },
      { h: "Teil I — Pläne", blocks: [
        { t: "p", text: 'Die Seite <b>Plans</b> steht allen Mitgliedern des Events offen und ist zum Ausdrucken gedacht:' },
        { t: "ul", items: [
          '<b>Teams — uniforms</b>: pro Team seine Spiele mit Feld, Gegner und dem zu tragenden Trikot.',
          '<b>Officials — day plan</b>: pro Person ihre Spiele des Tages mit Feld, Rolle und Shirtfarbe.',
        ] },
        { t: "p", text: '<b>Drucken</b> oder als <b>PDF</b> herunterladen — ein Team bzw. eine Person pro Seite, fertig zum Verteilen.' },
      ] },
      { h: "Teil J — Während des Turniers", blocks: [
        { t: "ol", start: 1, items: [
          'Jeder Official öffnet ein Spiel aus der Liste → füllt den <b>Spielbericht</b> aus (Aufstellungen aus dem Register vorausgefüllt; <b>„↻ Load roster“</b> holt Änderungen), erfasst Ballwechsel/Sätze und Karten und <b>schickt ab</b>.',
          'Bei jedem Speichern/Abschicken gehen Ergebnis und Karten automatisch an Fistball Live (Tabelle, Turnierbaum und Tab <b>Cards</b>), und der Turnierbaum rückt nach.',
          'Erfassung geprobt? <b>Settings → Event status → „Reset all game reports“</b> setzt alles zurück (Spiele und Kader bleiben); ein einzelnes Spiel: <b>„Reset this report“</b> im Spiel.',
          'Am Ende <b>Settings → Event status → Archive</b>: Das Event wird schreibgeschützt (<b>Re-activate</b> macht es rückgängig).',
        ] },
      ] },
      { h: "Zugang — Benutzer hinzufügen (wer erfasst)", blocks: [
        { t: "p", text: 'Die App <b>legt keine Konten mit Passwort an</b>: Jede Person meldet sich mit ihrem <b>eigenen Google-Konto</b> an („Sign in with Google“). Du <b>berechtigst nur ihre E-Mail</b> in einem Event.' },
        { t: "ol", start: 1, items: [
          'Event öffnen → <b>Settings → Schritt 9 „Access to this event“</b>.',
          'Die <b>genaue E-Mail des Google-Kontos</b> eingeben, einen <b>Namen</b> (optional), und eine <b>Rolle</b> wählen: <b>admin</b> (Event verwalten) · <b>official</b> (Spielberichte erfassen) · <b>viewer</b> (nur lesen). <b>Authorize</b> klicken.',
          'Meldet sich die Person mit dieser E-Mail über <b>Sign in with Google</b> an, ist sie mit dieser Rolle im Event.',
        ] },
        { t: "note", text: 'Das gilt <b>pro Event</b>. <b>„People used in other events“</b> berechtigt jemanden mit einem Klick erneut, und auf <b>Players &amp; staff</b> hat die Karte einer Person <b>„Give access“</b>. Die <b>E-Mail muss exakt</b> zum Google-Konto passen. Wer das Event angelegt hat und <b>Org-Admins</b> haben ohne Eintrag Zugriff auf alles. Das Event muss <b>aktiv</b> sein, um Mitglieder hinzuzufügen/zu entfernen.' },
      ] },
    ],
    summary: "<b>Ablauf in Kürze:</b> Neues Event → Settings: Details → Kategorien → Teams → Modus → Felder → Spielplan erzeugen &amp; veröffentlichen → Excel importieren (Spieler, Betreuer, Schiedsrichter) → Logos → Fistball Live → Zugang → Referees (automatisch einteilen) → Uniforms → Plans (drucken) → Spielberichte erfassen.",
  },
};
