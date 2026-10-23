/* atres.js — ATREs monitoradas e a regra de conferência das TAREFAS (operações do opcart).

   Para cada ATRE:
     cts        = CTs que PODEM/DEVEM ter a ATRE (testados no nome do CT, em maiúsculas e sem espaços)
     chaves     = palavras que indicam o serviço no texto da tarefa (sem acento, MAIÚSCULAS)
     todasDoCT  = true  -> TODA tarefa desses CTs deve ter a ATRE (CT dedicado ao serviço)
                  false -> só as tarefas desses CTs cujo texto indica o serviço devem ter a ATRE

   Regras aplicadas a cada tarefa:
     ATRE incorreta = o texto cita o código da ATRE, mas o CT da tarefa não é um dos permitidos
     Faltando ATRE  = o CT é permitido e a tarefa deveria ter a ATRE (pela regra acima), mas não cita o código
     A conferir     = cita a ATRE e o CT está certo, mas o texto não confirma o serviço
     Adequada       = cita a ATRE, CT certo e texto confere

   Para monitorar outra ATRE, copie um bloco abaixo e preencha cod, cts e chaves. */

const ATRES = [
  { cod: 'CA01', titulo: 'Remover/instalar caps, mangueiras e dispositivos', inicio: '17/02/2026', validade: '17/02/2027',
    cts: [/^CALD/], ctsRotulo: 'CALD (CALDTU, CALDDSC, CALDVAZA...)', todasDoCT: false,
    libera: 'Remoção e instalação de caps, mangueiras, dispositivos e flanges terminais com função de cap em linhas de drenos; abrir e repassar roscas; ferramentas manuais.',
    proibe: ['Serviços com liberação do equipamento e aplicação de LIBRA', 'Serviços com necessidade de RAS', 'Trabalhos de corte/solda'],
    chaves: [/\bCAPS?\b/, /\bMANGUEIRAS?\b/, /\bFLANGE (CEGO|TERMINAL)/, /\bREPASSAR ROSCA/] },

  { cod: 'CO01', titulo: 'Montagem, desmontagem e readequação de andaime', inicio: '17/02/2026', validade: '17/02/2027',
    cts: [/^MAND/], ctsRotulo: 'MAND (MANDTU, MANDDSC, MANDVAZA...)', todasDoCT: false,
    libera: 'Montagem, desmontagem e readequação de andaimes simplesmente apoiados (fixo e móveis); ferramentas manuais, furadeira à bateria e apoio de movimentação de cargas.',
    proibe: ['Serviços com LIBRA', 'Serviços com RAS', 'Andaimes especiais que exigem projeto (fachadeiro, em balanço, suspenso e especial)', 'Sobre bombas em operação, blow down de tocha, interior de bacias ou próximo a descarga de PSV'],
    chaves: [/\bANDAIM/] },

  { cod: 'CO02', titulo: 'Instalação e/ou remoção de isolamento térmico', inicio: '17/02/2026', validade: '17/02/2027',
    cts: [/^ISOL/], ctsRotulo: 'ISOLADOR', todasDoCT: true,
    libera: 'Remoção e instalação de isolamento térmico com ferramentas manuais e furadeira à bateria.',
    proibe: ['Serviços com LIBRA', 'Serviços com RAS', 'Serviços com alpinismo'],
    chaves: [/\bISOLAMENTO/, /\bISOL\b/, /\bISOLANTE/] },

  { cod: 'CO03', titulo: 'Limpeza de área', inicio: '17/02/2026', validade: '17/02/2027',
    cts: [/^AUSE/], ctsRotulo: 'AUSE (AUSETU, AUSEDSC...)', todasDoCT: false,
    libera: 'Limpeza de área em geral: pisos, plataformas, grades, organização, coleta de líquidos ou sólidos e limpeza das ruas no entorno das unidades; mangueira de água, desengraxante, água de hidrante e apoio de movimentação de cargas.',
    proibe: ['Serviços com LIBRA', 'Serviços com RAS', 'Utilização de ar comprimido'],
    chaves: [/\bLIMPEZA\b/, /\bLIMPAR\b/] },

  { cod: 'CO04', titulo: 'Pintura', inicio: '17/02/2026', validade: '17/02/2027',
    cts: [/^(PINTJCHT|PINTJATQ|PINTJATO|PINTLETRI)$/], ctsRotulo: 'PINTJCHT, PINTJATQ, PINTJATO e PINTLETRI', todasDoCT: true,
    libera: 'Pintura de TAGs, equipamentos, demarcações, pisos, estruturas em geral, guarda-corpo e tubulações; preparação manual ou jateamento úmido a frio; plataforma elevatória móvel.',
    proibe: ['Serviços com LIBRA', 'Serviços com RAS', 'Alpinismo, ferramentas mecânicas abrasivas, jateamento abrasivo seco, bomba airless e hidrojateamento de alta pressão', 'Atividades em espaço confinado'],
    chaves: [/\bPINTURA/, /\bPINTAR/, /\bPINT\b/, /\bJATEAMENTO (UMIDO|A FRIO)/] }
];

/* ---- regras de conferência (não precisa mexer) ---- */
const Atre = (() => {
  const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const porCod = {};
  ATRES.forEach((a) => { porCod[a.cod] = a; });
  const reCod = new RegExp('(^|[^A-Z0-9])(' + ATRES.map((a) => a.cod).join('|') + ')(?![A-Z0-9])', 'g');

  function data(s) { const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; }

  /* vigente, vencida ou futura */
  function vigencia(a) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const i = data(a.inicio), v = data(a.validade);
    if (v && hoje > v) return { estado: 'vencida', rotulo: 'vencida' };
    if (i && hoje < i) return { estado: 'futura', rotulo: 'ainda não vigente' };
    return { estado: 'vigente', rotulo: 'vigente' };
  }

  /* Analisa UMA tarefa (texto + CT). Devolve:
     declaradas = códigos citados no texto | erradas = declaradas que o CT não pode ter
     esperadas  = [{cod, motivo}] ATREs que a tarefa deveria ter e não cita (motivo: 'ct' ou 'texto')
     sit        = ok | incorreta | falta | conferir | nenhuma (sem relação com as ATREs monitoradas) */
  function analisar(texto, ct) {
    const t = norm(texto);
    const c = norm(ct).replace(/\s+/g, '');
    const permitida = (a) => a.cts.some((re) => re.test(c));
    const bate = (a) => a.chaves.some((re) => re.test(t));
    const declaradas = [];
    for (const m of t.matchAll(reCod)) if (!declaradas.includes(m[2])) declaradas.push(m[2]);
    const erradas = declaradas.filter((d) => !permitida(porCod[d]));
    const esperadas = ATRES
      .filter((a) => !declaradas.includes(a.cod) && permitida(a) && (a.todasDoCT || bate(a)))
      .map((a) => ({ cod: a.cod, motivo: a.todasDoCT ? 'ct' : 'texto' }));
    let sit = 'nenhuma';
    if (erradas.length) sit = 'incorreta';
    else if (declaradas.length) sit = declaradas.some((d) => porCod[d].todasDoCT || bate(porCod[d])) ? 'ok' : 'conferir';
    else if (esperadas.length) sit = 'falta';
    const primaria = erradas[0] || declaradas[0] || (esperadas[0] && esperadas[0].cod) || '';
    return { declaradas, erradas, esperadas, primaria, sit };
  }

  return { lista: ATRES, porCod, analisar, vigencia };
})();
