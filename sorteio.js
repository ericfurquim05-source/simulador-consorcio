(function(global){
  'use strict';

  const STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const LEGACY_GROUPS = 'simulador-sorteio-grupos-v1';
  const LEGACY_CLIENTS = 'simulador-sorteio-clientes-v1';
  const MAX_QUOTA = 9999;
  const ALERT_DISTANCE = 10;
  const DEFAULT_GROUP_SIZE = 5000;
  const DEFAULT_GROUP_TERM = 220;
  const MIN_QUOTA_DISTANCE = 21;
  const FEDERAL_DB = global.FEDERAL_HISTORY_DB || null;
  const FEDERAL_60_MONTHS = Array.isArray(FEDERAL_DB?.records) ? FEDERAL_DB.records : [];

  function validateFederalDatabase(){
    const errors = [];
    if(!FEDERAL_DB) errors.push('base não carregada');
    if(FEDERAL_DB?.windowMonths !== 60) errors.push('janela diferente de 60 meses');
    if(FEDERAL_60_MONTHS.length !== 60) errors.push('quantidade diferente de 60 registros');

    const contests = new Set();
    const months = new Set();

    FEDERAL_60_MONTHS.forEach((item, index) => {
      const raw = String(item?.raw || '');
      const ref = String(item?.reference || '');
      const match = String(item?.date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

      if(!/^\d{6}$/.test(raw)) errors.push('1º prêmio inválido no registro ' + (index + 1));
      if(!/^\d{4}$/.test(ref) || raw.slice(-4) !== ref) errors.push('referência divergente no registro ' + (index + 1));
      if(!Number.isInteger(Number(item?.contest))) errors.push('concurso inválido no registro ' + (index + 1));

      const contestKey = String(item?.contest);
      if(contests.has(contestKey)) errors.push('concurso duplicado ' + contestKey);
      contests.add(contestKey);

      if(match){
        const monthKey = match[3] + '-' + match[2];
        if(months.has(monthKey)) errors.push('mês duplicado ' + monthKey);
        months.add(monthKey);
      }else{
        errors.push('data inválida no registro ' + (index + 1));
      }
    });

    return {
      ok: errors.length === 0 && months.size === 60 && contests.size === 60,
      errors
    };
  }

  const FEDERAL_DB_STATUS = validateFederalDatabase();

  const IMPORT_RUI_HARI_KEY = 'simulador-sorteio-import-rui-hari-v1';

  const IMPORT_RUI_HARI = [
    {
      nome: 'Rui',
      cotas: ['1755','4874','4890','4828','4498','4343','3322','3609','3880','2448','2269','1644','1550','1949','3177','3257','1199','0909']
    },
    {
      nome: 'Hari',
      cotas: ['1652','3783','2153','2009','4927','3935','3221','3915','4079','0840','2893','1220']
    }
  ];

  const state = {
    clients: [],
    history: [],
    currentRecordId: null,
    search: '',
    groupSize: DEFAULT_GROUP_SIZE,
    groupTerm: DEFAULT_GROUP_TERM
  };

  const $ = id => document.getElementById(id);

  function activeGroupSize(){
    return Math.min(MAX_QUOTA, Math.max(1, Math.round(Number(state.groupSize) || DEFAULT_GROUP_SIZE)));
  }

  function activeGroupTerm(){
    return Math.min(360, Math.max(1, Math.round(Number(state.groupTerm) || DEFAULT_GROUP_TERM)));
  }

  function formatDecimal(value, digits = 2){
    return (Number(value) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function percent(value, digits = 2){
    return formatDecimal(value, digits) + '%';
  }

  function coverageForNumbers(numbers){
    const groupSize = activeGroupSize();
    const covered = new Set();
    (numbers || []).forEach(value => {
      const number = Number(value);
      if(!Number.isInteger(number) || number < 1 || number > groupSize) return;
      const from = Math.max(1, number - ALERT_DISTANCE);
      const to = Math.min(groupSize, number + ALERT_DISTANCE);
      for(let item = from; item <= to; item += 1) covered.add(item);
    });
    return {
      count: covered.size,
      percentage: groupSize ? (covered.size / groupSize) * 100 : 0
    };
  }

  function mathForQuotaCount(quotaCount){
    const groupSize = activeGroupSize();
    const term = activeGroupTerm();
    const q = Math.max(0, Math.min(groupSize, Number(quotaCount) || 0));
    const share = groupSize ? q / groupSize : 0;
    const averageGroupContemplations = term ? groupSize / term : 0;
    const expectedProjectContemplations = term ? q / term : 0;
    const monthlyProbability = share > 0
      ? (1 - Math.pow(1 - share, averageGroupContemplations)) * 100
      : 0;
    return {
      groupSize,
      term,
      sharePercentage: share * 100,
      averageGroupContemplations,
      expectedProjectContemplations,
      monthlyProbability,
      monthsPerExpected: expectedProjectContemplations > 0 ? 1 / expectedProjectContemplations : 0
    };
  }

  function clientMath(client){
    const groupSize = activeGroupSize();
    const validNumbers = (client?.cotas || []).map(Number).filter(number => number >= 1 && number <= groupSize);
    const coverage = coverageForNumbers(validNumbers);
    return {
      validQuotaCount: validNumbers.length,
      coverage,
      ...mathForQuotaCount(validNumbers.length)
    };
  }

  function renderGroupMath(){
    const groupSize = activeGroupSize();
    const term = activeGroupTerm();
    const average = term ? groupSize / term : 0;
    if($('sorteioGroupSize')) $('sorteioGroupSize').value = groupSize;
    if($('sorteioGroupTerm')) $('sorteioGroupTerm').value = term;
    if($('sorteioAvgContemplations')) $('sorteioAvgContemplations').textContent = formatDecimal(average, 2) + ' cotas/mês';
    if($('sorteioRadarRange')) $('sorteioRadarRange').textContent = (ALERT_DISTANCE * 2 + 1) + ' números por cota';
    if($('sorteioMathUniverse')) $('sorteioMathUniverse').textContent = formatDecimal(groupSize, 0) + ' posições';
  }

  function escapeHTML(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function uid(prefix){
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function loadJSON(key, fallback){
    try{
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    }catch(_error){
      return fallback;
    }
  }

  function quota(value){
    const digits = String(value ?? '').replace(/\D/g, '');
    if(!digits) return '';
    const lastFour = digits.slice(-4);
    const number = Number(lastFour);
    if(!Number.isInteger(number) || number < 1 || number > MAX_QUOTA) return '';
    return String(number).padStart(4, '0');
  }

  function extractQuotaList(text){
    const chunks = String(text || '')
      .replace(/\u00a0/g, ' ')
      .split(/[\s,;|/\\-]+/)
      .map(part => part.replace(/\D/g, ''))
      .filter(Boolean);

    const found = [];
    const seen = new Set();

    chunks.forEach(chunk => {
      const normalized = quota(chunk);
      if(!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      found.push(normalized);
    });

    return found.sort((a, b) => Number(a) - Number(b));
  }

  function normalizeDraw(value){
    const digits = String(value ?? '').replace(/\D/g, '');
    if(!digits) return null;
    const reference = quota(digits);
    if(!reference) return null;
    return {
      raw: digits,
      reference,
      reduced: digits.length > 4
    };
  }

  function normalizeClient(item){
    const nome = String(item?.nome || item?.name || '').trim();
    let cotas = [];
    if(Array.isArray(item?.cotas)) cotas = item.cotas.map(quota).filter(Boolean);
    else if(item?.cota) cotas = [quota(item.cota)].filter(Boolean);
    cotas = [...new Set(cotas)].sort((a, b) => Number(a) - Number(b));
    if(!nome || !cotas.length) return null;
    return {
      id: String(item?.id || uid('cliente')),
      nome,
      cotas,
      createdAt: Number(item?.createdAt || Date.now())
    };
  }

  function normalizeRecord(item){
    const reference = quota(item?.reference || item?.numero || item?.cota || item?.raw);
    if(!reference) return null;
    const raw = String(item?.raw || item?.numero || reference).replace(/\D/g, '') || reference;
    return {
      id: String(item?.id || uid('sorteio')),
      raw,
      reference,
      createdAt: Number(item?.createdAt || Date.now()),
      migrated: Boolean(item?.migrated)
    };
  }

  function mergeClient(target, incoming){
    const key = incoming.nome.trim().toLocaleLowerCase('pt-BR');
    const existing = target.find(item => item.nome.trim().toLocaleLowerCase('pt-BR') === key);
    if(existing){
      existing.cotas = [...new Set(existing.cotas.concat(incoming.cotas))].sort((a, b) => Number(a) - Number(b));
      return existing;
    }
    target.push(incoming);
    return incoming;
  }

  function migrateLegacy(){
    const clients = [];
    const history = [];
    const groups = loadJSON(LEGACY_GROUPS, null);

    if(Array.isArray(groups)){
      groups.forEach(group => {
        (Array.isArray(group?.clients) ? group.clients : []).forEach(item => {
          const normalized = normalizeClient(item);
          if(normalized) mergeClient(clients, normalized);
        });

        (Array.isArray(group?.assemblies) ? group.assemblies : []).forEach(assembly => {
          const dateTime = assembly?.data
            ? new Date(String(assembly.data) + 'T12:00:00').getTime()
            : Number(assembly?.createdAt || Date.now());
          (Array.isArray(assembly?.contempladas) ? assembly.contempladas : [])
            .filter(entry => String(entry?.modalidade || '').toLowerCase() === 'sorteio')
            .forEach(entry => {
              const reference = quota(entry?.cota);
              if(reference){
                history.push(normalizeRecord({
                  id: uid('migrado'),
                  raw: reference,
                  reference,
                  createdAt: Number.isFinite(dateTime) ? dateTime : Date.now(),
                  migrated: true
                }));
              }
            });
        });
      });
    }

    if(!clients.length){
      const legacyClients = loadJSON(LEGACY_CLIENTS, []);
      (Array.isArray(legacyClients) ? legacyClients : []).forEach(item => {
        const normalized = normalizeClient(item);
        if(normalized) mergeClient(clients, normalized);
      });
    }

    const uniqueHistory = [];
    const seen = new Set();
    history.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt).forEach(item => {
      const key = item.reference + ':' + new Date(item.createdAt).toISOString().slice(0, 10);
      if(seen.has(key)) return;
      seen.add(key);
      uniqueHistory.push(item);
    });

    return { clients, history: uniqueHistory };
  }

  function applyRuiHariImport(){
    if(localStorage.getItem(IMPORT_RUI_HARI_KEY) === '1') return;

    IMPORT_RUI_HARI.forEach(seed => {
      const incoming = normalizeClient({
        id: uid('cliente'),
        nome: seed.nome,
        cotas: seed.cotas,
        createdAt: Date.now()
      });
      if(incoming) mergeClient(state.clients, incoming);
    });

    save();
    localStorage.setItem(IMPORT_RUI_HARI_KEY, '1');
  }

  function load(){
    const stored = loadJSON(STORAGE_KEY, null);
    if(stored && Array.isArray(stored.clients)){
      state.clients = stored.clients.map(normalizeClient).filter(Boolean);
      state.groupSize = Math.min(MAX_QUOTA, Math.max(1, Math.round(Number(stored.groupSize) || DEFAULT_GROUP_SIZE)));
      state.groupTerm = Math.min(360, Math.max(1, Math.round(Number(stored.groupTerm) || DEFAULT_GROUP_TERM)));
    }else{
      const migrated = migrateLegacy();
      state.clients = migrated.clients;
    }

    // O histórico oficial vem exclusivamente da base Federal interna.
    // Remove definitivamente conferências manuais antigas salvas em versões anteriores.
    state.history = [];
    state.currentRecordId = null;
    localStorage.removeItem('simulador-sorteio-clientes-v1');
    localStorage.setItem('simulador-sorteio-manual-history-purged-v1', '1');
    applyRuiHariImport();
    save();
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clients: state.clients,
      history: [],
      groupSize: activeGroupSize(),
      groupTerm: activeGroupTerm()
    }));
  }

  function showMessage(id, text, type = 'success'){
    const element = $(id);
    if(!element) return;
    element.textContent = text;
    element.className = 'message ' + type;
    element.hidden = false;
    clearTimeout(element._timer);
    element._timer = setTimeout(() => { element.hidden = true; }, 5200);
  }

  function directionLabel(cotaNumber, referenceNumber){
    if(cotaNumber === referenceNumber) return 'exata';
    const distance = Math.abs(cotaNumber - referenceNumber);
    return cotaNumber < referenceNumber ? distance + ' abaixo' : distance + ' acima';
  }

  function computeMatches(reference){
    const ref = Number(reference);
    const matches = [];

    state.clients.forEach(client => {
      client.cotas.forEach(cotaValue => {
        const number = Number(cotaValue);
        const distance = Math.abs(number - ref);
        if(distance > ALERT_DISTANCE) return;
        matches.push({
          clientId: client.id,
          nome: client.nome,
          cota: cotaValue,
          distance,
          direction: directionLabel(number, ref)
        });
      });
    });

    return matches.sort((a, b) =>
      a.distance - b.distance ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      Number(a.cota) - Number(b.cota)
    );
  }

  function recordsForClient(client){
    const quotaNumbers = client.cotas.map(Number);
    return unifiedHistoryRows().filter(record => {
      const ref = Number(record.reference);
      return quotaNumbers.some(number => Math.abs(number - ref) <= ALERT_DISTANCE);
    });
  }

  function registeredQuotaEntries(excludeClientId = null){
    const entries = [];
    state.clients.forEach(client => {
      if(excludeClientId && client.id === excludeClientId) return;
      client.cotas.forEach(cotaValue => {
        entries.push({
          clientId: client.id,
          nome: client.nome,
          cota: cotaValue,
          number: Number(cotaValue)
        });
      });
    });
    return entries;
  }

  function pendingQuotaNumbers(){
    const textarea = $('sorteioClientQuotas');
    if(!textarea) return [];
    return extractQuotaList(textarea.value)
      .map(Number)
      .filter(number => number >= 1 && number <= activeGroupSize());
  }

  function federalHistoryWindow(){
    return FEDERAL_60_MONTHS.slice()
      .sort((a, b) => {
        const [da, ma, ya] = a.date.split('/').map(Number);
        const [db, mb, yb] = b.date.split('/').map(Number);
        return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
      })
      .slice(0, 60);
  }

  function historicalReferenceSet(){
    if(!FEDERAL_DB_STATUS.ok) return new Set();
    return new Set(federalHistoryWindow().map(item => item.reference));
  }

  function avoidHistoricalEnabled(){
    const control = $('sorteioAvoidHistorical');
    return control ? control.checked : true;
  }

  function computeCoverage(){
    return coverageForNumbers(registeredQuotaEntries().map(entry => entry.number));
  }

  function unifiedHistoryRows(){
    return federalHistoryWindow().map(item => ({
      id: 'official-' + item.contest,
      source: 'official',
      date: item.date,
      contest: item.contest,
      raw: item.raw,
      reference: item.reference,
      createdAt: (() => {
        const [day, month, year] = item.date.split('/').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getTime();
      })()
    })).sort((a, b) => b.createdAt - a.createdAt);
  }

  function renderUnifiedHistory(){
    const list = $('sorteioUnifiedHistoryList');
    if(!list) return;

    const rows = unifiedHistoryRows();
    const officialCount = federalHistoryWindow().length;
    const groupSize = activeGroupSize();
    const inRange = rows.filter(item => Number(item.reference) >= 1 && Number(item.reference) <= groupSize).length;

    $('sorteioUnifiedHistoryCount').textContent = rows.length + (rows.length === 1 ? ' sorteio' : ' sorteios');
    $('sorteioOfficialHistoryCount').textContent = officialCount;
    $('sorteioFederalInRangeCount').textContent = inRange;

    const dbStatus = $('sorteioFederalDbStatus');
    if(dbStatus){
      dbStatus.textContent = FEDERAL_DB_STATUS.ok
        ? 'Base interna validada · ' + officialCount + '/60 registros'
        : 'Base com erro · filtro histórico desativado';
      dbStatus.className = 'radar-db-status ' + (FEDERAL_DB_STATUS.ok ? 'ok' : 'error');
      if(!FEDERAL_DB_STATUS.ok) dbStatus.title = FEDERAL_DB_STATUS.errors.join(' | ');
    }
    const avoid = $('sorteioAvoidHistorical');
    if(avoid && !FEDERAL_DB_STATUS.ok){
      avoid.checked = false;
      avoid.disabled = true;
    }

    const registered = new Map();
    registeredQuotaEntries().forEach(entry => {
      if(!registered.has(entry.cota)) registered.set(entry.cota, []);
      registered.get(entry.cota).push(entry.nome);
    });

    list.innerHTML = rows.map(item => {
      const owners = registered.get(item.reference) || [];
      const matches = computeMatches(item.reference);
      const exact = matches.some(match => match.distance === 0);
      const sourceLabel = 'OFICIAL';
      const date = item.date + ' · concurso ' + item.contest;
      const owner = owners.length
        ? '<span class="radar-federal-owner">Cota cadastrada: ' + escapeHTML(owners.join(', ')) + '</span>'
        : '';
      const matchLabel = exact ? 'cota exata' : matches.length ? matches.length + (matches.length === 1 ? ' alerta' : ' alertas') : 'sem alerta';

      return '<div class="radar-unified-history-row official" data-record-id="' + escapeHTML(item.id) + '">' +
        '<div class="radar-unified-history-main">' +
          '<div><strong>' + item.reference + '</strong><span>' + escapeHTML(date) + '</span></div>' +
          '<div><b>' + sourceLabel + '</b><span>1º prêmio/ref. ' + escapeHTML(item.raw) + '</span>' + owner + '</div>' +
        '</div>' +
        '<div class="radar-unified-history-side"><span>' + matchLabel + '</span></div>' +
      '</div>';
    }).join('');

  }

  function freeQuotaSuggestions(){
    const occupied = registeredQuotaEntries()
      .map(entry => entry.number)
      .filter(number => number >= 1 && number <= activeGroupSize())
      .concat(pendingQuotaNumbers())
      .sort((a, b) => a - b);

    const historical = historicalReferenceSet();
    const selected = [];
    const groupSize = activeGroupSize();
    for(let number = 1; number <= groupSize; number += 1){
      const formatted = String(number).padStart(4, '0');
      if(avoidHistoricalEnabled() && historical.has(formatted)) continue;
      const farFromOccupied = occupied.every(used => Math.abs(number - used) >= MIN_QUOTA_DISTANCE);
      if(!farFromOccupied) continue;
      const previousSuggested = selected[selected.length - 1];
      if(previousSuggested !== undefined && number - previousSuggested < MIN_QUOTA_DISTANCE) continue;
      selected.push(number);
    }
    return selected.map(number => String(number).padStart(4, '0'));
  }

  function nearestConflict(cotas, excludeClientId = null, existingSameClient = []){
    const candidates = cotas.map(Number);
    const existing = registeredQuotaEntries(excludeClientId);
    existingSameClient.forEach(cotaValue => {
      existing.push({clientId: excludeClientId || '', nome: 'este cliente', cota: cotaValue, number: Number(cotaValue)});
    });

    for(let i = 0; i < candidates.length; i += 1){
      for(let j = i + 1; j < candidates.length; j += 1){
        const distance = Math.abs(candidates[i] - candidates[j]);
        if(distance === 0){
          return {type:'duplicate', cota:String(candidates[i]).padStart(4,'0'), other:'na própria lista', distance:0};
        }
        if(distance < MIN_QUOTA_DISTANCE){
          return {
            type:'near',
            cota:String(candidates[i]).padStart(4,'0'),
            other:String(candidates[j]).padStart(4,'0'),
            distance
          };
        }
      }
    }

    for(const cotaNumber of candidates){
      for(const item of existing){
        const distance = Math.abs(cotaNumber - item.number);
        if(distance === 0){
          return {
            type:'duplicate',
            cota:String(cotaNumber).padStart(4,'0'),
            other:item.nome + ' · ' + item.cota,
            distance
          };
        }
        if(distance < MIN_QUOTA_DISTANCE){
          return {
            type:'near',
            cota:String(cotaNumber).padStart(4,'0'),
            other:item.nome + ' · ' + item.cota,
            distance
          };
        }
      }
    }
    return null;
  }

  function appendFreeQuota(value){
    const textarea = $('sorteioClientQuotas');
    if(!textarea) return;
    const current = extractQuotaList(textarea.value);
    if(!current.includes(value)) current.push(value);
    textarea.value = current.join(', ');
    renderParsedPreview();
    renderFreeQuotas();
    textarea.focus();
  }

  function renderFreeQuotas(){
    const list = $('sorteioFreeList');
    if(!list) return;
    const free = freeQuotaSuggestions();
    const used = new Set(
      registeredQuotaEntries()
        .map(entry => entry.number)
        .filter(number => number >= 1 && number <= activeGroupSize())
    );

    $('sorteioFreeCount').textContent = free.length + (free.length === 1 ? ' livre' : ' livres');
    $('sorteioUsedQuotaCount').textContent = used.size;
    const coverage = computeCoverage();
    if($('sorteioCoveragePct')) $('sorteioCoveragePct').textContent = coverage.percentage.toFixed(1).replace('.', ',') + '%';
    if($('sorteioCoverageCount')) $('sorteioCoverageCount').textContent = coverage.count + ' / ' + activeGroupSize();

    if(!free.length){
      list.innerHTML = '<div class="radar-empty">Não há outra posição livre que mantenha 21 números de distância dentro de 0001–' + String(activeGroupSize()).padStart(4,'0') + '.</div>';
      return;
    }

    list.innerHTML = free.map(value =>
      '<button class="radar-free-chip" type="button" data-free-quota="' + value + '" title="Adicionar cota ' + value + '">' + value + '</button>'
    ).join('');

    list.querySelectorAll('[data-free-quota]').forEach(button => {
      button.addEventListener('click', () => appendFreeQuota(button.dataset.freeQuota));
    });
  }

  async function copyFreeQuotas(){
    const free = freeQuotaSuggestions();
    if(!free.length){
      showMessage('sorteioFreeMessage', 'Não há cotas livres para copiar.', 'error');
      return;
    }
    const text = free.join(', ');
    try{
      await navigator.clipboard.writeText(text);
      showMessage('sorteioFreeMessage', free.length + ' cotas livres copiadas.');
    }catch(_error){
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showMessage('sorteioFreeMessage', free.length + ' cotas livres copiadas.');
    }
  }

  function useNextFreeQuota(){
    const free = freeQuotaSuggestions();
    if(!free.length){
      showMessage('sorteioFreeMessage', 'Não há outra cota livre nessa faixa.', 'error');
      return;
    }
    appendFreeQuota(free[0]);
    showMessage('sorteioFreeMessage', 'Cota ' + free[0] + ' adicionada ao cliente. Salve o cliente para confirmar.');
  }

  function renderParsedPreview(){
    const preview = $('sorteioParsedPreview');
    const values = extractQuotaList($('sorteioClientQuotas')?.value || '');
    if(!values.length){
      preview.className = 'radar-parsed-preview';
      preview.textContent = 'Cole as cotas para visualizar antes de salvar.';
      return;
    }
    preview.className = 'radar-parsed-preview ready';
    preview.innerHTML = '<strong>' + values.length + (values.length === 1 ? ' cota identificada' : ' cotas identificadas') + '</strong><div>' +
      values.map(value => '<span>' + value + '</span>').join('') + '</div>';
  }

  function renderAlert(record){
    const wrap = $('sorteioAlerta');
    if(!record){
      wrap.hidden = true;
      return;
    }

    const matches = computeMatches(record.reference);
    const exact = matches.filter(item => item.distance === 0);
    const card = $('sorteioAlertCard');
    wrap.hidden = false;

    card.classList.remove('safe', 'warning', 'exact');

    let title;
    let text;
    let badge;
    let eyebrow;

    if(exact.length){
      card.classList.add('exact');
      eyebrow = 'Conferência prioritária';
      title = exact.length === 1 ? 'Cota exata encontrada' : exact.length + ' cotas exatas encontradas';
      badge = 'EXATA';
      text = 'Confira imediatamente no aplicativo oficial da administradora. Além da coincidência exata, o radar também mostra outras cotas dentro da faixa de ±10.';
    }else if(matches.length){
      card.classList.add('warning');
      eyebrow = 'Zona de atenção';
      title = matches.length === 1 ? '1 cota está muito próxima' : matches.length + ' cotas estão muito próximas';
      badge = '±10';
      text = 'Existe cliente com cota até 10 números abaixo ou acima do número sorteado. Vale conferir o resultado oficial do grupo.';
    }else{
      card.classList.add('safe');
      eyebrow = 'Conferência concluída';
      title = 'Nenhuma cota na faixa de ±10';
      badge = 'OK';
      text = 'O número foi salvo no histórico. Nenhuma cota cadastrada está entre 10 números abaixo e 10 números acima.';
    }

    $('sorteioAlertEyebrow').textContent = eyebrow;
    $('sorteioAlertTitle').textContent = title;
    $('sorteioAlertBadge').textContent = badge;

    const rawNote = record.raw !== record.reference
      ? ' Número informado: ' + record.raw + ' → referência usada: ' + record.reference + ' (4 últimos dígitos).'
      : ' Número conferido: ' + record.reference + '.';
    $('sorteioAlertText').textContent = text + rawNote;

    $('sorteioAlertList').innerHTML = matches.length
      ? matches.map(item => {
          const cls = item.distance === 0 ? ' exact' : item.distance <= 3 ? ' hot' : '';
          return '<div class="radar-match-row' + cls + '">' +
            '<div><strong>' + escapeHTML(item.nome) + '</strong><span>Cota ' + item.cota + '</span></div>' +
            '<div class="radar-match-distance"><b>' + (item.distance === 0 ? 'EXATA' : item.distance) + '</b><span>' + escapeHTML(item.direction) + '</span></div>' +
          '</div>';
        }).join('')
      : '<div class="radar-empty">Tudo certo neste sorteio.</div>';
  }

  function renderClients(){
    const list = $('sorteioClientList');
    $('sorteioClientesCount').textContent = state.clients.length + (state.clients.length === 1 ? ' cliente' : ' clientes');

    const query = state.search.trim().toLocaleLowerCase('pt-BR');
    const filtered = state.clients
      .filter(client => {
        if(!query) return true;
        return client.nome.toLocaleLowerCase('pt-BR').includes(query) ||
          client.cotas.some(cotaValue => cotaValue.includes(query.replace(/\D/g, '')));
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if(!filtered.length){
      list.innerHTML = '<div class="radar-empty">' + (state.clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.') + '</div>';
      return;
    }

    list.innerHTML = filtered.map(client => {
      const hits = recordsForClient(client).length;
      const visible = client.cotas.slice(0, 8);
      const rest = client.cotas.slice(8);
      const math = clientMath(client);
      return '<article class="radar-client-row" data-client-id="' + escapeHTML(client.id) + '">' +
        '<div class="radar-client-head">' +
          '<div><strong>' + escapeHTML(client.nome) + '</strong><span>' + client.cotas.length + (client.cotas.length === 1 ? ' cota' : ' cotas') + '</span></div>' +
          (hits ? '<b class="radar-history-hit">' + hits + (hits === 1 ? ' alerta no histórico' : ' alertas no histórico') + '</b>' : '') +
        '</div>' +
        '<div class="radar-client-probability">' +
          '<div><span>Cobertura exata ±10</span><strong>' + percent(math.coverage.percentage,2) + '</strong><small>' + math.coverage.count + ' / ' + math.groupSize + ' referências</small></div>' +
          '<div><span>Participação direta</span><strong>' + percent(math.sharePercentage,3) + '</strong><small>' + math.validQuotaCount + ' / ' + math.groupSize + ' cotas</small></div>' +
          '<div><span>Média linear da carteira</span><strong>' + formatDecimal(math.expectedProjectContemplations,3) + '/mês</strong><small>' + (math.monthsPerExpected ? '1 a cada ' + formatDecimal(math.monthsPerExpected,2) + ' meses' : '—') + '</small></div>' +
          '<div><span>Chance mensal teórica*</span><strong>' + percent(math.monthlyProbability,2) + '</strong><small>modelo uniforme</small></div>' +
        '</div>' +
        '<div class="radar-quota-chips">' + visible.map(value => '<span>' + value + '</span>').join('') + '</div>' +
        (rest.length ? '<details class="radar-more-quotas"><summary>Ver todas as ' + client.cotas.length + ' cotas</summary><div class="radar-quota-chips">' + client.cotas.map(value => '<span>' + value + '</span>').join('') + '</div></details>' : '') +
        '<div class="radar-client-actions"><button type="button" data-action="edit">Editar</button><button type="button" data-action="delete" class="danger">Excluir</button></div>' +
      '</article>';
    }).join('');

    list.querySelectorAll('.radar-client-row').forEach(row => {
      const id = row.dataset.clientId;
      row.querySelector('[data-action="edit"]').addEventListener('click', () => editClient(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteClient(id));
    });
  }

  function renderAll(){
    renderGroupMath();
    renderParsedPreview();
    renderClients();
    renderUnifiedHistory();
    renderFreeQuotas();
    renderAlert(null);
  }

  function saveDraw(){
    const parsed = normalizeDraw($('sorteioNumero').value);
    if(!parsed){
      showMessage('sorteioDrawMessage', 'Informe um número válido. Ex.: 5010 ou 35.010.', 'error');
      return;
    }

    const record = normalizeRecord({
      id: uid('conferencia'),
      raw: parsed.raw,
      reference: parsed.reference,
      createdAt: Date.now()
    });

    const matches = computeMatches(record.reference);
    renderAlert(record);

    if(matches.length && navigator.vibrate){
      try{ navigator.vibrate([180, 80, 180]); }catch(_error){}
    }

    showMessage(
      'sorteioDrawMessage',
      matches.length
        ? 'Conferência feita. Encontrei ' + matches.length + (matches.length === 1 ? ' cota na faixa de ±10.' : ' cotas na faixa de ±10.')
        : 'Conferência feita. Nenhuma cota ficou na faixa de ±10.',
      matches.length ? 'warning' : 'success'
    );

    $('sorteioNumero').value = '';
    $('sorteioNumero').focus();
    setTimeout(() => $('sorteioAlerta')?.scrollIntoView({behavior: 'smooth', block: 'start'}), 80);
  }

  function addClient(){
    const nome = $('sorteioClientName').value.trim();
    const cotas = extractQuotaList($('sorteioClientQuotas').value);

    if(!nome){
      showMessage('sorteioClientMessage', 'Informe o nome do cliente.', 'error');
      return;
    }
    if(!cotas.length){
      showMessage('sorteioClientMessage', 'Cole pelo menos uma cota válida.', 'error');
      return;
    }

    const key = nome.toLocaleLowerCase('pt-BR');
    let client = state.clients.find(item => item.nome.toLocaleLowerCase('pt-BR') === key);
    let merged = false;

    const existingSameClient = client ? client.cotas : [];
    const onlyNew = client ? cotas.filter(value => !client.cotas.includes(value)) : cotas;
    const conflict = nearestConflict(onlyNew, client?.id || null, existingSameClient);
    if(conflict){
      if(conflict.type === 'duplicate'){
        showMessage('sorteioClientMessage', 'A cota ' + conflict.cota + ' já está usada por ' + conflict.other + '. Escolha uma cota livre.', 'error');
      }else{
        showMessage('sorteioClientMessage', 'A cota ' + conflict.cota + ' ficou só ' + conflict.distance + ' números de ' + conflict.other + '. Use uma cota com distância mínima de 21.', 'error');
      }
      return;
    }

    if(client){
      client.cotas = [...new Set(client.cotas.concat(cotas))].sort((a, b) => Number(a) - Number(b));
      merged = true;
    }else{
      client = normalizeClient({id: uid('cliente'), nome, cotas, createdAt: Date.now()});
      state.clients.push(client);
    }

    save();
    $('sorteioClientName').value = '';
    $('sorteioClientQuotas').value = '';
    renderAll();

    const hits = recordsForClient(client);
    if(hits.length){
      state.currentRecordId = hits[0].id;
      renderAlert(hits[0]);
      showMessage(
        'sorteioClientMessage',
        'Cliente salvo. Atenção: encontrei ' + hits.length + (hits.length === 1 ? ' sorteio antigo próximo dessas cotas.' : ' sorteios antigos próximos dessas cotas.'),
        'warning'
      );
      setTimeout(() => $('sorteioAlerta')?.scrollIntoView({behavior: 'smooth', block: 'start'}), 120);
    }else{
      showMessage('sorteioClientMessage', merged ? 'Cotas adicionadas ao cliente existente.' : 'Cliente adicionado com todas as cotas.');
    }
  }

  function editClient(id){
    const client = state.clients.find(item => item.id === id);
    if(!client) return;

    const nome = prompt('Nome do cliente:', client.nome);
    if(nome === null) return;
    const quotasText = prompt('Cotas do cliente (separe por vírgula, espaço ou linha):', client.cotas.join(', '));
    if(quotasText === null) return;

    const cleanName = nome.trim();
    const cotas = extractQuotaList(quotasText);

    if(!cleanName || !cotas.length){
      showMessage('sorteioClientMessage', 'Para editar, mantenha um nome e pelo menos uma cota válida.', 'error');
      return;
    }

    const duplicateOther = cotas.find(value => registeredQuotaEntries(client.id).some(entry => entry.cota === value));
    if(duplicateOther){
      const owner = registeredQuotaEntries(client.id).find(entry => entry.cota === duplicateOther);
      showMessage('sorteioClientMessage', 'A cota ' + duplicateOther + ' já pertence a ' + owner.nome + '. Nenhum cliente pode repetir a mesma cota.', 'error');
      return;
    }

    client.nome = cleanName;
    client.cotas = cotas;
    save();
    renderAll();

    const hits = recordsForClient(client);
    showMessage(
      'sorteioClientMessage',
      hits.length
        ? 'Cliente atualizado. O histórico encontrou ' + hits.length + (hits.length === 1 ? ' sorteio próximo.' : ' sorteios próximos.')
        : 'Cliente atualizado.',
      hits.length ? 'warning' : 'success'
    );
  }

  function deleteClient(id){
    const client = state.clients.find(item => item.id === id);
    if(!client) return;
    if(!confirm('Excluir ' + client.nome + ' e todas as cotas dele?')) return;
    state.clients = state.clients.filter(item => item.id !== id);
    save();
    renderAll();
    showMessage('sorteioClientMessage', 'Cliente excluído.');
  }

  function bind(){
    $('sorteioCheckBtn').addEventListener('click', saveDraw);
    $('sorteioNumero').addEventListener('keydown', event => {
      if(event.key === 'Enter'){
        event.preventDefault();
        saveDraw();
      }
    });

    $('sorteioClientQuotas').addEventListener('input', () => {
      renderParsedPreview();
      renderFreeQuotas();
    });
    $('sorteioAddClientBtn').addEventListener('click', addClient);
    $('sorteioUseNextFreeBtn')?.addEventListener('click', useNextFreeQuota);
    $('sorteioCopyFreeBtn')?.addEventListener('click', copyFreeQuotas);
    $('sorteioAvoidHistorical')?.addEventListener('change', renderFreeQuotas);

    const updateGroupMath = () => {
      const size = Math.min(MAX_QUOTA, Math.max(1, Math.round(Number($('sorteioGroupSize')?.value) || DEFAULT_GROUP_SIZE)));
      const term = Math.min(360, Math.max(1, Math.round(Number($('sorteioGroupTerm')?.value) || DEFAULT_GROUP_TERM)));
      state.groupSize = size;
      state.groupTerm = term;
      save();
      renderAll();
    };
    $('sorteioGroupSize')?.addEventListener('change', updateGroupMath);
    $('sorteioGroupTerm')?.addEventListener('change', updateGroupMath);

    $('sorteioClientSearch').addEventListener('input', event => {
      state.search = event.target.value;
      renderClients();
    });
  }

  function init(){
    if(!$('view-sorteio')) return;
    load();
    bind();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
