(() => {
  'use strict';
  /* colunas (A=0): planilha atual e ordens */
  const C = { ordem: 1, op: 2, sub: 3, ct: 4, texto: 5, ini: 10, fim: 12, area: 19 };
  const O = { area: 0, ordem: 3, titulo: 4 };

  /* Filtros de centro: cts = CTs do grupo; areas = áreas aceitas; solda = SOLDADOR das mesmas ordens */
  const GRUPOS = [
    { id: 'MANDVAZA', cts: ['MANDVAZA'] },
    { id: 'MANDTU UT', cts: ['MANDTU'], areas: ['19', '14'] },
    { id: 'MANDTU TE', cts: ['MANDTU'], areas: ['18', '14'] },
    { id: 'AUSETU UT', cts: ['AUSETU'], areas: ['19', '14'] },
    { id: 'AUSETU TE', cts: ['AUSETU'], areas: ['18', '14'] },
    { id: 'CALDTU UT', cts: ['CALDTU'], areas: ['19', '14'], solda: 'SOLDADOR' },
    { id: 'CALDTU TE', cts: ['CALDTU'], areas: ['18', '14'], solda: 'SOLDADOR' },
    { id: 'CALDVAZA', cts: ['CALDVAZA', 'SOLDVAZA'] },
    { id: 'CALDDSC', cts: ['CALDDSC', 'SOLDDSC'] },
    { id: 'AUSEDSC', cts: ['AUSEDSC'] }
  ];

  const state = { dados: { atual: null, ordens: null }, tarefas: [], membros: new Map(), estado: {}, abertos: new Set(),
                  aba: 'ordem', dias: [], grupoKeys: new Map(), semana: '' };
  const $ = (id) => document.getElementById(id);
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const numNorm = (v) => { let s = txt(v); if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '').replace(/^0+/, '') || '0'; return s.toUpperCase(); };
  const chave = (o, p, s) => [numNorm(o), numNorm(p), numNorm(s)].join('|');
  const ctKey = (s) => txt(s).toUpperCase().replace(/\s+/g, '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const codigosArea = (s) => (String(s).match(/\d+/g) || []).map((x) => x.replace(/^0+/, '') || '0');
  const dois = (n) => String(n).padStart(2, '0');
  const fmtData = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
  const iso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  const segundaDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

  function paraData(v) {
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 90000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = txt(v);
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /* ---------- Leitura ---------- */
  function mostrarAviso(msg) { $('aviso').textContent = msg || ''; $('aviso').hidden = !msg; }

  function lerPlanilha(arquivo) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') return reject(new Error('Biblioteca XLSX não carregou'));
      const l = new FileReader();
      l.onerror = () => reject(new Error('Não consegui abrir ' + arquivo.name));
      l.onload = () => {
        try {
          const wb = XLSX.read(l.result, { type: 'array', cellDates: true });
          let linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
          linhas = linhas.filter((r) => r.some((c) => txt(c) !== ''));
          if (linhas.length && !linhas[0].some((c) => typeof c === 'number' || /^\d+$/.test(txt(c)))) linhas.shift();
          resolve(linhas);
        } catch (e) { reject(e); }
      };
      l.readAsArrayBuffer(arquivo);
    });
  }

  async function aoEscolherPasta(ev) {
    const input = ev.target;
    const arquivos = Array.from(input.files || []).filter((f) => (f.webkitRelativePath || f.name).split('/').length <= 2);
    input.value = '';
    const estado = $('card-pasta').querySelector('[data-estado]');
    const acha = (base) => arquivos.find((f) => new RegExp(`^${base}\\.(xlsx|xls|xlsm|csv)$`, 'i').test(f.name));
    const fAtual = acha('atual');
    if (!arquivos.length) return;
    if (!fAtual) { mostrarAviso('Não encontrei atual.xlsx na pasta.'); estado.textContent = 'Pasta incompleta'; return; }
    estado.textContent = 'Carregando…';
    try {
      state.dados.atual = await lerPlanilha(fAtual);
      const fOrd = acha('ordens');
      state.dados.ordens = fOrd ? await lerPlanilha(fOrd) : null;
      estado.textContent = `atual: ${state.dados.atual.length} linhas | ordens: ${state.dados.ordens ? state.dados.ordens.length + ' linhas' : 'não encontrada'}`;
      mostrarAviso('');
      Pasta.salvar({ atual: state.dados.atual, ordens: state.dados.ordens }).catch(() => {});
      processar();
    } catch (e) { estado.textContent = 'Erro ao ler'; mostrarAviso('Erro ao carregar a pasta: ' + e.message); }
  }

  /* ---------- Modelo ---------- */
  function processar() {
    const ords = new Map();
    (state.dados.ordens || []).forEach((r) => ords.set(numNorm(r[O.ordem]), { titulo: txt(r[O.titulo]), area: txt(r[O.area]) }));
    const mapa = new Map();
    state.dados.atual.forEach((r) => {
      if (!txt(r[C.ordem])) return;
      const k = Sync.limpa(chave(r[C.ordem], r[C.op], r[C.sub]));
      const ini = paraData(r[C.ini]); const fim = paraData(r[C.fim]);
      const t = mapa.get(k);
      if (!t) {
        const o = ords.get(numNorm(r[C.ordem])) || {};
        mapa.set(k, { k, ordem: txt(r[C.ordem]), op: txt(r[C.op]), sub: txt(r[C.sub]), ct: txt(r[C.ct]), texto: txt(r[C.texto]),
          area: txt(r[C.area]) || o.area || '', titulo: o.titulo || '', ini, fim });
      } else {
        if (ini && (!t.ini || ini < t.ini)) t.ini = ini;
        if (fim && (!t.fim || fim > t.fim)) t.fim = fim;
      }
    });
    state.tarefas = [...mapa.values()];
    state.tarefas.forEach((t) => { t.cods = codigosArea(t.area); });

    /* semana mais frequente nas datas de início */
    const cont = new Map();
    state.tarefas.forEach((t) => { if (t.ini) { const s = segundaDe(t.ini).getTime(); cont.set(s, (cont.get(s) || 0) + 1); } });
    const seg = cont.size ? new Date([...cont.entries()].sort((a, b) => b[1] - a[1])[0][0]) : segundaDe(new Date());
    state.semana = iso(seg);
    state.dias = Array.from({ length: 7 }, (_, i) => new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i));
    $('semana').textContent = `Semana ${fmtData(state.dias[0])} a ${fmtData(state.dias[6])}`;

    /* membros de cada filtro de centro */
    state.membros = new Map();
    GRUPOS.forEach((g) => {
      const base = state.tarefas.filter((t) => g.cts.includes(ctKey(t.ct)) && (!g.areas || g.areas.some((a) => t.cods.includes(a))));
      const set = new Set(base.map((t) => t.k));
      if (g.solda) {
        const ordens = new Set(base.map((t) => numNorm(t.ordem)));
        state.tarefas.forEach((t) => { if (ctKey(t.ct) === g.solda && ordens.has(numNorm(t.ordem))) set.add(t.k); });
      }
      state.membros.set(g.id, set);
    });

    $('filtro-centro').innerHTML = '<option value="">Todos</option>' + GRUPOS.map((g) => `<option>${esc(g.id)}</option>`).join('');
    const hoje = new Date();
    const hojeNaSemana = state.dias.some((d) => iso(d) === iso(hoje));
    const nomesDia = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    $('filtro-dia').innerHTML = '<option value="">Semana toda</option>' +
      state.dias.map((d, i) => `<option value="${iso(d)}">${nomesDia[i]} ${fmtData(d)}</option>`).join('');
    $('filtro-dia').value = hojeNaSemana ? iso(hoje) : '';

    $('inicio').hidden = true;
    $('resultado').hidden = false;
    $('sala').value = Sync.sala();
    $('nome').value = Sync.nome();
    conectar();
    render();
  }

  function conectar() {
    Sync.conectar(state.semana, (t) => { state.estado = t; patchTudo(); }, (s) => {
      const el = $('sync-estado');
      el.textContent = { online: 'Tempo real ativo', local: 'Modo local', reconectando: 'Reconectando…', erro: 'Erro de conexão' }[s] || s;
      el.className = 'chip-status ' + s;
    });
  }

  /* ---------- Filtros e renderização ---------- */
  const info = (k) => state.estado[k] || {};
  const confirmada = (k) => info(k).conf === true;

  function visiveis() {
    const busca = $('busca').value.trim().toLowerCase();
    const centro = $('filtro-centro').value; const area = $('filtro-area').value;
    const dia = $('filtro-dia').value; const sit = $('filtro-sit').value;
    const d = dia ? paraData(dia) : null;
    return state.tarefas.filter((t) => {
      if (centro && !state.membros.get(centro).has(t.k)) return false;
      if (area && !t.cods.includes(area)) return false;
      if (d && t.ini && (d < t.ini || d > (t.fim || t.ini))) return false;
      if (sit === 'conf' && !confirmada(t.k)) return false;
      if (sit === 'pend' && confirmada(t.k)) return false;
      if (busca && !`${t.ordem} ${t.texto} ${t.ct}`.toLowerCase().includes(busca)) return false;
      return true;
    });
  }

  function linhaHTML(t) {
    return `<tr data-k="${esc(t.k)}"><td class="nowrap">${esc(t.ordem)}</td><td class="nowrap">${esc(t.op)}</td>` +
      `<td class="nowrap">${esc(t.sub)}</td><td class="nowrap">${esc(t.ct)}</td><td class="texto">${esc(t.texto)}</td>` +
      '<td><input class="campo" data-f="just" placeholder="Justificativa"></td>' +
      '<td><input class="campo" data-f="motivo" list="motivos" placeholder="Motivo"></td>' +
      '<td class="nowrap"><button type="button" class="btn-conf" data-conf>CONFIRMADO</button><small class="quem"></small></td></tr>';
  }

  function render() {
    if (!state.tarefas.length) return;
    const vis = visiveis();
    const grupos = new Map(); /* id -> { rotulo, sub, tarefas } */
    const add = (id, rotulo, sub, t) => { if (!grupos.has(id)) grupos.set(id, { rotulo, sub, tarefas: [] }); grupos.get(id).tarefas.push(t); };
    if (state.aba === 'ordem') {
      [...vis].sort((a, b) => a.ordem.localeCompare(b.ordem, 'pt-BR', { numeric: true }))
        .forEach((t) => add('o' + numNorm(t.ordem), `Ordem ${t.ordem}`, t.titulo, t));
    } else if (state.aba === 'area') {
      vis.forEach((t) => { const a = t.cods[0] ? t.cods[0].padStart(3, '0') : 'Sem área'; add('a' + a, a === 'Sem área' ? a : `Área ${a}`, '', t); });
    } else {
      GRUPOS.forEach((g) => vis.forEach((t) => { if (state.membros.get(g.id).has(t.k)) add('c' + g.id, g.id, '', t); }));
    }
    state.grupoKeys = new Map();
    let html = '';
    [...grupos.entries()].sort((a, b) => (state.aba === 'area' ? a[0].localeCompare(b[0]) : 0)).forEach(([id, g]) => {
      state.grupoKeys.set(id, g.tarefas.map((t) => t.k));
      html += `<details class="grupo-card" data-id="${esc(id)}"${state.abertos.has(id) ? ' open' : ''}>` +
        `<summary><strong>${esc(g.rotulo)}</strong>${g.sub ? `<span class="muted">${esc(g.sub)}</span>` : ''}` +
        `<span class="cont" data-g="${esc(id)}"></span><span class="barra"><i data-b="${esc(id)}"></i></span></summary>` +
        '<div class="tabela-wrap"><table><thead><tr><th>Ordem</th><th>Op.</th><th>Sub</th><th>CT</th><th>Texto breve</th>' +
        `<th>Justificativa</th><th>Motivo</th><th></th></tr></thead><tbody>${g.tarefas.map(linhaHTML).join('')}</tbody></table></div></details>`;
    });
    $('lista').innerHTML = html || '<p class="vazio">Nenhuma tarefa com esses filtros.</p>';
    state.visKeys = vis.map((t) => t.k);
    patchTudo();
  }

  /* atualiza campos/botões sem recriar a tabela (não atrapalha quem está digitando) */
  function patchTudo() {
    const lista = $('lista');
    if (!lista) return;
    lista.querySelectorAll('tr[data-k]').forEach((tr) => {
      const e = info(tr.dataset.k);
      tr.querySelectorAll('input[data-f]').forEach((inp) => {
        if (document.activeElement !== inp) inp.value = e[inp.dataset.f] || '';
      });
      const ok = e.conf === true;
      tr.classList.toggle('confirmada', ok);
      const b = tr.querySelector('[data-conf]');
      b.classList.toggle('on', ok);
      b.textContent = ok ? '✔ CONFIRMADO' : 'CONFIRMADO';
      tr.querySelector('.quem').textContent = ok && e.por ? ` ${e.por}` : '';
    });
    contadores();
  }

  function contadores() {
    const conta = (keys) => { const n = keys.filter(confirmada).length; return { n, total: keys.length, p: keys.length ? Math.round((n / keys.length) * 100) : 0 }; };
    state.grupoKeys.forEach((keys, id) => {
      const c = conta(keys);
      const el = document.querySelector(`[data-g="${CSS.escape(id)}"]`);
      const b = document.querySelector(`[data-b="${CSS.escape(id)}"]`);
      if (el) el.textContent = `${c.n}/${c.total}`;
      if (b) b.style.width = c.p + '%';
    });
    const t = conta(state.visKeys || []);
    $('resumo').innerHTML =
      `<div class="cartao"><span class="num">${t.total}</span><span class="rot">Tarefas</span></div>` +
      `<div class="cartao ok"><span class="num">${t.n}</span><span class="rot">Confirmadas</span></div>` +
      `<div class="cartao"><span class="num">${t.total - t.n}</span><span class="rot">Pendentes</span></div>` +
      `<div class="cartao grande"><span class="num">${t.p}%</span><span class="rot">Concluído</span><span class="barra"><i style="width:${t.p}%"></i></span></div>`;
  }

  /* ---------- Eventos ---------- */
  $('seletor-pasta').addEventListener('change', aoEscolherPasta);
  ['busca', 'filtro-centro', 'filtro-area', 'filtro-dia', 'filtro-sit'].forEach((id) =>
    $(id).addEventListener(id === 'busca' ? 'input' : 'change', render));

  document.querySelector('.abas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-aba]');
    if (!b) return;
    state.aba = b.dataset.aba;
    document.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x === b));
    render();
  });

  $('lista').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.dataset || !d.dataset.id) return;
    if (d.open) state.abertos.add(d.dataset.id); else state.abertos.delete(d.dataset.id);
  }, true);

  $('abrir-todas').addEventListener('click', () => { state.grupoKeys.forEach((_, id) => state.abertos.add(id)); render(); });
  $('fechar-todas').addEventListener('click', () => { state.abertos.clear(); render(); });

  /* confirmar */
  $('lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-conf]');
    if (!b) return;
    const k = b.closest('tr').dataset.k;
    const agora = new Date();
    Sync.atualizar(k, confirmada(k)
      ? { conf: false, por: Sync.nome(), em: '' }
      : { conf: true, por: Sync.nome(), em: `${dois(agora.getHours())}:${dois(agora.getMinutes())}` });
  });

  /* justificativa / motivo: grava logo depois de parar de digitar */
  const timers = new Map();
  $('lista').addEventListener('input', (ev) => {
    const inp = ev.target.closest('input[data-f]');
    if (!inp) return;
    const k = inp.closest('tr').dataset.k; const f = inp.dataset.f; const id = k + f;
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => Sync.atualizar(k, { [f]: inp.value, por: Sync.nome() }), 500));
  });

  $('sala').addEventListener('change', () => { Sync.setSala($('sala').value); $('sala').value = Sync.sala(); if (state.semana) conectar(); });
  $('nome').addEventListener('change', () => Sync.setNome($('nome').value));

  /* carrega sozinho a pasta escolhida na página inicial */
  Pasta.ler().then((p) => {
    if (!p || !p.dados.atual) return;
    state.dados.atual = p.dados.atual;
    state.dados.ordens = p.dados.ordens;
    $('card-pasta').querySelector('[data-estado]').textContent = `Pasta carregada ${Pasta.rotulo(p.quando)}. Clique para escolher outra.`;
    processar();
  });
})();
