(function(global){
  'use strict';

  const STORAGE_CLIENTS = 'simulador-sorteio-clientes-v1';
  const STORAGE_ASSEMBLIES = 'simulador-sorteio-assembleias-v2';
  const STORAGE_BASE = 'simulador-sorteio-base-contempladas-v2';
  const MAX_QUOTA = 9999;

  const DEFAULT_CLIENTS = [
    { id: 'loreci-3446', nome: 'Loreci', cota: '3446' },
    { id: 'angela-4559', nome: 'Angela', cota: '4559' },
    { id: 'marcio-1665', nome: 'Marcio', cota: '1665' },
    { id: 'fabio-5986', nome: 'Fábio', cota: '5986' },
    { id: 'alan-6522', nome: 'Alan', cota: '6522' }
  ];

  const MODALITIES = {
    sorteio: 'Sorteio',
    sorteio_excluido: 'Sorteio de excluídos',
    lance_fixo: 'Lance fixo',
    lance_limitado: 'Lance limitado',
    lance_livre: 'Lance livre',
    lance_fidelidade: 'Lance fidelidade',
    reposicao: 'Reposição / outra contemplação'
  };

  const state = {
    clients: [],
    assemblies: [],
    baseline: [],
    lastAssemblyId: null,
    editingAssemblyId: null,
    draftContempladas: []
  };

  const $ = id => document.getElementById(id);

  function escapeHTML(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function uid(prefix){
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO(){
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function dateBR(value){
    if(!value) return 'Data não informada';
    const [year, month, day] = String(value).split('-');
    if(!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  function quota(value){
    const digits = String(value ?? '').replace(/\D/g, '').slice(-4);
    return digits ? digits.padStart(4, '0') : '';
  }

  function isValidQuota(value){
    const number = Number(value);
    return /^\d{4}$/.test(String(value)) && number >= 1 && number <= MAX_QUOTA;
  }

  function extractQuotaList(text){
    const matches = String(text || '').match(/(^|\D)(\d{1,4})(?=\D|$)/g) || [];
    return [...new Set(matches.map(item => quota(item)).filter(isValidQuota))];
  }

  function modalityKey(value){
    const raw = String(value || '').toLowerCase();
    if(MODALITIES[raw]) return raw;
    if(raw.includes('sorteio') && raw.includes('exclu')) return 'sorteio_excluido';
    if(raw.includes('sorteio')) return 'sorteio';
    if(raw.includes('fixo')) return 'lance_fixo';
    if(raw.includes('limitado')) return 'lance_limitado';
    if(raw.includes('livre')) return 'lance_livre';
    if(raw.includes('fidelidade')) return 'lance_fidelidade';
    return 'reposicao';
  }

  function normalizeEntry(item, fallbackModality = 'reposicao'){
    const number = quota(typeof item === 'object' ? item.cota : item);
    if(!isValidQuota(number)) return null;
    const key = modalityKey(typeof item === 'object' ? item.modalidade : fallbackModality);
    return {
      id: String((typeof item === 'object' && item.id) || uid('contemplada')),
      cota: number,
      modalidade: key
    };
  }

  function loadJSON(key, fallback){
    try{
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw ?? fallback;
    }catch{
      return fallback;
    }
  }

  function saveClients(){
    localStorage.setItem(STORAGE_CLIENTS, JSON.stringify(state.clients));
  }

  function saveAssemblies(){
    localStorage.setItem(STORAGE_ASSEMBLIES, JSON.stringify(state.assemblies));
  }

  function saveBaseline(){
    localStorage.setItem(STORAGE_BASE, JSON.stringify(state.baseline));
  }

  function normalizeAssembly(item){
    let entries = [];
    if(Array.isArray(item.contempladas)){
      entries = item.contempladas.map(entry => normalizeEntry(entry)).filter(Boolean);
    }else{
      if(item.sorteio) entries.push(normalizeEntry(item.sorteio, 'sorteio'));
      (Array.isArray(item.fixos) ? item.fixos : []).forEach(value => entries.push(normalizeEntry(value, 'lance_fixo')));
      if(item.limitado) entries.push(normalizeEntry(item.limitado, 'lance_limitado'));
      if(item.livre) entries.push(normalizeEntry(item.livre, 'lance_livre'));
      (Array.isArray(item.extras) ? item.extras : []).forEach(value => entries.push(normalizeEntry(value, 'reposicao')));
      entries = entries.filter(Boolean);
    }

    const unique = [];
    const seen = new Set();
    entries.forEach(entry => {
      if(seen.has(entry.cota)) return;
      seen.add(entry.cota);
      unique.push(entry);
    });

    return {
      id: String(item.id || uid('assembleia')),
      numero: String(item.numero || '').trim(),
      data: String(item.data || ''),
      contempladas: unique,
      createdAt: Number(item.createdAt || Date.now())
    };
  }

  function load(){
    const storedClients = loadJSON(STORAGE_CLIENTS, null);
    state.clients = Array.isArray(storedClients) && storedClients.length
      ? storedClients.map(item => ({
          id: String(item.id || uid('cliente')),
          nome: String(item.nome || '').trim(),
          cota: quota(item.cota)
        })).filter(item => item.nome && isValidQuota(item.cota))
      : DEFAULT_CLIENTS.map(item => ({...item}));

    const storedAssemblies = loadJSON(STORAGE_ASSEMBLIES, []);
    state.assemblies = Array.isArray(storedAssemblies)
      ? storedAssemblies.map(normalizeAssembly).filter(item => item.numero && item.data && item.contempladas.length)
      : [];

    const storedBase = loadJSON(STORAGE_BASE, []);
    state.baseline = Array.isArray(storedBase)
      ? [...new Set(storedBase.map(quota).filter(isValidQuota))]
      : [];

    saveClients();
    saveAssemblies();
    saveBaseline();
  }

  function showMessage(id, text, type = 'success'){
    const element = $(id);
    if(!element) return;
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = false;
    clearTimeout(element._timer);
    element._timer = setTimeout(() => { element.hidden = true; }, 5000);
  }

  function assemblyNumberValue(value){
    const numeric = Number(String(value || '').replace(/\D/g, ''));
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
  }

  function sortAssembliesAsc(list = state.assemblies){
    return [...list].sort((a, b) => {
      if(a.data !== b.data) return a.data.localeCompare(b.data);
      const numberDiff = assemblyNumberValue(a.numero) - assemblyNumberValue(b.numero);
      if(numberDiff) return numberDiff;
      return a.createdAt - b.createdAt;
    });
  }

  function sortAssembliesDesc(){
    return sortAssembliesAsc().reverse();
  }

  function winnersDetailed(assembly){
    return (assembly.contempladas || []).map(entry => ({
      id: entry.id,
      cota: entry.cota,
      modalidade: MODALITIES[entry.modalidade] || 'Outra contemplação',
      modalidadeKey: entry.modalidade
    }));
  }

  function referenceQuotas(assembly){
    return (assembly.contempladas || [])
      .filter(entry => entry.modalidade === 'sorteio')
      .map(entry => entry.cota);
  }

  function priorContext(assembly){
    const ordered = sortAssembliesAsc();
    const prior = new Set(state.baseline);
    for(const item of ordered){
      if(item.id === assembly.id) break;
      winnersDetailed(item).forEach(entry => prior.add(entry.cota));
    }
    return prior;
  }

  function allContemplatedExcept(assemblyId){
    const set = new Set(state.baseline);
    state.assemblies.forEach(item => {
      if(item.id === assemblyId) return;
      winnersDetailed(item).forEach(entry => set.add(entry.cota));
    });
    return set;
  }

  function allContemplated(){
    const set = new Set(state.baseline);
    state.assemblies.forEach(item => winnersDetailed(item).forEach(entry => set.add(entry.cota)));
    return set;
  }

  function countBetween(set, first, second){
    const a = Number(first);
    const b = Number(second);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    let total = 0;
    set.forEach(value => {
      const current = Number(value);
      if(current > min && current < max) total += 1;
    });
    return total;
  }

  function closestReference(clientQuota, assembly, prior){
    const references = referenceQuotas(assembly);
    if(!references.length) return null;
    return references.map(reference => {
      const rawDistance = Math.abs(Number(clientQuota) - Number(reference));
      const removedBetween = countBetween(prior, clientQuota, reference);
      const adjustedDistance = Math.max(0, rawDistance - removedBetween);
      return {reference, rawDistance, removedBetween, adjustedDistance};
    }).sort((a, b) => a.adjustedDistance - b.adjustedDistance || a.rawDistance - b.rawDistance)[0];
  }

  function clientAssemblyResult(client, assembly){
    const prior = priorContext(assembly);
    const currentWinners = winnersDetailed(assembly);
    const currentWin = currentWinners.find(item => item.cota === client.cota) || null;
    const alreadyContemplated = prior.has(client.cota);

    if(alreadyContemplated){
      return {
        client,
        alreadyContemplated: true,
        currentWin,
        reference: null,
        rawDistance: null,
        removedBetween: null,
        adjustedDistance: null,
        priorCount: prior.size
      };
    }

    const closest = closestReference(client.cota, assembly, prior);
    return {
      client,
      alreadyContemplated: false,
      currentWin,
      reference: closest?.reference || null,
      rawDistance: closest?.rawDistance ?? null,
      removedBetween: closest?.removedBetween ?? null,
      adjustedDistance: closest?.adjustedDistance ?? null,
      priorCount: prior.size
    };
  }

  function distanceLabel(value){
    if(value === null || value === undefined) return 'Sem referência de sorteio';
    if(value === 0) return 'Coincidência exata';
    return `${value.toLocaleString('pt-BR')} ${value === 1 ? 'número' : 'números'}`;
  }

  function renderLatest(assembly){
    const section = $('sorteioResultado');
    const prior = priorContext(assembly);
    const winners = winnersDetailed(assembly);
    const refs = referenceQuotas(assembly);
    const totalAfter = new Set([...prior, ...winners.map(item => item.cota)]).size;
    const activeAfter = Math.max(0, MAX_QUOTA - totalAfter);

    $('sorteioResultadoTitulo').textContent = `Assembleia ${assembly.numero}`;
    $('sorteioResultadoData').textContent = dateBR(assembly.data);
    $('sorteioDestaque').innerHTML = `
      <div><span>Referência${refs.length > 1 ? 's' : ''} por sorteio</span><strong>${refs.map(value => `Cota ${value}`).join(' · ')}</strong></div>
      <div><span>Já contempladas antes</span><strong>${prior.size.toLocaleString('pt-BR')}</strong></div>
      <div><span>Contempladas nesta assembleia</span><strong>${winners.length}</strong></div>
      <div><span>Cotas ativas após a assembleia</span><strong>${activeAfter.toLocaleString('pt-BR')}</strong></div>
    `;

    $('sorteioContemplados').innerHTML = winners.map(item => `
      <div><span>${escapeHTML(item.modalidade)}</span><strong>${item.cota}</strong></div>
    `).join('');

    const results = state.clients.map(client => clientAssemblyResult(client, assembly));
    $('sorteioClientesResultado').innerHTML = results.map(item => {
      if(item.alreadyContemplated){
        return `
          <article class="assembly-client-card inactive">
            <div class="assembly-client-head"><div><strong>${escapeHTML(item.client.nome)}</strong><span>Cota ${item.client.cota}</span></div><b>Cota já contemplada</b></div>
            <p>Esta cota já não participava da referência desta assembleia.</p>
          </article>
        `;
      }
      return `
        <article class="assembly-client-card ${item.currentWin ? 'contemplated-now' : ''} ${item.adjustedDistance === 0 ? 'exact' : ''}">
          <div class="assembly-client-head">
            <div><strong>${escapeHTML(item.client.nome)}</strong><span>Cota ${item.client.cota}</span></div>
            <b>${item.currentWin ? `Contemplada por ${escapeHTML(item.currentWin.modalidade.toLowerCase())}` : distanceLabel(item.adjustedDistance)}</b>
          </div>
          <div class="assembly-distance-grid four">
            <div><span>Referência mais próxima</span><strong>${item.reference || '—'}</strong></div>
            <div><span>Distância numérica</span><strong>${item.rawDistance === null ? '—' : item.rawDistance.toLocaleString('pt-BR')}</strong></div>
            <div><span>Já contempladas no intervalo</span><strong>${item.removedBetween === null ? '—' : item.removedBetween.toLocaleString('pt-BR')}</strong></div>
            <div class="adjusted"><span>Distância ajustada</span><strong>${item.adjustedDistance === null ? '—' : item.adjustedDistance.toLocaleString('pt-BR')}</strong></div>
          </div>
        </article>
      `;
    }).join('') || '<div class="empty-state">Nenhum cliente cadastrado.</div>';

    section.hidden = false;
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function renderDraft(){
    $('sorteioDraftCount').textContent = `${state.draftContempladas.length} ${state.draftContempladas.length === 1 ? 'cota' : 'cotas'}`;
    if(!state.draftContempladas.length){
      $('sorteioDraftList').innerHTML = '<div class="assembly-draft-empty">Nenhuma cota adicionada nesta assembleia.</div>';
      return;
    }
    $('sorteioDraftList').innerHTML = state.draftContempladas.map(entry => `
      <div class="assembly-draft-row" data-entry-id="${escapeHTML(entry.id)}">
        <div><strong>Cota ${entry.cota}</strong><span>${escapeHTML(MODALITIES[entry.modalidade] || 'Outra contemplação')}</span></div>
        <button type="button" data-remove-entry>Remover</button>
      </div>
    `).join('');
    $('sorteioDraftList').querySelectorAll('[data-remove-entry]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-entry-id]').dataset.entryId;
        state.draftContempladas = state.draftContempladas.filter(entry => entry.id !== id);
        renderDraft();
      });
    });
  }

  function addDraftEntry(){
    const number = quota($('sorteioNovaCota').value);
    const modality = $('sorteioNovaModalidade').value;
    if(!isValidQuota(number)){
      showMessage('sorteioFormMessage', 'Informe uma cota entre 0001 e 9999.', 'error');
      return;
    }
    if(state.draftContempladas.some(entry => entry.cota === number)){
      showMessage('sorteioFormMessage', `A cota ${number} já foi adicionada nesta assembleia.`, 'error');
      return;
    }
    state.draftContempladas.push({id: uid('contemplada'), cota: number, modalidade: MODALITIES[modality] ? modality : 'reposicao'});
    $('sorteioNovaCota').value = '';
    $('sorteioNovaCota').focus();
    renderDraft();
  }

  function renderClients(){
    $('sorteioClientesCount').textContent = `${state.clients.length} ${state.clients.length === 1 ? 'cliente' : 'clientes'}`;
    $('sorteioClientList').innerHTML = state.clients.map(client => `
      <div class="client-edit-row" data-client-id="${escapeHTML(client.id)}">
        <div class="field">
          <label>Nome</label>
          <div class="control"><input data-client-name type="text" maxlength="70" value="${escapeHTML(client.nome)}"></div>
        </div>
        <div class="field client-quota-field">
          <label>Cota</label>
          <div class="control"><input data-client-quota type="text" inputmode="numeric" maxlength="4" value="${client.cota}"></div>
        </div>
        <div class="client-row-actions">
          <button type="button" class="small-action primary" data-save-client>Salvar</button>
          <button type="button" class="small-action danger" data-delete-client>Excluir</button>
        </div>
      </div>
    `).join('');

    $('sorteioClientList').querySelectorAll('[data-client-quota]').forEach(input => {
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
    });

    $('sorteioClientList').querySelectorAll('[data-save-client]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-client-id]');
        const id = row.dataset.clientId;
        const name = row.querySelector('[data-client-name]').value.trim();
        const number = quota(row.querySelector('[data-client-quota]').value);
        if(!name || !isValidQuota(number)){
          showMessage('sorteioClientesMessage', 'Informe o nome e uma cota entre 0001 e 9999.', 'error');
          return;
        }
        const duplicate = state.clients.some(client => client.id !== id && client.cota === number);
        if(duplicate){
          showMessage('sorteioClientesMessage', 'Essa cota já está cadastrada para outro cliente.', 'error');
          return;
        }
        const client = state.clients.find(item => item.id === id);
        client.nome = name;
        client.cota = number;
        saveClients();
        renderAllData();
        showMessage('sorteioClientesMessage', 'Cliente atualizado.');
      });
    });

    $('sorteioClientList').querySelectorAll('[data-delete-client]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-client-id]');
        const client = state.clients.find(item => item.id === row.dataset.clientId);
        if(!client) return;
        if(!confirm(`Excluir ${client.nome} — cota ${client.cota}?`)) return;
        state.clients = state.clients.filter(item => item.id !== client.id);
        saveClients();
        renderAllData();
        showMessage('sorteioClientesMessage', 'Cliente excluído.');
      });
    });
  }

  function renderHistory(){
    const assemblies = sortAssembliesDesc();
    $('sorteioHistoryCount').textContent = `${assemblies.length} ${assemblies.length === 1 ? 'assembleia' : 'assembleias'}`;
    if(!assemblies.length){
      $('sorteioHistoryList').innerHTML = '<div class="empty-state">Nenhuma assembleia salva ainda.</div>';
      return;
    }

    $('sorteioHistoryList').innerHTML = assemblies.map(assembly => {
      const winners = winnersDetailed(assembly);
      const refs = referenceQuotas(assembly);
      return `
        <div class="draw-history-row" data-assembly-id="${escapeHTML(assembly.id)}">
          <div><strong>Assembleia ${escapeHTML(assembly.numero)}</strong><span>${dateBR(assembly.data)} · sorteio ${refs.join(', ')} · ${winners.length} contempladas</span></div>
          <div class="draw-history-actions">
            <button type="button" data-open-assembly>Ver</button>
            <button type="button" data-edit-assembly>Editar</button>
            <button type="button" class="danger-text" data-delete-assembly>Excluir</button>
          </div>
        </div>
      `;
    }).join('');

    $('sorteioHistoryList').querySelectorAll('[data-open-assembly]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-assembly-id]').dataset.assemblyId;
        const assembly = state.assemblies.find(item => item.id === id);
        if(!assembly) return;
        state.lastAssemblyId = assembly.id;
        renderLatest(assembly);
      });
    });

    $('sorteioHistoryList').querySelectorAll('[data-edit-assembly]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-assembly-id]').dataset.assemblyId;
        const assembly = state.assemblies.find(item => item.id === id);
        if(!assembly) return;
        fillAssemblyForm(assembly);
        window.scrollTo({top: $('view-sorteio').offsetTop, behavior: 'smooth'});
        showMessage('sorteioFormMessage', `Assembleia ${assembly.numero} carregada para edição.`);
      });
    });

    $('sorteioHistoryList').querySelectorAll('[data-delete-assembly]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-assembly-id]').dataset.assemblyId;
        const assembly = state.assemblies.find(item => item.id === id);
        if(!assembly || !confirm(`Excluir a assembleia ${assembly.numero}?`)) return;
        state.assemblies = state.assemblies.filter(item => item.id !== id);
        saveAssemblies();
        if(state.lastAssemblyId === id){
          state.lastAssemblyId = null;
          $('sorteioResultado').hidden = true;
        }
        renderHistory();
        renderStats();
        renderRangeStats();
        showMessage('sorteioHistoryMessage', 'Assembleia excluída.');
      });
    });
  }

  function clientStats(client){
    const ordered = sortAssembliesAsc();
    const rows = [];
    let contemplatedAt = null;

    for(const assembly of ordered){
      const result = clientAssemblyResult(client, assembly);
      if(result.alreadyContemplated){
        if(!contemplatedAt) contemplatedAt = 'Antes do histórico analisado';
        continue;
      }
      if(result.adjustedDistance !== null) rows.push({assembly, result});
      if(result.currentWin && !contemplatedAt){
        contemplatedAt = `Assembleia ${assembly.numero} · ${result.currentWin.modalidade}`;
      }
    }

    const values = rows.map(row => row.result.adjustedDistance);
    return {
      client,
      rows,
      analyzed: values.length,
      best: values.length ? Math.min(...values) : null,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      latest: values.length ? values[values.length - 1] : null,
      contemplatedAt
    };
  }

  function renderStats(){
    const total = state.assemblies.length;
    $('sorteioStatsCount').textContent = `${total} ${total === 1 ? 'assembleia' : 'assembleias'}`;
    if(!total){
      $('sorteioStatsGrid').innerHTML = '<div class="empty-state">As estatísticas aparecerão depois da primeira assembleia salva.</div>';
      return;
    }

    $('sorteioStatsGrid').innerHTML = state.clients.map(clientStats).map(item => `
      <article class="stat-client-card">
        <div class="stat-client-head"><strong>${escapeHTML(item.client.nome)}</strong><span>Cota ${item.client.cota}</span></div>
        <div class="stat-client-numbers">
          <div><span>Menor distância ajustada</span><strong>${item.best === null ? '—' : item.best.toLocaleString('pt-BR')}</strong></div>
          <div><span>Média ajustada</span><strong>${item.average === null ? '—' : Math.round(item.average).toLocaleString('pt-BR')}</strong></div>
          <div><span>Última assembleia</span><strong>${item.latest === null ? '—' : item.latest.toLocaleString('pt-BR')}</strong></div>
        </div>
        ${item.contemplatedAt ? `<p class="client-contemplated-note">${escapeHTML(item.contemplatedAt)}</p>` : ''}
      </article>
    `).join('');
  }

  function rangeLabel(start, end){
    return `${start.toLocaleString('pt-BR')} a ${end.toLocaleString('pt-BR')}`;
  }

  function calculateRanges(){
    const contemplated = allContemplated();
    const totalActive = Math.max(0, MAX_QUOTA - contemplated.size);
    const ranges = [];
    for(let start = 1; start <= MAX_QUOTA; start += 500){
      const end = Math.min(start + 499, MAX_QUOTA);
      const total = end - start + 1;
      let removed = 0;
      contemplated.forEach(value => {
        const number = Number(value);
        if(number >= start && number <= end) removed += 1;
      });
      const active = total - removed;
      const chance = totalActive > 0 ? (active / totalActive) * 100 : 0;
      ranges.push({start, end, total, removed, active, chance});
    }
    return {ranges, contemplated: contemplated.size, totalActive};
  }

  function renderRangeStats(){
    const data = calculateRanges();
    const maxActive = Math.max(...data.ranges.map(item => item.active));
    const best = data.ranges.filter(item => item.active === maxActive);
    const bestLabel = best.length === 1 ? rangeLabel(best[0].start, best[0].end) : `${best.length} faixas empatadas`;
    $('sorteioRangeBest').textContent = state.assemblies.length || state.baseline.length ? bestLabel : 'Sem histórico';

    $('sorteioRangeSummary').innerHTML = `
      <div><span>Cotas ainda ativas</span><strong>${data.totalActive.toLocaleString('pt-BR')}</strong></div>
      <div><span>Cotas já contempladas</span><strong>${data.contemplated.toLocaleString('pt-BR')}</strong></div>
      <div class="range-best-summary"><span>Maior presença de cotas ativas</span><strong>${escapeHTML(bestLabel)}</strong></div>
    `;

    $('sorteioRangeGrid').innerHTML = data.ranges.map(item => {
      const isBest = item.active === maxActive;
      return `
        <article class="range-stat-card ${isBest ? 'best' : ''}">
          <div class="range-stat-head"><strong>${rangeLabel(item.start, item.end)}</strong>${isBest ? '<span>Maior faixa ativa</span>' : ''}</div>
          <div class="range-stat-values">
            <div><span>Cotas ativas</span><strong>${item.active.toLocaleString('pt-BR')}</strong></div>
            <div><span>Já contempladas</span><strong>${item.removed.toLocaleString('pt-BR')}</strong></div>
            <div><span>Chance teórica da faixa</span><strong>${item.chance.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</strong></div>
          </div>
          <div class="range-bar"><i style="width:${Math.min(100, item.chance * 20).toFixed(2)}%"></i></div>
        </article>
      `;
    }).join('');
  }

  function renderReportSelect(){
    const select = $('sorteioReportClient');
    const previous = select.value;
    select.innerHTML = state.clients.map(client => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.nome)} — cota ${client.cota}</option>`).join('');
    if(state.clients.some(client => client.id === previous)) select.value = previous;
  }

  function renderBaseline(){
    $('sorteioBaseCount').textContent = `${state.baseline.length} ${state.baseline.length === 1 ? 'cota anterior' : 'cotas anteriores'}`;
    $('sorteioBaseContempladas').value = state.baseline.join('\n');
  }

  function renderAllData(){
    renderClients();
    renderHistory();
    renderStats();
    renderRangeStats();
    renderReportSelect();
    renderBaseline();
    renderDraft();
  }

  function addClient(){
    const name = $('sorteioNewClientName').value.trim();
    const number = quota($('sorteioNewClientQuota').value);
    if(!name || !isValidQuota(number)){
      showMessage('sorteioClientesMessage', 'Informe o nome e uma cota entre 0001 e 9999.', 'error');
      return;
    }
    if(state.clients.some(client => client.cota === number)){
      showMessage('sorteioClientesMessage', 'Essa cota já está cadastrada.', 'error');
      return;
    }
    state.clients.push({id: uid('cliente'), nome: name, cota: number});
    saveClients();
    $('sorteioNewClientName').value = '';
    $('sorteioNewClientQuota').value = '';
    renderAllData();
    showMessage('sorteioClientesMessage', 'Cliente adicionado.');
  }

  function collectAssemblyForm(){
    const number = $('sorteioAssembleia').value.trim();
    const existingByNumber = state.assemblies.find(item => item.numero.toLowerCase() === number.toLowerCase());
    const existing = state.editingAssemblyId
      ? state.assemblies.find(item => item.id === state.editingAssemblyId)
      : existingByNumber;
    return normalizeAssembly({
      id: existing?.id || uid('assembleia'),
      numero: number,
      data: $('sorteioData').value,
      contempladas: state.draftContempladas,
      createdAt: existing?.createdAt || Date.now()
    });
  }

  function validateAssembly(assembly){
    if(!assembly.numero) return 'Informe o número da assembleia.';
    if(!assembly.data) return 'Informe a data da assembleia.';
    if(!assembly.contempladas.length) return 'Adicione pelo menos uma cota contemplada.';
    if(!referenceQuotas(assembly).length) return 'Adicione pelo menos uma cota na modalidade Sorteio para servir de referência.';

    const winners = winnersDetailed(assembly).map(item => item.cota);
    if(new Set(winners).size !== winners.length){
      return 'A mesma cota não pode aparecer duas vezes na mesma assembleia.';
    }

    const previous = allContemplatedExcept(assembly.id);
    const repeated = winners.find(cota => previous.has(cota));
    if(repeated){
      return `A cota ${repeated} já consta como contemplada em uma assembleia anterior ou na configuração inicial.`;
    }
    return '';
  }

  function fillAssemblyForm(assembly){
    state.editingAssemblyId = assembly.id;
    state.draftContempladas = assembly.contempladas.map(entry => ({...entry}));
    $('sorteioAssembleia').value = assembly.numero;
    $('sorteioData').value = assembly.data;
    renderDraft();
  }

  function clearAssemblyForm(){
    state.editingAssemblyId = null;
    state.draftContempladas = [];
    $('sorteioAssembleia').value = '';
    $('sorteioData').value = todayISO();
    $('sorteioNovaCota').value = '';
    $('sorteioNovaModalidade').value = 'sorteio';
    renderDraft();
  }

  function submitAssembly(){
    if(!state.clients.length){
      showMessage('sorteioFormMessage', 'Cadastre pelo menos um cliente antes de conferir.', 'error');
      return;
    }

    const assembly = collectAssemblyForm();
    const error = validateAssembly(assembly);
    if(error){
      showMessage('sorteioFormMessage', error, 'error');
      return;
    }

    const index = state.assemblies.findIndex(item => item.id === assembly.id);
    if(index >= 0) state.assemblies.splice(index, 1, assembly);
    else state.assemblies.push(assembly);
    saveAssemblies();
    state.lastAssemblyId = assembly.id;
    renderLatest(assembly);
    renderHistory();
    renderStats();
    renderRangeStats();
    clearAssemblyForm();
    showMessage('sorteioFormMessage', index >= 0 ? 'Assembleia atualizada e recalculada.' : 'Assembleia salva e calculada.');
  }

  function saveBaseConfiguration(){
    const base = extractQuotaList($('sorteioBaseContempladas').value);
    const assemblyWinners = new Set(state.assemblies.flatMap(item => winnersDetailed(item).map(entry => entry.cota)));
    const repeated = base.find(cota => assemblyWinners.has(cota));
    if(repeated){
      showMessage('sorteioBaseMessage', `A cota ${repeated} já está registrada em uma assembleia. Retire-a da lista inicial.`, 'error');
      return;
    }
    state.baseline = base;
    saveBaseline();
    renderBaseline();
    renderStats();
    renderRangeStats();
    if(state.lastAssemblyId){
      const current = state.assemblies.find(item => item.id === state.lastAssemblyId);
      if(current) renderLatest(current);
    }
    showMessage('sorteioBaseMessage', 'Configuração salva e estatísticas recalculadas.');
  }

  function reportRows(client){
    return sortAssembliesAsc().map(assembly => ({
      assembly,
      result: clientAssemblyResult(client, assembly),
      winners: winnersDetailed(assembly)
    }));
  }

  function generateReport(){
    const clientId = $('sorteioReportClient').value;
    const client = state.clients.find(item => item.id === clientId);
    if(!client){
      showMessage('sorteioReportMessage', 'Selecione um cliente.', 'error');
      return;
    }
    if(!state.assemblies.length){
      showMessage('sorteioReportMessage', 'Salve pelo menos uma assembleia para gerar o relatório.', 'error');
      return;
    }

    const rows = reportRows(client);
    const stats = clientStats(client);
    const settings = global.Simulador?.Configuracoes?.load?.() || {};
    const company = settings.company || 'Acompanhamento de Consórcio';
    const consultant = settings.consultant || '';
    const phone = settings.phone || '';

    const tableRows = rows.map(({assembly, result, winners}) => {
      const winnersHTML = winners.map(item => `<span><b>${escapeHTML(item.modalidade)}:</b> ${item.cota}</span>`).join('');
      const references = referenceQuotas(assembly).join(', ');
      let distanceHTML = '';
      if(result.alreadyContemplated){
        distanceHTML = '<b>Cota já contemplada</b><small>Não participava desta assembleia</small>';
      }else if(result.adjustedDistance === null){
        distanceHTML = '<b>Sem referência</b><small>Nenhuma cota por sorteio cadastrada</small>';
      }else{
        distanceHTML = `<b>${result.adjustedDistance.toLocaleString('pt-BR')}</b><small>Referência ${result.reference}: ${result.rawDistance.toLocaleString('pt-BR')} de distância numérica − ${result.removedBetween.toLocaleString('pt-BR')} já contempladas no intervalo</small>`;
        if(result.currentWin) distanceHTML += `<em>Contemplada nesta assembleia por ${escapeHTML(result.currentWin.modalidade.toLowerCase())}</em>`;
      }
      return `
        <tr>
          <td><b>${escapeHTML(assembly.numero)}</b><small>${dateBR(assembly.data)}</small></td>
          <td class="assembly-winners">${winnersHTML}</td>
          <td><b>${references}</b><small>Referência(s) por sorteio</small></td>
          <td>${distanceHTML}</td>
        </tr>
      `;
    }).join('');

    const generated = new Date().toLocaleString('pt-BR');
    const latestAssembly = sortAssembliesDesc()[0];
    const latestResult = clientAssemblyResult(client, latestAssembly);
    const latestText = latestResult.alreadyContemplated ? 'Cota já contemplada' : (latestResult.adjustedDistance === null ? '—' : latestResult.adjustedDistance.toLocaleString('pt-BR'));
    const bestText = stats.best === null ? '—' : stats.best.toLocaleString('pt-BR');
    const averageText = stats.average === null ? '—' : Math.round(stats.average).toLocaleString('pt-BR');

    const report = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Histórico de assembleias — ${escapeHTML(client.nome)}</title>
<style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0;background:#fff;font-size:9px}.header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #f28a16;padding:0 0 10px;margin-bottom:10px}.brand{display:flex;gap:10px;align-items:center}.mark{width:38px;height:38px;border-radius:11px;background:#f28a16;color:#fff;display:grid;place-items:center;font-weight:900;font-size:14px}.header h1{font-size:18px;margin:0}.header p{margin:3px 0 0;color:#637181}.meta{text-align:right;color:#637181;line-height:1.45}.client{display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:7px;margin-bottom:10px}.card{border:1px solid #d8e0e7;border-radius:9px;padding:8px;background:#f7f9fb}.card span{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.06em;color:#6b7782}.card strong{display:block;font-size:13px;margin-top:4px}.card.primary{background:#fff3e4;border-color:#f1b56e}.card.primary strong{font-size:16px}.intro{border:1px solid #d8e0e7;border-radius:9px;padding:8px 10px;margin-bottom:10px;color:#44515d;line-height:1.45}.intro b{color:#14202b}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#182633;color:#fff;font-size:7px;text-transform:uppercase;letter-spacing:.05em;padding:7px 6px;text-align:left}td{border-bottom:1px solid #dfe5ea;padding:7px 6px;vertical-align:top}th:nth-child(1){width:12%}th:nth-child(2){width:42%}th:nth-child(3){width:16%}th:nth-child(4){width:30%}td b{font-size:9px}td small{display:block;color:#6c7882;font-size:7px;margin-top:2px;line-height:1.3}.assembly-winners{display:grid;grid-template-columns:repeat(2,1fr);gap:3px}.assembly-winners span{display:block;background:#f3f6f8;border-radius:4px;padding:4px;font-size:7px}.assembly-winners b{display:block;color:#53616c;font-size:6px;text-transform:uppercase}.footer{margin-top:9px;border-top:1px solid #d8e0e7;padding-top:7px;color:#68747e;font-size:7px;line-height:1.45}.footer b{color:#26343f}em{display:block;margin-top:3px;color:#b45f00;font-style:normal;font-size:7px;font-weight:700}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header class="header"><div class="brand"><div class="mark">SC</div><div><h1>Histórico individual de assembleias</h1><p>${escapeHTML(company)}</p></div></div><div class="meta">Emitido em ${generated}${consultant ? `<br>Consultor: ${escapeHTML(consultant)}` : ''}${phone ? `<br>WhatsApp: ${escapeHTML(phone)}` : ''}</div></header>
<section class="client"><div class="card primary"><span>Cliente acompanhado</span><strong>${escapeHTML(client.nome)} · cota ${client.cota}</strong></div><div class="card"><span>Assembleias analisadas</span><strong>${stats.analyzed}</strong></div><div class="card"><span>Menor distância ajustada</span><strong>${bestText}</strong></div><div class="card"><span>Última assembleia</span><strong>${latestText}</strong></div></section>
<div class="intro"><b>Como ler:</b> em assembleias com uma ou mais cotas por sorteio, o relatório usa a referência que ficou mais próxima da cota ${client.cota}. Depois, retira do intervalo as cotas que já haviam sido contempladas. Média ajustada no histórico: <b>${averageText}</b>.</div>
<table><thead><tr><th>Assembleia</th><th>Cotas contempladas</th><th>Referência</th><th>Situação da cota</th></tr></thead><tbody>${tableRows}</tbody></table>
<div class="footer"><b>Importante:</b> relatório gerado com as assembleias cadastradas manualmente no aplicativo. Os dados devem ser conferidos nos resultados oficiais da administradora. As estatísticas históricas não representam garantia de contemplação futura.</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`;

    const reportWindow = window.open('', '_blank');
    if(!reportWindow){
      showMessage('sorteioReportMessage', 'O navegador bloqueou a abertura do relatório. Permita pop-ups e tente novamente.', 'error');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(report);
    reportWindow.document.close();
  }

  function bindQuotaInput(id){
    const input = $(id);
    if(!input) return;
    input.addEventListener('input', event => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  function bind(){
    $('sorteioData').value = todayISO();
    ['sorteioNovaCota','sorteioNewClientQuota'].forEach(bindQuotaInput);
    $('sorteioNovaCota').addEventListener('keydown', event => {
      if(event.key === 'Enter'){
        event.preventDefault();
        addDraftEntry();
      }
    });
    $('sorteioAddContempladaBtn').addEventListener('click', addDraftEntry);
    $('sorteioAddClientBtn').addEventListener('click', addClient);
    $('sorteioConferirBtn').addEventListener('click', submitAssembly);
    $('sorteioGenerateReportBtn').addEventListener('click', generateReport);
    $('sorteioSaveBaseBtn').addEventListener('click', saveBaseConfiguration);
  }

  function init(){
    load();
    bind();
    renderAllData();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
