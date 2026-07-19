(function(global){
  'use strict';

  const STORAGE_GROUPS = 'simulador-sorteio-grupos-v1';
  const STORAGE_SELECTED = 'simulador-sorteio-grupo-selecionado-v1';
  const LEGACY_CLIENTS = 'simulador-sorteio-clientes-v1';
  const LEGACY_ASSEMBLIES = 'simulador-sorteio-assembleias-v2';
  const LEGACY_BASE = 'simulador-sorteio-base-contempladas-v2';
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
    groups: [],
    selectedGroupId: null,
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

  function loadJSON(key, fallback){
    try{
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw ?? fallback;
    }catch{
      return fallback;
    }
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

  function quotaNumber(value){
    return Number(quota(value));
  }

  function formatInteger(value){
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatPercent(value){
    const number = Number(value || 0);
    const decimals = number < 0.1 ? 3 : 2;
    return `${number.toLocaleString('pt-BR', {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}%`;
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
    if(!number) return null;
    return {
      id: String((typeof item === 'object' && item.id) || uid('contemplada')),
      cota: number,
      modalidade: modalityKey(typeof item === 'object' ? item.modalidade : fallbackModality)
    };
  }

  function normalizeAssembly(item){
    let entries = [];
    if(Array.isArray(item?.contempladas)){
      entries = item.contempladas.map(entry => normalizeEntry(entry)).filter(Boolean);
    }else if(item){
      if(item.sorteio) entries.push(normalizeEntry(item.sorteio, 'sorteio'));
      (Array.isArray(item.fixos) ? item.fixos : []).forEach(value => entries.push(normalizeEntry(value, 'lance_fixo')));
      if(item.limitado) entries.push(normalizeEntry(item.limitado, 'lance_limitado'));
      if(item.livre) entries.push(normalizeEntry(item.livre, 'lance_livre'));
      (Array.isArray(item.extras) ? item.extras : []).forEach(value => entries.push(normalizeEntry(value, 'reposicao')));
    }

    const unique = [];
    const seen = new Set();
    entries.forEach(entry => {
      if(seen.has(entry.cota)) return;
      seen.add(entry.cota);
      unique.push(entry);
    });

    return {
      id: String(item?.id || uid('assembleia')),
      numero: String(item?.numero || '').trim(),
      data: String(item?.data || ''),
      contempladas: unique,
      createdAt: Number(item?.createdAt || Date.now())
    };
  }

  function normalizeClient(item){
    const name = String(item?.nome || '').trim();
    const number = quota(item?.cota);
    if(!name || !number) return null;
    return { id: String(item?.id || uid('cliente')), nome: name, cota: number };
  }

  function normalizeGroup(item){
    const total = Math.max(1, Math.min(MAX_QUOTA, Number(item?.totalCotas || item?.maxQuota || 9999) || 9999));
    return {
      id: String(item?.id || uid('grupo')),
      numero: String(item?.numero || item?.nome || 'Novo grupo').trim(),
      totalCotas: total,
      clients: (Array.isArray(item?.clients) ? item.clients : []).map(normalizeClient).filter(Boolean),
      assemblies: (Array.isArray(item?.assemblies) ? item.assemblies : []).map(normalizeAssembly).filter(assembly => assembly.numero && assembly.data && assembly.contempladas.length),
      baseline: [...new Set((Array.isArray(item?.baseline) ? item.baseline : []).map(quota).filter(Boolean))],
      createdAt: Number(item?.createdAt || Date.now())
    };
  }

  function currentGroup(){
    return state.groups.find(group => group.id === state.selectedGroupId) || state.groups[0] || null;
  }

  function save(){
    localStorage.setItem(STORAGE_GROUPS, JSON.stringify(state.groups));
    localStorage.setItem(STORAGE_SELECTED, state.selectedGroupId || '');
  }

  function migrateLegacy(){
    const clients = loadJSON(LEGACY_CLIENTS, null);
    const assemblies = loadJSON(LEGACY_ASSEMBLIES, []);
    const baseline = loadJSON(LEGACY_BASE, []);
    return normalizeGroup({
      id: 'grupo-012186',
      numero: '012186',
      totalCotas: 9999,
      clients: Array.isArray(clients) && clients.length ? clients : DEFAULT_CLIENTS,
      assemblies: Array.isArray(assemblies) ? assemblies : [],
      baseline: Array.isArray(baseline) ? baseline : []
    });
  }

  function load(){
    const stored = loadJSON(STORAGE_GROUPS, null);
    state.groups = Array.isArray(stored) && stored.length ? stored.map(normalizeGroup) : [migrateLegacy()];
    const selected = localStorage.getItem(STORAGE_SELECTED);
    state.selectedGroupId = state.groups.some(group => group.id === selected) ? selected : state.groups[0].id;
    save();
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

  function isValidQuota(value, group = currentGroup()){
    const number = quotaNumber(value);
    return /^\d{4}$/.test(quota(value)) && number >= 1 && number <= Number(group?.totalCotas || MAX_QUOTA);
  }

  function extractQuotaList(text, group = currentGroup()){
    const matches = String(text || '').match(/(^|\D)(\d{1,4})(?=\D|$)/g) || [];
    return [...new Set(matches.map(item => quota(item)).filter(item => isValidQuota(item, group)))];
  }

  function assemblyNumberValue(value){
    const numeric = Number(String(value || '').replace(/\D/g, ''));
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
  }

  function sortAssembliesAsc(group = currentGroup()){
    return [...(group?.assemblies || [])].sort((a, b) => {
      if(a.data !== b.data) return a.data.localeCompare(b.data);
      const diff = assemblyNumberValue(a.numero) - assemblyNumberValue(b.numero);
      return diff || a.createdAt - b.createdAt;
    });
  }

  function sortAssembliesDesc(group = currentGroup()){
    return sortAssembliesAsc(group).reverse();
  }

  function winnersDetailed(assembly){
    return (assembly?.contempladas || []).map(entry => ({
      id: entry.id,
      cota: entry.cota,
      modalidadeKey: entry.modalidade,
      modalidade: MODALITIES[entry.modalidade] || 'Outra contemplação'
    }));
  }

  function referenceQuotas(assembly){
    return (assembly?.contempladas || []).filter(entry => entry.modalidade === 'sorteio').map(entry => entry.cota);
  }

  function allContemplated(group = currentGroup(), beforeAssemblyId = null){
    const set = new Set(group?.baseline || []);
    for(const assembly of sortAssembliesAsc(group)){
      if(beforeAssemblyId && assembly.id === beforeAssemblyId) break;
      winnersDetailed(assembly).forEach(entry => set.add(entry.cota));
    }
    return set;
  }

  function activeQuotaNumbers(group = currentGroup()){
    if(!group) return [];
    const removed = allContemplated(group);
    const active = [];
    for(let number = 1; number <= group.totalCotas; number += 1){
      const key = String(number).padStart(4, '0');
      if(!removed.has(key)) active.push(number);
    }
    return active;
  }

  // O contrato usa a cota ativa mais próxima da referência. Em empate, a cota acima vence.
  // Assim, cada cota ativa recebe uma "zona de captura" entre os pontos médios dos vizinhos.
  function captureZones(group = currentGroup()){
    const active = activeQuotaNumbers(group);
    const max = Number(group?.totalCotas || 0);
    if(!active.length || !max) return [];
    return active.map((number, index) => {
      const previous = active[index - 1];
      const next = active[index + 1];
      const start = previous === undefined ? 1 : Math.ceil((previous + number) / 2);
      const end = next === undefined ? max : Math.ceil((number + next) / 2) - 1;
      return { cota: number, start, end, possibilities: Math.max(0, end - start + 1) };
    });
  }

  function calculateRangeStats(group = currentGroup()){
    if(!group) return [];
    const zones = captureZones(group);
    const removed = allContemplated(group);
    const ranges = [];
    for(let start = 1; start <= group.totalCotas; start += 500){
      const end = Math.min(group.totalCotas, start + 499);
      const rangeZones = zones.filter(zone => zone.cota >= start && zone.cota <= end);
      const possibilities = rangeZones.reduce((sum, zone) => sum + zone.possibilities, 0);
      const active = rangeZones.length;
      let contemplated = 0;
      removed.forEach(value => {
        const number = Number(value);
        if(number >= start && number <= end) contemplated += 1;
      });
      ranges.push({
        start,
        end,
        active,
        contemplated,
        possibilities,
        probability: group.totalCotas ? possibilities / group.totalCotas * 100 : 0
      });
    }
    return ranges;
  }

  function rangeLabel(start, end){
    return `${formatInteger(start)} a ${formatInteger(end)}`;
  }

  function modalityTotals(group = currentGroup()){
    const totals = Object.fromEntries(Object.keys(MODALITIES).map(key => [key, 0]));
    (group?.assemblies || []).forEach(assembly => {
      winnersDetailed(assembly).forEach(entry => { totals[entry.modalidadeKey] = (totals[entry.modalidadeKey] || 0) + 1; });
    });
    return totals;
  }

  function renderGroupSelector(){
    const group = currentGroup();
    $('sorteioGrupoSelect').innerHTML = state.groups.map(item => `<option value="${escapeHTML(item.id)}"${item.id === state.selectedGroupId ? ' selected' : ''}>Grupo ${escapeHTML(item.numero)}</option>`).join('');
    $('sorteioGrupoTitulo').textContent = group ? `Grupo ${group.numero}` : 'Nenhum grupo';
    $('sorteioGrupoResumo').textContent = group ? `${formatInteger(group.totalCotas)} cotas` : '—';
    if(group){
      const contemplated = allContemplated(group).size;
      const active = Math.max(0, group.totalCotas - contemplated);
      $('sorteioGroupSnapshot').innerHTML = `
        <div><span>Assembleias</span><strong>${group.assemblies.length}</strong></div>
        <div><span>Contempladas</span><strong>${formatInteger(contemplated)}</strong></div>
        <div><span>Ainda ativas</span><strong>${formatInteger(active)}</strong></div>`;
    }else $('sorteioGroupSnapshot').innerHTML = '';
  }

  function renderGroupList(){
    $('sorteioGroupList').innerHTML = state.groups.map(group => `
      <div class="group-edit-row${group.id === state.selectedGroupId ? ' active' : ''}" data-group-id="${escapeHTML(group.id)}">
        <div><strong>Grupo ${escapeHTML(group.numero)}</strong><span>${formatInteger(group.totalCotas)} cotas · ${group.assemblies.length} assembleias · ${group.clients.length} clientes</span></div>
        <div class="group-edit-actions">
          <button type="button" data-action="select">Selecionar</button>
          <button type="button" data-action="edit">Editar</button>
          <button type="button" data-action="delete" class="danger">Excluir</button>
        </div>
      </div>`).join('');

    $('sorteioGroupList').querySelectorAll('.group-edit-row').forEach(row => {
      const id = row.dataset.groupId;
      row.querySelector('[data-action="select"]').addEventListener('click', () => selectGroup(id));
      row.querySelector('[data-action="edit"]').addEventListener('click', () => editGroup(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteGroup(id));
    });
  }

  function selectGroup(id){
    if(!state.groups.some(group => group.id === id)) return;
    state.selectedGroupId = id;
    state.lastAssemblyId = null;
    state.editingAssemblyId = null;
    state.draftContempladas = [];
    save();
    clearAssemblyForm();
    renderAll();
  }

  function addGroup(){
    const number = $('sorteioNewGroupNumber').value.trim();
    const total = Number($('sorteioNewGroupSize').value);
    if(!number){
      showMessage('sorteioGroupMessage', 'Informe o número do grupo.', 'error');
      return;
    }
    if(!Number.isInteger(total) || total < 1 || total > MAX_QUOTA){
      showMessage('sorteioGroupMessage', 'Informe uma quantidade de cotas entre 1 e 9.999.', 'error');
      return;
    }
    if(state.groups.some(group => group.numero.toLowerCase() === number.toLowerCase())){
      showMessage('sorteioGroupMessage', 'Esse grupo já está cadastrado.', 'error');
      return;
    }
    const group = normalizeGroup({ id: uid('grupo'), numero: number, totalCotas: total, clients: [], assemblies: [], baseline: [] });
    state.groups.push(group);
    state.selectedGroupId = group.id;
    $('sorteioNewGroupNumber').value = '';
    save();
    clearAssemblyForm();
    renderAll();
    showMessage('sorteioGroupMessage', `Grupo ${number} adicionado.`);
  }

  function editGroup(id){
    const group = state.groups.find(item => item.id === id);
    if(!group) return;
    const number = prompt('Número do grupo:', group.numero);
    if(number === null) return;
    const totalRaw = prompt('Quantidade total de cotas:', String(group.totalCotas));
    if(totalRaw === null) return;
    const total = Number(totalRaw);
    if(!number.trim() || !Number.isInteger(total) || total < 1 || total > MAX_QUOTA){
      showMessage('sorteioGroupMessage', 'Dados inválidos. Use de 1 a 9.999 cotas.', 'error');
      return;
    }
    const highestUsed = Math.max(0, ...group.baseline.map(Number), ...group.clients.map(item => Number(item.cota)), ...group.assemblies.flatMap(item => item.contempladas.map(entry => Number(entry.cota))));
    if(total < highestUsed){
      showMessage('sorteioGroupMessage', `O grupo já possui a cota ${String(highestUsed).padStart(4, '0')}. O total não pode ficar abaixo dela.`, 'error');
      return;
    }
    group.numero = number.trim();
    group.totalCotas = total;
    save();
    renderAll();
    showMessage('sorteioGroupMessage', 'Grupo atualizado.');
  }

  function deleteGroup(id){
    if(state.groups.length === 1){
      showMessage('sorteioGroupMessage', 'Mantenha pelo menos um grupo cadastrado.', 'error');
      return;
    }
    const group = state.groups.find(item => item.id === id);
    if(!group || !confirm(`Excluir o grupo ${group.numero} e todo o histórico salvo nele?`)) return;
    state.groups = state.groups.filter(item => item.id !== id);
    if(state.selectedGroupId === id) state.selectedGroupId = state.groups[0].id;
    save();
    clearAssemblyForm();
    renderAll();
  }

  function renderDraft(){
    $('sorteioDraftCount').textContent = `${state.draftContempladas.length} ${state.draftContempladas.length === 1 ? 'cota' : 'cotas'}`;
    $('sorteioDraftList').innerHTML = state.draftContempladas.length ? state.draftContempladas.map(entry => `
      <div class="assembly-draft-item" data-entry-id="${escapeHTML(entry.id)}">
        <div><strong>${entry.cota}</strong><span>${escapeHTML(MODALITIES[entry.modalidade])}</span></div>
        <button type="button" aria-label="Remover cota">×</button>
      </div>`).join('') : '<div class="empty-state compact">Nenhuma cota adicionada.</div>';
    $('sorteioDraftList').querySelectorAll('.assembly-draft-item button').forEach(button => {
      button.addEventListener('click', () => {
        state.draftContempladas = state.draftContempladas.filter(entry => entry.id !== button.closest('.assembly-draft-item').dataset.entryId);
        renderDraft();
      });
    });
  }

  function addDraftEntry(){
    const group = currentGroup();
    const number = quota($('sorteioNovaCota').value);
    const modality = modalityKey($('sorteioNovaModalidade').value);
    if(!isValidQuota(number, group)){
      showMessage('sorteioFormMessage', `Informe uma cota entre 0001 e ${String(group.totalCotas).padStart(4, '0')}.`, 'error');
      return;
    }
    if(state.draftContempladas.some(entry => entry.cota === number)){
      showMessage('sorteioFormMessage', 'Essa cota já foi adicionada nesta assembleia.', 'error');
      return;
    }
    if(allContemplated(group, state.editingAssemblyId).has(number)){
      showMessage('sorteioFormMessage', 'Essa cota já estava contemplada antes desta assembleia.', 'error');
      return;
    }
    state.draftContempladas.push({ id: uid('contemplada'), cota: number, modalidade: modality });
    $('sorteioNovaCota').value = '';
    $('sorteioNovaCota').focus();
    renderDraft();
  }

  function collectAssemblyForm(){
    return normalizeAssembly({
      id: state.editingAssemblyId || uid('assembleia'),
      numero: $('sorteioAssembleia').value.trim(),
      data: $('sorteioData').value,
      contempladas: state.draftContempladas,
      createdAt: state.editingAssemblyId ? (currentGroup().assemblies.find(item => item.id === state.editingAssemblyId)?.createdAt || Date.now()) : Date.now()
    });
  }

  function validateAssembly(assembly){
    const group = currentGroup();
    if(!assembly.numero) return 'Informe o número da assembleia.';
    if(!assembly.data) return 'Informe a data da assembleia.';
    if(!assembly.contempladas.length) return 'Adicione pelo menos uma cota contemplada.';
    const invalid = assembly.contempladas.find(entry => !isValidQuota(entry.cota, group));
    if(invalid) return `A cota ${invalid.cota} não pertence ao intervalo deste grupo.`;
    const duplicates = group.assemblies.filter(item => item.id !== assembly.id).flatMap(item => item.contempladas.map(entry => entry.cota));
    const duplicated = assembly.contempladas.find(entry => group.baseline.includes(entry.cota) || duplicates.includes(entry.cota));
    if(duplicated) return `A cota ${duplicated.cota} já foi contemplada anteriormente neste grupo.`;
    return '';
  }

  function clearAssemblyForm(){
    state.editingAssemblyId = null;
    state.draftContempladas = [];
    $('sorteioAssembleia').value = '';
    $('sorteioData').value = todayISO();
    $('sorteioNovaCota').value = '';
    $('sorteioConferirBtn').textContent = 'Salvar assembleia';
    renderDraft();
  }

  function fillAssemblyForm(assembly){
    state.editingAssemblyId = assembly.id;
    state.draftContempladas = assembly.contempladas.map(entry => ({...entry}));
    $('sorteioAssembleia').value = assembly.numero;
    $('sorteioData').value = assembly.data;
    $('sorteioConferirBtn').textContent = 'Salvar alterações';
    renderDraft();
    document.getElementById('view-sorteio').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function submitAssembly(){
    const group = currentGroup();
    const assembly = collectAssemblyForm();
    const error = validateAssembly(assembly);
    if(error){
      showMessage('sorteioFormMessage', error, 'error');
      return;
    }
    const index = group.assemblies.findIndex(item => item.id === assembly.id);
    if(index >= 0) group.assemblies.splice(index, 1, assembly);
    else group.assemblies.push(assembly);
    state.lastAssemblyId = assembly.id;
    save();
    renderLatest(assembly);
    clearAssemblyForm();
    renderAll();
    showMessage('sorteioFormMessage', index >= 0 ? 'Assembleia atualizada.' : 'Assembleia salva.');
  }

  function renderLatest(assembly){
    if(!assembly){
      $('sorteioResultado').hidden = true;
      return;
    }
    $('sorteioResultado').hidden = false;
    $('sorteioResultadoTitulo').textContent = `Assembleia ${assembly.numero}`;
    $('sorteioResultadoData').textContent = dateBR(assembly.data);
    const winners = winnersDetailed(assembly);
    const references = referenceQuotas(assembly);
    $('sorteioDestaque').innerHTML = `
      <div><span>Grupo</span><strong>${escapeHTML(currentGroup().numero)}</strong></div>
      <div><span>Total contemplado</span><strong>${winners.length}</strong></div>
      <div><span>Por sorteio</span><strong>${references.length}</strong></div>`;
    $('sorteioContemplados').innerHTML = winners.map(item => `
      <div class="assembly-winner-card"><span>${escapeHTML(item.modalidade)}</span><strong>${item.cota}</strong></div>`).join('');
  }

  function renderClients(){
    const group = currentGroup();
    $('sorteioClientesCount').textContent = `${group.clients.length} ${group.clients.length === 1 ? 'cliente' : 'clientes'}`;
    $('sorteioClientList').innerHTML = group.clients.length ? group.clients.map(client => `
      <div class="client-edit-row" data-client-id="${escapeHTML(client.id)}">
        <div><strong>${escapeHTML(client.nome)}</strong><span>Cota ${client.cota}</span></div>
        <div class="client-edit-actions"><button type="button" data-action="edit">Editar</button><button type="button" data-action="delete" class="danger">Excluir</button></div>
      </div>`).join('') : '<div class="empty-state">Nenhum cliente cadastrado neste grupo.</div>';

    $('sorteioClientList').querySelectorAll('.client-edit-row').forEach(row => {
      const client = group.clients.find(item => item.id === row.dataset.clientId);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        const name = prompt('Nome do cliente:', client.nome);
        if(name === null) return;
        const number = quota(prompt('Número da cota:', client.cota));
        if(!name.trim() || !isValidQuota(number, group)){
          showMessage('sorteioClientesMessage', 'Nome ou cota inválidos.', 'error');
          return;
        }
        if(group.clients.some(item => item.id !== client.id && item.cota === number)){
          showMessage('sorteioClientesMessage', 'Essa cota já pertence a outro cliente deste grupo.', 'error');
          return;
        }
        client.nome = name.trim();
        client.cota = number;
        save();
        renderClients();
        renderReportSelect();
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if(!confirm(`Excluir ${client.nome} deste grupo?`)) return;
        group.clients = group.clients.filter(item => item.id !== client.id);
        save();
        renderClients();
        renderReportSelect();
      });
    });
  }

  function addClient(){
    const group = currentGroup();
    const name = $('sorteioNewClientName').value.trim();
    const number = quota($('sorteioNewClientQuota').value);
    if(!name || !isValidQuota(number, group)){
      showMessage('sorteioClientesMessage', `Informe nome e uma cota entre 0001 e ${String(group.totalCotas).padStart(4, '0')}.`, 'error');
      return;
    }
    if(group.clients.some(item => item.cota === number)){
      showMessage('sorteioClientesMessage', 'Essa cota já está cadastrada neste grupo.', 'error');
      return;
    }
    group.clients.push({ id: uid('cliente'), nome: name, cota: number });
    $('sorteioNewClientName').value = '';
    $('sorteioNewClientQuota').value = '';
    save();
    renderClients();
    renderReportSelect();
    showMessage('sorteioClientesMessage', 'Cliente adicionado.');
  }

  function renderHistory(){
    const group = currentGroup();
    const assemblies = sortAssembliesDesc(group);
    $('sorteioHistoryCount').textContent = `${assemblies.length} ${assemblies.length === 1 ? 'assembleia' : 'assembleias'}`;
    $('sorteioHistoryList').innerHTML = assemblies.length ? assemblies.map(assembly => {
      const winners = winnersDetailed(assembly);
      return `
        <div class="draw-history-item" data-assembly-id="${escapeHTML(assembly.id)}">
          <div class="draw-history-head"><div><strong>Assembleia ${escapeHTML(assembly.numero)}</strong><span>${dateBR(assembly.data)} · ${winners.length} contemplações</span></div><div class="draw-history-actions"><button type="button" data-action="edit">Editar</button><button type="button" data-action="delete" class="danger">Excluir</button></div></div>
          <div class="draw-history-winners">${winners.map(item => `<span><b>${escapeHTML(item.modalidade)}</b>${item.cota}</span>`).join('')}</div>
        </div>`;
    }).join('') : '<div class="empty-state">Nenhuma assembleia cadastrada neste grupo.</div>';

    $('sorteioHistoryList').querySelectorAll('.draw-history-item').forEach(row => {
      const assembly = group.assemblies.find(item => item.id === row.dataset.assemblyId);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => fillAssemblyForm(assembly));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if(!confirm(`Excluir a assembleia ${assembly.numero}?`)) return;
        group.assemblies = group.assemblies.filter(item => item.id !== assembly.id);
        if(state.lastAssemblyId === assembly.id) state.lastAssemblyId = null;
        save();
        renderAll();
        showMessage('sorteioHistoryMessage', 'Assembleia excluída.');
      });
    });
  }

  function renderRangeStats(){
    const group = currentGroup();
    const ranges = calculateRangeStats(group);
    const contemplated = allContemplated(group).size;
    const active = Math.max(0, group.totalCotas - contemplated);
    const best = ranges.reduce((current, item) => !current || item.probability > current.probability ? item : current, null);
    $('sorteioRangeBest').textContent = best && active ? `${rangeLabel(best.start, best.end)} · ${formatPercent(best.probability)}` : 'Sem cotas ativas';
    $('sorteioRangeSummary').innerHTML = `
      <div><span>Cotas previstas</span><strong>${formatInteger(group.totalCotas)}</strong></div>
      <div><span>Já contempladas</span><strong>${formatInteger(contemplated)}</strong></div>
      <div><span>Ainda ativas</span><strong>${formatInteger(active)}</strong></div>
      <div><span>Referências possíveis</span><strong>${formatInteger(group.totalCotas)}</strong></div>`;
    $('sorteioRangeGrid').innerHTML = ranges.map(item => `
      <div class="range-stat-card${best && item.start === best.start ? ' best' : ''}">
        <div class="range-stat-head"><strong>${rangeLabel(item.start, item.end)}</strong><span>${formatPercent(item.probability)}</span></div>
        <div class="range-stat-bar"><i style="width:${Math.min(100, item.probability * 20)}%"></i></div>
        <small>${formatInteger(item.active)} cotas ativas · ${formatInteger(item.contemplated)} contempladas · ${formatInteger(item.possibilities)} referências possíveis</small>
      </div>`).join('');
  }

  function renderModalityStats(){
    const group = currentGroup();
    const totals = modalityTotals(group);
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    $('sorteioModalityAssemblies').textContent = `${group.assemblies.length} ${group.assemblies.length === 1 ? 'assembleia' : 'assembleias'}`;
    $('sorteioModalityGrid').innerHTML = `
      <div class="modality-stat-card total"><span>Total de contemplações</span><strong>${formatInteger(total)}</strong></div>
      ${Object.entries(MODALITIES).map(([key, label]) => `<div class="modality-stat-card"><span>${escapeHTML(label)}</span><strong>${formatInteger(totals[key] || 0)}</strong></div>`).join('')}`;
  }

  function renderBaseline(){
    const group = currentGroup();
    $('sorteioBaseCount').textContent = `${group.baseline.length} ${group.baseline.length === 1 ? 'cota anterior' : 'cotas anteriores'}`;
    $('sorteioBaseContempladas').value = group.baseline.join('\n');
  }

  function saveBaseConfiguration(){
    const group = currentGroup();
    const base = extractQuotaList($('sorteioBaseContempladas').value, group);
    const assemblyWinners = new Set(group.assemblies.flatMap(item => item.contempladas.map(entry => entry.cota)));
    const repeated = base.find(number => assemblyWinners.has(number));
    if(repeated){
      showMessage('sorteioBaseMessage', `A cota ${repeated} já está registrada em uma assembleia.`, 'error');
      return;
    }
    group.baseline = base;
    save();
    renderAll();
    showMessage('sorteioBaseMessage', 'Configuração salva e mapa recalculado.');
  }

  function renderReportSelect(){
    const group = currentGroup();
    $('sorteioReportClient').innerHTML = group.clients.length ? group.clients.map(client => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.nome)} · ${client.cota}</option>`).join('') : '<option value="">Nenhum cliente cadastrado</option>';
  }

  function clientAssemblyData(client, assembly, group){
    const references = referenceQuotas(assembly).map(Number);
    const clientNumber = Number(client.cota);
    const priorRemoved = allContemplated(group, assembly.id);
    const activeBefore = [];
    for(let number = 1; number <= group.totalCotas; number += 1){
      if(!priorRemoved.has(String(number).padStart(4, '0'))) activeBefore.push(number);
    }
    if(!references.length) return { reference: null, rawDistance: null, activeBetween: null };
    const reference = references.reduce((best, value) => Math.abs(value - clientNumber) < Math.abs(best - clientNumber) ? value : best, references[0]);
    const min = Math.min(reference, clientNumber);
    const max = Math.max(reference, clientNumber);
    const activeBetween = activeBefore.filter(number => number > min && number < max).length;
    return { reference: String(reference).padStart(4, '0'), rawDistance: Math.abs(reference - clientNumber), activeBetween };
  }

  function generateReport(){
    const group = currentGroup();
    const client = group.clients.find(item => item.id === $('sorteioReportClient').value);
    if(!client){
      showMessage('sorteioReportMessage', 'Selecione um cliente.', 'error');
      return;
    }
    if(!group.assemblies.length){
      showMessage('sorteioReportMessage', 'Salve pelo menos uma assembleia neste grupo.', 'error');
      return;
    }
    const settings = global.Simulador?.Configuracoes?.load?.() || {};
    const rows = sortAssembliesAsc(group).map(assembly => {
      const data = clientAssemblyData(client, assembly, group);
      const winners = winnersDetailed(assembly);
      const currentWin = winners.find(item => item.cota === client.cota);
      return `
        <tr>
          <td><b>${escapeHTML(assembly.numero)}</b><small>${dateBR(assembly.data)}</small></td>
          <td>${winners.map(item => `<span><b>${escapeHTML(item.modalidade)}</b>${item.cota}</span>`).join('')}</td>
          <td>${data.reference ? `<b>${data.reference}</b><small>Distância numérica: ${formatInteger(data.rawDistance)}<br>Cotas ativas no intervalo: ${formatInteger(data.activeBetween)}</small>` : '<b>Sem referência</b><small>Nenhuma cota marcada como sorteio</small>'}${currentWin ? `<em>Contemplada por ${escapeHTML(currentWin.modalidade.toLowerCase())}</em>` : ''}</td>
        </tr>`;
    }).join('');

    const report = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Histórico — ${escapeHTML(client.nome)}</title><style>
      @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0;font-size:9px}.header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #f28a16;padding-bottom:10px;margin-bottom:10px}.brand{display:flex;gap:10px;align-items:center}.mark{width:38px;height:38px;border-radius:11px;background:#f28a16;color:#fff;display:grid;place-items:center;font-weight:900}.header h1{font-size:18px;margin:0}.header p,.meta{margin:3px 0 0;color:#637181}.meta{text-align:right;line-height:1.5}.client{display:grid;grid-template-columns:2fr 1fr 1fr;gap:7px;margin-bottom:10px}.card{border:1px solid #d8e0e7;border-radius:9px;padding:8px;background:#f7f9fb}.card span{display:block;font-size:7px;text-transform:uppercase;color:#6b7782}.card strong{display:block;font-size:14px;margin-top:4px}.card.primary{background:#fff3e4;border-color:#f1b56e}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#182633;color:#fff;font-size:7px;text-transform:uppercase;padding:7px;text-align:left}td{border-bottom:1px solid #dfe5ea;padding:7px;vertical-align:top}th:nth-child(1){width:15%}th:nth-child(2){width:50%}th:nth-child(3){width:35%}td span{display:inline-block;background:#f3f6f8;border-radius:4px;padding:4px;margin:0 3px 3px 0;font-size:7px}td span b,td small{display:block;color:#6c7882;font-size:7px}em{display:block;color:#b45f00;font-style:normal;font-weight:700;margin-top:3px}.footer{margin-top:9px;border-top:1px solid #d8e0e7;padding-top:7px;color:#68747e;font-size:7px;line-height:1.45}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <header class="header"><div class="brand"><div class="mark">SC</div><div><h1>Histórico individual de assembleias</h1><p>${escapeHTML(settings.company || 'Acompanhamento de Consórcio')}</p></div></div><div class="meta">Grupo ${escapeHTML(group.numero)}<br>Emitido em ${new Date().toLocaleString('pt-BR')}${settings.consultant ? `<br>Consultor: ${escapeHTML(settings.consultant)}` : ''}</div></header>
      <section class="client"><div class="card primary"><span>Cliente</span><strong>${escapeHTML(client.nome)} · ${client.cota}</strong></div><div class="card"><span>Grupo</span><strong>${escapeHTML(group.numero)}</strong></div><div class="card"><span>Assembleias</span><strong>${group.assemblies.length}</strong></div></section>
      <table><thead><tr><th>Assembleia</th><th>Cotas contempladas</th><th>Referência e proximidade</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer"><b>Importante:</b> relatório formado pelos registros manuais deste grupo. A distância histórica não prevê o próximo resultado. Confira os dados nos resultados oficiais da administradora.</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`;

    const reportWindow = window.open('', '_blank');
    if(!reportWindow){
      showMessage('sorteioReportMessage', 'Permita pop-ups no navegador e tente novamente.', 'error');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(report);
    reportWindow.document.close();
  }

  function renderAll(){
    renderGroupSelector();
    renderGroupList();
    renderDraft();
    renderClients();
    renderReportSelect();
    renderHistory();
    renderRangeStats();
    renderModalityStats();
    renderBaseline();
    const group = currentGroup();
    const latest = state.lastAssemblyId ? group.assemblies.find(item => item.id === state.lastAssemblyId) : null;
    renderLatest(latest || null);
  }

  function bindQuotaInput(id){
    const input = $(id);
    if(!input) return;
    input.addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4); });
  }

  function bind(){
    $('sorteioData').value = todayISO();
    ['sorteioNovaCota', 'sorteioNewClientQuota'].forEach(bindQuotaInput);
    $('sorteioGrupoSelect').addEventListener('change', event => selectGroup(event.target.value));
    $('sorteioAddGroupBtn').addEventListener('click', addGroup);
    $('sorteioAddContempladaBtn').addEventListener('click', addDraftEntry);
    $('sorteioNovaCota').addEventListener('keydown', event => {
      if(event.key === 'Enter'){
        event.preventDefault();
        addDraftEntry();
      }
    });
    $('sorteioConferirBtn').addEventListener('click', submitAssembly);
    $('sorteioAddClientBtn').addEventListener('click', addClient);
    $('sorteioGenerateReportBtn').addEventListener('click', generateReport);
    $('sorteioSaveBaseBtn').addEventListener('click', saveBaseConfiguration);
  }

  function init(){
    load();
    bind();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
