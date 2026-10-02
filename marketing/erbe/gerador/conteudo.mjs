// Conteúdo das 30 publicações de outubro/2026: textos das artes e legendas.
// Tipos de slide e campos aceitos: ver corpo() em template.mjs.
// <em>…</em> destaca a palavra na cor de destaque (verde ou menta).

const NOMES = { saude: 'Plano de Saúde', seguros: 'Seguros', consorcio: 'Consórcio', inst: 'Institucional' };
const H = {
  marca: ['#ERBEProtecaoEPatrimonio', '#ProtegerOQueContinua'],
};
const cta = (title, button = 'Fale com a ERBE', body, note = 'Link na bio') => ({ t: 'cta', title, button, body, note });
const ctaBox = (title, box, body) => ({ t: 'cta', title, box, body });

const lista = [
  // ───────────────────────────── 01
  {
    n: '01', slug: 'manifesto', data: 'Qui 01/10', titulo: 'Manifesto: proteger o que continua',
    pilar: 'inst', formato: 'Reels', funil: 'Topo',
    slides: [
      { t: 'reel', kicker: 'Manifesto', title: 'Ninguém planeja o imprevisto. <em>Mas dá para proteger o que continua.</em>', sub: 'Seguros, plano de saúde e consórcio. Uma só casa.' },
    ],
    telas: [
      'Ninguém planeja o imprevisto.',
      'A gente planeja a escola, a viagem, a reforma.',
      'A expansão, a contratação, o próximo trimestre.',
      'Mas quase ninguém planeja o que protege tudo isso.',
      'Saúde. Seguros. Consórcio.',
      'Não são produtos soltos. São partes do mesmo plano.',
      'Três pilares. Uma só casa.',
      'ERBE — Proteger o que continua.',
    ],
    legenda: `Ninguém planeja o imprevisto. Mas dá para proteger o que continua.

A gente planeja a escola dos filhos, a viagem das férias, a expansão da empresa. Mas quase ninguém planeja o que protege tudo isso.

Seguros, plano de saúde e consórcio não são produtos soltos. São partes do mesmo plano: cuidar de quem você ama e do que você construiu.

Na ERBE, a gente começa entendendo a sua vida — ou a sua empresa. Você recebe um estudo escrito, com as opções lado a lado e o motivo da recomendação. E continua falando com a gente depois de assinar.

Três pilares. Uma só casa.

👉 Siga a @erbeprotecao. Todos os dias, um conteúdo para você decidir com mais segurança.`,
    hashtags: [...H.marca, '#PlanejamentoFinanceiro', '#PlanoDeSaude', '#Seguros', '#Consorcio'],
  },
  // ───────────────────────────── 02
  {
    n: '02', slug: 'carencia', data: 'Sex 02/10', titulo: 'Carência: os prazos máximos da lei',
    pilar: 'saude', formato: 'Carrossel', funil: 'Topo',
    slides: [
      { t: 'cover', title: 'Contratei o plano hoje. <em>Posso usar amanhã?</em>', sub: 'O que a lei diz sobre carência — em 1 minuto.' },
      { t: 'text', kicker: 'Primeiro, o conceito', title: 'Carência é o tempo de espera.', body: 'É o período entre a contratação e o direito de usar determinadas coberturas do plano.' },
      { t: 'facts', kicker: 'Lei 9.656/98', title: 'Os prazos máximos', facts: [['24h', 'urgência e emergência'], ['180 dias', 'demais coberturas'], ['300 dias', 'parto a termo']] },
      { t: 'text', kicker: 'Doença preexistente', title: 'Pode haver CPT por até 24 meses.', body: 'Nesse período, a Cobertura Parcial Temporária limita cirurgias, leitos de alta tecnologia e procedimentos de alta complexidade ligados à doença declarada.' },
      { t: 'text', kicker: 'Detalhe importante', title: 'São prazos <em>máximos</em>.', body: 'Contratos e condições comerciais podem prever prazos menores. Por isso, vale comparar antes de assinar.' },
      { t: 'text', kicker: 'Para empresas', title: '30 vidas ou mais: sem carência.', body: 'Em planos empresariais com 30 participantes ou mais, quem entra em até 30 dias da contratação ou da admissão não cumpre carência.' },
      { t: 'list', title: 'Antes de assinar, pergunte:', marker: 'num', items: ['Quais carências valem para o meu caso?', 'Existe redução de carência disponível?', 'Há cobertura parcial temporária?', 'Está tudo por escrito no contrato?'] },
      cta('Ficou com dúvida <em>sobre o seu caso?</em>', 'Fale com a ERBE', 'A gente explica cada detalhe antes de você assinar.'),
    ],
    legenda: `Contratou o plano hoje. Pode usar amanhã? Depende da carência — e a lei define o limite.

Carência é o tempo de espera entre a contratação e o direito de usar determinadas coberturas. Os prazos máximos são:

• 24 horas para urgência e emergência
• 180 dias para as demais coberturas
• 300 dias para parto a termo

Tem doença preexistente? Pode haver Cobertura Parcial Temporária por até 24 meses para procedimentos ligados a ela.

E em planos empresariais com 30 vidas ou mais, quem entra em até 30 dias da contratação ou da admissão não cumpre carência.

O mais importante: peça por escrito quais carências valem para o seu caso — antes de assinar. A gente estuda antes de indicar.

💬 Responda com SAÚDE (aqui nos comentários ou no WhatsApp do link na bio) e receba um estudo para o seu caso.`,
    hashtags: [...H.marca, '#PlanoDeSaude', '#Carencia', '#ANS', '#SaudeSuplementar'],
  },
  // ───────────────────────────── 03
  {
    n: '03', slug: 'mitos-seguro-de-vida', data: 'Sáb 03/10', titulo: 'Mitos e verdades do seguro de vida',
    pilar: 'seguros', formato: 'Carrossel', funil: 'Topo',
    slides: [
      { t: 'cover', title: '4 coisas que te disseram sobre seguro de vida. <em>E não são bem assim.</em>' },
      { t: 'myth', kicker: 'Mito 1', myth: 'Só serve quando a pessoa morre.', truth: 'Muitas apólices incluem coberturas em vida, como invalidez e doenças graves — conforme o que foi contratado.' },
      { t: 'myth', kicker: 'Mito 2', myth: 'O dinheiro vai para o inventário.', truth: 'Pelo Código Civil (art. 794), o capital do seguro de vida não é considerado herança. Ele é pago aos beneficiários indicados.' },
      { t: 'myth', kicker: 'Mito 3', myth: 'É só para quem tem filhos.', truth: 'É para quem tem alguém que depende da sua renda — cônjuge, pais, sócios — ou compromissos que não podem parar.' },
      { t: 'myth', kicker: 'Mito 4', myth: 'Seguro de vida é caro.', truth: 'O valor depende de idade, coberturas e capital segurado. A única forma de saber é simulando.' },
      { t: 'statement', kicker: 'Bônus', title: 'Revisar beneficiários é tão importante <em>quanto contratar.</em>', body: 'Casou, separou, teve filhos? Sua apólice precisa acompanhar.' },
      cta('Salve e envie para <em>quem precisa ler isso.</em>', 'Fale com a ERBE', 'Quer entender qual proteção faz sentido para você?'),
    ],
    legenda: `Seguro de vida não entra no inventário. E essa não é a única coisa que pouca gente sabe.

Arraste para ver 4 ideias que afastam as pessoas de uma decisão importante — e o que de fato acontece:

• Não serve só em caso de morte: muitas apólices têm coberturas em vida, como invalidez e doenças graves.
• O capital vai direto aos beneficiários indicados (Código Civil, art. 794).
• Não é só para quem tem filhos: é para quem tem alguém que depende da sua renda.
• O valor depende de idade, coberturas e capital. Só dá para saber simulando.

Bônus: beneficiário desatualizado passa despercebido. Casou, separou, teve filhos? Revise a sua apólice.

📌 Salve este post e envie para alguém que precisa ler isso.
💬 Responda com SEGUROS e receba um estudo do que faz sentido para você.`,
    hashtags: [...H.marca, '#SeguroDeVida', '#MitosEVerdades', '#ProtecaoFamiliar', '#PlanejamentoFinanceiro'],
  },
  // ───────────────────────────── 04
  {
    n: '04', slug: 'outubro-rosa', data: 'Dom 04/10', titulo: 'Outubro Rosa',
    pilar: 'saude', formato: 'Estático', funil: 'Topo',
    slides: [
      { t: 'poster', theme: 'light', pink: true, kicker: 'Outubro Rosa', title: 'Cuidar também é <em>se lembrar de você.</em>', body: 'Converse com seu médico sobre os exames indicados para você.', line: 'A ERBE apoia a prevenção.' },
    ],
    legenda: `Você lembra da consulta dos filhos, dos pais, de todo mundo. E a sua?

Neste Outubro Rosa, o convite é simples: converse com seu médico sobre os exames indicados para você — e agende.

Cuidar também é se lembrar de você.

Se você tem plano de saúde e ficou com dúvida sobre a rede ou sobre o que está coberto, a gente ajuda a entender.

💗 Compartilhe com uma mulher importante para você.`,
    hashtags: [...H.marca, '#OutubroRosa', '#Prevencao', '#SaudeDaMulher', '#CuidarDeVoce'],
  },
  // ───────────────────────────── 05
  {
    n: '05', slug: 'plano-pelo-cnpj', data: 'Seg 05/10', titulo: 'Plano de saúde pelo CNPJ (Dia da Micro e Pequena Empresa)',
    pilar: 'saude', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: '5/10 · Dia da Micro e Pequena Empresa', title: 'Você tem CNPJ. <em>Seu plano de saúde ainda é de pessoa física?</em>' },
      { t: 'text', kicker: 'Pouca gente sabe', title: 'MEIs e pequenas empresas podem contratar planos empresariais.', body: 'São os planos PME, contratados pelo CNPJ.' },
      { t: 'list', title: 'O que pode mudar', items: ['Operadoras e produtos disponíveis', 'Valores das mensalidades', 'Regras para incluir dependentes', 'Forma de reajuste'] },
      { t: 'list', title: 'Mas atenção às exigências', body: 'Cada operadora define as suas, como:', marker: 'doc', items: ['Tempo mínimo de CNPJ ativo', 'Número mínimo de vidas', 'Vínculo dos beneficiários com a empresa'] },
      { t: 'text', kicker: 'Reajuste', title: 'PME e individual seguem regras diferentes.', body: 'Entender como o reajuste funciona em cada modalidade faz parte da decisão — não só o preço de entrada.' },
      { t: 'statement', title: 'Não existe resposta pronta. <em>Existe comparação feita para o seu caso.</em>', big: true },
      ctaBox('Seu CNPJ pode abrir <em>outras opções.</em>', 'Responda com PME e receba um estudo para o seu CNPJ.', 'A gente compara e explica cada detalhe antes de você decidir.'),
    ],
    legenda: `Você tem CNPJ, mas o plano de saúde ainda está no seu CPF?

MEIs e pequenas empresas podem contratar planos empresariais — os chamados planos PME. Isso pode mudar as operadoras disponíveis, os valores, as regras para dependentes e a forma de reajuste.

Mas cada operadora tem as suas exigências: tempo mínimo de CNPJ ativo, número mínimo de vidas e vínculo dos beneficiários com a empresa.

Por isso, não existe resposta pronta. Existe comparação feita para o seu caso.

Hoje, 5 de outubro, é Dia Nacional da Micro e Pequena Empresa. Um bom dia para revisar isso.

📲 Responda com PME (aqui nos comentários ou no WhatsApp do link na bio) e receba um estudo para o seu CNPJ.`,
    hashtags: [...H.marca, '#PlanoPME', '#MEI', '#PlanoDeSaudeEmpresarial', '#PequenasEmpresas', '#Empreendedorismo'],
  },
  // ───────────────────────────── 06
  {
    n: '06', slug: 'seguro-empresarial-lucros-cessantes', data: 'Ter 06/10', titulo: 'Empresa parada: quem paga as contas?',
    pilar: 'seguros', formato: 'Reels', funil: 'Topo',
    slides: [
      { t: 'reel', kicker: 'Seguro empresarial', title: 'Se a sua empresa fechasse por 60 dias, <em>quem pagaria as contas?</em>', sub: 'O prejuízo que ninguém vê: lucros cessantes.' },
    ],
    telas: [
      'Se a sua empresa fechasse por 60 dias…',
      'quem pagaria as contas?',
      'Incêndio. Alagamento. Pane elétrica.',
      'O prejuízo não é só o que quebrou.',
      'É o que você deixa de faturar enquanto conserta.',
      'Aluguel, salários e fornecedores continuam.',
      'Lucros cessantes e despesas fixas podem estar na apólice.',
      'Se ela for montada assim.',
      'Comente EMPRESA e receba o checklist.',
    ],
    legenda: `Incêndio, alagamento, pane elétrica. O prejuízo não é só o que quebrou. É o que sua empresa deixa de faturar enquanto conserta — com aluguel, salários e fornecedores vencendo normalmente.

O seguro empresarial pode incluir cobertura de lucros cessantes e despesas fixas. Mas só se a apólice for desenhada assim.

A diferença está na hora de montar a proteção, não na hora do sinistro.

💬 Comente EMPRESA e receba o checklist de coberturas para o seu negócio.`,
    hashtags: [...H.marca, '#SeguroEmpresarial', '#LucrosCessantes', '#GestaoDeRiscos', '#Empresarios'],
  },
  // ───────────────────────────── 07
  {
    n: '07', slug: 'consorcio-x-financiamento', data: 'Qua 07/10', titulo: 'Consórcio x financiamento',
    pilar: 'consorcio', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', title: 'Consórcio ou financiamento? <em>A resposta começa com outra pergunta.</em>' },
      { t: 'statement', theme: 'light', kicker: 'A pergunta certa', title: 'Quando você <em>precisa</em> do bem?', body: 'O prazo muda tudo. É por ele que a comparação começa.', big: true },
      { t: 'list', kicker: 'Financiamento', title: 'Para quem tem urgência.', items: ['Crédito imediato', 'Juros sobre o valor financiado', 'Parcelas definidas em contrato'] },
      { t: 'list', kicker: 'Consórcio', title: 'Para quem planeja.', items: ['Sem juros, com taxa de administração', 'Crédito na contemplação, por sorteio ou lance', 'Parcelas corrigidas por índice previsto em contrato'] },
      { t: 'compare', title: 'Lado a lado', heads: ['Financiamento', 'Consórcio'], rows: [['Quando recebe', 'Na hora', 'Na contemplação'], ['Custo', 'Juros', 'Taxa de administração'], ['Indicado para', 'Urgência', 'Planejamento'], ['Previsibilidade da data', 'Total', 'Depende de sorteio ou lance']] },
      { t: 'statement', title: 'Nenhum é melhor em tudo.', body: 'A escolha certa depende de prazo, fluxo de caixa e objetivo.', big: true },
      cta('Compare o custo total <em>antes de decidir.</em>', 'Fale com a ERBE', 'Simule o consórcio para o seu objetivo.'),
    ],
    legenda: `Consórcio ou financiamento? Antes de comparar taxas, responda: quando você precisa do bem?

Financiamento entrega o crédito na hora, com juros.
Consórcio não tem juros, tem taxa de administração — e o crédito vem na contemplação, por sorteio ou lance.

Nenhum é melhor em tudo. Urgência pede uma solução. Planejamento permite outra.

Fale com a ERBE e compare o custo total antes de decidir. Link na bio.`,
    hashtags: [...H.marca, '#Consorcio', '#Financiamento', '#CartaDeCredito', '#PlanejamentoFinanceiro'],
  },
  // ───────────────────────────── 08
  {
    n: '08', slug: 'metodo-erbe', data: 'Qui 08/10', titulo: 'Método ERBE',
    pilar: 'inst', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', kicker: 'Método ERBE', title: 'Preço sem diagnóstico <em>é chute.</em>', sub: 'Por que a gente faz perguntas antes de mandar preço.' },
      { t: 'step', n: 1, total: 5, kicker: 'Etapa 1', title: 'Diagnóstico', body: 'Entendemos quem você protege, o que já tem e onde está exposto.' },
      { t: 'step', n: 2, total: 5, kicker: 'Etapa 2', title: 'Análise de mercado', body: 'Comparamos operadoras, seguradoras e administradoras.' },
      { t: 'step', n: 3, total: 5, kicker: 'Etapa 3', title: 'Estudo escrito', body: 'As opções lado a lado, o que cada uma cobre e o motivo da recomendação.' },
      { t: 'step', n: 4, total: 5, kicker: 'Etapa 4', title: 'Implantação', body: 'Cuidamos da documentação e dos prazos.' },
      { t: 'step', n: 5, total: 5, kicker: 'Etapa 5', title: 'Acompanhamento', body: 'Você continua falando com a gente depois de assinar: reajustes, renovações e sinistros.' },
      cta('Quer começar <em>pelo diagnóstico?</em>'),
    ],
    legenda: `Já pediu uma cotação e recebeu só uma tabela de preços?

Na ERBE, a gente faz perguntas antes. Porque preço sem diagnóstico é chute.

Nosso método:
1. Diagnóstico
2. Análise de mercado
3. Estudo escrito, com as opções lado a lado e o motivo da recomendação
4. Implantação
5. Acompanhamento

Proteção bem feita não termina na assinatura. Ela continua nas renovações, nos reajustes e no dia em que você precisa usar.

Quer começar pelo diagnóstico? Fale com a ERBE pelo link na bio.`,
    hashtags: [...H.marca, '#Consultoria', '#CorretoraDeSeguros', '#PlanoDeSaude', '#Consorcio'],
  },
  // ───────────────────────────── 09
  {
    n: '09', slug: 'erros-empresas-plano-de-saude', data: 'Sex 09/10', titulo: '5 erros das empresas no plano de saúde',
    pilar: 'saude', formato: 'Reels', funil: 'Meio',
    slides: [
      { t: 'reel', kicker: 'Para empresários e RH', title: '5 erros que pesam no plano de saúde <em>da sua empresa.</em>', sub: 'E quase ninguém percebe.' },
    ],
    telas: [
      '5 erros que pesam no plano de saúde da sua empresa',
      '1. Escolher só pela mensalidade do primeiro ano',
      '2. Rede que não atende onde a equipe mora',
      '3. Regras de elegibilidade indefinidas',
      '4. Ler a cláusula de reajuste só na renovação',
      '5. Não acompanhar a utilização',
      'Se reconheceu algum? Fale com a ERBE.',
    ],
    legenda: `Plano de saúde empresarial não pesa só pelo preço. Pesa pelas decisões tomadas — ou não tomadas — ao longo do contrato.

5 erros comuns:
1. Escolher só pela mensalidade do primeiro ano
2. Contratar uma rede que não atende onde a equipe mora
3. Não definir regras de elegibilidade (dependentes, agregados)
4. Ler a cláusula de reajuste só na renovação
5. Não acompanhar a utilização ao longo do ano

Se reconheceu pelo menos um, vale uma conversa antes da próxima renovação. Fale com a ERBE pelo link na bio.`,
    hashtags: [...H.marca, '#PlanoDeSaudeEmpresarial', '#RH', '#BeneficiosCorporativos', '#GestaoDePessoas'],
  },
  // ───────────────────────────── 10
  {
    n: '10', slug: 'seguro-residencial', data: 'Sáb 10/10', titulo: 'Seguro residencial além do incêndio',
    pilar: 'seguros', formato: 'Estático', funil: 'Topo',
    slides: [
      { t: 'poster', kicker: 'Seguro residencial', title: 'Cano estourado no domingo. <em>Seu seguro resolve?</em>', size: 88, body: 'Muitas apólices incluem assistências como encanador, chaveiro e eletricista — além de coberturas para incêndio, danos elétricos e roubo. Depende do que foi contratado.', icons: ['drop', 'key', 'bolt', 'fire'], line: 'Envie sua apólice para a ERBE analisar.' },
    ],
    legenda: `Domingo, 8 da manhã. Um cano estoura na cozinha.

Muita gente não sabe, mas várias apólices de seguro residencial incluem assistências como encanador, chaveiro e eletricista — além das coberturas para incêndio, danos elétricos e roubo.

Tudo depende do que foi contratado. E é justamente aí que pouca gente olha.

Não sabe o que o seu cobre? Envie sua apólice para a ERBE analisar. Link na bio.`,
    hashtags: [...H.marca, '#SeguroResidencial', '#Casa', '#Assistencia24h', '#ProtecaoFamiliar'],
  },
  // ───────────────────────────── 11
  {
    n: '11', slug: 'contemplacao-consorcio', data: 'Dom 11/10', titulo: 'Contemplação explicada em 30 segundos',
    pilar: 'consorcio', formato: 'Reels', funil: 'Topo',
    slides: [
      { t: 'reel', kicker: 'Consórcio sem mistério', title: 'Como você recebe o crédito no consórcio, <em>em 30 segundos.</em>' },
    ],
    telas: [
      'Como você recebe o crédito no consórcio?',
      'Um grupo de pessoas contribui todo mês.',
      'A cada assembleia: contemplação por sorteio…',
      '…e por lance.',
      'Lance = antecipar parte das parcelas.',
      'Livre, fixo ou embutido: depende da administradora.',
      'Contemplado, o crédito passa por análise.',
      'E você compra o bem à vista.',
      'Sem juros. Com planejamento.',
    ],
    legenda: `Consórcio é um grupo de pessoas com o mesmo objetivo, contribuindo todo mês.

A cada assembleia, há contemplações por sorteio e por lance. O lance é antecipar parte das parcelas — e as regras (livre, fixo ou embutido) variam conforme a administradora.

Contemplado, o crédito passa por análise e você compra o bem à vista.

Sem juros. Com planejamento.

Salve para consultar depois — e, quando quiser simular, fale com a ERBE.`,
    hashtags: [...H.marca, '#Consorcio', '#Contemplacao', '#CartaDeCredito', '#ConsorcioImobiliario'],
  },
  // ───────────────────────────── 12
  {
    n: '12', slug: 'dia-das-criancas', data: 'Seg 12/10', titulo: 'Dia das Crianças: quem protege o seu plano?',
    pilar: 'seguros', formato: 'Estático', funil: 'Topo',
    slides: [
      { t: 'poster', kicker: '12 de outubro · Dia das Crianças', title: 'Você planeja o futuro deles. <em>Quem protege o seu plano?</em>', size: 88, body: 'Escola, sonhos, viagens. Tudo depende de uma rotina que continua — mesmo quando algo sai do controle.', icons: ['heart'], line: 'Seguro de vida é sobre continuidade.' },
    ],
    legenda: `Escola, sonhos, viagens, a primeira bicicleta, a faculdade. A gente planeja tudo isso para eles.

Mas todo plano depende de uma rotina que continua — mesmo quando algo sai do controle.

Seguro de vida não é sobre ausência. É sobre garantir que os planos da sua família sigam em frente.

Feliz Dia das Crianças.

Fale com a ERBE e entenda qual proteção faz sentido para a sua família. Link na bio.`,
    hashtags: [...H.marca, '#DiaDasCriancas', '#SeguroDeVida', '#Familia', '#ProtecaoFamiliar'],
  },
  // ───────────────────────────── 13
  {
    n: '13', slug: 'coparticipacao', data: 'Ter 13/10', titulo: 'Coparticipação: economia ou armadilha?',
    pilar: 'saude', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', title: 'Coparticipação: <em>economia ou armadilha?</em>', sub: 'Depende de como você usa.' },
      { t: 'text', kicker: 'O que é', title: 'Mensalidade + um valor a cada uso.', body: 'Em consultas e exames, por exemplo, você paga um valor fixo ou um percentual, conforme o contrato.' },
      { t: 'list', title: 'Pode fazer sentido quando…', items: ['O uso é baixo ou previsível', 'A empresa quer incentivar o uso consciente', 'Uma mensalidade menor é prioridade'] },
      { t: 'list', title: 'Pode pesar quando…', marker: 'x', items: ['Há tratamentos contínuos', 'A rotina tem muitas consultas e exames', 'Ninguém acompanha quanto se usa'] },
      { t: 'list', title: 'O que conferir no contrato', marker: 'doc', items: ['Quais procedimentos têm coparticipação', 'Se é valor fixo ou percentual', 'Se existe limite por evento ou por período'] },
      { t: 'statement', title: 'A conta certa é o <em>custo total no ano</em> — não só a mensalidade.', big: true },
      cta('Simule os dois modelos <em>com o seu perfil de uso.</em>'),
    ],
    legenda: `Coparticipação divide opiniões. Para uns, é economia. Para outros, uma conta que cresce sem ninguém ver.

A verdade: depende do perfil de uso.

Pode fazer sentido quando o uso é baixo ou previsível.
Pode pesar quando há tratamentos contínuos ou muitas consultas e exames.

No contrato, confira: quais procedimentos têm coparticipação, se é valor fixo ou percentual e se existe limite por evento ou por período.

A conta certa é o custo total no ano — não só a mensalidade.

Quer simular os dois modelos com o seu perfil? Fale com a ERBE pelo link na bio.`,
    hashtags: [...H.marca, '#Coparticipacao', '#PlanoDeSaude', '#PlanoDeSaudeEmpresarial', '#RH'],
  },
  // ───────────────────────────── 14
  {
    n: '14', slug: 'dit-profissional-liberal', data: 'Qua 14/10', titulo: 'Renda protegida para profissional liberal (DIT)',
    pilar: 'seguros', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', kicker: 'Para profissionais liberais', title: 'Se você parar de trabalhar por 30 dias, <em>sua renda para junto?</em>' },
      { t: 'statement', theme: 'light', title: 'Afastamento <em>não pausa</em> as contas.', body: 'Para muitos autônomos, ficar sem trabalhar significa ficar sem renda. Aluguel, equipe e compromissos continuam.', big: true },
      { t: 'text', kicker: 'Uma proteção pouco conhecida', title: 'DIT — Diária por Incapacidade Temporária', body: 'Paga diárias enquanto você não pode trabalhar por acidente ou doença, conforme as condições da apólice.' },
      { t: 'list', title: 'Pontos de atenção', marker: 'doc', items: ['Franquia: os dias iniciais sem pagamento', 'Limite de diárias por evento', 'Comprovação de renda'] },
      { t: 'list', title: 'Combina com', items: ['Seguro de vida', 'Cobertura de invalidez', 'Cobertura para doenças graves'] },
      { t: 'list', title: 'Para quem vive da própria agenda', cols: true, marker: 'people', items: ['Médicos', 'Dentistas', 'Fisioterapeutas', 'Psicólogos', 'Advogados', 'Arquitetos', 'Consultores', 'Autônomos'] },
      ctaBox('Quanto da sua renda <em>dá para proteger?</em>', 'Responda com RENDA e receba um estudo.'),
    ],
    legenda: `Médico, dentista, advogado, arquiteto, consultor: quando a agenda para, a renda para junto.

A DIT — Diária por Incapacidade Temporária — paga diárias enquanto você não pode trabalhar por acidente ou doença, conforme as condições da apólice.

Antes de contratar, olhe a franquia, o limite de diárias e como a renda é comprovada.

E combine com seguro de vida, invalidez e doenças graves para uma proteção mais completa.

📲 Responda com RENDA (nos comentários ou no WhatsApp do link na bio) e receba um estudo de quanto da sua renda dá para proteger.`,
    hashtags: [...H.marca, '#ProfissionalLiberal', '#ProtecaoDeRenda', '#SeguroDeVida', '#Autonomos'],
  },
  // ───────────────────────────── 15
  {
    n: '15', slug: 'plano-pais-60-mais', data: 'Qui 15/10', titulo: 'Plano de saúde para pais com mais de 60',
    pilar: 'saude', formato: 'Carrossel', funil: 'Topo',
    slides: [
      { t: 'cover', title: 'Plano de saúde para seus pais depois dos 60: <em>o que você precisa saber.</em>' },
      { t: 'text', kicker: 'Verdade 1', title: 'Não há idade máxima para contratar.', body: 'Ninguém pode ser impedido de ter plano de saúde por causa da idade.' },
      { t: 'text', kicker: 'Verdade 2', title: 'A última faixa etária é aos 59 anos.', body: 'Em planos contratados a partir de 2004, não há aumento por mudança de faixa depois disso. O reajuste anual continua existindo.' },
      { t: 'text', kicker: 'Verdade 3', title: 'Doenças preexistentes devem ser declaradas.', body: 'Pode haver Cobertura Parcial Temporária por até 24 meses para procedimentos ligados a elas.' },
      { t: 'text', kicker: 'Verdade 4', title: 'Rede e região pesam mais do que nunca.', body: 'Hospital perto de casa e os especialistas certos fazem diferença no dia a dia.' },
      { t: 'text', kicker: 'Vale verificar', title: 'Dependente no plano da empresa?', body: 'Em alguns contratos empresariais, pais podem entrar como dependentes ou agregados. Depende das regras da operadora e do contrato.' },
      cta('Veja quais caminhos existem <em>para os seus pais.</em>'),
    ],
    legenda: `Cuidar dos pais também é planejar.

Se você está pensando em um plano de saúde para eles depois dos 60, comece por aqui:

• Não há idade máxima para contratar.
• A última faixa etária de reajuste é aos 59 anos (planos contratados a partir de 2004). O reajuste anual continua.
• Doenças preexistentes devem ser declaradas, e pode haver cobertura parcial temporária.
• Rede e região fazem toda a diferença.
• Em alguns contratos empresariais, pais podem entrar como dependentes ou agregados.

Cada família tem um caminho. Fale com a ERBE e veja quais existem para os seus pais. Link na bio.`,
    hashtags: [...H.marca, '#PlanoDeSaude', '#Idosos', '#CuidarDosPais', '#Familia'],
  },
  // ───────────────────────────── 16
  {
    n: '16', slug: 'stories-revisao-de-seguros', data: 'Sex 16/10', titulo: 'Você sabe o que seu seguro cobre?',
    pilar: 'seguros', formato: 'Story', funil: 'Fundo',
    slides: [
      { t: 'story', theme: 'dark', kicker: 'Pergunta rápida', title: 'Você sabe exatamente o que <em>seu seguro cobre?</em>', sticker: 340 },
      { t: 'story', theme: 'light', kicker: 'Na hora do sinistro', title: 'O que mais surpreende:', size: 84, items: ['Franquia', 'Exclusões', 'Limites de cobertura', 'Beneficiários desatualizados'], marker: 'x' },
      { t: 'story', theme: 'green', kicker: 'Quiz', title: 'Seguro de vida sem beneficiário indicado: <em>para quem vai?</em>', sticker: 380 },
      { t: 'story', theme: 'light', kicker: 'Resposta', title: 'Segue a regra do Código Civil.', size: 84, body: 'Metade vai ao cônjuge não separado judicialmente e o restante aos herdeiros, na ordem da lei. Por isso, indicar e revisar beneficiários faz diferença.' },
      { t: 'story', theme: 'dark', kicker: 'Revisão de apólices', title: 'A ERBE mostra onde você está protegido <em>— e onde não está.</em>', sticker: 300 },
    ],
    stickers: [
      'Story 01: sticker de ENQUETE no espaço inferior — opções "Sim" e "Mais ou menos".',
      'Story 02: sem sticker (ou sticker de reação/emoji deslizante "quanto isso te preocupa?").',
      'Story 03: sticker de QUIZ no espaço inferior — "Para os herdeiros, pela lei" (correta) / "Para o Estado" / "Ninguém recebe".',
      'Story 04: sem sticker.',
      'Story 05: sticker de LINK no espaço inferior — texto "Quero revisar meus seguros" → WhatsApp da ERBE com mensagem pronta. Se o diagnóstico for sem custo, acrescente esse destaque no texto do sticker.',
    ],
    hashtags: [],
  },
  // ───────────────────────────── 17
  {
    n: '17', slug: 'patrimonio-com-metodo', data: 'Sáb 17/10', titulo: 'Patrimônio se constrói com método',
    pilar: 'consorcio', formato: 'Estático', funil: 'Topo',
    slides: [
      { t: 'poster', kicker: 'Consórcio', title: 'Patrimônio não se constrói de uma vez. <em>Se constrói com método.</em>', size: 86, body: 'Consórcio transforma uma parcela planejada em carta de crédito para imóvel, veículo ou equipamento — sem juros, com taxa de administração.', icons: ['house', 'car', 'building'] },
    ],
    legenda: `Patrimônio raramente nasce de uma grande tacada. Ele se constrói com decisões consistentes.

O consórcio transforma uma parcela planejada em carta de crédito para imóvel, veículo ou equipamento — sem juros, com taxa de administração.

É uma ferramenta para quem pensa no próximo passo antes de precisar dar.

Salve este post e, quando quiser simular, fale com a ERBE.`,
    hashtags: [...H.marca, '#Patrimonio', '#Consorcio', '#ConsorcioImobiliario', '#PlanejamentoFinanceiro'],
  },
  // ───────────────────────────── 18
  {
    n: '18', slug: 'por-que-corretora', data: 'Dom 18/10', titulo: 'Por que contratar com uma corretora?',
    pilar: 'inst', formato: 'Reels', funil: 'Meio',
    slides: [
      { t: 'reel', kicker: 'Pergunta honesta', title: 'Por que contratar com uma corretora <em>se dá para cotar no site?</em>' },
    ],
    telas: [
      'Por que contratar com uma corretora se dá para cotar no site?',
      'O site mostra um produto. A corretora compara vários.',
      'Traduz o contrato antes da assinatura.',
      'Ajuda no sinistro, no reembolso, na inclusão de dependentes.',
      'Acompanha reajustes e renovações.',
      'O preço é só o começo da relação.',
      'Fale com a ERBE.',
    ],
    legenda: `Cotar no site é rápido. Mas o site mostra um produto. A corretora compara vários.

E o trabalho não termina na assinatura: explicar o contrato, ajudar no reembolso e no sinistro, incluir dependentes, acompanhar reajustes e renovações.

O preço é só o começo da relação.

Fale com a ERBE e veja a diferença de ter alguém do seu lado. Link na bio.`,
    hashtags: [...H.marca, '#CorretoraDeSeguros', '#Consultoria', '#PlanoDeSaude', '#Seguros'],
  },
  // ───────────────────────────── 19
  {
    n: '19', slug: 'beneficios-e-retencao', data: 'Seg 19/10', titulo: 'Mesmo salário, duas propostas: o que decide?',
    pilar: 'saude', formato: 'Estático', funil: 'Topo',
    slides: [
      {
        t: 'offers', kicker: 'Para empresários e RH', title: 'Duas propostas com o mesmo salário. <em>O que decide?</em>',
        offers: [
          { h: 'Proposta A', l: ['<span>Salário:</span> igual', '<span>Benefícios:</span> básicos'] },
          { h: 'Proposta B', l: ['<span>Salário:</span> igual', '<span>Benefícios:</span> planejados'] },
        ],
        line: 'Estruture os benefícios da sua empresa com a ERBE.',
      },
    ],
    legenda: `Duas propostas. O mesmo salário. Qual delas o profissional escolhe?

Benefícios bem estruturados entram na conta de quem decide onde trabalhar — e de quem decide ficar.

Plano de saúde, seguro de vida em grupo e outras proteções podem fazer parte de uma política de benefícios planejada para o orçamento da empresa.

Fale com a ERBE para estruturar o pacote de benefícios da sua empresa. Link na bio.`,
    hashtags: [...H.marca, '#BeneficiosCorporativos', '#RH', '#RetencaoDeTalentos', '#PlanoDeSaudeEmpresarial'],
  },
  // ───────────────────────────── 20
  {
    n: '20', slug: 'vida-em-grupo-convencao', data: 'Ter 20/10', titulo: 'Seguro de vida em grupo e convenção coletiva',
    pilar: 'seguros', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: 'Para empresários, RH e contadores', title: 'A convenção da sua categoria pode exigir seguro de vida. <em>Você já conferiu?</em>' },
      { t: 'text', kicker: 'Atenção', title: 'Algumas convenções coletivas exigem seguro de vida.', body: 'A obrigação, as coberturas e os valores mínimos variam de acordo com a categoria.' },
      { t: 'text', kicker: 'O risco', title: 'Não cumprir pode gerar passivo trabalhista.', body: 'E o problema costuma aparecer justamente no pior momento.' },
      { t: 'list', title: 'Coberturas comuns', items: ['Morte', 'Invalidez', 'Assistência funeral'], note: 'Conforme a apólice contratada.' },
      { t: 'statement', title: 'Mais que obrigação: <em>um benefício que protege a família do colaborador.</em>' },
      { t: 'text', kicker: 'Para contadores', title: 'Um ponto para checar com seus clientes.', body: 'A ERBE pode ser a parceira que resolve essa parte para a sua carteira.' },
      ctaBox('Sua empresa está <em>em dia?</em>', 'Envie a convenção e o número de colaboradores. A gente devolve um estudo.'),
    ],
    legenda: `Empresário, RH, contador: já conferiu se a convenção coletiva da categoria exige seguro de vida para os colaboradores?

Algumas exigem — com coberturas e valores mínimos definidos. E não cumprir pode gerar passivo trabalhista.

Mais que obrigação, o seguro de vida em grupo é um benefício que protege a família de quem trabalha com você.

📲 Envie a convenção e o número de colaboradores para a ERBE (link na bio). A gente verifica as exigências e devolve um estudo com as opções.`,
    hashtags: [...H.marca, '#SeguroDeVidaEmGrupo', '#ConvencaoColetiva', '#RH', '#Contabilidade', '#BeneficiosCorporativos'],
  },
  // ───────────────────────────── 21
  {
    n: '21', slug: 'consorcio-frota-e-maquinas', data: 'Qua 21/10', titulo: 'Frota e máquinas com consórcio',
    pilar: 'consorcio', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', kicker: 'Para transportadoras e indústrias', title: 'Renovar a frota sem juros no caixa. <em>Já considerou consórcio?</em>' },
      { t: 'list', title: 'O que dá para conquistar', marker: 'truck', items: ['Veículos leves', 'Caminhões e pesados', 'Máquinas e equipamentos'], note: 'Conforme os grupos disponíveis na administradora.' },
      { t: 'text', kicker: 'Estratégia', title: 'Renovação escalonada.', body: 'Várias cotas com prazos diferentes ajudam a planejar a troca da frota ao longo do tempo.' },
      { t: 'text', kicker: 'Antecipação', title: 'Lance para tentar antecipar.', body: 'Ofertar lance pode antecipar a contemplação — sem garantia de data.' },
      { t: 'text', kicker: 'Negociação', title: 'Crédito à vista na mão.', body: 'A carta de crédito pode ajudar na negociação com o fornecedor.' },
      { t: 'list', title: 'Pontos de atenção', marker: 'doc', items: ['A contemplação não tem data garantida', 'Há análise de crédito após a contemplação', 'Taxa de administração e correção das parcelas'] },
      cta('Monte um plano de <em>renovação de frota.</em>'),
    ],
    legenda: `Frota parada custa caro. Frota renovada com juros também.

O consórcio pode ser uma ferramenta para renovar veículos, caminhões, máquinas e equipamentos de forma planejada:
• Cotas com prazos diferentes para renovação escalonada
• Lance para tentar antecipar a contemplação
• Crédito à vista para negociar com o fornecedor

Pontos de atenção: a contemplação não tem data garantida, há análise de crédito, taxa de administração e correção das parcelas.

Consórcio funciona melhor dentro de um plano. Fale com a ERBE e monte o seu. Link na bio.`,
    hashtags: [...H.marca, '#ConsorcioDePesados', '#Frota', '#Transportadora', '#Industria', '#Consorcio'],
  },
  // ───────────────────────────── 22
  {
    n: '22', slug: 'seguro-cyber', data: 'Qui 22/10', titulo: 'Vazou um dado: quem paga a conta?',
    pilar: 'seguros', formato: 'Reels', funil: 'Topo',
    slides: [
      { t: 'reel', kicker: 'Para empresas de tecnologia', title: 'Vazou um dado de cliente. <em>Quem paga a conta?</em>', sub: 'Seguro cyber: o risco que não é só de TI.' },
    ],
    telas: [
      'Vazou um dado de cliente. Quem paga a conta?',
      'Investigação técnica.',
      'Notificação de clientes.',
      'Defesa jurídica.',
      'Possíveis sanções da LGPD.',
      'Sistema fora do ar.',
      'Não é só problema de TI. É problema de caixa.',
      'Seguro cyber pode cobrir parte desses custos.',
      'Comente CYBER.',
    ],
    legenda: `Um incidente com dados não é só problema de TI. Envolve investigação técnica, notificação de clientes, defesa jurídica, possíveis sanções da LGPD e sistema fora do ar.

O seguro cyber pode cobrir parte desses custos, conforme a apólice. E quando a decisão de um gestor é questionada, o tema passa a ser D&O.

💬 Comente CYBER e receba os pontos que uma apólice precisa ter.`,
    hashtags: [...H.marca, '#SeguroCyber', '#LGPD', '#Tecnologia', '#Startups', '#DeO'],
  },
  // ───────────────────────────── 23
  {
    n: '23', slug: 'portabilidade-de-carencias', data: 'Sex 23/10', titulo: 'Portabilidade de carências',
    pilar: 'saude', formato: 'Reels', funil: 'Meio',
    slides: [
      { t: 'reel', kicker: 'Portabilidade de carências', title: 'Trocar de plano de saúde <em>sem cumprir carência de novo?</em>' },
    ],
    telas: [
      'Dá para trocar de plano sem cumprir carência de novo?',
      'Em muitos casos, sim.',
      'É a portabilidade de carências, regulamentada pela ANS.',
      'Pagamentos em dia.',
      'Tempo mínimo no plano atual.',
      'Plano de destino compatível.',
      'Um erro no processo pode atrasar ou inviabilizar a troca.',
      'Mande PORTABILIDADE no WhatsApp.',
    ],
    legenda: `Insatisfeito com o plano de saúde, mas com medo de cumprir carência de novo?

Em muitos casos, existe a portabilidade de carências, regulamentada pela ANS. Os requisitos gerais incluem estar com os pagamentos em dia, cumprir um tempo mínimo no plano atual e escolher um plano de destino compatível.

Cada caso tem detalhes — e um erro no processo pode atrasar ou inviabilizar a troca.

📲 Mande PORTABILIDADE no WhatsApp (link na bio) e a ERBE analisa o seu caso.`,
    hashtags: [...H.marca, '#PortabilidadeDeCarencias', '#PlanoDeSaude', '#ANS', '#Carencia'],
  },
  // ───────────────────────────── 24
  {
    n: '24', slug: 'consorcio-meia-verdade', data: 'Sáb 24/10', titulo: '"Consórcio é para quem não tem pressa"?',
    pilar: 'consorcio', formato: 'Reels', funil: 'Meio',
    slides: [
      { t: 'reel', kicker: 'Mito ou verdade', title: '“Consórcio é para quem não tem pressa.” <em>Meia verdade.</em>' },
    ],
    telas: [
      '"Consórcio é para quem não tem pressa."',
      'Meia verdade.',
      'Consórcio é para quem tem planejamento.',
      'Com lance, dá para tentar antecipar.',
      'Sem garantia de data.',
      'Reserva para lance. Lance embutido. Prazo certo.',
      'O erro não é entrar no consórcio.',
      'É entrar sem estratégia.',
    ],
    legenda: `"Consórcio é para quem não tem pressa." Meia verdade.

Consórcio é para quem tem planejamento. Com lance, é possível tentar antecipar a contemplação — sem garantia de data. E há estratégias: reserva para lance, lance embutido (quando a administradora permite) e escolha do prazo certo.

O erro não é entrar no consórcio. É entrar sem estratégia.

Fale com a ERBE e monte a sua antes de escolher a cota. Link na bio.`,
    hashtags: [...H.marca, '#Consorcio', '#Lance', '#Contemplacao', '#PlanejamentoFinanceiro'],
  },
  // ───────────────────────────── 25
  {
    n: '25', slug: 'case-clinica', data: 'Dom 25/10', titulo: 'Case ERBE (exemplo ilustrativo)',
    pilar: 'inst', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: 'Exemplo ilustrativo', title: 'Uma clínica tinha plano de saúde para a equipe. <em>E achava que bastava.</em>', sub: 'Uma situação que encontramos com frequência.' },
      { t: 'text', kicker: 'Contexto', title: 'Equipe pequena, agenda cheia.', body: 'O plano de saúde estava em dia. O restante da proteção nunca tinha sido revisado.' },
      { t: 'list', kicker: 'Diagnóstico', title: 'O que apareceu na revisão', marker: 'doc', items: ['Sem RC profissional para a clínica', 'Convenção da categoria não conferida', 'Imóvel e equipamentos sem seguro', 'Plano de saúde sem revisão antes da renovação'] },
      { t: 'text', kicker: 'Solução', title: 'Um plano de proteção, não um produto.', body: 'Prioridades definidas por risco e por orçamento: o essencial primeiro, o restante em etapas.' },
      { t: 'text', kicker: 'Resultado', title: 'Clareza sobre onde está protegida.', body: 'E sobre o que ainda falta, com prazo para cada decisão.' },
      { t: 'statement', title: 'Proteção não é ter um seguro. <em>É saber o que está coberto.</em>', big: true },
      cta('Sua situação <em>é parecida?</em>'),
    ],
    legenda: `Exemplo ilustrativo de uma situação que encontramos com frequência:

Uma clínica com equipe pequena tinha o plano de saúde em dia — e achava que isso bastava.

Na revisão, apareceram pontos que ninguém tinha olhado: responsabilidade civil profissional, exigências da convenção coletiva, proteção do imóvel e dos equipamentos e o plano de saúde sem revisão antes da renovação.

A solução não foi um produto. Foi um plano de proteção, com prioridades definidas por risco e orçamento.

Sua situação é parecida? Fale com a ERBE pelo link na bio.`,
    hashtags: [...H.marca, '#Clinicas', '#GestaoDeRiscos', '#SeguroEmpresarial', '#Consultoria'],
  },
  // ───────────────────────────── 26
  {
    n: '26', slug: 'reajuste-plano-empresarial', data: 'Seg 26/10', titulo: 'O reajuste chegou: aceitar ou analisar?',
    pilar: 'saude', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: 'Para RH, financeiro e empresários', title: 'O reajuste do plano chegou. <em>Você aceita ou analisa?</em>' },
      { t: 'list', title: 'Por que ele acontece', items: ['Variação dos custos médicos', 'Utilização do próprio contrato'], note: 'Conforme as regras previstas no contrato.' },
      { t: 'text', kicker: 'Até 29 vidas', title: 'Reajuste por agrupamento.', body: 'Contratos com menos de 30 vidas recebem o mesmo percentual aplicado aos demais contratos pequenos da operadora.' },
      { t: 'text', kicker: '30 vidas ou mais', title: 'A utilização do seu contrato pesa.', body: 'O percentual considera o uso do seu grupo — e há espaço para negociar com dados.' },
      { t: 'list', title: 'Antes da data de aniversário', marker: 'num', items: ['Peça o relatório de utilização', 'Compare com o mercado', 'Reveja rede, coparticipação e acomodação'] },
      { t: 'statement', theme: 'light', kicker: 'Prazo', title: 'Comece de <em>60 a 90 dias</em> antes.', body: 'Tempo é o que permite negociar com calma — ou migrar sem pressa.', big: true },
      { t: 'list', title: 'O que evitar', marker: 'x', items: ['Aceitar sem ler', 'Trocar de plano só pelo preço', 'Decidir em cima do prazo'] },
      ctaBox('Antes de aceitar, <em>analise.</em>', 'Envie a carta de reajuste e receba um estudo.', 'A gente mostra os caminhos possíveis.'),
    ],
    legenda: `A carta de reajuste chegou. E agora?

Antes de aceitar, entenda de onde vem o percentual:
• Contratos com menos de 30 vidas: reajuste por agrupamento.
• 30 vidas ou mais: a utilização do contrato pesa — e há espaço para negociar com dados.

O que fazer antes da data de aniversário: pedir o relatório de utilização, comparar com o mercado e rever o desenho do plano. O ideal é começar de 60 a 90 dias antes.

📲 Envie a carta de reajuste para a ERBE (link na bio) e receba um estudo com os caminhos possíveis.`,
    hashtags: [...H.marca, '#ReajustePlanoDeSaude', '#PlanoDeSaudeEmpresarial', '#RH', '#Financeiro', '#BeneficiosCorporativos'],
  },
  // ───────────────────────────── 27
  {
    n: '27', slug: 'rc-profissional-clinicas', data: 'Ter 27/10', titulo: 'Responsabilidade civil profissional para clínicas',
    pilar: 'seguros', formato: 'Carrossel', funil: 'Meio',
    slides: [
      { t: 'cover', kicker: 'Para clínicas e profissionais de saúde', title: 'Um paciente insatisfeito pode virar um processo. <em>Sua clínica está preparada?</em>' },
      { t: 'text', kicker: 'O que é', title: 'Responsabilidade civil profissional.', body: 'Pode cobrir custos de defesa e indenizações por danos causados a terceiros no exercício da profissão, conforme a apólice.' },
      { t: 'cards', title: 'Clínica ou profissional?', cards: [['RC da clínica', 'Protege o estabelecimento.'], ['RC do profissional', 'Protege a atuação individual.']], note: 'São coberturas diferentes. Vale conferir quem está coberto em cada uma.' },
      { t: 'list', title: 'Pontos de atenção', marker: 'doc', items: ['Data de retroatividade', 'Limite máximo de indenização', 'Franquia', 'Período complementar'] },
      { t: 'text', kicker: 'Corpo clínico', title: 'Quem está coberto?', body: 'Sócios, contratados e prestadores podem ter situações diferentes na apólice.' },
      { t: 'list', title: 'Também vale para', cols: true, marker: 'people', items: ['Engenheiros', 'Arquitetos', 'Contadores', 'Advogados'] },
      cta('Revise a proteção <em>da sua clínica.</em>'),
    ],
    legenda: `Na área da saúde, um paciente insatisfeito pode virar um processo — mesmo quando o atendimento foi correto.

O seguro de responsabilidade civil profissional pode cobrir custos de defesa e indenizações, conforme a apólice. E atenção: RC da clínica e RC do profissional são coberturas diferentes.

Na hora de contratar, olhe retroatividade, limite, franquia e período complementar.

Fale com a ERBE e revise a proteção da sua clínica. Link na bio.`,
    hashtags: [...H.marca, '#RCProfissional', '#Clinicas', '#Medicos', '#Dentistas', '#SeguroEmpresarial'],
  },
  // ───────────────────────────── 28
  {
    n: '28', slug: 'apolice-de-carga', data: 'Qua 28/10', titulo: 'Sua apólice de carga acompanhou a operação?',
    pilar: 'seguros', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: 'Para transportadoras', title: 'Sua transportadora cresceu. <em>Sua apólice acompanhou?</em>' },
      { t: 'list', title: 'A operação mudou', marker: 'truck', items: ['Novas rotas', 'Novos clientes', 'Novos tipos de carga'], note: 'E a apólice continua a mesma?' },
      { t: 'text', kicker: 'Obrigação legal', title: 'O transporte de cargas tem seguros obrigatórios.', body: 'E as regras foram atualizadas nos últimos anos. Vale conferir se a sua apólice está em dia com elas.' },
      { t: 'list', title: 'Onde mais surgem problemas', marker: 'doc', items: ['Averbação de todos os embarques', 'Limite por embarque', 'Exigências do gerenciamento de risco', 'Mercadorias excluídas'] },
      { t: 'list', title: 'Além da carga', items: ['Frota', 'Responsabilidade civil', 'Seguro de vida dos motoristas'] },
      { t: 'statement', title: 'Revisar não é burocracia. <em>É evitar surpresa quando mais se precisa.</em>' },
      ctaBox('Vamos olhar <em>a sua apólice?</em>', 'Envie a apólice e o perfil das rotas. A gente faz a revisão.'),
    ],
    legenda: `Novas rotas. Novos clientes. Novos tipos de carga. Sua apólice acompanhou?

O transporte rodoviário de cargas tem seguros obrigatórios, e as regras foram atualizadas nos últimos anos. Além disso, averbação, limite por embarque, gerenciamento de risco e mercadorias excluídas são pontos que costumam gerar problema.

E não esqueça: frota, responsabilidade civil e seguro de vida dos motoristas.

📲 Mande sua apólice atual e o perfil das rotas para a ERBE (link na bio). A gente faz a revisão.`,
    hashtags: [...H.marca, '#SeguroDeCarga', '#Transportadora', '#Logistica', '#TransporteRodoviario'],
  },
  // ───────────────────────────── 29
  {
    n: '29', slug: 'stories-simulacao-consorcio', data: 'Qui 29/10', titulo: 'Simule seu próximo passo',
    pilar: 'consorcio', formato: 'Story', funil: 'Fundo',
    slides: [
      { t: 'story', theme: 'dark', kicker: 'Consórcio', title: 'Qual é o seu <em>próximo passo?</em>', icons: ['house', 'car', 'building'], sticker: 340 },
      { t: 'story', theme: 'light', kicker: 'Conta pra gente', title: 'Qual valor você quer <em>conquistar?</em>', sticker: 420 },
      { t: 'story', theme: 'light', kicker: 'Simulação', title: 'Para simular, precisamos de 3 respostas:', size: 80, items: ['Valor do crédito', 'Parcela confortável', 'Prazo ideal'], marker: 'num' },
      { t: 'story', theme: 'green', kicker: 'Sem compromisso', title: 'Responda e receba uma <em>simulação personalizada.</em>', body: 'Sem juros. Com taxa de administração e planejamento.' },
      { t: 'story', theme: 'dark', kicker: 'Fale com a ERBE', title: 'Seu próximo passo <em>começa aqui.</em>', sticker: 300 },
    ],
    stickers: [
      'Story 01: sticker de ENQUETE no espaço inferior — "Imóvel" / "Veículo" / "Empresa" (a enquete aceita até 4 opções).',
      'Story 02: sticker de CAIXA DE PERGUNTAS no espaço inferior — "Ex.: R$ 300 mil para um imóvel".',
      'Story 03: sem sticker.',
      'Story 04: sem sticker (ou sticker de contagem regressiva, se houver campanha com prazo real).',
      'Story 05: sticker de LINK no espaço inferior — "Quero simular" → WhatsApp da ERBE com a mensagem pronta de consórcio.',
    ],
    hashtags: [],
  },
  // ───────────────────────────── 30
  {
    n: '30', slug: 'checklist-cotacao-empresarial', data: 'Sex 30/10', titulo: 'Checklist da cotação empresarial',
    pilar: 'saude', formato: 'Carrossel', funil: 'Fundo',
    slides: [
      { t: 'cover', kicker: 'Checklist', title: 'Quer cotar plano empresarial sem vai e volta? <em>Tenha isto em mãos.</em>' },
      { t: 'text', kicker: 'Item 1 de 6', title: 'CNPJ e tempo de abertura.', body: 'Algumas operadoras exigem tempo mínimo de CNPJ ativo.' },
      { t: 'text', kicker: 'Item 2 de 6', title: 'Número de vidas e datas de nascimento.', body: 'Titulares e dependentes. A idade de cada pessoa influencia o valor.' },
      { t: 'text', kicker: 'Item 3 de 6', title: 'Cidade ou região de atendimento.', body: 'Onde a equipe mora e onde vai usar o plano.' },
      { t: 'text', kicker: 'Item 4 de 6', title: 'Hospitais e laboratórios essenciais.', body: 'Os que não podem faltar na rede.' },
      { t: 'text', kicker: 'Item 5 de 6', title: 'Plano atual, se houver.', body: 'A última fatura e a carta de reajuste ajudam a comparar.' },
      { t: 'text', kicker: 'Item 6 de 6', title: 'Suas preferências.', body: 'Acomodação, coparticipação e abrangência.' },
      ctaBox('Com isso, a ERBE monta um <em>comparativo claro.</em>', 'Responda com COTAÇÃO e receba um estudo.', 'Não uma lista de preços.'),
    ],
    legenda: `Cotação de plano de saúde empresarial costuma virar um vai e volta de mensagens. Dá para evitar.

Separe:
1. CNPJ e tempo de abertura
2. Número de vidas e datas de nascimento
3. Cidade ou região de atendimento
4. Hospitais e laboratórios essenciais
5. Plano atual (fatura e carta de reajuste), se houver
6. Preferências: acomodação, coparticipação, abrangência

Com isso, a ERBE monta um comparativo claro — não só uma lista de preços.

💬 Responda com COTAÇÃO (nos comentários ou no WhatsApp do link na bio) e receba um estudo. E salve este post para usar depois.`,
    hashtags: [...H.marca, '#PlanoDeSaudeEmpresarial', '#CotacaoPlanoDeSaude', '#PlanoPME', '#RH', '#Empresarios'],
  },
];

export const posts = lista.map((p) => ({ ...p, pilarNome: NOMES[p.pilar] }));
