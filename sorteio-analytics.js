(function(global){
  'use strict';

  const DB = global.FEDERAL_HISTORY_10Y_DB || null;
  const CLIENT_STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const SIMPLE_STORAGE_KEY = 'simulador-sorteio-simples-v1';
  const DEFAULT_GROUP_SIZE = 5000;
  const DEFAULT_INTERVAL = 5;
  const DEFAULT_YEARS = 10;
  const MAX_RENDER = 300;

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = value => String(value).padStart(4, '0');

  function loadJSON(key, fallback){
    try{
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    }catch(_error){
      return fallback;
    }
  }

  function saveJSON(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  function parseDate(value){
    return new Date(String(value) + 'T12:00:00Z').getTime();
  }

  function dateLabel(value){
    if(!value) return '—';
    const [y,m,d] = String(value).split('-');
    return `${d}/${m}/${y}`;
  }

  function minusYears(dateValue, years){
    const d = new Date(String(dateValue) + 'T12:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0,10);
  }

  function savedSettings(){
    const stored = loadJSON(SIMPLE_STORAGE_KEY, {});
    return {
      years: [5,10].includes(Number(stored.years)) ? Number(stored.years) : DEFAULT_YEARS,
      interval: clamp(Math.round(Number(stored.interval) || DEFAULT_INTERVAL), 0, 100),
      groupSize: clamp(Math.round(Number(stored.groupSize) || DEFAULT_GROUP_SIZE), 1, 9999),
      unavailableText: String(stored.unavailableText || '')
    };
  }

  function currentGroupSize(){
    return clamp(
      Math.round(Number($('simpleGroupSize')?.value) || Number($('sorteioGroupSize')?.value) || savedSettings().groupSize),
      1,
      9999
    );
  }

  function currentInterval(){
    return clamp(Math.round(Number($('simpleInterval')?.value) || 0), 0, 100);
  }

  function currentYears(){
    return Number($('simpleYears')?.value) === 5 ? 5 : 10;
  }

  function groupReference(reference, groupSize = currentGroupSize()){
    const digits = String(reference ?? '').replace(/\D/g, '');
    if(!digits) return null;
    const tail = digits.slice(-4).padStart(4, '0');
    let base = Number(tail);
    if(!Number.isFinite(base)) return null;
    if(base === 0) base = 10000;
    return ((base - 1) % groupSize) + 1;
  }

  function mappedRows(groupSize = currentGroupSize()){
    if(!DB?.rows?.length) return [];
    return DB.rows
      .map(([date, reference]) => ({date, ms:parseDate(date), number:groupReference(reference, groupSize)}))
      .filter(item => Number.isInteger(item.number));
  }

  function rowsForYears(years, groupSize = currentGroupSize()){
    const rows = mappedRows(groupSize);
    if(!rows.length) return [];
    const latest = rows[rows.length - 1].date;
    const cutoff = parseDate(minusYears(latest, years));
    return rows.filter(item => item.ms >= cutoff);
  }

  function parseUnavailable(text, groupSize = currentGroupSize()){
    const values = new Set();
    String(text || '')
      .split(/[\n,;\s]+/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => {
        const first = part.split(':')[0].replace(/\D/g, '');
        if(!first) return;
        const number = Number(first.slice(-4));
        if(Number.isInteger(number) && number >= 1 && number <= groupSize) values.add(number);
      });
    return values;
  }

  function registeredNumbers(groupSize = currentGroupSize()){
    const stored = loadJSON(CLIENT_STORAGE_KEY, {});
    const numbers = new Set();

    for(const client of Array.isArray(stored?.clients) ? stored.clients : []){
      for(const value of Array.isArray(client?.cotas) ? client.cotas : []){
        const number = Number(String(value).replace(/\D/g, '').slice(-4));
        if(Number.isInteger(number) && number >= 1 && number <= groupSize) numbers.add(number);
      }
    }

    const pending = String($('sorteioClientQuotas')?.value || '').match(/\d+/g) || [];
    for(const value of pending){
      const number = Number(value.slice(-4));
      if(Number.isInteger(number) && number >= 1 && number <= groupSize) numbers.add(number);
    }

    return numbers;
  }

  function exactDrawSet(years, groupSize){
    const rows = rowsForYears(years, groupSize);
    return {rows, set:new Set(rows.map(item => item.number))};
  }

  function candidateGrid(interval, groupSize){
    const step = interval > 0 ? interval : 1;
    const values = [];
    for(let n=step; n<=groupSize; n+=step) values.push(n);
    return values;
  }

  function availableNumbers(){
    const groupSize = currentGroupSize();
    const years = currentYears();
    const interval = currentInterval();
    const {rows, set:drawnExact} = exactDrawSet(years, groupSize);
    const used = registeredNumbers(groupSize);
    const unavailable = parseUnavailable($('simpleUnavailable')?.value, groupSize);
    const grid = candidateGrid(interval, groupSize);
    const available = grid.filter(number => !drawnExact.has(number) && !used.has(number) && !unavailable.has(number));

    return {
      groupSize,
      years,
      interval,
      rows,
      drawnExact,
      used,
      unavailable,
      grid,
      available
    };
  }

  function exactOccurrences(number, years, groupSize){
    return rowsForYears(years, groupSize).filter(item => item.number === number);
  }

  function appendQuota(number){
    const textarea = $('sorteioClientQuotas');
    if(!textarea) return;

    const formatted = pad(number);
    const current = String(textarea.value || '').match(/\d+/g)?.map(value => pad(Number(value.slice(-4)))) || [];
    if(!current.includes(formatted)) current.push(formatted);

    textarea.value = current.join(', ');
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
    textarea.focus();
    renderAvailable();
  }

  function copyText(text){
    if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function gridLabel(interval){
    return interval > 0 ? `de ${interval} em ${interval}` : 'sem espaçamento fixo';
  }

  function renderAnalysis(){
    const output = $('simpleAnalysisResult');
    if(!output) return;

    const groupSize = currentGroupSize();
    const raw = Number($('simpleNumber')?.value);
    if(!Number.isInteger(raw) || raw < 1 || raw > groupSize){
      output.innerHTML = '<div class="message error">Digite uma cota válida dentro do grupo.</div>';
      return;
    }

    const number = raw;
    const five = exactOccurrences(number, 5, groupSize);
    const ten = exactOccurrences(number, 10, groupSize);
    const years = currentYears();
    const chosen = years === 5 ? five : ten;
    const interval = currentInterval();
    const onGrid = interval === 0 || number % interval === 0;
    const used = registeredNumbers(groupSize).has(number);
    const unavailable = parseUnavailable($('simpleUnavailable')?.value, groupSize).has(number);
    const available = chosen.length === 0 && onGrid && !used && !unavailable;
    const from = Math.max(1, number - interval);
    const to = Math.min(groupSize, number + interval);

    function exactCard(label, rows){
      const last = rows.length ? rows[rows.length - 1].date : null;
      return `<div class="simple-stat ${rows.length ? 'bad' : 'good'}">
        <span>${label}</span>
        <strong>${rows.length ? `SAIU ${rows.length}x` : 'NÃO SAIU'}</strong>
        <small>${rows.length ? `última vez: ${dateLabel(last)}` : 'nenhuma ocorrência exata'}</small>
      </div>`;
    }

    let reason = 'Passou no histórico exato e está livre.';
    if(chosen.length) reason = `Saiu exatamente ${chosen.length}x no período escolhido.`;
    else if(!onGrid) reason = `Não faz parte da régua ${gridLabel(interval)}.`;
    else if(used) reason = 'Essa cota já está cadastrada em um cliente.';
    else if(unavailable) reason = 'Essa cota está marcada como contemplada ou indisponível.';

    output.innerHTML = `
      <div class="simple-verdict ${available ? 'good' : 'bad'}">
        <span>Cota ${pad(number)}</span>
        <strong>${available ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL'}</strong>
        <small>${reason}</small>
      </div>
      <div class="simple-stats">
        ${exactCard('Últimos 5 anos · 60 meses', five)}
        ${exactCard('Últimos 10 anos · 120 meses', ten)}
        <div class="simple-stat ${onGrid ? 'good' : 'bad'}">
          <span>Régua atual</span>
          <strong>${onGrid ? 'ENTRA NA RÉGUA' : 'FORA DA RÉGUA'}</strong>
          <small>${interval > 0 ? `centros ${pad(interval)}, ${pad(interval*2)}, ${pad(interval*3)}...` : 'todos os números podem ser centro'}</small>
        </div>
        <div class="simple-stat good">
          <span>Faixa de conferência se usar esta cota</span>
          <strong>${pad(from)} → ${pad(to)}</strong>
          <small>isso serve para aproximação na conferência; não queima histórico vizinho</small>
        </div>
      </div>`;
  }

  function renderAvailable(){
    const result = availableNumbers();
    const count = $('simpleAvailableCount');
    const mirror = $('simpleAvailableCountMirror');
    const meta = $('simpleAvailableMeta');
    const list = $('simpleAvailableList');
    const more = $('simpleShowAll');

    if(!count || !meta || !list || !more) return;

    const countText = result.available.length.toLocaleString('pt-BR') + ' cotas';
    count.textContent = countText;
    if(mirror) mirror.textContent = countText;

    meta.textContent =
      `Últimos ${result.years === 5 ? '5 anos (60 meses)' : '10 anos (120 meses)'} · ` +
      `histórico somente exato · régua ${gridLabel(result.interval)} · ` +
      `${result.used.size.toLocaleString('pt-BR')} cotas já usadas retiradas.`;

    const showAll = more.dataset.showAll === '1';
    const visible = showAll ? result.available : result.available.slice(0, MAX_RENDER);

    list.innerHTML = visible
      .map(number => `<button type="button" class="simple-quota" data-simple-quota="${number}">${pad(number)}</button>`)
      .join('') || '<div class="radar-empty">Nenhuma cota passou pelo filtro atual.</div>';

    list.querySelectorAll('[data-simple-quota]').forEach(button => {
      button.addEventListener('click', () => appendQuota(Number(button.dataset.simpleQuota)));
    });

    if(result.available.length > MAX_RENDER){
      more.hidden = false;
      more.textContent = showAll
        ? `Mostrar só as primeiras ${MAX_RENDER}`
        : `Mostrar todas (${result.available.length.toLocaleString('pt-BR')})`;
    }else{
      more.hidden = true;
    }

    renderAnalysis();
    updateDrawPanel();
  }

  function persistAndRender(){
    const settings = {
      years: currentYears(),
      interval: currentInterval(),
      groupSize: currentGroupSize(),
      unavailableText: String($('simpleUnavailable')?.value || '')
    };

    saveJSON(SIMPLE_STORAGE_KEY, settings);

    const legacyGroup = $('sorteioGroupSize');
    if(legacyGroup && Number(legacyGroup.value) !== settings.groupSize){
      legacyGroup.value = settings.groupSize;
      legacyGroup.dispatchEvent(new Event('change', {bubbles:true}));
    }

    renderAvailable();
  }

  function matchesForClients(reference, clients){
    const groupSize = currentGroupSize();
    const interval = currentInterval();
    const base = groupReference(reference, groupSize);
    if(!base) return [];

    const unavailable = parseUnavailable($('simpleUnavailable')?.value, groupSize);
    const matches = [];

    for(const client of Array.isArray(clients) ? clients : []){
      for(const value of Array.isArray(client?.cotas) ? client.cotas : []){
        const number = Number(String(value).replace(/\D/g, '').slice(-4));
        if(!Number.isInteger(number) || number < 1 || number > groupSize || unavailable.has(number)) continue;

        const distance = Math.abs(number - base);
        if(distance > interval) continue;

        matches.push({
          clientId: client.id,
          nome: client.nome,
          cota: pad(number),
          distance,
          structuralRank: distance,
          direction: distance === 0 ? 'exata' : (number < base ? `${distance} abaixo` : `${distance} acima`),
          numericDistance: distance,
          structural: false,
          base
        });
      }
    }

    return matches.sort((a,b) =>
      a.distance - b.distance ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      Number(a.cota) - Number(b.cota)
    );
  }

  function updateDrawPanel(){
    const panel = document.querySelector('.radar-draw-panel');
    if(!panel) return;

    const interval = currentInterval();
    const pill = panel.querySelector('.pill');
    const lead = panel.querySelector('.lead');
    const small = panel.querySelector('.field small');

    if(pill) pill.textContent = `± ${interval}`;
    if(lead){
      lead.textContent =
        `Digite o resultado da Federal. O sistema normaliza o número para o grupo e confere as cotas cadastradas usando ±${interval}.`;
    }
    if(small){
      small.textContent =
        'Exemplo: em grupo de 5.000, 7125 vira 2125. O histórico filtra só número exato; o ± serve apenas para conferir aproximação.';
    }
  }

  function makeClientsCollapsible(){
    const panel = document.querySelector('.radar-clients-panel');
    if(!panel || panel.tagName === 'DETAILS') return;

    const details = document.createElement('details');
    details.className = panel.className + ' draw-collapsible simple-clients';

    const summary = document.createElement('summary');
    const count = panel.querySelector('#sorteioClientesCount');
    if(count) count.remove();

    summary.innerHTML = '<span><b>Clientes e cotas</b><small>abre só quando tu precisar cadastrar ou consultar</small></span>';
    if(count) summary.appendChild(count);

    const body = document.createElement('div');
    body.className = 'draw-details-body';

    panel.querySelector('.result-topline')?.remove();
    while(panel.firstChild) body.appendChild(panel.firstChild);

    details.append(summary, body);
    panel.replaceWith(details);
  }

  function injectStyle(){
    if($('simpleSorteioStyle')) return;

    const style = document.createElement('style');
    style.id = 'simpleSorteioStyle';
    style.textContent = `
      .radar-probability-panel,.radar-federal-history-panel,.radar-free-panel{display:none!important}
      .simple-panel{margin-top:16px}
      .simple-stat,.simple-verdict{padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:rgba(255,255,255,.025)}
      .simple-verdict{margin-top:14px}
      .simple-stat span,.simple-stat small,.simple-verdict span,.simple-verdict small{display:block}
      .simple-stat span,.simple-verdict span{font-size:12px;opacity:.72}
      .simple-stat strong{display:block;font-size:21px;margin:5px 0}
      .simple-verdict strong{display:block;font-size:26px;margin:6px 0}
      .simple-stat small,.simple-verdict small{font-size:12px;line-height:1.45;opacity:.72}
      .simple-stat.good,.simple-verdict.good{border-color:rgba(53,182,111,.35)}
      .simple-stat.bad,.simple-verdict.bad{border-color:rgba(214,164,59,.38)}
      .simple-stats{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}
      .simple-filter-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .simple-available-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:16px}
      .simple-available-head strong{font-size:26px}
      .simple-meta{font-size:12px;opacity:.72;margin-top:5px;line-height:1.45}
      .simple-quota-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:12px}
      .simple-quota{padding:10px 6px;border-radius:11px;border:1px solid rgba(53,182,111,.24);background:rgba(53,182,111,.07);color:inherit;font-weight:800;letter-spacing:.04em}
      .simple-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .simple-explain{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.035);font-size:13px;line-height:1.5;margin:12px 0}
      .simple-explain b{display:block;margin-bottom:3px}
      .simple-settings{margin-top:12px}
      .simple-settings textarea{min-height:90px}
      .simple-clients{margin-top:16px}
      @media(min-width:700px){
        .simple-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
        .simple-quota-list{grid-template-columns:repeat(8,minmax(0,1fr))}
        .simple-filter-row{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
    `;

    document.head.appendChild(style);
  }

  function injectUI(){
    if($('simpleSorteioPanel')) return;

    injectStyle();
    makeClientsCollapsible();

    const anchor = document.querySelector('.radar-draw-panel');
    if(!anchor) return;

    const settings = savedSettings();
    const section = document.createElement('section');
    section.id = 'simpleSorteioPanel';
    section.innerHTML = `
      <details class="panel draw-collapsible simple-panel" open>
        <summary>
          <span><b>Escolher cotas</b><small>histórico exato + régua automática + cotas já usadas</small></span>
          <strong id="simpleAvailableCount">—</strong>
        </summary>
        <div class="draw-details-body">
          <div class="simple-filter-row">
            <div class="field">
              <label for="simpleYears">Histórico</label>
              <div class="control select-control">
                <select id="simpleYears">
                  <option value="5" ${settings.years === 5 ? 'selected' : ''}>5 anos · 60 meses</option>
                  <option value="10" ${settings.years === 10 ? 'selected' : ''}>10 anos · 120 meses</option>
                </select>
              </div>
            </div>

            <div class="field">
              <label for="simpleInterval">Régua entre novas cotas</label>
              <div class="control">
                <input id="simpleInterval" type="number" min="0" max="100" step="1" value="${settings.interval}">
                <span>em ${settings.interval || 1}</span>
              </div>
            </div>

            <div class="field">
              <label for="simpleNumber">Consultar uma cota</label>
              <div class="control">
                <input id="simpleNumber" type="number" min="1" max="${settings.groupSize}" value="3000">
              </div>
            </div>
          </div>

          <div class="simple-explain">
            <b>Regra automática:</b>
            intervalo 5 gera 0005, 0010, 0015, 0020...; intervalo 10 gera 0010, 0020, 0030...
            Depois o sistema tira as cotas já usadas, as indisponíveis e os números que saíram <b>exatamente</b> no histórico escolhido.
            O intervalo não queima vizinhos no histórico.
          </div>

          <div class="simple-actions">
            <button id="simpleAnalyze" class="secondary-button" type="button">Consultar cota</button>
          </div>
          <div id="simpleAnalysisResult"></div>

          <div class="simple-available-head">
            <div>
              <span class="eyebrow">Cotas disponíveis na régua</span>
              <div id="simpleAvailableMeta" class="simple-meta"></div>
            </div>
            <strong id="simpleAvailableCountMirror"></strong>
          </div>

          <div class="simple-actions">
            <button id="simpleCopyAll" class="secondary-button" type="button">Copiar todas</button>
            <button id="simpleShowAll" class="secondary-button" type="button" hidden></button>
          </div>

          <div id="simpleAvailableList" class="simple-quota-list"></div>

          <details class="simple-settings">
            <summary>
              <span><b>Ajustes avançados</b><small>normalmente tu não precisa abrir</small></span>
            </summary>
            <div class="draw-details-body">
              <div class="field">
                <label for="simpleGroupSize">Tamanho do grupo</label>
                <div class="control">
                  <input id="simpleGroupSize" type="number" min="1" max="9999" value="${settings.groupSize}">
                  <span>cotas</span>
                </div>
              </div>

              <div class="field" style="margin-top:10px">
                <label for="simpleUnavailable">Cotas já contempladas / indisponíveis <span class="optional">opcional</span></label>
                <div class="control textarea-control">
                  <textarea id="simpleUnavailable" rows="4" placeholder="Ex.: 2998, 3001, 3002">${settings.unavailableText}</textarea>
                </div>
                <small>Essas cotas são retiradas da lista. Pode colar separadas por espaço, vírgula ou quebra de linha.</small>
              </div>

              <button id="simpleSaveSettings" class="secondary-button" type="button" style="margin-top:10px">Salvar e recalcular</button>
            </div>
          </details>
        </div>
      </details>`;

    anchor.insertAdjacentElement('afterend', section);

    $('simpleYears')?.addEventListener('change', persistAndRender);
    $('simpleInterval')?.addEventListener('change', persistAndRender);
    $('simpleInterval')?.addEventListener('input', () => updateDrawPanel());
    $('simpleAnalyze')?.addEventListener('click', renderAnalysis);
    $('simpleNumber')?.addEventListener('keydown', event => {
      if(event.key === 'Enter') renderAnalysis();
    });
    $('simpleSaveSettings')?.addEventListener('click', persistAndRender);

    $('simpleCopyAll')?.addEventListener('click', () => {
      const result = availableNumbers();
      copyText(result.available.map(pad).join(', ')).then(() => {
        const button = $('simpleCopyAll');
        if(!button) return;
        const old = button.textContent;
        button.textContent = 'Copiado';
        setTimeout(() => { button.textContent = old; }, 1200);
      });
    });

    $('simpleShowAll')?.addEventListener('click', event => {
      event.currentTarget.dataset.showAll = event.currentTarget.dataset.showAll === '1' ? '0' : '1';
      renderAvailable();
    });

    $('sorteioClientQuotas')?.addEventListener('input', () => setTimeout(renderAvailable, 0));

    renderAvailable();
  }

  global.SORTEIO_STRUCTURAL_ENGINE = {
    matchesForClients,
    normalize: groupReference,
    current: () => ({
      groupSize: currentGroupSize(),
      interval: currentInterval(),
      years: currentYears()
    })
  };

  function init(){
    if(!$('view-sorteio')) return;
    injectUI();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})(window);
