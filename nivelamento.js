(() => {
  'use strict';

  /* ---------- Colunas (índice começa em 0: A=0, B=1, ...) ---------- */
  const COL = {
    diario:  { conf: 0, ordem: 1, ct: 2, area: 3, op: 4, sub: 5, texto: 6 },
    ordens:  { area: 0, grupo: 1, nota: 2, ordem: 3, titulo: 4, ct: 5, stUsuario: 6, stSistema: 7, prioridade: 10 },
    tarefas: { local: 0, ordem: 1, op: 2, sub: 3, ct: 4, texto: 5, exec: 6, duracao: 7, planejado: 8,
               stUsuario: 9, real: 10, stSistema: 11, conf: 12, restricao: 13, restData: 14, ini: 15, fim: 16 },
    atual:   { conf: 0, ordem: 1, op: 2, sub: 3, ct: 4, texto: 5, real: 6, trabalho: 7, exec: 8, duracao: 9,
               ini: 10, horaIni: 11, fim: 12, horaFim: 13, stUsuario: 14, stSistema: 15, chave: 17,
               ctPrinc: 18, area: 19 }
  };

  const state = {
    dados: { diario: null, ordens: null, tarefas: null, atual: null },
    modelo: null, abertas: new Set(), tagsAbertas: new Set(), ctAbertos: new Set(), cap: null
  };
  state.selecionadas = new Map(); /* chave normalizada da ordem -> número da ordem (marcadas para copiar) */
  const $ = (id) => document.getElementById(id);

  /* Regras de planejador (ajuste os nomes aqui, se precisar) */

  /* ---------- Utilitários ---------- */
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());

  function numNorm(v) {
    let s = txt(v);
    if (s === '') return '';
    if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '').replace(/^0+/, '') || '0';
    return s.toUpperCase();
  }

  const chave = (ordem, op, sub) => [numNorm(ordem), numNorm(op), numNorm(sub)].join('|');

  function paraData(v) {
    if (v instanceof Date && !isNaN(v)) {
      const d = new Date(v.getTime() + 90000);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = txt(v);
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  const doisDig = (n) => String(n).padStart(2, '0');
  const fmtData = (d) => (d ? `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}/${d.getFullYear()}` : '');
  const segundaDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

  function fmtNum(v) {
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return txt(v);
  }

  function fmtDataCel(v) {
    const d = paraData(v);
    return d ? fmtData(d) : txt(v);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const temCONF = (v) => /\bCONF\b/i.test(txt(v));

  /* Converte número digitado/lido da planilha (aceita "8,5" e "1.234,5") */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = txt(v).replace(/\s/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /* ---------- Estilos extras (seções novas) ---------- */
  const estilo = document.createElement('style');
  estilo.textContent = `
.badge{font-size:.8rem;padding:2px 8px;border-radius:99px;background:rgba(128,128,128,.2);margin-left:8px;font-weight:400}
.oc-in{width:90px;padding:4px 6px}
#nivct-conteudo table{width:100%;border-collapse:collapse}
#nivct-conteudo th,#nivct-conteudo td{padding:6px 8px;text-align:left;border-bottom:1px solid rgba(128,128,128,.25)}
#ocupacao-conteudo table{width:100%;border-collapse:collapse}
#ocupacao-conteudo th,#ocupacao-conteudo td{padding:6px 8px;text-align:left;border-bottom:1px solid rgba(128,128,128,.25)}
#ocupacao-conteudo tr.oc-total td{font-weight:700}
.oc-cel{display:flex;align-items:center;gap:8px;min-width:220px}
.oc-barra{flex:1;height:14px;border-radius:8px;background:rgba(128,128,128,.25);overflow:hidden}
.oc-fill{height:100%;width:0;background:#2e9d5b;transition:width .25s}
.oc-fill.estouro{background:#d64545}
.oc-pct{font-weight:600;min-width:56px}
.oc-saldo.ok{color:#2e9d5b}
.oc-saldo.over{color:#d64545;font-weight:600}`;
  document.head.appendChild(estilo);

  /* ---------- Leitura dos arquivos ---------- */
  function mostrarAviso(msg) {
    const el = $('aviso');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function lerPlanilha(arquivo) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') return reject(new Error('Biblioteca XLSX não carregou'));
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não consegui abrir ' + arquivo.name));
      leitor.onload = () => {
        try {
          const wb = XLSX.read(leitor.result, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          let linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
          linhas = linhas.filter((r) => r.some((c) => txt(c) !== ''));
          /* descarta cabeçalho: primeira linha sem nenhum valor numérico */
          if (linhas.length && !linhas[0].some((c) => typeof c === 'number' || /^\d+$/.test(txt(c)))) linhas.shift();
          resolve(linhas);
        } catch (e) { reject(e); }
      };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  async function aoEscolherPasta(ev) {
    const input = ev.target;
    /* ignora subpastas */
    const arquivos = Array.from(input.files || [])
      .filter((f) => (f.webkitRelativePath || f.name).split('/').length <= 2);
    input.value = ''; /* permite reselecionar a mesma pasta depois de atualizar as planilhas */

    const card = $('card-pasta');
    const estado = card.querySelector('[data-estado]');
    if (!arquivos.length) return;

    const nomes = {
      diario: ['diario.xlsx', 'diario.xls', 'diario.xlsm', 'diario.csv'],
      tarefas: ['tarefas.xlsx', 'tarefas.xls', 'tarefas.xlsm', 'tarefas.csv'],
      ordens: ['ordens.xlsx', 'ordens.xls', 'ordens.xlsm', 'ordens.csv'],
      atual: ['atual.xlsx', 'atual.xls', 'atual.xlsm', 'atual.csv']
    };

    const encontrados = {};
    arquivos.forEach((arquivo) => {
      const nome = arquivo.name.toLowerCase();
      for (const tipo of Object.keys(nomes)) {
        if (nomes[tipo].includes(nome)) { encontrados[tipo] = arquivo; break; }
      }
    });

    const faltantes = ['diario', 'tarefas'].filter((tipo) => !encontrados[tipo]);
    if (faltantes.length) {
      mostrarAviso('Não encontrei na pasta os arquivos obrigatórios: ' +
        faltantes.map((x) => x + '.xlsx').join(' e ') + '. Confira os nomes dos arquivos.');
      estado.textContent = 'Pasta incompleta';
      card.classList.remove('ok');
      card.classList.add('erro');
      return;
    }

    estado.textContent = 'Carregando planilhas...';
    card.classList.remove('ok', 'erro');

    try {
      const dadosNovos = { diario: null, tarefas: null, ordens: null, atual: null };
      for (const tipo of Object.keys(nomes)) {
        if (encontrados[tipo]) dadosNovos[tipo] = await lerPlanilha(encontrados[tipo]);
      }
      state.dados = dadosNovos;
      if (typeof Pasta !== 'undefined') Pasta.aplicar(dadosNovos, false).catch((e) => mostrarAviso('Dados carregados, mas não enviei para a nuvem: ' + e.message));

      estado.textContent = Object.keys(nomes)
        .map((tipo) => encontrados[tipo] ? `${tipo}: ${dadosNovos[tipo].length} linhas` : `${tipo}: não encontrada`)
        .join(' | ');
      card.classList.add('ok');
      mostrarAviso('');
      processar();
    } catch (e) {
      card.classList.add('erro');
      estado.textContent = 'Erro ao ler as planilhas';
      mostrarAviso('Erro ao carregar a pasta: ' + e.message);
    }
  }

  /* ---------- Regras ---------- */
  function estaConfirmada(t) {
    const modo = $('modo-conf').value;
    if (modo === 'confirmacao') return txt(t.conf) !== '';
    if (modo === 'sistema') return temCONF(t.stSistema);
    return temCONF(t.stSistema) || temCONF(t.stUsuario);
  }

  function processar() {
    const { diario, tarefas, ordens, atual } = state.dados;
    if (!diario || !tarefas) {
      $('resultado').hidden = true;
      $('inicio').hidden = false;
      return;
    }
    $('inicio').hidden = true;

    /* diario: mapa chave -> linhas */
    const mapaDiario = new Map();
    diario.forEach((r) => {
      const k = chave(r[COL.diario.ordem], r[COL.diario.op], r[COL.diario.sub]);
      if (!mapaDiario.has(k)) mapaDiario.set(k, []);
      mapaDiario.get(k).push(r);
    });

    /* atual: mapa chave -> linhas + semana vigente */
    const mapaAtual = new Map();
    const contagemSemana = new Map();
    (atual || []).forEach((r) => {
      const k = chave(r[COL.atual.ordem], r[COL.atual.op], r[COL.atual.sub]);
      if (!mapaAtual.has(k)) mapaAtual.set(k, []);
      mapaAtual.get(k).push(r);
      const d = paraData(r[COL.atual.ini]);
      if (d) {
        const seg = segundaDe(d).getTime();
        contagemSemana.set(seg, (contagemSemana.get(seg) || 0) + 1);
      }
    });

    let semana = null;
    if (contagemSemana.size) {
      const seg = [...contagemSemana.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const ini = new Date(seg);
      semana = { ini, fim: new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6) };
    }

    /* ordens */
    const mapaOrdens = new Map();
    (ordens || []).forEach((r) => {
      mapaOrdens.set(numNorm(r[COL.ordens.ordem]), {
        ordem: txt(r[COL.ordens.ordem]), area: txt(r[COL.ordens.area]), grupo: txt(r[COL.ordens.grupo]), nota: txt(r[COL.ordens.nota]),
        titulo: txt(r[COL.ordens.titulo]), ct: txt(r[COL.ordens.ct]),
        stUsuario: txt(r[COL.ordens.stUsuario]), stSistema: txt(r[COL.ordens.stSistema]),
        prioridade: txt(r[COL.ordens.prioridade])
      });
    });

    /* duplicadas */
    const dupDiarioAtual = [];
    mapaDiario.forEach((linhas, k) => {
      if (mapaAtual.has(k)) {
        const d = linhas[0];
        const a = mapaAtual.get(k)[0];
        dupDiarioAtual.push({
          k,
          ordem: txt(d[COL.diario.ordem]), op: txt(d[COL.diario.op]), sub: txt(d[COL.diario.sub]),
          texto: txt(d[COL.diario.texto]) || txt(a[COL.atual.texto]),
          ctDiario: txt(d[COL.diario.ct]), ctAtual: txt(a[COL.atual.ct]),
          ini: fmtDataCel(a[COL.atual.ini]), fim: fmtDataCel(a[COL.atual.fim])
        });
      }
    });
    const dupDentroDiario = [];
    mapaDiario.forEach((linhas, k) => {
      if (linhas.length > 1) {
        const d = linhas[0];
        dupDentroDiario.push({
          k, vezes: linhas.length,
          ordem: txt(d[COL.diario.ordem]), op: txt(d[COL.diario.op]), sub: txt(d[COL.diario.sub]),
          texto: txt(d[COL.diario.texto]), cts: [...new Set(linhas.map((l) => txt(l[COL.diario.ct])))].join(', ')
        });
      }
    });
    const chavesDup = new Set([...dupDiarioAtual.map((d) => d.k), ...dupDentroDiario.map((d) => d.k)]);

    /* linhas da tabela: tarefas + tarefas do diario que não estão em tarefas */
    const T = COL.tarefas;
    let linhas = [];
    const chavesTarefas = new Set();
    tarefas.forEach((r) => {
      const k = chave(r[T.ordem], r[T.op], r[T.sub]);
      chavesTarefas.add(k);
      linhas.push({
        k, origem: 'tarefas',
        ordem: txt(r[T.ordem]), local: txt(r[T.local]), op: txt(r[T.op]), sub: txt(r[T.sub]), ct: txt(r[T.ct]),
        texto: txt(r[T.texto]), exec: fmtNum(r[T.exec]), duracao: fmtNum(r[T.duracao]),
        planejado: fmtNum(r[T.planejado]), real: fmtNum(r[T.real]),
        execN: num(r[T.exec]), duracaoN: num(r[T.duracao]), planejadoN: num(r[T.planejado]),
        stSistema: txt(r[T.stSistema]), stUsuario: txt(r[T.stUsuario]), conf: txt(r[T.conf]),
        restricao: txt(r[T.restricao]), restData: fmtDataCel(r[T.restData]),
        ini: fmtDataCel(r[T.ini]), fim: fmtDataCel(r[T.fim])
      });
    });
    mapaDiario.forEach((ls, k) => {
      if (chavesTarefas.has(k)) return;
      const d = ls[0];
      linhas.push({
        k, origem: 'diario',
        ordem: txt(d[COL.diario.ordem]), op: txt(d[COL.diario.op]), sub: txt(d[COL.diario.sub]),
        ct: txt(d[COL.diario.ct]), local: '', texto: txt(d[COL.diario.texto]), exec: '', duracao: '', planejado: '',
        real: '', execN: 0, duracaoN: 0, planejadoN: 0,
        stSistema: '', stUsuario: '', conf: txt(d[COL.diario.conf]),
        restricao: '', restData: '', ini: '', fim: ''
      });
    });

    /* tempo da planilha atual (nivelamento): usado quando a tarefa não tem tempo em tarefas.xlsx */
    linhas.forEach((t) => {
      let w = 0;
      let ed = 0;
      (mapaAtual.get(t.k) || []).forEach((r) => {
        w += num(r[COL.atual.trabalho]);
        ed += num(r[COL.atual.exec]) * num(r[COL.atual.duracao]);
      });
      t.hhAtual = w > 0 ? w : ed;
    });

    /* área de cada ordem: ordens.xlsx, depois diario, depois atual */
    const areaAlt = new Map();
    diario.forEach((r) => {
      const g = numNorm(r[COL.diario.ordem]);
      if (!areaAlt.has(g) && txt(r[COL.diario.area])) areaAlt.set(g, txt(r[COL.diario.area]));
    });
    (atual || []).forEach((r) => {
      const g = numNorm(r[COL.atual.ordem]);
      if (!areaAlt.has(g) && txt(r[COL.atual.area])) areaAlt.set(g, txt(r[COL.atual.area]));
    });
    linhas.forEach((t) => {
      const g = numNorm(t.ordem);
      t.area = (mapaOrdens.get(g) || {}).area || areaAlt.get(g) || '';
    });

    /* escopo: só OMs com os meus CTs e áreas 014, 018 e 019 */
    const totalAntes = linhas.length;
    if ($('escopo').checked) linhas = filtrarEscopo(linhas, { ordem: (t) => numNorm(t.ordem), ct: (t) => t.ct, area: (t) => t.area });
    $('escopo-info').textContent = $('escopo').checked ? `${linhas.length} de ${totalAntes} tarefas no escopo` : '';


    state.modelo = { linhas, mapaOrdens, semana, temAtual: !!atual, dupDiarioAtual, dupDentroDiario, chavesDup, mapaDiario };
    classificar();
    montarFiltroCT();
    $('resultado').hidden = false;
    renderSemana();
    renderDuplicadas();
    renderTabela();
    renderTags();
    renderOcupacao();
    renderNivelandoCT();
  }

  /* Verde: está no diario. Cinza: tem CONF. Branca: o resto. */
  function classificar() {
    const m = state.modelo;
    if (!m) return;
    m.linhas.forEach((t) => {
      if (m.mapaDiario.has(t.k)) t.cat = 'verde';
      else if (estaConfirmada(t)) t.cat = 'cinza';
      else t.cat = 'branca';
      t.dup = m.chavesDup.has(t.k);
    });
    m.ordensNivelando = new Set(m.linhas.filter((t) => t.cat === 'verde').map((t) => numNorm(t.ordem)));
  }

  const codigosArea = (s) => (String(s).match(/\d+/g) || []).map((x) => x.replace(/^0+/, '') || '0');

  /* ---------- Renderização ---------- */
  function renderSemana() {
    const m = state.modelo;
    const el = $('semana');
    if (m.semana) {
      el.textContent = `Semana atual: ${fmtData(m.semana.ini)} a ${fmtData(m.semana.fim)}`;
    } else {
      el.textContent = 'Semana atual: carregue a planilha atual';
    }
  }

  function tabelaSimples(cab, linhas) {
    const th = cab.map((c) => `<th>${esc(c)}</th>`).join('');
    const tr = linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="tabela-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  function renderDuplicadas() {
    const m = state.modelo;
    let html = '';

    if (!m.temAtual) {
      html += '<div class="banner info">Carregue a planilha atual para comparar o diario com as tarefas já niveladas na semana.</div>';
    } else if (!m.dupDiarioAtual.length) {
      html += '<div class="banner ok">Nenhuma tarefa do diario está duplicada na semana atual.</div>';
    } else {
      html += `<div class="banner alerta">${m.dupDiarioAtual.length} tarefa(s) do diario já estão niveladas na semana atual.</div>`;
      html += '<div class="dup-bloco"><h3>Em diario e na planilha atual</h3>' +
        tabelaSimples(['Ordem', 'Op.', 'Sub', 'Texto', 'CT diario', 'CT atual', '1ª início (atual)', '1ª fim (atual)'],
          m.dupDiarioAtual.map((d) => [d.ordem, d.op, d.sub, d.texto, d.ctDiario, d.ctAtual, d.ini, d.fim])) + '</div>';
    }

    if (m.dupDentroDiario.length) {
      html += `<div class="banner alerta" style="margin-top:12px">${m.dupDentroDiario.length} tarefa(s) aparecem mais de uma vez no próprio diario.</div>`;
      html += '<div class="dup-bloco">' +
        tabelaSimples(['Ordem', 'Op.', 'Sub', 'Texto', 'CT', 'Vezes'],
          m.dupDentroDiario.map((d) => [d.ordem, d.op, d.sub, d.texto, d.cts, d.vezes])) + '</div>';
    }
    $('duplicadas-conteudo').innerHTML = html;

    const n = m.dupDiarioAtual.length + m.dupDentroDiario.length;
    const badge = !m.temAtual && !n ? 'carregue a atual' : n ? `${n} alerta(s)` : 'sem alertas';
    $('painel-duplicadas').querySelector('summary').innerHTML =
      `<strong>Verificação de duplicadas</strong> <span class="badge">${badge}</span>`;
  }

  function montarFiltroCT() {
    const sel = $('filtro-ct');
    const atual = sel.value;
    const cts = [...new Set(state.modelo.linhas.map((t) => t.ct).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos</option>' + cts.map((c) => `<option>${esc(c)}</option>`).join('');
    if (cts.includes(atual)) sel.value = atual;
  }

  function linhasFiltradas() {
    const busca = $('busca').value.trim().toLowerCase();
    const ct = $('filtro-ct').value;
    const sit = $('filtro-sit').value;
    const soDup = $('so-dup').checked;
    const area = $('filtro-area').value;
    const soNiv = $('so-nivelando').checked;
    const nivelando = state.modelo.ordensNivelando;
    return state.modelo.linhas.filter((t) => {
      if (area && !codigosArea(t.area).includes(area)) return false;
      if (soNiv && !nivelando.has(numNorm(t.ordem))) return false;
      if (ct && t.ct !== ct) return false;
      if (sit && t.cat !== sit) return false;
      if (soDup && !t.dup) return false;
      if (busca && !`${t.ordem} ${t.texto} ${t.ct}`.toLowerCase().includes(busca)) return false;
      return true;
    });
  }

  function renderResumo() {
    const l = state.modelo.linhas;
    const cont = (c) => l.filter((t) => t.cat === c).length;
    const sit = $('filtro-sit').value;
    const itens = [
      { cat: '', cls: '', rot: 'Total', n: l.length },
      { cat: 'verde', cls: 'verde', rot: 'Nivelando', n: cont('verde') },
      { cat: 'cinza', cls: 'cinza', rot: 'Confirmadas', n: cont('cinza') },
      { cat: 'branca', cls: 'branca', rot: 'Pendentes', n: cont('branca') }
    ];
    let html = itens.map((i) =>
      `<button type="button" class="cartao${sit === i.cat ? ' ativo' : ''}" data-cat="${i.cat}">` +
      `${i.cls ? `<span class="amostra ${i.cls}"></span>` : ''}` +
      `<span class="num">${i.n}</span><span class="rot">${i.rot}</span></button>`).join('');
    html += `<button type="button" class="cartao${$('so-dup').checked ? ' ativo' : ''}" data-dup="1">` +
      `<span class="amostra dup"></span><span class="num">${new Set(l.filter((t) => t.dup).map((t) => t.k)).size}</span><span class="rot">Duplicadas</span></button>`;
    html += `<button type="button" class="cartao${$('so-nivelando').checked ? ' ativo' : ''}" data-niv="1">` +
      `<span class="amostra niv"></span><span class="num">${new Set(l.filter((t) => t.cat === 'verde').map((t) => numNorm(t.ordem))).size}</span><span class="rot">Ordens nivelando</span></button>`;
    $('resumo').innerHTML = html;
  }

  function renderTabela() {
    if (!state.modelo) return;
    renderResumo();
    const filtradas = linhasFiltradas();
    const corpo = $('corpo');
    if (!filtradas.length) {
      corpo.innerHTML = '<tr><td colspan="13" class="vazio">Nenhuma tarefa encontrada com esses filtros.</td></tr>';
      return;
    }

    const grupos = new Map();
    filtradas.forEach((t) => {
      const g = numNorm(t.ordem);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(t);
    });

    const rotulo = { verde: 'Nivelando', cinza: 'Confirmada', branca: 'Pendente' };
    let html = '';
    let idx = 0;
    grupos.forEach((ts, g) => {
      const i = idx++;
      const aberta = state.abertas.has(g);
      const o = state.modelo.mapaOrdens.get(g);
      const chips = o
        ? [o.area, o.grupo && `Grupo ${o.grupo}`, o.nota && `Nota ${o.nota}`, o.ct && `CT ${o.ct}`, o.stUsuario, o.stSistema]
            .filter(Boolean).map((c) => `<span class="chip">${esc(c)}</span>`).join('')
        : '<span class="chip chip-aviso">Ordem não encontrada em ordens.xlsx</span>';
      const prio = o && o.prioridade ? `<span class="prio" title="Prioridade">${esc(o.prioridade)}</span>` : '';
      const n = (c) => ts.filter((t) => t.cat === c).length;
      const nDup = ts.filter((t) => t.dup).length;
      const contagem =
        `<span class="mini" title="Nivelando"><span class="amostra verde"></span>${n('verde')}</span>` +
        `<span class="mini" title="Confirmadas"><span class="amostra cinza"></span>${n('cinza')}</span>` +
        `<span class="mini" title="Pendentes"><span class="amostra branca"></span>${n('branca')}</span>` +
        (nDup ? `<span class="mini" title="Duplicadas"><span class="amostra dup"></span>${nDup}</span>` : '') +
        `<span class="total">${ts.length} ${ts.length === 1 ? 'tarefa' : 'tarefas'}</span>`;

      html += `<tr class="grupo" data-i="${i}" data-k="${esc(g)}"><td colspan="13"><div class="grupo-linha">` +
        `<label class="sel-ordem" title="Marcar para copiar"><input type="checkbox" data-sel="${esc(g)}" data-ordem="${esc(ts[0].ordem)}"${state.selecionadas.has(g) ? ' checked' : ''}></label>` +
        `<button type="button" class="abre" aria-expanded="${aberta}" aria-label="Abrir ou fechar a ordem ${esc(ts[0].ordem)}">` +
        `<span class="chevron" aria-hidden="true"></span>${prio}` +
        `<span class="grupo-texto"><span class="grupo-titulo"><strong>Ordem ${esc(ts[0].ordem)}</strong>` +
        `${o && o.titulo ? `<span class="grupo-nome">${esc(o.titulo)}</span>` : ''}</span>` +
        `<span class="chips">${chips}</span></span>` +
        `<span class="grupo-contagem">${contagem}</span></button></div></td></tr>`;

      ts.forEach((t) => {
        const restr = [t.restricao, t.restData].filter(Boolean).join(' ');
        html += `<tr class="${t.cat}${t.dup ? ' dup' : ''}" data-i="${i}"${aberta ? '' : ' hidden'}>` +
          `<td class="nowrap">${esc(t.op)}</td><td class="nowrap">${esc(t.sub)}</td><td class="nowrap">${esc(t.ct)}</td>` +
          `<td class="texto">${esc(t.texto)}</td><td>${esc(t.exec)}</td><td>${esc(t.duracao)}</td>` +
          `<td>${esc(t.planejado)}</td><td>${esc(t.real)}</td><td>${esc(t.stSistema)}</td><td>${esc(restr)}</td>` +
          `<td class="nowrap">${esc(t.ini)}</td><td class="nowrap">${esc(t.fim)}</td>` +
          `<td class="nowrap"><span class="selo ${t.cat}">${rotulo[t.cat]}</span>` +
          `${t.dup ? '<span class="selo dup">Duplicada</span>' : ''}` +
          `${t.origem === 'diario' ? '<span class="selo so">Só no diario</span>' : ''}</td></tr>`;
      });
    });
    corpo.innerHTML = html;
    atualizarSel();
  }

  /* ---------- Nivelando por centro de trabalho ---------- */
  function hhCelula(t) {
    const i = hhInfo(t);
    if (!i.h) return '<em>sem tempo</em>';
    return esc(fmtHH(i.h)) + (i.fonte === 'planilha atual' ? ' <small>(atual)</small>' : '');
  }

  function renderNivelandoCT() {
    const m = state.modelo;
    if (!m) return;
    const porCT = new Map();
    state.modelo.linhas.filter((t) => t.cat === 'verde').forEach((t) => {
      const k = ctKey(t.ct) || '(SEM CT)';
      if (!porCT.has(k)) porCT.set(k, { nome: t.ct || '(sem CT)', tarefas: [], hh: 0 });
      const g = porCT.get(k);
      g.tarefas.push(t);
      g.hh += hhTarefa(t);
    });
    const grupos = [...porCT.entries()].sort((a, b) => b[1].hh - a[1].hh || a[1].nome.localeCompare(b[1].nome));
    const totalT = grupos.reduce((s, [, g]) => s + g.tarefas.length, 0);
    const totalHH = grupos.reduce((s, [, g]) => s + g.hh, 0);
    $('nivct-badge').textContent = totalT ? `${totalT} tarefa(s) · ${fmtHH(totalHH)} · ${grupos.length} CT(s)` : 'nenhuma nivelando';

    if (!grupos.length) {
      $('nivct-conteudo').innerHTML = '<div class="banner info">Nenhuma tarefa nivelando para este filtro.</div>';
      return;
    }
    $('nivct-conteudo').innerHTML = grupos.map(([k, g]) => {
      const linhas = g.tarefas.map((t) =>
        `<tr><td class="nowrap">${esc(t.ordem)}</td>` +
        `<td class="nowrap">${esc(t.op)}${t.sub ? '.' + esc(t.sub) : ''}</td><td class="texto">${esc(t.texto)}</td>` +
        `<td>${esc(t.exec)}</td><td>${esc(t.duracao)}</td><td class="nowrap">${hhCelula(t)}</td></tr>`).join('');
      return `<details class="tag-grupo" data-ct="${esc(k)}"${state.ctAbertos.has(k) ? ' open' : ''}>` +
        `<summary><span class="tag-nome">${esc(g.nome)}</span><span class="tag-qtd">${g.tarefas.length} tarefa(s)</span>` +
        `<span class="selo niv">${esc(fmtHH(g.hh))}</span></summary>` +
        `<div class="tag-corpo"><p><button type="button" class="botao pequeno" data-copiar-ct="${esc(k)}">Copiar OMs deste CT</button></p><div class="tabela-wrap"><table><thead><tr><th>Ordem</th><th>Op.</th>` +
        '<th>Texto da operação</th><th>Executantes</th><th>Duração</th><th>HH</th></tr></thead>' +
        `<tbody>${linhas}</tbody></table></div></div></details>`;
    }).join('');
  }

  /* ---------- Copiar OMs ---------- */
  function avisoRapido(t) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  async function copiarOMs(ts, rotulo) {
    const oms = [...new Set(ts.map((t) => t.ordem).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (!oms.length) { avisoRapido('Nenhuma OM para copiar.'); return; }
    const texto = oms.join('\n');
    try { await navigator.clipboard.writeText(texto); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    avisoRapido(`${oms.length} OM(s) copiada(s) · ${rotulo}`);
  }

  /* ---------- Excel ---------- */
  const arred = (n, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas;

  async function gerarExcel() {
    const m = state.modelo;
    if (!m) return;
    if (typeof XLSX === 'undefined') { mostrarAviso('Biblioteca XLSX não carregou.'); return; }
    mostrarAviso('');

    /* confirmações feitas no Acompanhamento diário (semana da planilha atual) */
    let acomp = {};
    if (m.semana) {
      const s = m.semana.ini;
      acomp = await Sync.lerAcomp(`${s.getFullYear()}-${doisDig(s.getMonth() + 1)}-${doisDig(s.getDate())}`);
    }
    const rotSit = { verde: 'Nivelando', cinza: 'Confirmada', branca: 'Pendente' };
    const cab = ['Situação', 'Área', 'Ordem', 'Título da ordem', 'Local', 'CT', 'Op.', 'Sub', 'Texto da operação', 'Executantes',
      'Duração', 'Planejado', 'Real', 'HH considerado', 'Fonte do HH', 'Status usuário', 'Status sistema', 'Confirmação (sistema)',
      'Restrição', 'Data restrição', 'Início', 'Fim', 'Duplicada', 'Acomp.: confirmado', 'Acomp.: por', 'Acomp.: hora',
      'Acomp.: justificativa', 'Acomp.: motivo'];
    const larg = [11, 8, 10, 30, 12, 11, 6, 5, 45, 10, 8, 9, 8, 12, 18, 14, 14, 14, 16, 12, 11, 11, 9, 12, 12, 8, 30, 22];
    const linha = (t) => {
      const a = acomp[Sync.limpa(t.k)] || {};
      const i = hhInfo(t);
      return [rotSit[t.cat], t.area, t.ordem, (m.mapaOrdens.get(numNorm(t.ordem)) || {}).titulo || '', t.local, t.ct, t.op, t.sub,
        t.texto, t.execN || '', t.duracaoN || '', t.planejadoN || '', t.real, i.h ? arred(i.h, 2) : '', i.fonte, t.stUsuario,
        t.stSistema, t.conf, t.restricao, t.restData, t.ini, t.fim, t.dup ? 'Sim' : 'Não',
        a.conf === true ? 'Sim' : '', a.por || '', a.em || '', a.just || '', a.motivo || ''];
    };
    const aba = (ts) => {
      const ws = XLSX.utils.aoa_to_sheet([cab].concat(ts.map(linha)));
      ws['!cols'] = larg.map((wch) => ({ wch }));
      return ws;
    };
    const ordenar = (ts) => [...ts].sort((a, b) => a.ct.localeCompare(b.ct) || a.ordem.localeCompare(b.ordem, 'pt-BR', { numeric: true }));
    const todas = ordenar(m.linhas);
    if (!todas.length) { mostrarAviso('Não há tarefas para exportar.'); return; }
    const verdes = todas.filter((t) => t.cat === 'verde');
    const confirmadas = todas.filter((t) => t.cat === 'cinza' || (acomp[Sync.limpa(t.k)] || {}).conf === true);

    const porCT = new Map();
    verdes.forEach((t) => {
      const k = ctKey(t.ct);
      if (!porCT.has(k)) porCT.set(k, { nome: t.ct, n: 0, hh: 0 });
      const g = porCT.get(k);
      g.n++;
      g.hh += hhTarefa(t);
    });
    const aba2 = [['CT', 'Tarefas nivelando', 'HH nivelando']].concat(
      [...porCT.values()].sort((a, b) => b.hh - a.hh).map((g) => [g.nome, g.n, arred(g.hh, 2)]));

    const { usado, nomes } = m.ocup;
    const padrao = parseFloat(state.cap.horasPadrao) || 0;
    const extras = state.cap.extras.filter((k) => !CTS_FIXOS.includes(k));
    const aba3 = [['CT', 'Executantes', 'Horas por executante', 'Disponível (HH)', 'Usado nivelando (HH)',
      'Ocupação (%)', 'Saldo (HH): + livre / − excesso']];
    CTS_FIXOS.concat(extras).forEach((k) => {
      const c = state.cap.cts[k] || {};
      const ex = parseFloat(c.exec) || 0;
      const h = parseFloat(c.horas) || padrao;
      const disp = ex * h;
      const us = usado.get(k) || 0;
      aba3.push([nomes.get(k) || k, ex || '', h || '', disp || '', arred(us),
        disp > 0 ? arred((us / disp) * 100) : '', disp > 0 ? arred(disp - us) : '']);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, aba(todas), 'Todas as tarefas');
    XLSX.utils.book_append_sheet(wb, aba(verdes), 'Nivelando');
    XLSX.utils.book_append_sheet(wb, aba(confirmadas), 'Confirmadas');
    const ws2 = XLSX.utils.aoa_to_sheet(aba2);
    ws2['!cols'] = [16, 18, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Por CT');
    const ws3 = XLSX.utils.aoa_to_sheet(aba3);
    ws3['!cols'] = [16, 12, 20, 16, 20, 14, 30].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Ocupação (todos)');

    const h = new Date();
    XLSX.writeFile(wb, `nivelamento_${h.getFullYear()}-${doisDig(h.getMonth() + 1)}-${doisDig(h.getDate())}.xlsx`);
  }

  /* ---------- Ocupação semanal ---------- */
  const CHAVE_CAP = 'nivelamento.capacidade.v1';
  const CTS_FIXOS = ['AUSETU', 'CALDTU', 'CALDVAZA', 'CALDDSC', 'MANDTU', 'MANDVAZA', 'MANDDSC', 'SOLDADOR', 'SOLDVAZA'];
  const ctKey = (s) => txt(s).toUpperCase().replace(/\s+/g, '');
  const capVazia = () => ({ horasPadrao: '', cts: {}, extras: [] });
  function carregarCap() {
    try {
      const c = Object.assign(capVazia(), JSON.parse(localStorage.getItem(CHAVE_CAP)) || {});
      if (!Array.isArray(c.extras)) c.extras = [];
      return c;
    } catch (e) { return capVazia(); }
  }
  function salvarCap() {
    try { localStorage.setItem(CHAVE_CAP, JSON.stringify(state.cap)); } catch (e) { /* vale só nesta sessão */ }
  }
  state.cap = carregarCap();

  /* HH da tarefa: 1) planejado; 2) executantes x duração; 3) tempo da planilha atual (nivelamento). */
  function hhInfo(t) {
    if ((t.planejadoN || 0) > 0) return { h: t.planejadoN, fonte: 'planejado' };
    const ed = (t.execN || 0) * (t.duracaoN || 0);
    if (ed > 0) return { h: ed, fonte: 'executantes x duração' };
    if ((t.hhAtual || 0) > 0) return { h: t.hhAtual, fonte: 'planilha atual' };
    return { h: 0, fonte: '' };
  }
  const hhTarefa = (t) => hhInfo(t).h;
  const fmtHH = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' HH';
  const fmtPct = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

  const celulasOc = '<td class="oc-disp"></td><td class="oc-usado"></td>' +
    '<td><div class="oc-cel"><div class="oc-barra"><div class="oc-fill"></div></div><span class="oc-pct"></span></div></td>' +
    '<td class="oc-saldo"></td>';

  function renderOcupacao() {
    const m = state.modelo;
    if (!m) return;
    /* usado = só tarefas "Nivelando" (verdes), por CT */
    const usado = new Map();
    const semHH = new Map();
    const nomes = new Map();
    m.linhas.forEach((t) => {
      if (!t.ct) return;
      const k = ctKey(t.ct);
      if (!nomes.has(k)) nomes.set(k, t.ct);
      if (t.cat !== 'verde') return;
      const h = hhTarefa(t);
      usado.set(k, (usado.get(k) || 0) + h);
      if (!h) semHH.set(k, (semHH.get(k) || 0) + 1);
    });
    m.ocup = { usado, semHH, nomes };

    const extras = state.cap.extras.filter((k) => !CTS_FIXOS.includes(k));
    const visiveis = CTS_FIXOS.map((k) => ({ k, nome: k, extra: false }))
      .concat(extras.map((k) => ({ k, nome: nomes.get(k) || k, extra: true })));
    const val = (v) => esc(v === undefined ? '' : v);

    const linhas = visiveis.map(({ k, nome, extra }) => {
      const c = state.cap.cts[k] || {};
      return `<tr data-ct="${esc(k)}"><td class="nowrap"><strong>${esc(nome)}</strong>` +
        `${extra ? ` <button type="button" class="botao pequeno" data-remover="${esc(k)}" title="Tirar da lista">✕</button>` : ''}</td>` +
        `<td><input type="number" min="0" step="1" class="oc-in" data-campo="exec" value="${val(c.exec)}"></td>` +
        `<td><input type="number" min="0" step="0.5" class="oc-in" data-campo="horas" value="${val(c.horas)}"></td>` +
        celulasOc + '</tr>';
    }).join('');

    const jaVisiveis = new Set(visiveis.map((v) => v.k));
    const outros = [...nomes.entries()].filter(([k]) => !jaVisiveis.has(k)).sort((a, b) => a[1].localeCompare(b[1]));
    const opcoes = '<option value="">Adicionar outro CT…</option>' +
      outros.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');

    $('ocupacao-conteudo').innerHTML =
      `<p>Horas da semana por executante (padrão): <input type="number" min="0" step="0.5" class="oc-in" id="oc-padrao" value="${val(state.cap.horasPadrao)}"> ` +
      '<small>Disponível = executantes × horas. Usado = soma de HH apenas das tarefas "Nivelando" do CT . Tarefa sem tempo em tarefas.xlsx usa o tempo da planilha atual.</small></p>' +
      `<p><select id="oc-add"${outros.length ? '' : ' disabled'}>${opcoes}</select></p>` +
      '<div class="tabela-wrap"><table><thead><tr><th>CT</th><th>Executantes</th><th>Horas/executante</th><th>Disponível</th>' +
      '<th>Usado (nivelando)</th><th>Ocupação</th><th>Saldo</th></tr></thead><tbody>' + linhas +
      `<tr class="oc-total" data-total="1"><td>Total (CTs preenchidos)</td><td></td><td></td>${celulasOc}</tr></tbody></table></div>`;
    pintarOcupacao();
  }

  function pintarOcupacao() {
    const raiz = $('ocupacao-conteudo');
    if (!raiz || !state.modelo || !state.modelo.ocup) return;
    const { usado, semHH } = state.modelo.ocup;
    const padrao = parseFloat(state.cap.horasPadrao) || 0;
    let somaDisp = 0;
    let somaUsado = 0;

    const preencher = (tr, disp, us, semHoras) => {
      const set = (sel, v) => { tr.querySelector(sel).textContent = v; };
      const saldo = tr.querySelector('.oc-saldo');
      const fill = tr.querySelector('.oc-fill');
      set('.oc-disp', disp > 0 ? fmtHH(disp) : '—');
      set('.oc-usado', fmtHH(us) + (semHoras ? ` (${semHoras} tarefa(s) sem tempo)` : ''));
      if (disp <= 0) {
        fill.style.width = '0';
        fill.classList.remove('estouro');
        set('.oc-pct', '—');
        saldo.className = 'oc-saldo';
        saldo.textContent = us > 0 ? 'Informe executantes e horas' : '';
        return;
      }
      const pct = (us / disp) * 100;
      const dif = disp - us;
      fill.style.width = Math.min(pct, 100) + '%';
      fill.classList.toggle('estouro', pct > 100);
      set('.oc-pct', fmtPct(pct));
      saldo.className = 'oc-saldo ' + (dif >= 0 ? 'ok' : 'over');
      saldo.textContent = dif >= 0 ? `Faltam ${fmtHH(dif)} (livre)` : `Passou ${fmtHH(-dif)} (excesso)`;
    };

    raiz.querySelectorAll('tr[data-ct]').forEach((tr) => {
      const k = tr.dataset.ct;
      const c = state.cap.cts[k] || {};
      tr.querySelector('[data-campo="horas"]').placeholder = state.cap.horasPadrao || '';
      const disp = (parseFloat(c.exec) || 0) * (parseFloat(c.horas) || padrao);
      const us = usado.get(k) || 0;
      if (disp > 0) { somaDisp += disp; somaUsado += us; }
      preencher(tr, disp, us, semHH.get(k) || 0);
    });
    preencher(raiz.querySelector('tr[data-total]'), somaDisp, somaUsado, 0);

    $('ocupacao-badge').textContent = somaDisp > 0
      ? `${fmtPct((somaUsado / somaDisp) * 100)} do total`
      : 'informe executantes e horas';
  }

  /* ---------- TAGs repetidas entre ordens ---------- */
  const REGEX_TAG = /\b[A-Z]{1,5}-\d{2,6}[A-Z]{0,2}\b/g;
  const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const extrairTags = (s) => new Set(semAcento(s).match(REGEX_TAG) || []);
  const limparTexto = (s) => semAcento(s).replace(REGEX_TAG, ' ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  function jaccard(a, b) {
    if (!a.size || !b.size) return null;
    let inter = 0;
    a.forEach((x) => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  function montarOrdensTag(fonte, area) {
    const m = state.modelo;
    const mapa = new Map();
    const pega = (g, ordem) => {
      if (!mapa.has(g)) mapa.set(g, { g, ordem, titulo: '', area: '', prioridade: '', tarefas: [], tags: new Set() });
      return mapa.get(g);
    };
    m.mapaOrdens.forEach((o, g) => {
      const x = pega(g, o.ordem || g);
      x.titulo = o.titulo;
      x.area = o.area;
      x.prioridade = o.prioridade;
      if (fonte === 'titulo') extrairTags(o.titulo).forEach((t) => x.tags.add(t));
    });
    m.linhas.forEach((t) => {
      const x = pega(numNorm(t.ordem), t.ordem);
      x.tarefas.push(t);
      if (!x.area) x.area = t.area;
      if (fonte === 'local') extrairTags(t.local).forEach((g) => x.tags.add(g));
      if (fonte === 'texto') extrairTags(t.texto).forEach((g) => x.tags.add(g));
    });
    const lista = [...mapa.values()].filter((x) => !area || codigosArea(x.area).includes(area));
    lista.forEach((x) => {
      x.textos = new Set(x.tarefas.map((t) => limparTexto(t.texto)).filter(Boolean));
      x.palavras = new Set(limparTexto(x.titulo).split(' ').filter((w) => w.length >= 3));
      x.nivelando = x.tarefas.some((t) => t.cat === 'verde');
    });
    return lista;
  }

  function comparar(a, b) {
    const tar = jaccard(a.textos, b.textos);
    const tit = jaccard(a.palavras, b.palavras);
    return { tar, tit, base: tar !== null ? tar : tit };
  }

  function veredito(base) {
    if (base === null) return { cls: 'sem', rot: 'Sem dados para comparar' };
    if (base >= 0.7) return { cls: 'sim', rot: 'Provável mesmo serviço' };
    if (base >= 0.3) return { cls: 'parcial', rot: 'Parcialmente igual' };
    return { cls: 'dif', rot: 'Serviços diferentes' };
  }

  const pct = (v) => (v === null ? 'sem dados' : Math.round(v * 100) + '%');

  function renderTags() {
    if (!state.modelo) return;
    const fonte = $('fonte-tag').value;
    /* só ordens que estão nivelando entram na comparação de TAGs */
    const ordens = montarOrdensTag(fonte, $('filtro-area').value).filter((o) => o.nivelando);

    const porTag = new Map();
    ordens.forEach((o) => o.tags.forEach((tag) => {
      if (!porTag.has(tag)) porTag.set(tag, []);
      porTag.get(tag).push(o);
    }));

    const grupos = [];
    porTag.forEach((os, tag) => {
      if (os.length < 2) return;
      let melhor = null;
      for (let i = 0; i < os.length; i++) {
        for (let j = i + 1; j < os.length; j++) {
          const c = comparar(os[i], os[j]);
          if (!melhor || (c.base === null ? -1 : c.base) > (melhor.base === null ? -1 : melhor.base)) {
            melhor = { ...c, a: os[i], b: os[j] };
          }
        }
      }
      grupos.push({ tag, os, melhor, nivelando: os.filter((o) => o.nivelando).length });
    });
    grupos.sort((x, y) => (y.nivelando > 0) - (x.nivelando > 0) || y.os.length - x.os.length || x.tag.localeCompare(y.tag));

    const lista = grupos;

    $('tags-badge').textContent = grupos.length ? `${grupos.length} TAG(s) repetida(s)` : 'nenhuma';

    let resumo;
    if (fonte === 'titulo' && !state.dados.ordens) {
      resumo = '<div class="banner info">Carregue o ordens.xlsx para ler a TAG do título das ordens, ou escolha outro lugar para procurar.</div>';
    } else if (!grupos.length) {
      resumo = '<div class="banner ok">Nenhuma TAG aparece em mais de uma ordem nivelando.</div>';
    } else {
      resumo = `<div class="banner alerta">${grupos.length} TAG(s) repetida(s) entre as ordens nivelando.</div>`;
    }
    $('tags-resumo').innerHTML = resumo;

    const nomeOrdem = (o) => `Ordem ${esc(o.ordem)}`;
    $('tags-lista').innerHTML = lista.map(({ tag, os, melhor, nivelando }) => {
      const v = veredito(melhor.base);
      const repetidos = new Map();
      os.forEach((o) => o.textos.forEach((t) => repetidos.set(t, (repetidos.get(t) || 0) + 1)));
      const cartoes = os.map((o) => {
        const n = (c) => o.tarefas.filter((t) => t.cat === c).length;
        const itens = o.tarefas.length
          ? o.tarefas.map((t) => {
              const rep = repetidos.get(limparTexto(t.texto)) > 1 && limparTexto(t.texto);
              return `<li class="${t.cat}"><span class="op">${esc(t.op)}${t.sub ? '.' + esc(t.sub) : ''}</span>` +
                `<span class="tx">${esc(t.texto)}</span>${rep ? '<span class="selo rep">igual em outra ordem</span>' : ''}</li>`;
            }).join('')
          : '<li class="vazio-li">Sem tarefas em tarefas.xlsx</li>';
        return `<div class="tag-ordem">` +
          `<div class="tag-ordem-cab"><strong>${nomeOrdem(o)}</strong>` +
          `${o.prioridade ? `<span class="prio" title="Prioridade">${esc(o.prioridade)}</span>` : ''}` +
          `${o.nivelando ? '<span class="selo niv">Nivelando</span>' : ''}</div>` +
          `<div class="tag-titulo">${esc(o.titulo || 'Sem título em ordens.xlsx')}</div>` +
          `<div class="chips">${o.area ? `<span class="chip">${esc(o.area)}</span>` : ''}` +
          `<span class="chip">${o.tarefas.length} tarefas</span>` +
          `<span class="mini"><span class="amostra verde"></span>${n('verde')}</span>` +
          `<span class="mini"><span class="amostra cinza"></span>${n('cinza')}</span>` +
          `<span class="mini"><span class="amostra branca"></span>${n('branca')}</span></div>` +
          `<ul class="tag-tarefas">${itens}</ul>` +
          `<button type="button" class="botao pequeno" data-ver="${esc(o.g)}" data-ordem="${esc(o.ordem)}">Ver no quadro</button></div>`;
      }).join('');

      const par = os.length > 2 ? ` (melhor par: ${nomeOrdem(melhor.a)} e ${nomeOrdem(melhor.b)})` : '';
      return `<details class="tag-grupo" data-tag="${esc(tag)}"${state.tagsAbertas.has(tag) ? ' open' : ''}>` +
        `<summary><span class="tag-nome">${esc(tag)}</span><span class="tag-qtd">${os.length} ordens</span>` +
        `<span class="veredito ${v.cls}">${v.rot}</span>` +
        `${nivelando ? `<span class="selo niv">${nivelando} nivelando</span>` : ''}</summary>` +
        `<div class="tag-corpo"><p class="tag-sim">Tarefas iguais: ${pct(melhor.tar)}. Títulos parecidos: ${pct(melhor.tit)}${par}.</p>` +
        `<div class="tag-ordens">${cartoes}</div></div></details>`;
    }).join('');
  }

  function limparFiltros() {
    $('busca').value = '';
    $('filtro-ct').value = '';
    $('filtro-sit').value = '';
    $('filtro-area').value = '';
    $('so-dup').checked = false;
    $('so-nivelando').checked = false;
  }

  /* ---------- Eventos ---------- */
  $('seletor-pasta').addEventListener('change', aoEscolherPasta);

  $('modo-conf').addEventListener('change', () => {
    if (!state.modelo) return;
    classificar();
    renderTabela();
    renderTags();
    renderOcupacao();
  });

  ['busca', 'filtro-ct', 'filtro-sit', 'filtro-area', 'so-nivelando', 'so-dup'].forEach((id) => {
    $(id).addEventListener(id === 'busca' ? 'input' : 'change', renderTabela);
  });

  /* Abrir e fechar ordens */
  $('corpo').addEventListener('click', (ev) => {
    if (ev.target.closest('.sel-ordem')) return;            /* clique na caixinha não abre/fecha */
    if (String(window.getSelection()).trim()) return;        /* está selecionando texto: não abre/fecha */
    const cab = ev.target.closest('tr.grupo');
    if (!cab) return;
    const k = cab.dataset.k;
    const abrir = !state.abertas.has(k);
    if (abrir) state.abertas.add(k); else state.abertas.delete(k);
    cab.querySelector('.abre').setAttribute('aria-expanded', String(abrir));
    $('corpo').querySelectorAll(`tr[data-i="${cab.dataset.i}"]:not(.grupo)`).forEach((r) => { r.hidden = !abrir; });
  });

  $('abrir-todas').addEventListener('click', () => {
    if (!state.modelo) return;
    linhasFiltradas().forEach((t) => state.abertas.add(numNorm(t.ordem)));
    renderTabela();
  });

  $('fechar-todas').addEventListener('click', () => {
    state.abertas.clear();
    renderTabela();
  });

  $('resumo').addEventListener('click', (ev) => {
    const b = ev.target.closest('.cartao');
    if (!b) return;
    if (b.dataset.niv) {
      $('so-nivelando').checked = !$('so-nivelando').checked;
    } else if (b.dataset.dup) {
      $('so-dup').checked = !$('so-dup').checked;
    } else {
      $('filtro-sit').value = b.dataset.cat;
    }
    renderTabela();
  });

  ['fonte-tag', 'filtro-area'].forEach((id) => $(id).addEventListener('change', renderTags));

  $('tags-lista').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.dataset || !d.dataset.tag) return;
    if (d.open) state.tagsAbertas.add(d.dataset.tag); else state.tagsAbertas.delete(d.dataset.tag);
  }, true);

  $('tags-lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ver]');
    if (!b) return;
    limparFiltros();
    $('busca').value = b.dataset.ordem;
    state.abertas.add(b.dataset.ver);
    renderTabela();
    renderTags();
    $('t-tarefas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* carrega sozinho as planilhas (neste computador e da nuvem) */
  if (typeof Pasta !== 'undefined') {
    Pasta.carregar((p) => {
      if (!p.dados.diario || !p.dados.tarefas) return;
      state.dados = p.dados;
      const card = $('card-pasta');
      card.querySelector('[data-estado]').textContent = `${Pasta.descricao(p)}. Clique para escolher outra pasta.`;
      card.classList.add('ok');
      processar();
    }, mostrarAviso);
  }

  /* Ocupação: digitar executantes/horas recalcula na hora e salva no navegador */
  $('ocupacao-conteudo').addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'oc-padrao') {
      state.cap.horasPadrao = el.value;
    } else if (el.dataset.campo) {
      const ct = el.closest('tr').dataset.ct;
      (state.cap.cts[ct] = state.cap.cts[ct] || {})[el.dataset.campo] = el.value;
    } else {
      return;
    }
    salvarCap();
    pintarOcupacao();
  });

  /* Marcar ordens para copiar */
  function atualizarSel() {
    const el = $('qtd-sel');
    if (el) el.textContent = state.selecionadas.size;
  }

  $('corpo').addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-sel]');
    if (!c) return;
    if (c.checked) state.selecionadas.set(c.dataset.sel, c.dataset.ordem);
    else state.selecionadas.delete(c.dataset.sel);
    atualizarSel();
  });

  $('sel-todas').addEventListener('click', () => {
    if (!state.modelo) return;
    linhasFiltradas().forEach((t) => state.selecionadas.set(numNorm(t.ordem), t.ordem));
    renderTabela();
  });

  $('limpar-sel').addEventListener('click', () => {
    state.selecionadas.clear();
    if (state.modelo) renderTabela(); else atualizarSel();
  });

  $('copiar-oms-sel').addEventListener('click', () =>
    copiarOMs([...state.selecionadas.values()].map((ordem) => ({ ordem })), 'marcadas'));

  $('gerar-excel').addEventListener('click', gerarExcel);
  $('copiar-oms').addEventListener('click', () => { if (state.modelo) copiarOMs(linhasFiltradas(), 'filtro da tabela'); });
  $('copiar-oms-niv').addEventListener('click', () => { if (state.modelo) copiarOMs(state.modelo.linhas.filter((t) => t.cat === 'verde'), 'nivelando'); });
  $('escopo').addEventListener('change', () => { if (state.dados.diario) processar(); });
  $('nivct-conteudo').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-copiar-ct]');
    if (!b || !state.modelo) return;
    const k = b.dataset.copiarCt;
    copiarOMs(state.modelo.linhas.filter((t) => t.cat === 'verde' && (ctKey(t.ct) || '(SEM CT)') === k), b.dataset.copiarCt);
  });

  $('nivct-conteudo').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.dataset || !d.dataset.ct) return;
    if (d.open) state.ctAbertos.add(d.dataset.ct); else state.ctAbertos.delete(d.dataset.ct);
  }, true);

  /* Ocupação: adicionar / remover outros CTs da lista */
  $('ocupacao-conteudo').addEventListener('change', (ev) => {
    if (ev.target.id !== 'oc-add' || !ev.target.value) return;
    if (!state.cap.extras.includes(ev.target.value)) state.cap.extras.push(ev.target.value);
    salvarCap();
    renderOcupacao();
  });

  $('ocupacao-conteudo').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-remover]');
    if (!b) return;
    state.cap.extras = state.cap.extras.filter((k) => k !== b.dataset.remover);
    salvarCap();
    renderOcupacao();
  });
})();
