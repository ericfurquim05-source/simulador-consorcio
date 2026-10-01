(function(global){
  'use strict';

  const STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const LEGACY_GROUPS = 'simulador-sorteio-grupos-v1';
  const LEGACY_CLIENTS = 'simulador-sorteio-clientes-v1';
  const MAX_QUOTA = 9999;
  const ALERT_DISTANCE = 10;
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
    return state.history.filter(record => {
      const ref = Number(record.reference);
      return quotaNumbers.some(number => Math.abs(number - ref) <= ALERT_DISTANCE);
    });
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

  function renderHistory(){
    const list = $('sorteioHistoryList');
    $('sorteioHistoryCount').textContent = state.history.length + (state.history.length === 1 ? ' sorteio' : ' sorteios');

    if(!state.history.length){
      list.innerHTML = '<div class="radar-empty">Nenhum número sorteado foi salvo ainda.</div>';
      return;
    }

    list.innerHTML = state.history.map(record => {
      const matches = computeMatches(record.reference);
      const exact = matches.some(item => item.distance === 0);
      const date = new Date(record.createdAt);
      const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
      const status = exact ? 'COTA EXATA' : matches.length ? matches.length + (matches.length === 1 ? ' alerta' : ' alertas') : 'sem alertas';
      const statusClass = exact ? ' exact' : matches.length ? ' warning' : ' safe';
      const raw = record.raw !== record.reference ? '<span>Federal ' + escapeHTML(record.raw) + ' → ref. ' + record.reference + '</span>' : '<span>Referência ' + record.reference + '</span>';
      return '<div class="radar-history-row' + statusClass + '" data-record-id="' + escapeHTML(record.id) + '">' +
        '<div class="radar-history-number"><strong>' + record.reference + '</strong>' + raw + '</div>' +
        '<div class="radar-history-meta"><b>' + escapeHTML(status) + '</b><span>' + escapeHTML(when) + '</span></div>' +
        '<div class="radar-history-actions"><button type="button" data-action="view">Ver</button><button type="button" data-action="delete" class="danger">Excluir</button></div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.radar-history-row').forEach(row => {
      const id = row.dataset.recordId;
      row.querySelector('[data-action="view"]').addEventListener('click', () => {
        state.currentRecordId = id;
        renderAlert(state.history.find(item => item.id === id) || null);
        $('sorteioAlerta')?.scrollIntoView({behavior: 'smooth', block: 'start'});
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteHistory(id));
    });
  }

  function renderAll(){
    renderParsedPreview();
    renderClients();
    renderHistory();
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
        ? 'Número salvo. Atenção: encontrei ' + matches.length + (matches.length === 1 ? ' cota na faixa de ±10.' : ' cotas na faixa de ±10.')
        : 'Número salvo. Nenhuma cota ficou na faixa de ±10.',
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

    $('sorteioClientQuotas').addEventListener('input', renderParsedPreview);
    $('sorteioAddClientBtn').addEventListener('click', addClient);

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
