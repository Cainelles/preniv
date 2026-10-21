/* script.js — configuração e sincronização em tempo real
   Usa o Firebase Realtime Database via REST + EventSource (sem biblioteca).
   1) Crie um Realtime Database no Firebase  2) cole a URL abaixo (sem "/" no final). */
const FIREBASE_URL = 'https://planejamento-9cfd1-default-rtdb.firebaseio.com/'.replace(/\/+$/, ''); // a barra final é removida sozinha

const Sync = (() => {
  const LS = { sala: 'nivelamento.sala', nome: 'nivelamento.nome', local: 'nivelamento.local:' };
  const lerLS = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const gravaLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem storage */ } };
  const limpa = (s) => String(s).trim().replace(/[.$#[\]/\s]+/g, '_');
  const sala = () => limpa(lerLS(LS.sala) || 'geral');
  const nome = () => lerLS(LS.nome);
  let tree = {}, base = '', es = null, cbData = () => {}, cbStatus = () => {};

  /* grava valor numa posição da árvore local (null apaga) */
  function setIn(obj, parts, val) {
    if (!parts.length) return val;
    obj = obj && typeof obj === 'object' ? obj : {};
    const filho = setIn(obj[parts[0]], parts.slice(1), val);
    if (filho === null || filho === undefined) delete obj[parts[0]]; else obj[parts[0]] = filho;
    return Object.keys(obj).length ? obj : null;
  }

  function desconectar() { if (es) { es.close(); es = null; } }

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
    es = new EventSource(`${FIREBASE_URL}/${base}.json`);
    es.addEventListener('open', () => onStatus('online'));
    es.addEventListener('error', () => onStatus('reconectando'));
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

  return {
    configurado: !!FIREBASE_URL, limpa, sala, nome, conectar, atualizar,
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

  /* substituir=true troca tudo; senão só atualiza as planilhas informadas */
  async function salvar(dados, substituir) {
    const antigo = substituir ? null : await ler();
    const d = {};
    NOMES.forEach((k) => { d[k] = dados[k] || (antigo && antigo.dados[k]) || null; });
    const novo = { dados: d, quando: Date.now() };
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

  return { ler, salvar, limpar, rotulo, lerArquivos };
})();

/* Página inicial: escolher a pasta uma vez e mostrar se a sincronização está ativa */
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('seletor-pasta-home');
  if (!sel) return;
  const card = document.getElementById('card-pasta');
  const estado = card.querySelector('[data-estado]');
  const aviso = document.getElementById('aviso');
  const btn = document.getElementById('limpar-pasta');
  const msg = (t) => { aviso.textContent = t || ''; aviso.hidden = !t; };

  const mostrar = (p) => {
    if (!p) { btn.hidden = true; return; }
    const achados = Object.keys(p.dados).filter((k) => p.dados[k]).map((k) => `${k}: ${p.dados[k].length} linhas`);
    estado.textContent = `Carregada ${Pasta.rotulo(p.quando)} · ${achados.join(' | ')}`;
    card.classList.add('ok');
    btn.hidden = false;
  };
  Pasta.ler().then(mostrar);

  sel.addEventListener('change', async () => {
    const arquivos = Array.from(sel.files || []);
    sel.value = '';
    if (!arquivos.length) return;
    estado.textContent = 'Carregando planilhas…';
    try {
      const { dados, achados } = await Pasta.lerArquivos(arquivos);
      if (!achados.length) { msg('Não encontrei diario, tarefas, ordens ou atual (.xlsx) nessa pasta.'); estado.textContent = 'Nada encontrado'; return; }
      const faltam = ['diario', 'tarefas', 'atual'].filter((k) => !dados[k]);
      msg(faltam.length ? `Atenção: não encontrei ${faltam.join(', ')}. As páginas que dependem deles não vão carregar.` : '');
      mostrar(await Pasta.salvar(dados, true));
    } catch (e) { msg('Erro ao carregar a pasta: ' + e.message); estado.textContent = 'Erro ao ler'; }
  });

  btn.addEventListener('click', async () => {
    await Pasta.limpar();
    card.classList.remove('ok');
    estado.textContent = 'Escolha uma vez aqui e as outras páginas carregam sozinhas';
    btn.hidden = true;
    msg('');
  });
});

/* Página inicial: mostra se a sincronização está configurada */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = Sync.configurado ? 'Tempo real ativo' : 'Modo local (sem sincronização)';
  el.classList.add(Sync.configurado ? 'online' : 'local');
});
