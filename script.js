// =========================================================================
// 1. CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// =========================================================================

const COLUNAS_DIARIO = {
  OM: 1,      // Coluna B
  CT: 2,      // Coluna C
  OP: 4,      // Coluna E
  SUBOP: 5,   // Coluna F
  TEXTO: 6,   // Coluna G
  HH: 7       // Coluna H
};

const COLUNAS_TEMPO = {
  OM: 1,          // Coluna B
  OP: 2,          // Coluna C
  SUBOP: 3,       // Coluna D
  EXECUTANTES: 6, // Coluna G
  HH: 7,          // Coluna H
  TRABALHO: 8     // Coluna I
};

let recursosPorCT = {};
let rawDiarioData = [];
let rawTempoData  = [];
let ctsSelecionadosParaPorcentagem = new Set();
let dadosCruzadosGlobais = [];

let abaAtiva = 'om';

// =========================================================================
// 2. FUNÇÃO PARA ABRIR/FECHAR OS CARDS (COLLAPSIBLE)
// =========================================================================
function toggleCard(element) {
  const card = element.closest('.om-card');
  if (card) {
    card.classList.toggle('collapsed');
  }
}

// =========================================================================
// 3. LEITURA AUTOMÁTICA DOS ARQUIVOS .TXT NA MESMA PASTA
// =========================================================================
async function carregarArquivosDaPasta() {
  const statusBadge = document.getElementById('status-update');
  if (statusBadge) statusBadge.innerText = 'Carregando dados dos arquivos .txt...';

  try {
    // 1. Lê o arquivo do Diário (ex: diario.txt)
    const respostaDiario = await fetch('diario.txt');
    if (!respostaDiario.ok) {
      throw new Error('Não foi possível encontrar o arquivo diario.txt na pasta.');
    }
    const textoDiario = await respostaDiario.text();
    rawDiarioData = textoDiario.split('\n').map(linha => linha.split('\t'));

    // 2. Lê o arquivo de Tempo opcional (ex: tempo.txt)
    try {
      const respostaTempo = await fetch('tempo.txt');
      if (respostaTempo.ok) {
        const textoTempo = await respostaTempo.text();
        rawTempoData = textoTempo.split('\n').map(linha => linha.split('\t'));
      }
    } catch (e) {
      console.log('Arquivo tempo.txt não encontrado ou não utilizado.');
    }

    atualizarDadosProcessados();

    if (statusBadge) {
      statusBadge.innerText = 'Dados carregados automaticamente dos TXT!';
    }
  } catch (err) {
    console.error(err);
    if (statusBadge) {
      statusBadge.innerText = 'Erro: Coloque o arquivo diario.txt na pasta.';
    }
  }
}

function atualizarDadosProcessados() {
  if (rawDiarioData.length === 0) {
    renderizarMensagemAguardando();
    return;
  }

  dadosCruzadosGlobais = processarDadosDinamico(rawDiarioData, rawTempoData);
  inicializarFiltrosEInputs(dadosCruzadosGlobais);
  recalcularTudo();
}

// =========================================================================
// 4. PROCESSAMENTO DOS DADOS
// =========================================================================
function processarDadosDinamico(diario, tempo) {
  if (!diario || !Array.isArray(diario) || diario.length === 0) return [];

  const mapaTempo = {};
  if (tempo && Array.isArray(tempo) && tempo.length > 0) {
    for (let j = 0; j < tempo.length; j++) {
      const r = tempo[j];
      if (!Array.isArray(r)) continue;

      const ordem = String(r[COLUNAS_TEMPO.OM] || '').trim();
      const op    = String(r[COLUNAS_TEMPO.OP] || '').trim();
      const subOp = String(r[COLUNAS_TEMPO.SUBOP] || '').trim();
      const key   = `${ordem}_${op}_${subOp}`;

      mapaTempo[key] = {
        executantes: parseFloat(r[COLUNAS_TEMPO.EXECUTANTES]) || 1,
        hh:          parseFloat(r[COLUNAS_TEMPO.HH]) || 0,
        trabalho:    parseFloat(r[COLUNAS_TEMPO.TRABALHO]) || 0
      };
    }
  }

  const tarefas = [];
  for (let i = 0; i < diario.length; i++) {
    const r = diario[i];
    if (!Array.isArray(r)) continue;

    const ordem      = String(r[COLUNAS_DIARIO.OM] || '').trim();
    const ct         = String(r[COLUNAS_DIARIO.CT] || '').trim();
    const op         = String(r[COLUNAS_DIARIO.OP] || '').trim();
    const subOp      = String(r[COLUNAS_DIARIO.SUBOP] || '').trim();
    const textoBreve = String(r[COLUNAS_DIARIO.TEXTO] || '').trim();
    const hhFallback = parseFloat(r[COLUNAS_DIARIO.HH]) || 0;

    if (!ordem || ordem.toLowerCase().includes('ordem') || ordem.toLowerCase().includes('om')) {
      continue;
    }

    const key = `${ordem}_${op}_${subOp}`;
    const infoTempo = mapaTempo[key] || { executantes: 1, hh: hhFallback, trabalho: hhFallback };

    tarefas.push({
      ordem,
      ct,
      operacao: op,
      subOperacao: subOp,
      textoBreve,
      executantes: infoTempo.executantes,
      hh: infoTempo.hh,
      trabalho: infoTempo.trabalho
    });
  }

  return tarefas;
}

// =========================================================================
// 5. INTERFACE DADOS E CONTROLES
// =========================================================================
function inicializarFiltrosEInputs(tarefas) {
  const todosCTs = [...new Set(tarefas.map(t => t.ct).filter(Boolean))].sort();

  todosCTs.forEach(ct => {
    if (recursosPorCT[ct] === undefined) {
      recursosPorCT[ct] = 1;
    }
  });

  const chkContainer = document.getElementById('ct-checkboxes');
  if (chkContainer) {
    let html = `
      <div style="margin-bottom: 12px; display: flex; gap: 8px;">
        <button type="button" onclick="selecionarTodosCTs(true)" style="padding:5px 10px; font-size:0.8rem; cursor:pointer;">Marcar Todos</button>
        <button type="button" onclick="selecionarTodosCTs(false)" style="padding:5px 10px; font-size:0.8rem; cursor:pointer;">Desmarcar Todos</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
    `;

    todosCTs.forEach(ct => {
      const checked = ctsSelecionadosParaPorcentagem.has(ct) ? 'checked' : '';
      html += `
        <label class="ct-checkbox-label" style="background:#fff; padding:6px 12px; border-radius:6px; border:1px solid #ccc; display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" value="${ct}" ${checked} onchange="toggleCTSelecao('${ct}', this.checked)">
          <strong>${ct}</strong>
        </label>
      `;
    });

    html += `</div>`;
    chkContainer.innerHTML = html;
  }

  renderizarInputsRecursos();
}

function renderizarInputsRecursos() {
  const resContainer = document.getElementById('ct-resources-container');
  if (!resContainer) return;

  resContainer.innerHTML = '';

  if (ctsSelecionadosParaPorcentagem.size === 0) {
    resContainer.innerHTML = `<div style="color:#777; font-size:0.85rem; font-style:italic;">Abra o Card 3 e selecione os CTs para definir a quantidade de pessoas.</div>`;
    return;
  }

  Array.from(ctsSelecionadosParaPorcentagem).sort().forEach(ct => {
    const row = document.createElement('div');
    row.className = 'ct-resource-row';
    row.style = "display:flex; align-items:center; gap:10px; margin-bottom:8px;";
    row.innerHTML = `
      <span style="font-size:0.88rem; font-weight:bold; width:120px; color:#0056b3;">
        ${ct}:
      </span>
      <input type="number" min="0" value="${recursosPorCT[ct] || 1}" onchange="atualizarRecurso('${ct}', this.value)" style="width:70px; padding:4px; border:1px solid #ccc; border-radius:4px;">
      <span style="font-size:0.8rem; color:#666;">executante(s)</span>
    `;
    resContainer.appendChild(row);
  });
}

function selecionarTodosCTs(marcar) {
  ctsSelecionadosParaPorcentagem.clear();
  const checkboxes = document.querySelectorAll('#ct-checkboxes input[type="checkbox"]');
  checkboxes.forEach(chk => {
    chk.checked = marcar;
    if (marcar) ctsSelecionadosParaPorcentagem.add(chk.value);
  });
  renderizarInputsRecursos();
  recalcularTudo();
}

function toggleCTSelecao(ct, checked) {
  if (checked) {
    ctsSelecionadosParaPorcentagem.add(ct);
  } else {
    ctsSelecionadosParaPorcentagem.delete(ct);
  }
  renderizarInputsRecursos();
  recalcularTudo();
}

function atualizarRecurso(ct, val) {
  recursosPorCT[ct] = parseFloat(val) || 0;
  recalcularTudo();
}

function alternarAba(aba) {
  abaAtiva = aba;
  const btnOM = document.getElementById('btn-aba-om');
  const btnCT = document.getElementById('btn-aba-ct');

  if (aba === 'om') {
    if (btnOM) btnOM.className = 'tab-btn active';
    if (btnCT) btnCT.className = 'tab-btn';
  } else {
    if (btnOM) btnOM.className = 'tab-btn';
    if (btnCT) btnCT.className = 'tab-btn active';
  }

  recalcularTudo();
}

function obterEstiloBarraProgresso(pct) {
  let cor = '#28a745'; 
  let textoStatus = 'Ideal';
  
  if (pct > 105) {
    cor = '#dc3545'; 
    textoStatus = 'Sobrecarga (>105%)';
  } else if (pct > 100) {
    cor = '#fd7e14'; 
    textoStatus = 'Atenção (100-105%)';
  } else if (pct >= 75) {
    cor = '#28a745'; 
    textoStatus = 'Ótimo Aproveitamento';
  } else if (pct >= 40) {
    cor = '#17a2b8'; 
    textoStatus = 'Carga Moderada';
  } else {
    cor = '#6c757d'; 
    textoStatus = 'Subutilizado';
  }

  return { cor, textoStatus };
}

// =========================================================================
// 6. CÁLCULO DE CAPACIDADE E RENDERIZAÇÃO
// =========================================================================
function recalcularTudo() {
  const inputHoras = document.getElementById('hours-per-day');
  const inputDias  = document.getElementById('work-days');

  const horasPorDia = inputHoras ? parseFloat(inputHoras.value) || 8.8 : 8.8;
  const diasUteis   = inputDias  ? parseFloat(inputDias.value)  || 5 : 5;
  const horasPorPessoa = horasPorDia * diasUteis;

  const omsMap = {};
  const ctsMap = {};

  dadosCruzadosGlobais.forEach(t => {
    const hhCalculado = (t.trabalho && t.trabalho > 0) ? t.trabalho : (t.executantes * t.hh);

    if (!omsMap[t.ordem]) {
      omsMap[t.ordem] = { ordem: t.ordem, tarefas: [], hhPorCT: {}, hhSelecionado: 0 };
    }
    omsMap[t.ordem].tarefas.push(t);
    omsMap[t.ordem].hhPorCT[t.ct] = (omsMap[t.ordem].hhPorCT[t.ct] || 0) + hhCalculado;

    if (ctsSelecionadosParaPorcentagem.has(t.ct)) {
      omsMap[t.ordem].hhSelecionado += hhCalculado;
    }

    if (!ctsMap[t.ct]) {
      ctsMap[t.ct] = { ct: t.ct, tarefas: [], totalHH: 0, omsContadas: new Set() };
    }
    ctsMap[t.ct].tarefas.push(t);
    ctsMap[t.ct].totalHH += hhCalculado;
    ctsMap[t.ct].omsContadas.add(t.ordem);
  });

  const resumosPorCT = [];
  Array.from(ctsSelecionadosParaPorcentagem).sort().forEach(ct => {
    const pessoas = recursosPorCT[ct] !== undefined ? recursosPorCT[ct] : 1;
    const capacidade = pessoas * horasPorPessoa;
    const demanda = ctsMap[ct] ? ctsMap[ct].totalHH : 0;
    const saldo = capacidade - demanda;
    const ocupacao = capacidade > 0 ? (demanda / capacidade) * 100 : 0;

    resumosPorCT.push({
      ct,
      pessoas,
      capacidade,
      demanda,
      saldo,
      ocupacao
    });
  });

  renderizarResumosPorCT(resumosPorCT);

  if (abaAtiva === 'om') {
    renderizarListaOMs(Object.values(omsMap));
  } else {
    renderizarListaCTs(ctsMap, horasPorPessoa);
  }
}

function renderizarResumosPorCT(resumosPorCT) {
  const container = document.getElementById('capacity-summary-container');
  if (!container) return;

  if (resumosPorCT.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background:#fff3cd; color:#856404; padding:15px; border-radius:8px; border:1px solid #ffeeba; text-align:center;">
        <strong>Nenhum CT selecionado.</strong> Abra o card "3. Filtrar CTs" e marque as opções desejadas para visualizar o cálculo individual.
      </div>
    `;
    return;
  }

  let html = '';
  resumosPorCT.forEach(item => {
    const pct = parseFloat(item.ocupacao.toFixed(1));
    const { cor, textoStatus } = obterEstiloBarraProgresso(pct);
    const larguraBarra = Math.min(pct, 100);

    html += `
      <div style="background:#fff; border:1px solid #dcdcdc; border-radius:10px; padding:18px; margin-bottom:20px; box-shadow:0 3px 6px rgba(0,0,0,0.06);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; color:#0056b3; font-size:1.15rem; display:flex; align-items:center; gap:8px;">
            🏢 <strong>${item.ct}</strong> 
            <span style="font-size:0.85rem; color:#666; font-weight:normal; background:#f0f0f0; padding:2px 8px; border-radius:12px;">
              ${item.pessoas} executante(s)
            </span>
          </h3>
          <span style="font-size:0.9rem; font-weight:bold; color:${cor}; background: ${cor}15; padding:4px 12px; border-radius:15px; border: 1px solid ${cor}40;">
            ${textoStatus}
          </span>
        </div>

        <div style="margin-bottom:15px;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:bold; margin-bottom:5px; color:#444;">
            <span>Progresso da Carga</span>
            <span style="color:${cor}; font-size:1rem;">${pct}%</span>
          </div>
          <div style="width:100%; height:18px; background-color:#e9ecef; border-radius:10px; overflow:hidden; position:relative; border: 1px solid #ccc;">
            <div style="width:${larguraBarra}%; height:100%; background-color:${cor}; transition: width 0.4s ease; border-radius:${pct >= 100 ? '10px' : '10px 0 0 10px'};"></div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
          <div style="background:#f8f9fa; padding:10px 12px; border-radius:6px; border-left:4px solid #0056b3;">
            <div style="font-size:0.75rem; color:#666; text-transform:uppercase; font-weight:bold;">Capacidade</div>
            <div style="font-size:1.1rem; font-weight:bold; color:#0056b3;">${item.capacidade.toFixed(1)} h</div>
          </div>
          <div style="background:#f8f9fa; padding:10px 12px; border-radius:6px; border-left:4px solid #ff9800;">
            <div style="font-size:0.75rem; color:#666; text-transform:uppercase; font-weight:bold;">Horas Agendadas</div>
            <div style="font-size:1.1rem; font-weight:bold; color:#e65100;">${item.demanda.toFixed(1)} h</div>
          </div>
          <div style="background:#f8f9fa; padding:10px 12px; border-radius:6px; border-left:4px solid ${item.saldo < 0 ? '#dc3545' : '#17a2b8'};">
            <div style="font-size:0.75rem; color:#666; text-transform:uppercase; font-weight:bold;">Saldo Restante</div>
            <div style="font-size:1.1rem; font-weight:bold; color:${item.saldo < 0 ? '#dc3545' : '#0056b3'};">${item.saldo.toFixed(1)} h</div>
          </div>
          <div style="background:#f8f9fa; padding:10px 12px; border-radius:6px; border-left:4px solid ${cor};">
            <div style="font-size:0.75rem; color:#666; text-transform:uppercase; font-weight:bold;">Ocupação (%)</div>
            <div style="font-size:1.1rem; font-weight:bold; color:${cor};">${pct}%</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderizarMensagemAguardando() {
  const container = document.getElementById('om-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-box" style="text-align: center; padding: 40px; background: #eef6ff; border: 1px dashed #0056b3; border-radius: 8px;">
      <h3 style="color: #0056b3; margin-top:0;">📂 Arquivo diario.txt não encontrado</h3>
      <p style="color: #555;">Crie um arquivo chamado <strong>diario.txt</strong> na mesma pasta e cole os dados nele.</p>
    </div>
  `;
}

// -------------------------------------------------------------------------
// VISÃO 1: AGRUPADO POR OM (ORDEM CORRIGIDA)
// -------------------------------------------------------------------------
function renderizarListaOMs(listaOMs) {
  const container = document.getElementById('om-list-container');
  if (!container) return;

  container.innerHTML = '';

  if (listaOMs.length === 0) {
    renderizarMensagemAguardando();
    return;
  }

  if (ctsSelecionadosParaPorcentagem.size > 0) {
    listaOMs.sort((a, b) => {
      if (b.hhSelecionado !== a.hhSelecionado) {
        return b.hhSelecionado - a.hhSelecionado;
      }
      return a.ordem.localeCompare(b.ordem);
    });
  }

  listaOMs.forEach(om => {
    const card = document.createElement('div');
    card.className = 'om-card collapsed';

    const temHorasSelecionadas = om.hhSelecionado > 0;
    const estiloCardBorder = temHorasSelecionadas ? 'border-left: 6px solid #28a745;' : 'border-left: 6px solid #ccc; opacity:0.85;';

    let badgesHTML = '';
    Object.keys(om.hhPorCT).forEach(ct => {
      const hh = om.hhPorCT[ct].toFixed(1);
      const estaNoCalculo = ctsSelecionadosParaPorcentagem.has(ct);
      const estiloBadge = estaNoCalculo 
        ? 'border-color:#28a745; background:#e8f5e9; color:#28a745; font-weight:bold;' 
        : 'border-color:#ddd; background:#f5f5f5; color:#999; opacity:0.7;';

      badgesHTML += `<div class="ct-badge" style="${estiloBadge}">${ct}: ${hh}h</div>`;
    });

    let linhasTarefasHTML = '';
    const tarefasOrdenadas = [...om.tarefas].sort((a, b) => {
      const aSel = ctsSelecionadosParaPorcentagem.has(a.ct) ? 1 : 0;
      const bSel = ctsSelecionadosParaPorcentagem.has(b.ct) ? 1 : 0;
      if (bSel !== aSel) return bSel - aSel;

      if (a.operacao !== b.operacao) {
        return a.operacao.localeCompare(b.operacao, undefined, { numeric: true });
      }
      if (a.subOperacao !== b.subOperacao) {
        return a.subOperacao.localeCompare(b.subOperacao, undefined, { numeric: true });
      }
      return a.ct.localeCompare(b.ct);
    });

    tarefasOrdenadas.forEach(t => {
      const hhTotal = (t.trabalho && t.trabalho > 0) ? t.trabalho : (t.executantes * t.hh);
      const estaNoCalculo = ctsSelecionadosParaPorcentagem.has(t.ct);
      const estiloLinha = estaNoCalculo ? 'style="background-color:#f0fff4; font-weight:500;"' : 'style="opacity:0.4; background-color:#fcfcfc;"';

      linhasTarefasHTML += `
        <tr ${estiloLinha}>
          <td>${t.operacao}</td>
          <td>${t.subOperacao}</td>
          <td><strong>${t.ct}</strong> ${estaNoCalculo ? '✔' : ''}</td>
          <td>${t.textoBreve}</td>
          <td>${t.executantes}</td>
          <td>${t.hh} h</td>
          <td><strong>${hhTotal.toFixed(1)} h</strong></td>
        </tr>
      `;
    });

    const badgeDestaqueOM = temHorasSelecionadas 
      ? `<span style="background:#e8f5e9; color:#28a745; border:1px solid #28a745; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:bold;">${om.hhSelecionado.toFixed(1)}h nos CTs Selecionados</span>`
      : `<span style="background:#f5f5f5; color:#888; border:1px solid #ccc; padding:2px 8px; border-radius:10px; font-size:0.75rem;">Sem CTs Filtrados</span>`;

    card.innerHTML = `
      <div class="om-header" onclick="toggleCard(this)" style="${estiloCardBorder}; cursor:pointer;">
        <div class="om-title" style="display:flex; align-items:center; gap:10px;">
          <span class="arrow-icon">▶</span>
          <strong>OM: ${om.ordem}</strong>
          ${badgeDestaqueOM}
        </div>
        <div class="om-ct-summary">${badgesHTML}</div>
      </div>
      <div class="om-body">
        <table>
          <thead>
            <tr>
              <th>Operação</th>
              <th>SubOp.</th>
              <th>Centro Trabalho</th>
              <th>Texto Breve</th>
              <th>Executantes</th>
              <th>HH Un.</th>
              <th>Trabalho Total</th>
            </tr>
          </thead>
          <tbody>${linhasTarefasHTML}</tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
  });
}

// -------------------------------------------------------------------------
// VISÃO 2: AGRUPADO POR CENTRO DE TRABALHO
// -------------------------------------------------------------------------
function renderizarListaCTs(ctsMap, horasPorPessoa) {
  const container = document.getElementById('om-list-container');
  if (!container) return;

  container.innerHTML = '';

  const listaCTs = Object.keys(ctsMap).sort((a, b) => {
    const aSel = ctsSelecionadosParaPorcentagem.has(a) ? 1 : 0;
    const bSel = ctsSelecionadosParaPorcentagem.has(b) ? 1 : 0;
    if (bSel !== aSel) return bSel - aSel;
    return a.localeCompare(b);
  });

  if (listaCTs.length === 0) {
    renderizarMensagemAguardando();
    return;
  }

  listaCTs.forEach(ctName => {
    const ctInfo = ctsMap[ctName];
    const card = document.createElement('div');
    card.className = 'om-card collapsed';

    const estaSelecionado = ctsSelecionadosParaPorcentagem.has(ctName);
    const qtdPessoas = recursosPorCT[ctName] !== undefined ? recursosPorCT[ctName] : 1;
    const capCT = qtdPessoas * horasPorPessoa;
    const ocupacaoCT = capCT > 0 ? ((ctInfo.totalHH / capCT) * 100).toFixed(1) : 0;

    const { cor, textoStatus } = obterEstiloBarraProgresso(parseFloat(ocupacaoCT));
    const badgeStatus = estaSelecionado 
      ? `<span style="background:${cor}15; color:${cor}; border:1px solid ${cor}40; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${ocupacaoCT}% - ${textoStatus}</span>`
      : `<span style="background:#f5f5f5; color:#888; border:1px solid #ccc; padding:3px 8px; border-radius:12px; font-size:0.75rem;">Fora do Filtro</span>`;

    let linhasTarefasHTML = '';
    ctInfo.tarefas.forEach(t => {
      const hhTotal = (t.trabalho && t.trabalho > 0) ? t.trabalho : (t.executantes * t.hh);
      linhasTarefasHTML += `
        <tr>
          <td><strong>${t.ordem}</strong></td>
          <td>${t.operacao}</td>
          <td>${t.subOperacao}</td>
          <td>${t.textoBreve}</td>
          <td>${t.executantes}</td>
          <td>${t.hh} h</td>
          <td><strong>${hhTotal.toFixed(1)} h</strong></td>
        </tr>
      `;
    });

    card.innerHTML = `
      <div class="om-header" onclick="toggleCard(this)" style="border-left: 6px solid ${estaSelecionado ? cor : '#ccc'}; ${estaSelecionado ? '' : 'opacity:0.65;'}; cursor:pointer;">
        <div class="om-title">
          <span class="arrow-icon">▶</span>
          CT: ${ctName} ${estaSelecionado ? '✔' : ''}
        </div>
        <div class="om-ct-summary" style="display:flex; gap:15px; align-items:center;">
          <span style="font-size:0.85rem; color:#444;">OMs: <strong>${ctInfo.omsContadas.size}</strong></span>
          <span style="font-size:0.85rem; color:#444;">Demanda: <strong>${ctInfo.totalHH.toFixed(1)} h</strong></span>
          ${badgeStatus}
        </div>
      </div>
      <div class="om-body">
        <table>
          <thead>
            <tr>
              <th>OM</th>
              <th>Operação</th>
              <th>SubOp.</th>
              <th>Texto Breve</th>
              <th>Executantes</th>
              <th>HH Un.</th>
              <th>Trabalho Total</th>
            </tr>
          </thead>
          <tbody>${linhasTarefasHTML}</tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
  });
}

// Inicia o carregamento automático ao abrir a página
window.addEventListener('DOMContentLoaded', () => {
  carregarArquivosDaPasta();
});