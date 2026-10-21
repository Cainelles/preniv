(() => {
  'use strict';

  /* ---------- Configuração ---------- */
  const CHAVES = ['DUM9', 'R1H0', 'GBH3', 'R1PC', 'ANGS'];
  const AREAS = ['14', '18', '19'];
  const CTS = ['AUSETU', 'CALDTU', 'MANDTU', 'MANDVAZA', 'CALDVAZA', 'MANDDSC', 'CALDDSC', 'AUSEDSC'];

  /* colunas (A=0): opcart = operações em aberto; omcart = ordens */
  const OP = { gpm: 0, local: 1, ordem: 2, op: 3, sub: 4, conf: 5, ctrl: 6, texto: 7, ct: 8, ex: 9, dur: 10, trab: 11,
               ri: 12, restr: 13, stSis: 14, dtRef: 15, ini: 16, stUsu: 17 };
  const OM = { gpm: 0, area: 1, nota: 2, ordem: 3, ct: 4, texto: 5, stUsu: 6, stSis: 7, imp: 8, cpo: 9, inicioBase: 10, planos: 11 };

  const SESSAO = 'carteira.sessao';
  const $ = (id) => document.getElementById(id);

  /* ---------- Utilitários ---------- */
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const numNorm = (v) => { let s = txt(v); if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '').replace(/^0+/, '') || '0'; return s.toUpperCase(); };
  const ctKey = (s) => txt(s).toUpperCase().replace(/\s+/g, '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const codigosArea = (s) => (String(s).match(/\d+/g) || []).map((x) => x.replace(/^0+/, '') || '0');
  const dois = (n) => String(n).padStart(2, '0');
  const fmtData = (d) => (d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '');
  const cmpNum = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

  function paraData(v) {
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 90000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = txt(v);
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  const fmtDataCel = (v) => { const d = paraData(v); return d ? fmtData(d) : txt(v); };
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : txt(v));

  function avisoRapido(t) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  /* ---------- Login (chave + senha criada no primeiro acesso) ---------- */
  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const novoSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

  async function hashSenha(senha, saltHex) {
    const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, chave, 256));
  }

  const urlUsuario = (c) => `${FIREBASE_URL}/usuarios/${c}.json`;

  async function lerUsuario(c) {
    const r = await fetch(urlUsuario(c), { cache: 'no-store' });
    if (r.status === 401 || r.status === 403) throw new Error('regras');
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  async function gravarUsuario(c, dados) {
    const r = await fetch(urlUsuario(c), { method: 'PUT', body: JSON.stringify(dados) });
    if (r.status === 401 || r.status === 403) throw new Error('regras');
    if (!r.ok) throw new Error('http ' + r.status);
  }

  let etapa = 'chave';

  function erroLogin(msg) { $('login-erro').textContent = msg || ''; $('login-erro').hidden = !msg; }

  function irParaEtapa(nova) {
    etapa = nova;
    $('campo-senha').hidden = etapa === 'chave';
    $('campo-confirma').hidden = etapa !== 'criar';
    $('login-chave').readOnly = etapa !== 'chave';
    $('login-trocar').hidden = etapa === 'chave';
    $('login-btn').textContent = { chave: 'Continuar', senha: 'Entrar', criar: 'Criar senha e entrar' }[etapa];
    $('login-info').textContent = {
      chave: 'Digite a sua chave de acesso.',
      senha: 'Digite a sua senha.',
      criar: 'Primeiro acesso com esta chave: escolha uma senha (mínimo 6 caracteres). Guarde-a, ela será pedida nos próximos acessos.'
    }[etapa];
    $('login-senha').value = '';
    $('login-confirma').value = '';
    if (etapa === 'chave') $('login-chave').focus(); else $('login-senha').focus();
  }

  function msgErro(e) {
    if (e && e.message === 'regras') return 'O Firebase recusou o acesso. Nas regras do Realtime Database, libere o caminho "usuarios".';
    return 'Não consegui falar com o servidor. Verifique a internet e tente de novo.';
  }

  async function enviarLogin(ev) {
    ev.preventDefault();
    erroLogin('');
    const btn = $('login-btn');
    if (!window.crypto || !crypto.subtle) { erroLogin('Este navegador não permite o login seguro. Abra o site por https.'); return; }
    if (typeof FIREBASE_URL === 'undefined' || !FIREBASE_URL) { erroLogin('O login precisa do Firebase configurado no script.js.'); return; }
    btn.disabled = true;
    try {
      const chave = txt($('login-chave').value).toUpperCase();
      if (etapa === 'chave') {
        if (!CHAVES.includes(chave)) { erroLogin('Chave inválida.'); return; }
        $('login-chave').value = chave;
        const u = await lerUsuario(chave);
        irParaEtapa(u && u.hash ? 'senha' : 'criar');
        return;
      }
      const senha = $('login-senha').value;
      if (etapa === 'criar') {
        if (senha.length < 6) { erroLogin('A senha precisa ter pelo menos 6 caracteres.'); return; }
        if (senha !== $('login-confirma').value) { erroLogin('As senhas não são iguais.'); return; }
        const existente = await lerUsuario(chave);             /* alguém pode ter criado enquanto isso */
        if (existente && existente.hash) { erroLogin('Esta chave já tem senha. Digite a senha dela.'); irParaEtapa('senha'); return; }
        const salt = novoSalt();
        await gravarUsuario(chave, { salt, hash: await hashSenha(senha, salt), criado: Date.now() });
        entrar(chave);
        return;
      }
      /* etapa senha */
      const u = await lerUsuario(chave);
      if (!u || !u.hash) { irParaEtapa('criar'); return; }
      if (!senha) { erroLogin('Digite a senha.'); return; }
      if ((await hashSenha(senha, u.salt)) !== u.hash) {
        await new Promise((r) => setTimeout(r, 800));
        erroLogin('Senha incorreta.');
        return;
      }
      entrar(chave);
    } catch (e) {
      erroLogin(msgErro(e));
    } finally {
      btn.disabled = false;
    }
  }

  let iniciado = false;
  function entrar(chave) {
    try { sessionStorage.setItem(SESSAO, chave); } catch (e) { /* vale só enquanto a página estiver aberta */ }
    $('login').hidden = true;
    $('app').hidden = false;
    $('usuario').textContent = 'Chave ' + chave;
    $('usuario').hidden = false;
    $('sair').hidden = false;
    if (!iniciado) { iniciado = true; iniciarApp(); }
  }

  function sair() {
    try { sessionStorage.removeItem(SESSAO); } catch (e) { /* ignora */ }
    location.reload();
  }

  $('login-form').addEventListener('submit', enviarLogin);
  $('login-trocar').addEventListener('click', () => { erroLogin(''); $('login-chave').value = ''; irParaEtapa('chave'); });
  $('sair').addEventListener('click', sair);

  /* ---------- Dados ---------- */
  const state = { dados: { opcart: null, omcart: null }, ordens: [], abertas: new Set(), vis: [] };

  function mostrarAviso(msg) { $('aviso').textContent = msg || ''; $('aviso').hidden = !msg; }

  function processar() {
    const mapa = new Map();
    const pega = (k, ordem) => {
      if (!mapa.has(k)) mapa.set(k, { k, ordem, om: null, ops: [] });
      return mapa.get(k);
    };

    (state.dados.omcart || []).forEach((r) => {
      const ordem = txt(r[OM.ordem]);
      if (!ordem) return;
      const o = pega(numNorm(ordem), ordem);
      o.om = {
        gpm: txt(r[OM.gpm]), area: txt(r[OM.area]), nota: txt(r[OM.nota]), ct: txt(r[OM.ct]), texto: txt(r[OM.texto]),
        stUsu: txt(r[OM.stUsu]), stSis: txt(r[OM.stSis]), imp: txt(r[OM.imp]), cpo: txt(r[OM.cpo]),
        inicioBase: r[OM.inicioBase], planos: txt(r[OM.planos])
      };
    });

    (state.dados.opcart || []).forEach((r) => {
      const ordem = txt(r[OP.ordem]);
      if (!ordem) return;
      pega(numNorm(ordem), ordem).ops.push({
        gpm: txt(r[OP.gpm]), local: txt(r[OP.local]), op: txt(r[OP.op]), sub: txt(r[OP.sub]), conf: txt(r[OP.conf]),
        ctrl: txt(r[OP.ctrl]), texto: txt(r[OP.texto]), ct: txt(r[OP.ct]), ex: fmtNum(r[OP.ex]), dur: fmtNum(r[OP.dur]),
        trab: fmtNum(r[OP.trab]), ri: txt(r[OP.ri]), restr: fmtDataCel(r[OP.restr]), stSis: txt(r[OP.stSis]),
        dtRef: fmtDataCel(r[OP.dtRef]), ini: fmtDataCel(r[OP.ini]), stUsu: txt(r[OP.stUsu])
      });
    });

    state.ordens = [...mapa.values()];
    state.ordens.forEach((o) => {
      o.ops.sort((a, b) => cmpNum(a.op, b.op) || cmpNum(a.sub, b.sub));
      o.cods = codigosArea(o.om ? o.om.area : '');
      o.areaOk = o.cods.some((c) => AREAS.includes(c));
      o.ctOk = o.ops.some((p) => CTS.includes(ctKey(p.ct))) || CTS.includes(ctKey(o.om ? o.om.ct : ''));
      o.porCT = !o.areaOk && o.ctOk;
      o.dataBase = o.om ? paraData(o.om.inicioBase) : null;
      o.busca = `${o.ordem} ${o.om ? o.om.nota + ' ' + o.om.texto : ''} ${o.ops.map((p) => p.texto).join(' ')}`.toLowerCase();
    });

    $('inicio').hidden = true;
    $('resultado').hidden = false;
    montarFiltros();
    render();
  }

  const noEscopo = (o) => o.areaOk || o.ctOk;

  function montarFiltros() {
    const base = $('escopo').checked ? state.ordens.filter(noEscopo) : state.ordens;

    const cts = new Map();
    const sts = new Set();
    base.forEach((o) => {
      o.ops.forEach((p) => { const k = ctKey(p.ct); if (k && !cts.has(k)) cts.set(k, p.ct); });
      if (o.om && o.om.stSis) sts.add(o.om.stSis);
    });
    const ct = $('filtro-ct').value;
    const st = $('filtro-st').value;
    $('filtro-ct').innerHTML = '<option value="">Todos</option>' +
      [...cts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    $('filtro-st').innerHTML = '<option value="">Todos</option>' +
      [...sts].sort().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (cts.has(ct)) $('filtro-ct').value = ct;
    if (sts.has(st)) $('filtro-st').value = st;
  }

  function visiveis() {
    const busca = $('busca').value.trim().toLowerCase();
    const area = $('filtro-area').value;
    const ct = $('filtro-ct').value;
    const st = $('filtro-st').value;
    const soEscopo = $('escopo').checked;
    const lista = state.ordens.filter((o) => {
      if (soEscopo && !noEscopo(o)) return false;
      if (area === 'ct' ? !o.porCT : (area && !o.cods.includes(area))) return false;
      if (ct && !o.ops.some((p) => ctKey(p.ct) === ct)) return false;
      if (st && !(o.om && o.om.stSis === st)) return false;
      if (busca && !o.busca.includes(busca)) return false;
      return true;
    });
    if ($('ordenar').value === 'inicio') {
      lista.sort((a, b) => (a.dataBase ? a.dataBase.getTime() : Infinity) - (b.dataBase ? b.dataBase.getTime() : Infinity) || cmpNum(a.ordem, b.ordem));
    } else {
      lista.sort((a, b) => cmpNum(a.ordem, b.ordem));
    }
    return lista;
  }

  /* ---------- Renderização ---------- */
  function chipsHTML(o) {
    const om = o.om;
    const c = [];
    if (om && om.area) c.push(`<span class="chip">Área ${esc(om.area)}</span>`);
    if (o.porCT) c.push('<span class="chip chip-aviso" title="Fora das áreas 014/018/019, mas tem CT do seu escopo">Entrou pelo CT</span>');
    if (om && om.ct) c.push(`<span class="chip">CT ${esc(om.ct)}</span>`);
    if (om && om.stSis) c.push(`<span class="chip">${esc(om.stSis)}</span>`);
    if (om && om.stUsu) c.push(`<span class="chip">${esc(om.stUsu)}</span>`);
    if (!om) c.push('<span class="chip chip-aviso">Ordem não encontrada em omcart.xlsx</span>');
    return c.join('');
  }

  function ordemHTML(o) {
    const n = o.ops.length;
    return `<details class="ordem-card" data-k="${esc(o.k)}"${state.abertas.has(o.k) ? ' open' : ''}>` +
      `<summary><span class="ord-num">Ordem ${esc(o.ordem)}</span>` +
      `<span class="ord-texto">${esc(o.om ? o.om.texto : '')}</span>` +
      `<span class="ord-qtd">${n} ${n === 1 ? 'operação' : 'operações'}</span>` +
      `<span class="chips">${chipsHTML(o)}</span></summary>` +
      '<div class="ord-corpo"></div></details>';
  }

  function corpoHTML(o) {
    const om = o.om || {};
    const campos = [
      ['Nota', om.nota], ['GPM', om.gpm || (o.ops[0] && o.ops[0].gpm) || ''], ['CT principal', om.ct],
      ['Imp. falha', om.imp], ['CPO', om.cpo], ['Início base', fmtDataCel(om.inicioBase)]
    ];
    let html = '<dl class="ord-info">' +
      campos.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v || '—')}</dd></div>`).join('') +
      `<div class="largo"><dt>Planos de manutenção</dt><dd>${esc(om.planos || '—')}</dd></div></dl>`;

    if (!o.ops.length) return html + '<p class="sem-ops">Sem operações em aberto em opcart.xlsx.</p>';

    const cab = ['Oper.', 'SubOp', 'CenTrab', 'Txt.breve operação', 'Ex.', 'DurNrm', 'Trab', 'Confirmação', 'Ctrl', 'RI',
      'Restr.iníc', 'Status do sistema', 'Status usuário', '1º início', 'Dt.refer.', 'Localiz.'];
    const linhas = o.ops.map((p) => {
      const meu = CTS.includes(ctKey(p.ct));
      return `<tr${meu ? ' class="meu"' : ''}><td class="nowrap">${esc(p.op)}</td><td class="nowrap">${esc(p.sub)}</td>` +
        `<td class="nowrap">${esc(p.ct)}</td><td class="texto">${esc(p.texto)}</td><td>${esc(p.ex)}</td><td>${esc(p.dur)}</td>` +
        `<td>${esc(p.trab)}</td><td>${esc(p.conf)}</td><td>${esc(p.ctrl)}</td><td>${esc(p.ri)}</td>` +
        `<td class="nowrap">${esc(p.restr)}</td><td>${esc(p.stSis)}</td><td>${esc(p.stUsu)}</td>` +
        `<td class="nowrap">${esc(p.ini)}</td><td class="nowrap">${esc(p.dtRef)}</td><td>${esc(p.local)}</td></tr>`;
    }).join('');
    return html + `<div class="tabela-wrap"><table><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` +
      `<tbody>${linhas}</tbody></table></div>`;
  }

  /* o conteúdo da ordem só é montado quando ela é aberta (lista grande fica leve) */
  function preencher(det) {
    const corpo = det.querySelector('.ord-corpo');
    if (!corpo || corpo.dataset.pronto) return;
    const o = state.vis.find((x) => x.k === det.dataset.k);
    if (!o) return;
    corpo.innerHTML = corpoHTML(o);
    corpo.dataset.pronto = '1';
  }

  function renderResumo(lista) {
    const ops = lista.reduce((s, o) => s + o.ops.length, 0);
    const porArea = (a) => lista.filter((o) => o.cods.includes(a)).length;
    const itens = [
      ['Ordens', lista.length], ['Operações em aberto', ops],
      ['Área 014', porArea('14')], ['Área 018', porArea('18')], ['Área 019', porArea('19')],
      ['Só pelo CT', lista.filter((o) => o.porCT).length]
    ];
    $('resumo').innerHTML = itens.map(([r, n]) =>
      `<div class="cartao"><span class="num">${n}</span><span class="rot">${esc(r)}</span></div>`).join('');
  }

  function render() {
    const lista = visiveis();
    state.vis = lista;
    renderResumo(lista);
    $('escopo-info').textContent = $('escopo').checked
      ? `${lista.length} de ${state.ordens.length} ordens no escopo (áreas 014, 018, 019 e CTs ${CTS.join(', ')}).`
      : `${lista.length} de ${state.ordens.length} ordens.`;
    $('lista').innerHTML = lista.length ? lista.map(ordemHTML).join('') : '<p class="vazio">Nenhuma ordem com esses filtros.</p>';
    $('lista').querySelectorAll('details[open]').forEach(preencher);
  }

  /* ---------- Copiar e exportar ---------- */
  async function copiarOMs() {
    const oms = state.vis.map((o) => o.ordem);
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
    avisoRapido(`${oms.length} OM(s) copiada(s)`);
  }

  function gerarExcel() {
    if (typeof XLSX === 'undefined') { mostrarAviso('Biblioteca XLSX não carregou.'); return; }
    if (!state.vis.length) { mostrarAviso('Nada para exportar com esses filtros.'); return; }
    mostrarAviso('');
    const cab = ['Ordem', 'Área', 'Nota', 'GPM', 'CT principal', 'Texto breve', 'Status usuário (ordem)', 'Status sistema (ordem)',
      'Imp. falha', 'CPO', 'Início base', 'Planos de manutenção', 'Oper.', 'SubOp', 'CenTrab', 'Txt.breve operação', 'Ex.', 'DurNrm',
      'Trab', 'Confirmação', 'Ctrl', 'RI', 'Restr.iníc', 'Status do sistema', 'Status usuário', '1º início', 'Dt.refer.', 'Localiz.'];
    const linhas = [];
    state.vis.forEach((o) => {
      const om = o.om || {};
      const base = [o.ordem, om.area || '', om.nota || '', om.gpm || '', om.ct || '', om.texto || '', om.stUsu || '', om.stSis || '',
        om.imp || '', om.cpo || '', fmtDataCel(om.inicioBase), om.planos || ''];
      if (!o.ops.length) { linhas.push(base.concat(new Array(16).fill(''))); return; }
      o.ops.forEach((p) => linhas.push(base.concat([p.op, p.sub, p.ct, p.texto, p.ex, p.dur, p.trab, p.conf, p.ctrl, p.ri, p.restr,
        p.stSis, p.stUsu, p.ini, p.dtRef, p.local])));
    });
    const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas));
    ws['!cols'] = [10, 8, 11, 8, 12, 36, 14, 14, 9, 8, 11, 28, 6, 6, 10, 40, 5, 8, 8, 12, 6, 5, 11, 14, 14, 11, 11, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Carteira');
    const h = new Date();
    XLSX.writeFile(wb, `carteira_${h.getFullYear()}-${dois(h.getMonth() + 1)}-${dois(h.getDate())}.xlsx`);
  }

  /* ---------- Início do app (depois do login) ---------- */
  function atualizarEstado(p) {
    $('card-pasta').querySelector('[data-estado]').textContent =
      `${Pasta.descricao(p)}. opcart: ${p.dados.opcart ? p.dados.opcart.length : 0} linhas | omcart: ${p.dados.omcart ? p.dados.omcart.length : 0} linhas. Clique para escolher outra pasta.`;
  }

  async function aoEscolherPasta(ev) {
    const input = ev.target;
    const arquivos = Array.from(input.files || []);
    input.value = '';
    if (!arquivos.length) return;
    const estado = $('card-pasta').querySelector('[data-estado]');
    estado.textContent = 'Carregando…';
    try {
      const { dados } = await Pasta.lerArquivos(arquivos);
      if (!dados.opcart) { mostrarAviso('Não encontrei opcart.xlsx na pasta.'); estado.textContent = 'Pasta incompleta'; return; }
      if (!dados.omcart) mostrarAviso('Atenção: não encontrei omcart.xlsx; as áreas das ordens ficam desconhecidas.');
      else mostrarAviso('');
      state.dados.opcart = dados.opcart;
      state.dados.omcart = dados.omcart || state.dados.omcart;
      estado.textContent = `opcart: ${dados.opcart.length} linhas | omcart: ${dados.omcart ? dados.omcart.length + ' linhas' : 'não encontrada'}`;
      Pasta.aplicar({ opcart: dados.opcart, omcart: dados.omcart }, false)
        .catch((e) => mostrarAviso('Dados carregados, mas não enviei para a nuvem: ' + e.message));
      processar();
    } catch (e) { estado.textContent = 'Erro ao ler'; mostrarAviso('Erro ao carregar a pasta: ' + e.message); }
  }

  function iniciarApp() {
    $('seletor-pasta').addEventListener('change', aoEscolherPasta);
    $('escopo').addEventListener('change', () => { if (state.ordens.length) { montarFiltros(); render(); } });
    ['filtro-area', 'filtro-ct', 'filtro-st', 'ordenar'].forEach((id) => $(id).addEventListener('change', () => { if (state.ordens.length) render(); }));
    $('busca').addEventListener('input', () => { if (state.ordens.length) render(); });

    $('lista').addEventListener('toggle', (ev) => {
      const d = ev.target;
      if (!d.dataset || !d.dataset.k) return;
      if (d.open) { state.abertas.add(d.dataset.k); preencher(d); } else state.abertas.delete(d.dataset.k);
    }, true);

    $('abrir-todas').addEventListener('click', () => {
      if (state.vis.length > 150 && !confirm(`Abrir ${state.vis.length} ordens de uma vez? Pode ficar pesado.`)) return;
      state.vis.forEach((o) => state.abertas.add(o.k));
      render();
    });
    $('fechar-todas').addEventListener('click', () => { state.abertas.clear(); render(); });
    $('copiar-oms').addEventListener('click', copiarOMs);
    $('gerar-excel').addEventListener('click', gerarExcel);

    Pasta.carregar((p) => {
      if (!p.dados.opcart) return;
      state.dados.opcart = p.dados.opcart;
      state.dados.omcart = p.dados.omcart;
      atualizarEstado(p);
      processar();
    }, mostrarAviso);
  }

  /* sessão aberta nesta aba: não pede login de novo */
  let sessao = '';
  try { sessao = sessionStorage.getItem(SESSAO) || ''; } catch (e) { sessao = ''; }
  if (CHAVES.includes(sessao)) entrar(sessao);
  else $('login-chave').focus();
})();
