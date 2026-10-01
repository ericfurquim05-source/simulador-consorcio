(function(global){
  'use strict';

  const STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const LEGACY_GROUPS = 'simulador-sorteio-grupos-v1';
  const LEGACY_CLIENTS = 'simulador-sorteio-clientes-v1';
  const MAX_QUOTA = 9999;
  const ALERT_DISTANCE = 10;
  const FREE_QUOTA_MAX = 5000;
  const MIN_QUOTA_DISTANCE = 21;
  const FEDERAL_36_MONTHS = [
    {date:'16/09/2026', contest:6101, raw:'047125', reference:'7125'},
    {date:'19/08/2026', contest:6093, raw:'080574', reference:'0574'},
    {date:'19/07/2026', contest:6084, raw:'017667', reference:'7667'},
    {date:'17/06/2026', contest:6075, raw:'053952', reference:'3952'},
    {date:'16/05/2026', contest:6066, raw:'008667', reference:'8667'},
    {date:'18/04/2026', contest:6058, raw:'083358', reference:'3358'},
    {date:'18/03/2026', contest:6050, raw:'034456', reference:'4456'},
    {date:'21/02/2026', contest:6043, raw:'054522', reference:'4522'},
    {date:'17/01/2026', contest:6034, raw:'094590', reference:'4590'},
    {date:'17/12/2025', contest:6027, raw:'069015', reference:'9015'},
    {date:'19/11/2025', contest:6019, raw:'042441', reference:'2441'},
    {date:'18/10/2025', contest:6010, raw:'076478', reference:'6478'},
    {date:'17/09/2025', contest:6001, raw:'050309', reference:'0309'},
    {date:'16/08/2025', contest:5992, raw:'044771', reference:'4771'},
    {date:'19/07/2025', contest:5984, raw:'067482', reference:'7482'},
    {date:'18/06/2025', contest:5975, raw:'053681', reference:'3681'},
    {date:'17/05/2025', contest:5966, raw:'021652', reference:'1652'},
    {date:'16/04/2025', contest:5958, raw:'043165', reference:'3165'},
    {date:'19/03/2025', contest:5950, raw:'054838', reference:'4838'},
    {date:'19/02/2025', contest:5943, raw:'084978', reference:'4978'},
    {date:'18/01/2025', contest:5934, raw:'025472', reference:'5472'},
    {date:'21/12/2024', contest:5928, raw:'081282', reference:'1282'},
    {date:'16/11/2024', contest:5919, raw:'026609', reference:'6609'},
    {date:'19/10/2024', contest:5911, raw:'035189', reference:'5189'},
    {date:'18/09/2024', contest:5902, raw:'045525', reference:'5525'},
    {date:'17/08/2024', contest:5893, raw:'041547', reference:'1547'},
    {date:'17/07/2024', contest:5884, raw:'012630', reference:'2630'},
    {date:'19/06/2024', contest:5876, raw:'052749', reference:'2749'},
    {date:'18/05/2024', contest:5867, raw:'035181', reference:'5181'},
    {date:'17/04/2024', contest:5858, raw:'067610', reference:'7610'},
    {date:'16/03/2024', contest:5849, raw:'007542', reference:'7542'},
    {date:'17/02/2024', contest:5841, raw:'017178', reference:'7178'},
    {date:'17/01/2024', contest:5833, raw:'060541', reference:'0541'},
    {date:'16/12/2023', contest:5826, raw:'030255', reference:'0255'},
    {date:'18/11/2023', contest:5818, raw:'060687', reference:'0687'},
    {date:'18/10/2023', contest:5809, raw:'072525', reference:'2525'}
  ];
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
    search: ''
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
    if(stored && Array.isArray(stored.clients) && Array.isArray(stored.history)){
      state.clients = stored.clients.map(normalizeClient).filter(Boolean);
      state.history = stored.history.map(normalizeRecord).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    }else{
      const migrated = migrateLegacy();
      state.clients = migrated.clients;
      state.history = migrated.history;
      save();
    }

    applyRuiHariImport();
    state.currentRecordId = state.history[0]?.id || null;
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clients: state.clients,
      history: state.history
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
      .filter(number => number >= 1 && number <= FREE_QUOTA_MAX);
  }

  function historicalReferenceSet(){
    return new Set(FEDERAL_36_MONTHS.map(item => item.reference));
  }

  function avoidHistoricalEnabled(){
    const control = $('sorteioAvoidHistorical');
    return control ? control.checked : true;
  }

  function computeCoverage(){
    const covered = new Set();
    registeredQuotaEntries().forEach(entry => {
      if(entry.number < 1 || entry.number > FREE_QUOTA_MAX) return;
      const from = Math.max(1, entry.number - ALERT_DISTANCE);
      const to = Math.min(FREE_QUOTA_MAX, entry.number + ALERT_DISTANCE);
      for(let number = from; number <= to; number += 1) covered.add(number);
    });
    return {
      count: covered.size,
      percentage: FREE_QUOTA_MAX ? (covered.size / FREE_QUOTA_MAX) * 100 : 0
    };
  }

  function unifiedHistoryRows(){
    const official = FEDERAL_36_MONTHS.map(item => ({
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
    }));

    const manual = state.history.map(record => ({
      id: record.id,
      source: 'manual',
      date: '',
      contest: null,
      raw: record.raw,
      reference: record.reference,
      createdAt: record.createdAt
    }));

    return official.concat(manual).sort((a, b) => b.createdAt - a.createdAt);
  }

  function renderUnifiedHistory(){
    const list = $('sorteioUnifiedHistoryList');
    if(!list) return;

    const rows = unifiedHistoryRows();
    const officialCount = FEDERAL_36_MONTHS.length;
    const manualCount = state.history.length;
    const inRange = rows.filter(item => Number(item.reference) >= 1 && Number(item.reference) <= FREE_QUOTA_MAX).length;

    $('sorteioUnifiedHistoryCount').textContent = rows.length + (rows.length === 1 ? ' sorteio' : ' sorteios');
    $('sorteioOfficialHistoryCount').textContent = officialCount;
    $('sorteioManualHistoryCount').textContent = manualCount;
    $('sorteioFederalInRangeCount').textContent = inRange;

    const registered = new Map();
    registeredQuotaEntries().forEach(entry => {
      if(!registered.has(entry.cota)) registered.set(entry.cota, []);
      registered.get(entry.cota).push(entry.nome);
    });

    list.innerHTML = rows.map(item => {
      const owners = registered.get(item.reference) || [];
      const matches = computeMatches(item.reference);
      const exact = matches.some(match => match.distance === 0);
      const sourceLabel = item.source === 'official' ? 'OFICIAL' : 'MANUAL';
      const date = item.source === 'official'
        ? item.date + ' · concurso ' + item.contest
        : new Date(item.createdAt).toLocaleString('pt-BR');
      const owner = owners.length
        ? '<span class="radar-federal-owner">Cota cadastrada: ' + escapeHTML(owners.join(', ')) + '</span>'
        : '';
      const matchLabel = exact ? 'cota exata' : matches.length ? matches.length + (matches.length === 1 ? ' alerta' : ' alertas') : 'sem alerta';

      return '<div class="radar-unified-history-row ' + item.source + '" data-record-id="' + escapeHTML(item.id) + '">' +
        '<div class="radar-unified-history-main">' +
          '<div><strong>' + item.reference + '</strong><span>' + escapeHTML(date) + '</span></div>' +
          '<div><b>' + sourceLabel + '</b><span>1º prêmio/ref. ' + escapeHTML(item.raw) + '</span>' + owner + '</div>' +
        '</div>' +
        '<div class="radar-unified-history-side"><span>' + matchLabel + '</span>' +
          (item.source === 'manual' ? '<button type="button" data-action="delete" class="danger">Excluir</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.radar-unified-history-row.manual').forEach(row => {
      row.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteHistory(row.dataset.recordId));
    });
  }

  function freeQuotaSuggestions(){
    const occupied = registeredQuotaEntries()
      .map(entry => entry.number)
      .filter(number => number >= 1 && number <= FREE_QUOTA_MAX)
      .concat(pendingQuotaNumbers())
      .sort((a, b) => a - b);

    const historical = historicalReferenceSet();
    const selected = [];
    for(let number = 1; number <= FREE_QUOTA_MAX; number += 1){
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
        .filter(number => number >= 1 && number <= FREE_QUOTA_MAX)
    );

    $('sorteioFreeCount').textContent = free.length + (free.length === 1 ? ' livre' : ' livres');
    $('sorteioUsedQuotaCount').textContent = used.size;
    const coverage = computeCoverage();
    if($('sorteioCoveragePct')) $('sorteioCoveragePct').textContent = coverage.percentage.toFixed(1).replace('.', ',') + '%';
    if($('sorteioCoverageCount')) $('sorteioCoverageCount').textContent = coverage.count + ' / ' + FREE_QUOTA_MAX;

    if(!free.length){
      list.innerHTML = '<div class="radar-empty">Não há outra posição livre que mantenha 21 números de distância dentro de 0001–5000.</div>';
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
      return '<article class="radar-client-row" data-client-id="' + escapeHTML(client.id) + '">' +
        '<div class="radar-client-head">' +
          '<div><strong>' + escapeHTML(client.nome) + '</strong><span>' + client.cotas.length + (client.cotas.length === 1 ? ' cota' : ' cotas') + '</span></div>' +
          (hits ? '<b class="radar-history-hit">' + hits + (hits === 1 ? ' alerta no histórico' : ' alertas no histórico') + '</b>' : '') +
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
    renderParsedPreview();
    renderClients();
    renderUnifiedHistory();
    renderFreeQuotas();
    const record = state.history.find(item => item.id === state.currentRecordId) || state.history[0] || null;
    state.currentRecordId = record?.id || null;
    renderAlert(record);
  }

  function saveDraw(){
    const parsed = normalizeDraw($('sorteioNumero').value);
    if(!parsed){
      showMessage('sorteioDrawMessage', 'Informe um número válido. Ex.: 5010 ou 35.010.', 'error');
      return;
    }

    const record = normalizeRecord({
      id: uid('sorteio'),
      raw: parsed.raw,
      reference: parsed.reference,
      createdAt: Date.now()
    });

    state.history.unshift(record);
    state.currentRecordId = record.id;
    save();
    renderAll();

    const matches = computeMatches(record.reference);
    if(matches.length && navigator.vibrate){
      try{ navigator.vibrate([180, 80, 180]); }catch(_error){}
    }

    showMessage(
      'sorteioDrawMessage',
      matches.length
        ? 'Número adicionado ao histórico. Atenção: encontrei ' + matches.length + (matches.length === 1 ? ' cota na faixa de ±10.' : ' cotas na faixa de ±10.')
        : 'Número adicionado ao histórico. Nenhuma cota ficou na faixa de ±10.',
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

  function deleteHistory(id){
    const record = state.history.find(item => item.id === id);
    if(!record) return;
    if(!confirm('Excluir o número ' + record.reference + ' do histórico?')) return;
    state.history = state.history.filter(item => item.id !== id);
    if(state.currentRecordId === id) state.currentRecordId = state.history[0]?.id || null;
    save();
    renderAll();
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
