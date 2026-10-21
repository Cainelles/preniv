/* script.js — configuração e sincronização em tempo real
   Usa o Firebase Realtime Database via REST + EventSource (sem biblioteca).
   1) Crie um Realtime Database no Firebase  2) cole a URL abaixo (sem "/" no final). */
const FIREBASE_URL = 'https://planejamento-9cfd1-default-rtdb.firebaseio.com/'.replace(/\/+$/, ''); // a barra final é removida sozinha

/* Escopo: só OMs que têm os meus CTs e que estão nas áreas 014, 018 ou 019 */
const ESCOPO = {
  areas: ['14', '18', '19'],
  cts: ['AUSETU', 'CALDTU', 'CALDVAZA', 'CALDDSC', 'MANDTU', 'MANDVAZA', 'MANDDSC', 'SOLDADOR', 'SOLDVAZA', 'SOLDDSC', 'AUSEDSC']
};
function filtrarEscopo(itens, f, extras) {
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const meus = new Set(ESCOPO.cts.concat(extras || []).map(norm));
  /* área desconhecida não esconde a ordem */
  const areaOk = (s) => {
    const c = (String(s).match(/\d+/g) || []).map((x) => x.replace(/^0+/, '') || '0');
    return !c.length || c.some((x) => ESCOPO.areas.includes(x));
  };
  const ordens = new Set(itens.filter((t) => meus.has(norm(f.ct(t)))).map(f.ordem));
  return itens.filter((t) => ordens.has(f.ordem(t)) && areaOk(f.area(t)));
}

const Sync = (() => {
  const LS = { sala: 'nivelamento.sala', nome: 'nivelamento.nome', local: 'nivelamento.local:' };
  const lerLS = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const gravaLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem storage */ } };
  const limpa = (s) => String(s).trim().replace(/[.$#[\]/\s]+/g, '_');
  const sala = () => limpa(lerLS(LS.sala) || 'geral');
  const nome = () => lerLS(LS.nome);
  let tree = {}, base = '', es = null, poll = null, espera = null, cbData = () => {}, cbStatus = () => {};

  /* grava valor numa posição da árvore local (null apaga) */
  function setIn(obj, parts, val) {
    if (!parts.length) return val;
    obj = obj && typeof obj === 'object' ? obj : {};
    const filho = setIn(obj[parts[0]], parts.slice(1), val);
    if (filho === null || filho === undefined) delete obj[parts[0]]; else obj[parts[0]] = filho;
    return Object.keys(obj).length ? obj : null;
  }

  function desconectar() {
    if (es) { es.close(); es = null; }
    clearInterval(poll); clearTimeout(espera);
  }

  function conectar(semana, onData, onStatus) {
    desconectar();
    cbData = onData; cbStatus = onStatus;
    base = `acompanhamento/${sala()}/${semana}`;
    tree = {};
    if (!FIREBASE_URL) {            /* modo local: só este navegador */
      try { tree = JSON.parse(lerLS(LS.local + base)) || {}; } catch (e) { tree = {}; }
      onStatus('local'); onData(tree);
      return;
    }
    /* modo alternativo: se a conexão contínua não abrir (firewall/proxy), consulta o banco a cada 4 s */
    const iniciarPolling = () => {
      if (es) { es.close(); es = null; }
      clearInterval(poll); clearTimeout(espera);
      const buscar = async () => {
        try {
          const r = await fetch(`${FIREBASE_URL}/${base}.json`, { cache: 'no-store' });
          if (!r.ok) throw new Error(r.status);
          tree = (await r.json()) || {};
          onStatus('polling'); onData(tree);
        } catch (e) { onStatus('erro'); }
      };
      buscar();
      poll = setInterval(buscar, 4000);
    };
    let abriu = false;
    es = new EventSource(`${FIREBASE_URL}/${base}.json`);
    espera = setTimeout(() => { if (!abriu) iniciarPolling(); }, 8000);
    es.addEventListener('open', () => { abriu = true; clearTimeout(espera); onStatus('online'); });
    es.addEventListener('error', () => {
      if (!abriu && es && es.readyState === 2) iniciarPolling();   /* recusada (ex.: regras) */
      else onStatus('reconectando');
    });
    es.addEventListener('cancel', () => onStatus('erro'));
    es.addEventListener('auth_revoked', () => onStatus('erro'));
    const aplicar = (ev, mescla) => {
      try {
        const { path, data } = JSON.parse(ev.data);
        const partes = path.split('/').filter(Boolean);
        if (mescla) Object.keys(data || {}).forEach((k) => { tree = setIn(tree, [...partes, k], data[k]) || {}; });
        else tree = setIn(tree, partes, data) || {};
        onData(tree);
      } catch (e) { /* evento inválido */ }
    };
    es.addEventListener('put', (ev) => aplicar(ev, false));
    es.addEventListener('patch', (ev) => aplicar(ev, true));
  }

  /* atualiza campos de uma tarefa (aparece na hora aqui e no outro computador) */
  async function atualizar(chaveTarefa, campos) {
    const k = limpa(chaveTarefa);
    const obj = { ...campos, ts: Date.now() };
    Object.keys(obj).forEach((f) => { tree = setIn(tree, [k, f], obj[f]) || {}; });
    cbData(tree);
    if (!FIREBASE_URL) { gravaLS(LS.local + base, JSON.stringify(tree)); return; }
    try {
      const r = await fetch(`${FIREBASE_URL}/${base}/${k}.json`, { method: 'PATCH', body: JSON.stringify(obj) });
      if (!r.ok) throw new Error(r.status);
    } catch (e) { cbStatus('erro'); }
  }

  /* teste rápido de acesso ao banco: { ok } ou { ok:false, motivo: 'regras' | 'url' | 'rede' | 'http NNN' } */
  async function testar() {
    if (!FIREBASE_URL) return { ok: true, local: true };
    try {
      const r = await fetch(`${FIREBASE_URL}/acompanhamento/${sala()}.json?shallow=true`, { cache: 'no-store' });
      if (r.ok) return { ok: true };
      return { ok: false, motivo: r.status === 401 || r.status === 403 ? 'regras' : r.status === 404 ? 'url' : 'http ' + r.status };
    } catch (e) { return { ok: false, motivo: 'rede' }; }
  }

  /* leitura única dos apontamentos da semana (para o Excel do nivelamento) */
  async function lerAcomp(semana) {
    const caminho = `acompanhamento/${sala()}/${semana}`;
    if (!FIREBASE_URL) { try { return JSON.parse(lerLS(LS.local + caminho)) || {}; } catch (e) { return {}; } }
    try {
      const r = await fetch(`${FIREBASE_URL}/${caminho}.json`, { cache: 'no-store' });
      return r.ok ? ((await r.json()) || {}) : {};
    } catch (e) { return {}; }
  }

  return {
    configurado: !!FIREBASE_URL, limpa, sala, nome, conectar, atualizar, testar, lerAcomp,
    setSala: (v) => gravaLS(LS.sala, limpa(v)), setNome: (v) => gravaLS(LS.nome, String(v).trim())
  };
})();

/* ---- Pasta compartilhada: lê as planilhas uma vez e guarda no navegador (IndexedDB) ---- */
const Pasta = (() => {
  const NOMES = ['diario', 'tarefas', 'ordens', 'atual'];
  const abrir = () => new Promise((res, rej) => {
    const r = indexedDB.open('nivelamento-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (modo, fn) => {
    const db = await abrir();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', modo);
      const rq = fn(t.objectStore('kv'));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
    });
  };
  const ler = () => tx('readonly', (st) => st.get('pasta')).catch(() => null);

  /* substituir=true troca tudo; senão só atualiza as planilhas informadas. extra = { versoes, quando, por } */
  async function salvar(dados, substituir, extra) {
    const antigo = substituir ? null : await ler();
    const d = {};
    NOMES.forEach((k) => { d[k] = dados[k] || (antigo && antigo.dados[k]) || null; });
    const e = extra || {};
    const novo = { dados: d, quando: e.quando || Date.now(), por: e.por || '',
      versoes: { ...((antigo && antigo.versoes) || {}), ...(e.versoes || {}) } };
    await tx('readwrite', (st) => st.put(novo, 'pasta'));
    return novo;
  }
  const limpar = () => tx('readwrite', (st) => st.delete('pasta')).catch(() => null);

  function rotulo(quando) {
    const d = new Date(quando);
    const p2 = (n) => String(n).padStart(2, '0');
    const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    return d.toDateString() === new Date().toDateString() ? `hoje às ${hora}` : `em ${p2(d.getDate())}/${p2(d.getMonth() + 1)} às ${hora}`;
  }

  function lerPlanilha(arquivo) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') return reject(new Error('Biblioteca XLSX não carregou'));
      const l = new FileReader();
      l.onerror = () => reject(new Error('Não consegui abrir ' + arquivo.name));
      l.onload = () => {
        try {
          const wb = XLSX.read(l.result, { type: 'array', cellDates: true });
          let linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
          linhas = linhas.filter((r) => r.some((c) => String(c).trim() !== ''));
          if (linhas.length && !linhas[0].some((c) => typeof c === 'number' || /^\d+$/.test(String(c).trim()))) linhas.shift();
          resolve(linhas);
        } catch (e) { reject(e); }
      };
      l.readAsArrayBuffer(arquivo);
    });
  }

  /* lê os arquivos da pasta escolhida e devolve { dados, achados } */
  async function lerArquivos(arquivos) {
    const lista = Array.from(arquivos || []).filter((f) => (f.webkitRelativePath || f.name).split('/').length <= 2);
    const dados = {};
    const achados = [];
    for (const nome of NOMES) {
      const f = lista.find((x) => new RegExp(`^${nome}\\.(xlsx|xls|xlsm|csv)$`, 'i').test(x.name));
      dados[nome] = f ? await lerPlanilha(f) : null;
      if (f) achados.push(`${nome}: ${dados[nome].length} linhas`);
    }
    return { dados, achados };
  }

  /* ---- Nuvem: as planilhas ficam no Firebase (compactadas) e todos recebem automaticamente ---- */
  const raiz = () => `${FIREBASE_URL}/planilhas/${Sync.sala()}`;
  const trocaData = function (k, v) { const o = this[k]; return o instanceof Date ? '@D:' + o.getTime() : v; };
  const voltaData = (k, v) => (typeof v === 'string' && v.startsWith('@D:') ? new Date(+v.slice(3)) : v);

  async function http(url, opcoes) {
    const r = await fetch(url, { cache: 'no-store', ...opcoes });
    if (r.status === 401 || r.status === 403) throw new Error('o Firebase recusou o acesso às planilhas. Publique as regras novas (bloco "planilhas")');
    if (!r.ok) throw new Error('o Firebase respondeu ' + r.status);
    return r.json();
  }

  async function comprimir(texto) {
    if (typeof CompressionStream === 'undefined') return { fmt: 'raw', texto };
    const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(fluxo).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { fmt: 'gz', texto: btoa(bin) };
  }

  async function descomprimir(pacote) {
    if (pacote.fmt !== 'gz') return pacote.texto;
    if (typeof DecompressionStream === 'undefined') throw new Error('este navegador não descompacta os dados; use um navegador mais novo');
    const buf = Uint8Array.from(atob(pacote.texto), (c) => c.charCodeAt(0));
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }

  async function publicar(dados) {
    const metas = {};
    for (const nome of NOMES) {
      if (!dados[nome]) continue;
      const pacote = await comprimir(JSON.stringify(dados[nome], trocaData));
      await http(`${raiz()}/dados/${nome}.json`, { method: 'PUT', body: JSON.stringify(pacote) });
      metas[nome] = { quando: Date.now(), por: Sync.nome(), linhas: dados[nome].length };
      await http(`${raiz()}/meta/${nome}.json`, { method: 'PUT', body: JSON.stringify(metas[nome]) });
    }
    return metas;
  }

  async function baixar(nome) {
    const pacote = await http(`${raiz()}/dados/${nome}.json`);
    return pacote ? JSON.parse(await descomprimir(pacote), voltaData) : null;
  }

  /* baixa só as planilhas que mudaram na nuvem desde a última vez */
  async function sincronizar() {
    const local = await ler();
    if (!FIREBASE_URL) return { reg: local, mudou: false };
    const m = (await http(`${raiz()}/meta.json`)) || {};
    const versoes = (local && local.versoes) || {};
    const novos = {};
    const nv = {};
    for (const nome of NOMES) {
      if (m[nome] && m[nome].quando !== versoes[nome]) { novos[nome] = await baixar(nome); nv[nome] = m[nome].quando; }
    }
    if (!Object.keys(novos).length) return { reg: local, mudou: false };
    const ultima = Object.values(m).sort((a, b) => b.quando - a.quando)[0];
    return { reg: await salvar(novos, false, { versoes: nv, quando: ultima.quando, por: ultima.por }), mudou: true };
  }

  /* mostra o que já está neste computador e depois confere a nuvem */
  async function carregar(onDados, onAviso) {
    const local = await ler();
    if (local) onDados(local);
    if (!FIREBASE_URL) return;
    try {
      const { reg, mudou } = await sincronizar();
      if (mudou) onDados(reg);
    } catch (e) { if (onAviso) onAviso('Não consegui buscar as planilhas da nuvem: ' + e.message); }
  }

  /* guarda neste computador e envia para a nuvem (se configurada) */
  async function aplicar(dados, substituir) {
    await salvar(dados, substituir && !FIREBASE_URL);
    if (!FIREBASE_URL) return ler();
    const metas = await publicar(dados);
    const versoes = {};
    Object.keys(metas).forEach((k) => { versoes[k] = metas[k].quando; });
    return salvar({}, false, { versoes, quando: Date.now(), por: Sync.nome() });
  }

  const descricao = (p) => `${FIREBASE_URL ? 'Atualizada' : 'Carregada'} ${rotulo(p.quando)}${p.por ? ' por ' + p.por : ''}`;

  return { ler, salvar, aplicar, carregar, limpar, rotulo, descricao, lerArquivos };
})();

/* Página inicial: quem atualiza escolhe a pasta; todos os outros recebem da nuvem */
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('seletor-pasta-home');
  if (!sel) return;
  const card = document.getElementById('card-pasta');
  const estado = card.querySelector('[data-estado]');
  const aviso = document.getElementById('aviso');
  const btn = document.getElementById('limpar-pasta');
  const salaEl = document.getElementById('sala-home');
  const nomeEl = document.getElementById('nome-home');
  const padrao = estado.textContent;
  const msg = (t) => { aviso.textContent = t || ''; aviso.hidden = !t; };
  salaEl.value = Sync.sala();
  nomeEl.value = Sync.nome();

  const mostrar = (p) => {
    if (!p) { btn.hidden = true; return; }
    const achados = Object.keys(p.dados).filter((k) => p.dados[k]).map((k) => `${k}: ${p.dados[k].length} linhas`);
    estado.textContent = `${Pasta.descricao(p)} · ${achados.join(' | ')}`;
    card.classList.add('ok');
    btn.hidden = false;
  };
  const iniciar = () => Pasta.carregar(mostrar, msg);
  iniciar();

  const escolher = async (input) => {
    const arquivos = Array.from(input.files || []);
    input.value = '';
    if (!arquivos.length) return;
    msg('');
    estado.textContent = 'Lendo planilhas…';
    try {
      const { dados, achados } = await Pasta.lerArquivos(arquivos);
      if (!achados.length) { msg('Não encontrei diario, tarefas, ordens ou atual (.xlsx) nessa pasta.'); estado.textContent = 'Nada encontrado'; return; }
      const faltam = ['diario', 'tarefas', 'atual'].filter((k) => !dados[k]);
      if (faltam.length) msg(`Atenção: não encontrei ${faltam.join(', ')} na pasta.`);
      estado.textContent = Sync.configurado ? 'Enviando para a nuvem…' : 'Guardando…';
      mostrar(await Pasta.aplicar(dados, true));
    } catch (e) {
      msg('Erro: ' + e.message + (Sync.configurado ? '. Se a pasta foi lida, os dados ficaram só neste computador.' : ''));
      estado.textContent = 'Erro ao enviar';
      Pasta.ler().then(mostrar);
    }
  };
  sel.addEventListener('change', () => escolher(sel));
  const selArq = document.getElementById('seletor-arquivos-home');
  if (selArq) selArq.addEventListener('change', () => escolher(selArq));

  btn.addEventListener('click', async () => {
    await Pasta.limpar();
    card.classList.remove('ok');
    estado.textContent = padrao;
    btn.hidden = true;
    msg(Sync.configurado ? 'Limpei só este computador. Os dados da nuvem continuam e voltam ao recarregar.' : '');
  });

  salaEl.addEventListener('change', async () => {
    Sync.setSala(salaEl.value);
    salaEl.value = Sync.sala();
    await Pasta.limpar();
    card.classList.remove('ok');
    estado.textContent = padrao;
    btn.hidden = true;
    iniciar();
  });
  nomeEl.addEventListener('change', () => Sync.setNome(nomeEl.value));
});

/* Página inicial: mostra se a sincronização está configurada */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (!Sync.configurado) { el.textContent = 'Modo local (sem sincronização)'; el.classList.add('local'); return; }
  Sync.testar().then((r) => {
    const msg = { regras: 'Firebase recusou (regras)', url: 'URL do Firebase incorreta', rede: 'Sem acesso ao Firebase' };
    el.textContent = r.ok ? 'Tempo real disponível' : (msg[r.motivo] || 'Erro no Firebase (' + r.motivo + ')');
    el.classList.add(r.ok ? 'online' : 'erro');
  });
});
