/* carteira.js — Gestão de carteira
   Organização do arquivo:
   1. Configuração   2. Utilitários   3. Login   4. Dados   5. Navegação
   6. Tela Início    7. Tela Ordens   8. Tela ATREs   9. Início do app          */
(() => {
  'use strict';

  /* =====================================================================
     1. CONFIGURAÇÃO
     ===================================================================== */
  const CHAVES = ['DUM9', 'R1H0', 'GBH3', 'R1PC', 'ANGS'];
  const AREAS = ['14', '18', '19'];
  const CTS = ['AUSETU', 'CALDTU', 'MANDTU', 'MANDVAZA', 'CALDVAZA', 'MANDDSC', 'CALDDSC', 'AUSEDSC'];

  /* colunas (A=0): opcart = operações em aberto; omcart = ordens */
  const OP = { gpm: 0, local: 1, ordem: 2, op: 3, sub: 4, conf: 5, ctrl: 6, texto: 7, ct: 8, ex: 9, dur: 10, trab: 11,
               ri: 12, restr: 13, stSis: 14, dtRef: 15, ini: 16, stUsu: 17 };
  const OM = { gpm: 0, area: 1, nota: 2, ordem: 3, ct: 4, texto: 5, stUsu: 6, stSis: 7, imp: 8, cpo: 9, inicioBase: 10, planos: 11 };

  /* Coluna do "Cód.plan.ordem" (0, 1 ou 2). Você indicou a coluna I (índice 8), que aqui se chama 'imp'.
     Se o aviso na tela "Ordens para planejar" mostrar valores estranhos, troque para 'cpo' (coluna J). */
  const COL_COD = 'imp';

  /* Temas da página inicial. 'esp' = filtro de ordens aplicado (igual ao id, exceto "ordens"). */
  const TOPICOS = [
    { id: 'ordens', grupo: 'geral', titulo: 'Todas as ordens', unid: 'ordens',
      desc: 'A carteira completa, com busca, filtros e exportação para Excel.',
      icone: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'atre', grupo: 'geral', destaque: true, titulo: 'ATREs', unid: 'tarefas p/ conferir',
      desc: 'Tarefas com ATRE incorreta para o CT e tarefas que deveriam ter ATRE e estão sem (CA01, CO01, CO02, CO03, CO04).',
      icone: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM9 12l2 2 4-4' },
    { id: 'planejar', grupo: 'ordens', titulo: 'Ordens para planejar', unid: 'ordens',
      desc: 'Cód. plan. ordem vazio ou 0.',
      icone: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
    { id: 'aent', grupo: 'ordens', titulo: 'AENT', unid: 'ordens',
      desc: 'Status com CONF, mas sem AENT.',
      icone: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11' },
    { id: 'imediatas', grupo: 'ordens', titulo: 'Ordens imediatas', unid: 'ordens',
      desc: 'Cód. plan. ordem igual a 2.',
      icone: 'M13 2L4 14h7l-1 8 9-12h-7z' },
    { id: 'smpmi', grupo: 'ordens', titulo: 'Ordens s/MPMI', unid: 'ordens',
      desc: 'Cód. plan. ordem 1 ou 2 e status sem MPMI.',
      icone: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8' },
    { id: 'cnpa', grupo: 'ordens', titulo: 'CNPA', unid: 'ordens',
      desc: 'Ordens com CNPA: quantas tarefas ainda estão em aberto, quais e em quais CTs.',
      icone: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' }
  ];
  const SECOES = [['geral', 'Visão geral'], ['ordens', 'Filtros de ordens']];

  const SITUACAO = { ok: 'Adequada', incorreta: 'ATRE incorreta', falta: 'Faltando ATRE', conferir: 'A conferir' };
  const PROBLEMA = new Set(['incorreta', 'falta', 'conferir']);
  const PAGINA = 200;                 /* linhas mostradas por vez dentro de cada grupo de ATRE */
  const SESSAO = 'carteira.sessao';
  const $ = (id) => document.getElementById(id);

  /* =====================================================================
     2. UTILITÁRIOS
     ===================================================================== */
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const numNorm = (v) => { let s = txt(v); if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '').replace(/^0+/, '') || '0'; return s.toUpperCase(); };
  const ctKey = (s) => txt(s).toUpperCase().replace(/\s+/g, '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const codigosArea = (s) => (String(s).match(/\d+/g) || []).map((x) => x.replace(/^0+/, '') || '0');
  const dois = (n) => String(n).padStart(2, '0');
  const fmtData = (d) => (d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '');
  const cmpNum = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const semAcento = (s) => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const temStatus = (s, w) => new RegExp('(^|[^A-Z0-9])' + w + '([^A-Z0-9]|$)').test(s);
  const hojeStr = () => { const h = new Date(); return `${h.getFullYear()}-${dois(h.getMonth() + 1)}-${dois(h.getDate())}`; };

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

  async function copiarTexto(texto) {
    try { await navigator.clipboard.writeText(texto); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  /* =====================================================================
     3. LOGIN (chave + senha criada no primeiro acesso)
     ===================================================================== */
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

  /* =====================================================================
     4. DADOS
     ===================================================================== */
  const state = {
    dados: { opcart: null, omcart: null },
    ordens: [], escopo: true,
    esp: '', vis: [], abertas: new Set(),            /* telas de ordens */
    grupos: new Map(), tarefasVis: [], atreAbertas: new Set()   /* tela de ATREs */
  };

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
      const p = {
        gpm: txt(r[OP.gpm]), local: txt(r[OP.local]), op: txt(r[OP.op]), sub: txt(r[OP.sub]), conf: txt(r[OP.conf]),
        ctrl: txt(r[OP.ctrl]), texto: txt(r[OP.texto]), ct: txt(r[OP.ct]), ex: fmtNum(r[OP.ex]), dur: fmtNum(r[OP.dur]),
        trab: fmtNum(r[OP.trab]), ri: txt(r[OP.ri]), restr: fmtDataCel(r[OP.restr]), stSis: txt(r[OP.stSis]),
        dtRef: fmtDataCel(r[OP.dtRef]), ini: fmtDataCel(r[OP.ini]), stUsu: txt(r[OP.stUsu])
      };
      p.a = Atre.analisar(p.texto, p.ct);                  /* conferência da tarefa contra as ATREs */
      pega(numNorm(ordem), ordem).ops.push(p);
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

      /* filtros de ordens */
      const om = o.om;
      o.cod = om ? txt(om[COL_COD]).replace(/\.0+$/, '') : null;
      o.st = om ? semAcento(om.stUsu + ' ' + om.stSis) : '';
      o.esp = {
        planejar:  !!om && (o.cod === '' || o.cod === '0'),
        aent:      !!om && temStatus(o.st, 'CONF') && !temStatus(o.st, 'AENT'),
        imediatas: !!om && o.cod === '2',
        smpmi:     !!om && (o.cod === '1' || o.cod === '2') && !temStatus(o.st, 'MPMI'),
        cnpa:      !!om && temStatus(o.st, 'CNPA')
      };
    });

    montarFiltros();
    aplicarRota(false);
  }

  const noEscopo = (o) => o.areaOk || o.ctOk;
  const baseOrdens = () => (state.escopo ? state.ordens.filter(noEscopo) : state.ordens);
  const temDados = () => state.ordens.length > 0;

  function montarFiltros() {
    const base = baseOrdens();
    const cts = new Map();
    const sts = new Set();
    base.forEach((o) => {
      o.ops.forEach((p) => { const k = ctKey(p.ct); if (k && !cts.has(k)) cts.set(k, p.ct); });
      if (o.om && o.om.stSis) sts.add(o.om.stSis);
    });
    const optCt = '<option value="">Todos</option>' +
      [...cts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    ['filtro-ct', 'a-ct'].forEach((id) => { const el = $(id); const v = el.value; el.innerHTML = optCt; if (cts.has(v)) el.value = v; });
    const st = $('filtro-st').value;
    $('filtro-st').innerHTML = '<option value="">Todos</option>' +
      [...sts].sort().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (sts.has(st)) $('filtro-st').value = st;
  }

  function setEscopo(v) {
    state.escopo = v;
    document.querySelectorAll('.chk-escopo').forEach((c) => { c.checked = v; });
    if (temDados()) { montarFiltros(); aplicarRota(false); }
  }

  /* =====================================================================
     5. NAVEGAÇÃO (cada tema tem o seu endereço: carteira.html#atre, #cnpa ...)
     ===================================================================== */
  const topicoAtual = () => TOPICOS.find((t) => t.id === decodeURIComponent(location.hash.slice(1))) || null;

  function resetFiltros() {
    ['busca', 'filtro-area', 'filtro-ct', 'filtro-st', 'a-busca', 'a-atre', 'a-sit', 'a-ct'].forEach((id) => { $(id).value = ''; });
    $('ordenar').value = 'ordem';
    $('a-sit').value = 'problema';
    state.abertas.clear();
    state.atreAbertas.clear();
  }

  function aplicarRota(reset) {
    const t = topicoAtual();
    $('tela-inicio').hidden = !!t;
    $('tela-ordens').hidden = !(t && t.id !== 'atre');
    $('tela-atre').hidden = !(t && t.id === 'atre');
    document.title = t ? `${t.titulo} · Gestão de carteira` : 'Gestão de carteira';
    if (!t) { atualizarInicio(); return; }
    if (reset) resetFiltros();
    if (t.id === 'atre') telaAtre(); else telaOrdens(t);
  }

  function rotear() {
    if (!iniciado) return;
    aplicarRota(true);
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     6. TELA INÍCIO
     ===================================================================== */
  function cartaoHTML(t) {
    return `<a class="cartao-home${t.destaque ? ' destaque' : ''}" href="#${t.id}">` +
      `<span class="cartao-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${t.icone}"/></svg></span>` +
      `<span class="cartao-texto"><strong>${esc(t.titulo)}</strong><span>${esc(t.desc)}</span></span>` +
      `<span class="cartao-rodape"><span class="cartao-qtd" data-qtd="${t.id}">—</span><span class="cartao-seta" aria-hidden="true">Abrir →</span></span></a>`;
  }

  function montarInicio() {
    $('cartoes').innerHTML = SECOES.map(([g, titulo]) =>
      `<h3 class="home-sec">${esc(titulo)}</h3><div class="cartoes-home">${TOPICOS.filter((t) => t.grupo === g).map(cartaoHTML).join('')}</div>`).join('');
  }

  function atualizarInicio() {
    const base = baseOrdens();
    TOPICOS.forEach((t) => {
      const el = document.querySelector(`[data-qtd="${t.id}"]`);
      if (!el) return;
      if (!temDados()) { el.textContent = '—'; return; }
      let n;
      if (t.id === 'ordens') n = base.length;
      else if (t.id === 'atre') n = base.reduce((s, o) => s + o.ops.filter((p) => PROBLEMA.has(p.a.sit)).length, 0);
      else n = base.filter((o) => o.esp[t.id]).length;
      el.textContent = `${n.toLocaleString('pt-BR')} ${t.unid}`;
    });
  }

  /* =====================================================================
     7. TELA ORDENS
     ===================================================================== */
  function telaOrdens(t) {
    state.esp = t.id === 'ordens' ? '' : t.id;
    $('ordens-titulo').textContent = t.titulo;
    $('ordens-desc').textContent = t.desc;
    $('ordens-vazio').hidden = temDados();
    $('ordens-conteudo').hidden = !temDados();
    if (!temDados()) return;
    const diag = $('diag-cod');
    diag.hidden = !['planejar', 'imediatas', 'smpmi'].includes(t.id);
    if (!diag.hidden) diag.textContent = diagCod();
    renderOrdens();
  }

  /* mostra o que foi lido na coluna do Cód.plan.ordem, para conferir se é a coluna certa */
  function diagCod() {
    const c = new Map();
    state.ordens.forEach((o) => { if (!o.om) return; const k = o.cod === '' ? 'vazio' : o.cod; c.set(k, (c.get(k) || 0) + 1); });
    const lista = [...c].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}: ${n}`).join(' · ');
    return `Valores lidos na coluna do Cód.plan.ordem (omcart, coluna I): ${lista || 'nenhum'}. ` +
      'Se não aparecem 0, 1 e 2, ajuste COL_COD no começo do carteira.js.';
  }

  function visiveis() {
    const busca = $('busca').value.trim().toLowerCase();
    const area = $('filtro-area').value;
    const ct = $('filtro-ct').value;
    const st = $('filtro-st').value;
    const lista = baseOrdens().filter((o) => {
      if (area === 'ct' ? !o.porCT : (area && !o.cods.includes(area))) return false;
      if (ct && !o.ops.some((p) => ctKey(p.ct) === ct)) return false;
      if (st && !(o.om && o.om.stSis === st)) return false;
      if (busca && !o.busca.includes(busca)) return false;
      if (state.esp && !o.esp[state.esp]) return false;
      return true;
    });
    if ($('ordenar').value === 'inicio') {
      lista.sort((a, b) => (a.dataBase ? a.dataBase.getTime() : Infinity) - (b.dataBase ? b.dataBase.getTime() : Infinity) || cmpNum(a.ordem, b.ordem));
    } else {
      lista.sort((a, b) => cmpNum(a.ordem, b.ordem));
    }
    return lista;
  }

  function cnpaResumo(o) {
    const m = new Map();
    o.ops.forEach((p) => { const c = p.ct || '(sem CT)'; m.set(c, (m.get(c) || 0) + 1); });
    return [...m].map(([c, n]) => `${c} (${n})`).join(', ');
  }

  function chipsHTML(o) {
    const om = o.om;
    const c = [];
    if (om && om.area) c.push(`<span class="chip">Área ${esc(om.area)}</span>`);
    if (o.porCT) c.push('<span class="chip chip-aviso" title="Fora das áreas 014/018/019, mas tem CT do seu escopo">Entrou pelo CT</span>');
    if (om && om.ct) c.push(`<span class="chip">CT ${esc(om.ct)}</span>`);
    if (om && om.stSis) c.push(`<span class="chip">${esc(om.stSis)}</span>`);
    if (om && om.stUsu) c.push(`<span class="chip">${esc(om.stUsu)}</span>`);
    if (!om) c.push('<span class="chip chip-aviso">Ordem não encontrada em omcart.xlsx</span>');
    if (state.esp === 'cnpa' && o.esp.cnpa) c.push(`<span class="chip chip-aviso">CNPA · ${o.ops.length} em aberto · CT: ${esc(cnpaResumo(o) || '—')}</span>`);
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

    if (state.esp === 'cnpa' && o.esp.cnpa) {
      html += `<div class="banner alerta"><strong>CNPA:</strong> ${o.ops.length} tarefa(s) em aberto · CTs: ${esc(cnpaResumo(o) || '—')}` +
        `<ul class="ct-lista">${o.ops.map((p) => `<li>${esc(p.op)}${p.sub ? '.' + esc(p.sub) : ''} — ${esc(p.texto)} <em>(${esc(p.ct)})</em></li>`).join('')}</ul></div>`;
    }

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
  function preencherOrdem(det) {
    const corpo = det.querySelector('.ord-corpo');
    if (!corpo || corpo.dataset.pronto) return;
    const o = state.vis.find((x) => x.k === det.dataset.k);
    if (!o) return;
    corpo.innerHTML = corpoHTML(o);
    corpo.dataset.pronto = '1';
  }

  function renderResumoOrdens(lista) {
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

  function renderOrdens() {
    const lista = visiveis();
    state.vis = lista;
    renderResumoOrdens(lista);
    $('escopo-info').textContent = state.escopo
      ? `${lista.length} de ${state.ordens.length} ordens (áreas 014, 018, 019 e CTs ${CTS.join(', ')}).`
      : `${lista.length} de ${state.ordens.length} ordens.`;
    $('lista').innerHTML = lista.length ? lista.map(ordemHTML).join('') : '<p class="vazio">Nenhuma ordem com esses filtros.</p>';
    $('lista').querySelectorAll('details[open]').forEach(preencherOrdem);
  }

  async function copiarOMs() {
    const oms = state.vis.map((o) => o.ordem);
    if (!oms.length) { avisoRapido('Nenhuma OM para copiar.'); return; }
    await copiarTexto(oms.join('\n'));
    avisoRapido(`${oms.length} OM(s) copiada(s)`);
  }

  function baixarPlanilha(cab, linhas, larguras, aba, prefixo) {
    if (typeof XLSX === 'undefined') { mostrarAviso('Biblioteca XLSX não carregou.'); return; }
    mostrarAviso('');
    const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas));
    ws['!cols'] = larguras.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, aba);
    XLSX.writeFile(wb, `${prefixo}_${hojeStr()}.xlsx`);
  }

  function gerarExcelOrdens() {
    if (!state.vis.length) { mostrarAviso('Nada para exportar com esses filtros.'); return; }
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
    baixarPlanilha(cab, linhas, [10, 8, 11, 8, 12, 36, 14, 14, 9, 8, 11, 28, 6, 6, 10, 40, 5, 8, 8, 12, 6, 5, 11, 14, 14, 11, 11, 12],
      'Carteira', 'carteira');
  }

  /* =====================================================================
     8. TELA ATREs (tarefas)
     ===================================================================== */
  function montarSelectAtre() {
    $('a-atre').innerHTML = '<option value="">Todas</option>' +
      Atre.lista.map((a) => `<option value="${a.cod}">${a.cod} · ${esc(a.titulo)}</option>`).join('');
  }

  function telaAtre() {
    $('atre-vazio').hidden = temDados();
    $('atre-conteudo').hidden = !temDados();
    if (temDados()) renderAtre();
  }

  /* tarefas relacionadas às ATREs monitoradas que passam nos filtros (menos o de situação) */
  function tarefasFiltradas() {
    const busca = $('a-busca').value.trim().toLowerCase();
    const ct = $('a-ct').value;
    const cod = $('a-atre').value;
    const out = [];
    let fora = 0;
    baseOrdens().forEach((o) => {
      o.ops.forEach((p) => {
        if (ct && ctKey(p.ct) !== ct) return;
        if (busca && !`${o.ordem} ${p.texto}`.toLowerCase().includes(busca)) return;
        if (p.a.sit === 'nenhuma') { fora++; return; }
        if (cod && p.a.primaria !== cod) return;
        out.push({ o, p });
      });
    });
    state.fora = fora;
    return out;
  }

  function contar(itens) {
    const c = { ok: 0, incorreta: 0, falta: 0, conferir: 0 };
    itens.forEach(({ p }) => { c[p.a.sit]++; });
    return c;
  }

  const passaSit = (p, sit) => !sit || (sit === 'problema' ? PROBLEMA.has(p.a.sit) : p.a.sit === sit);

  function renderAtre() {
    const todas = tarefasFiltradas();
    const c = contar(todas);
    const sit = $('a-sit').value;

    /* cartões de resumo: clicar filtra pela situação */
    const cartoes = [['', 'Tarefas analisadas', todas.length], ['problema', 'Com problema', c.incorreta + c.falta + c.conferir],
      ['incorreta', 'ATRE incorreta', c.incorreta], ['falta', 'Faltando ATRE', c.falta], ['conferir', 'A conferir', c.conferir], ['ok', 'Adequadas', c.ok]];
    $('atre-resumo').innerHTML = cartoes.map(([k, r, n]) =>
      `<button type="button" class="cartao${sit === k ? ' ativo' : ''}" data-sit="${k}"><span class="num">${n}</span><span class="rot">${esc(r)}</span></button>`).join('');

    const lista = todas.filter(({ p }) => passaSit(p, sit));
    state.tarefasVis = lista;

    const grupos = new Map();
    lista.forEach((it) => { const k = it.p.a.primaria; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(it); });
    const semFiltro = !$('a-busca').value.trim() && !$('a-ct').value && !$('a-atre').value;
    const ordem = Atre.lista.filter((a) => grupos.has(a.cod) || semFiltro).map((a) => a.cod);
    state.grupos = new Map(ordem.map((k) => [k, { cod: k, def: Atre.porCod[k], itens: grupos.get(k) || [] }]));

    $('atre-info').textContent = `${lista.length.toLocaleString('pt-BR')} tarefa(s) listada(s). ` +
      `${state.fora.toLocaleString('pt-BR')} tarefa(s) não têm relação com estas ATREs (CT e texto não se aplicam) e não aparecem. ` +
      (state.escopo ? 'Escopo: áreas 014, 018, 019 e CTs do escopo.' : 'Todas as ordens.');
    $('atre-lista').innerHTML = ordem.length
      ? ordem.map((k) => grupoAtreHTML(state.grupos.get(k), sit)).join('')
      : '<p class="vazio">Nenhuma tarefa com esses filtros.</p>';
    $('atre-lista').querySelectorAll('details[open]').forEach(preencherAtre);
  }

  function chipSit(cls, n, rotulo) { return n ? `<span class="chip ${cls}">${n} ${rotulo}</span>` : ''; }

  function grupoAtreHTML(g, sit) {
    const c = contar(g.itens);
    const n = g.itens.length;
    const chips = n
      ? chipSit('sit-incorreta', c.incorreta, 'incorreta(s)') + chipSit('sit-falta', c.falta, 'faltando') +
        chipSit('sit-conferir', c.conferir, 'a conferir') + chipSit('sit-ok', c.ok, 'adequada(s)')
      : (sit && sit !== 'ok' && sit !== ''
        ? '<span class="chip sit-ok">Nada a corrigir</span>'
        : '<span class="chip chip-aviso">Nenhuma tarefa</span>');
    return `<details class="ordem-card" data-cod="${esc(g.cod)}"${state.atreAbertas.has(g.cod) ? ' open' : ''}>` +
      `<summary><span class="ord-num">${esc(g.def.cod)}</span><span class="ord-texto">${esc(g.def.titulo)}</span>` +
      `<span class="ord-qtd">${n.toLocaleString('pt-BR')} ${n === 1 ? 'tarefa' : 'tarefas'}</span><span class="chips">${chips}</span></summary>` +
      '<div class="ord-corpo"></div></details>';
  }

  function refAtreHTML(a) {
    const v = Atre.vigencia(a);
    const selo = v.estado === 'vigente' ? 'sit-ok' : 'sit-incorreta';
    return `<div class="atre-ref"><p><strong>CTs permitidos:</strong> ${esc(a.ctsRotulo)} ` +
      `<span class="obs">(${a.todasDoCT ? 'toda tarefa desses CTs deve ter a ATRE' : 'só as tarefas em que o texto indica o serviço'})</span></p>` +
      `<p><strong>Vigência:</strong> ${esc(a.inicio)} a ${esc(a.validade)} <span class="sit ${selo}">${esc(v.rotulo)}</span></p>` +
      `<p><strong>Libera:</strong> ${esc(a.libera)}</p>` +
      (a.proibe.length ? `<p><strong>Não liberado:</strong></p><ul>${a.proibe.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
      '</div>';
  }

  /* o que fazer com a tarefa (texto simples, usado na tela e no Excel) */
  function obsTarefa(a, ct) {
    const deveria = a.esperadas.map((e) => e.cod).join(', ');
    if (a.sit === 'incorreta') {
      const regras = a.erradas.map((cod) => `${cod} só vale para ${Atre.porCod[cod].ctsRotulo}`).join('; ');
      return `ATRE ${a.erradas.join(', ')} incorreta para o CT ${ct || '(vazio)'}: ${regras}.` + (deveria ? ` Deveria ter ${deveria}.` : '');
    }
    if (a.sit === 'falta') {
      return a.esperadas.map((e) => (e.motivo === 'ct'
        ? `Deveria ter ${e.cod}: toda tarefa do CT ${ct} precisa dela.`
        : `Deveria ter ${e.cod}: CT ${ct} permitido e o texto indica o serviço.`)).join(' ');
    }
    if (a.sit === 'conferir') return `Cita ${a.declaradas.join(', ')} e o CT está certo, mas o texto não confirma o serviço.`;
    return '';
  }

  function linhaAtreHTML({ o, p }) {
    const a = p.a;
    return `<tr><td class="nowrap">${esc(o.ordem)}</td><td class="nowrap">${esc(p.op)}${p.sub ? '.' + esc(p.sub) : ''}</td>` +
      `<td class="nowrap">${esc(p.ct)}</td><td class="texto">${esc(p.texto)}</td>` +
      `<td class="nowrap">${esc(a.declaradas.join(', ') || '—')}</td>` +
      `<td><span class="sit sit-${a.sit}">${esc(SITUACAO[a.sit])}</span></td><td class="obs">${esc(obsTarefa(a, p.ct))}</td></tr>`;
  }

  /* o grupo só monta a tabela quando é aberto, e mostra PAGINA linhas por vez */
  function preencherAtre(det) {
    const corpo = det.querySelector('.ord-corpo');
    if (!corpo || corpo.dataset.pronto) return;
    const g = state.grupos.get(det.dataset.cod);
    if (!g) return;
    let html = refAtreHTML(g.def);
    if (g.itens.length) {
      const cab = ['Ordem', 'Oper.', 'CT', 'Tarefa', 'ATRE indicada', 'Situação', 'O que fazer'];
      html += `<div class="tabela-wrap"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` +
        `<tbody>${g.itens.slice(0, PAGINA).map(linhaAtreHTML).join('')}</tbody></table></div>`;
      if (g.itens.length > PAGINA) {
        html += `<button type="button" class="botao mais-linhas" data-mais="${esc(g.cod)}">Mostrar mais (${PAGINA} de ${g.itens.length.toLocaleString('pt-BR')})</button>`;
      }
    } else {
      html += '<p class="sem-ops">Nenhuma tarefa com o filtro de situação escolhido.</p>';
    }
    corpo.innerHTML = html;
    corpo.dataset.pronto = '1';
    corpo.dataset.n = PAGINA;
  }

  function mostrarMais(btn) {
    const det = btn.closest('details');
    const g = state.grupos.get(btn.dataset.mais);
    const corpo = det.querySelector('.ord-corpo');
    const n = +corpo.dataset.n;
    const prox = Math.min(n + PAGINA, g.itens.length);
    corpo.querySelector('tbody').insertAdjacentHTML('beforeend', g.itens.slice(n, prox).map(linhaAtreHTML).join(''));
    corpo.dataset.n = prox;
    if (prox >= g.itens.length) btn.remove();
    else btn.textContent = `Mostrar mais (${prox} de ${g.itens.length.toLocaleString('pt-BR')})`;
  }

  async function copiarOMsAtre() {
    const oms = [...new Set(state.tarefasVis.map(({ o }) => o.ordem))];
    if (!oms.length) { avisoRapido('Nenhuma OM para copiar.'); return; }
    await copiarTexto(oms.join('\n'));
    avisoRapido(`${oms.length} OM(s) copiada(s)`);
  }

  function gerarExcelAtre() {
    if (!state.tarefasVis.length) { mostrarAviso('Nada para exportar com esses filtros.'); return; }
    const cab = ['ATRE (grupo)', 'Ordem', 'Texto da ordem', 'Área', 'Oper.', 'SubOp', 'CenTrab', 'Txt.breve operação',
      'ATRE indicada', 'ATRE que deveria ter', 'Situação', 'O que fazer'];
    const linhas = state.tarefasVis.map(({ o, p }) => {
      const a = p.a;
      return [a.primaria, o.ordem, o.om ? o.om.texto : '', o.om ? o.om.area : '', p.op, p.sub, p.ct, p.texto,
        a.declaradas.join(', '), a.esperadas.map((e) => e.cod).join(', '), SITUACAO[a.sit], obsTarefa(a, p.ct)];
    });
    baixarPlanilha(cab, linhas, [12, 10, 36, 8, 6, 6, 10, 44, 12, 18, 16, 60], 'ATREs', 'atres');
  }

  /* =====================================================================
     9. INÍCIO DO APP (depois do login)
     ===================================================================== */
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

  function ligarLista(containerId, abertas, preencher, attr) {
    $(containerId).addEventListener('toggle', (ev) => {
      const d = ev.target;
      if (!d.dataset || !d.dataset[attr]) return;
      if (d.open) { abertas.add(d.dataset[attr]); preencher(d); } else abertas.delete(d.dataset[attr]);
    }, true);
  }

  function iniciarApp() {
    montarInicio();
    montarSelectAtre();

    $('seletor-pasta').addEventListener('change', aoEscolherPasta);
    document.querySelectorAll('.chk-escopo').forEach((c) => c.addEventListener('change', () => setEscopo(c.checked)));
    window.addEventListener('hashchange', rotear);

    /* tela Ordens */
    ['filtro-area', 'filtro-ct', 'filtro-st', 'ordenar'].forEach((id) => $(id).addEventListener('change', () => { if (temDados()) renderOrdens(); }));
    $('busca').addEventListener('input', () => { if (temDados()) renderOrdens(); });
    ligarLista('lista', state.abertas, preencherOrdem, 'k');
    $('abrir-todas').addEventListener('click', () => {
      if (state.vis.length > 150 && !confirm(`Abrir ${state.vis.length} ordens de uma vez? Pode ficar pesado.`)) return;
      state.vis.forEach((o) => state.abertas.add(o.k));
      renderOrdens();
    });
    $('fechar-todas').addEventListener('click', () => { state.abertas.clear(); renderOrdens(); });
    $('copiar-oms').addEventListener('click', copiarOMs);
    $('gerar-excel').addEventListener('click', gerarExcelOrdens);

    /* tela ATREs */
    ['a-atre', 'a-sit', 'a-ct'].forEach((id) => $(id).addEventListener('change', () => { if (temDados()) renderAtre(); }));
    $('a-busca').addEventListener('input', () => { if (temDados()) renderAtre(); });
    ligarLista('atre-lista', state.atreAbertas, preencherAtre, 'cod');
    $('atre-lista').addEventListener('click', (ev) => { const b = ev.target.closest('[data-mais]'); if (b) mostrarMais(b); });
    $('atre-resumo').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sit]');
      if (!b) return;
      $('a-sit').value = $('a-sit').value === b.dataset.sit ? '' : b.dataset.sit;
      renderAtre();
    });
    $('a-abrir').addEventListener('click', () => { state.grupos.forEach((g) => { if (g.itens.length) state.atreAbertas.add(g.cod); }); renderAtre(); });
    $('a-fechar').addEventListener('click', () => { state.atreAbertas.clear(); renderAtre(); });
    $('a-copiar').addEventListener('click', copiarOMsAtre);
    $('a-excel').addEventListener('click', gerarExcelAtre);

    aplicarRota(true);
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
