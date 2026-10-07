(function(global){
  'use strict';

  // Base canônica local usada pelo radar. O aplicativo não depende do chat para estes números.
  // Fonte de referência: Loterias CAIXA / Loteria Federal.
  const records = [
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
    {date:'18/10/2023', contest:5809, raw:'072525', reference:'2525'},
    {date:'19/09/2023', contest:5792, raw:'012593', reference:'2593'},
    {date:'16/08/2023', contest:5791, raw:'027413', reference:'7413'},
    {date:'19/07/2023', contest:5783, raw:'021712', reference:'1712'},
    {date:'17/06/2023', contest:5774, raw:'077129', reference:'7129'},
    {date:'17/05/2023', contest:5765, raw:'033770', reference:'3770'},
    {date:'19/04/2023', contest:5757, raw:'034125', reference:'4125'},
    {date:'18/03/2023', contest:5748, raw:'085850', reference:'5850'},
    {date:'18/02/2023', contest:5741, raw:'088869', reference:'8869'},
    {date:'18/01/2023', contest:5732, raw:'050366', reference:'0366'},
    {date:'17/12/2022', contest:5725, raw:'058657', reference:'8657'},
    {date:'19/11/2022', contest:5717, raw:'045928', reference:'5928'},
    {date:'19/10/2022', contest:5708, raw:'097990', reference:'7990'},
    {date:'17/09/2022', contest:5699, raw:'049645', reference:'9645'},
    {date:'17/08/2022', contest:5690, raw:'065426', reference:'5426'},
    {date:'16/07/2022', contest:5681, raw:'047844', reference:'7844'},
    {date:'18/06/2022', contest:5673, raw:'037325', reference:'7325'},
    {date:'18/05/2022', contest:5664, raw:'070279', reference:'0279'},
    {date:'16/04/2022', contest:5655, raw:'000871', reference:'0871'},
    {date:'19/03/2022', contest:5646, raw:'082051', reference:'2051'},
    {date:'19/02/2022', contest:5640, raw:'032646', reference:'2646'},
    {date:'19/01/2022', contest:5631, raw:'005146', reference:'5146'},
    {date:'18/12/2021', contest:5623, raw:'010118', reference:'0118'},
    {date:'20/11/2021', contest:5615, raw:'014162', reference:'4162'},
    {date:'16/10/2021', contest:5606, raw:'079603', reference:'9603'}
  ];

  const STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const DEFAULT_GROUP_SIZE = 5000;
  const MAX_GROUP_SIZE = 9999;
  let pendingManualDraw = null;
  let historyObserver = null;

  function clampGroupSize(value){
    return Math.min(MAX_GROUP_SIZE, Math.max(1, Math.round(Number(value) || DEFAULT_GROUP_SIZE)));
  }

  function storedGroupSize(){
    try{
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(stored && stored.groupSize) return clampGroupSize(stored.groupSize);
    }catch(_error){}
    const input = document.getElementById('sorteioGroupSize');
    return clampGroupSize(input?.value || DEFAULT_GROUP_SIZE);
  }

  function federalBaseNumber(value){
    const digits = String(value ?? '').replace(/\D/g, '');
    if(!digits) return null;
    const lastFour = digits.slice(-4).padStart(4, '0');
    const parsed = Number(lastFour);
    if(!Number.isInteger(parsed)) return null;
    // Na referência de 4 dígitos, 0000 representa o topo do ciclo (10.000).
    return parsed === 0 ? 10000 : parsed;
  }

  function originalReferenceLabel(value){
    const base = federalBaseNumber(value);
    if(base === null) return '';
    return base === 10000 ? '0000' : String(base).padStart(4, '0');
  }

  function groupReference(value, groupSize){
    const base = federalBaseNumber(value);
    if(base === null) return '';
    const size = clampGroupSize(groupSize);
    const reduced = ((base - 1) % size) + 1;
    return String(reduced).padStart(4, '0');
  }

  // O sorteio.js valida a base logo ao carregar. Por isso exportamos inicialmente
  // as referências oficiais originais e só aplicamos a regra do grupo no DOMContentLoaded.
  const runtimeRecords = records.map(item => ({...item, originalReference: item.reference}));

  global.FEDERAL_HISTORY_DB = {
    version: '2026-10-07.1',
    source: 'Loterias CAIXA — Loteria Federal',
    sourceEndpoint: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/federal',
    selectionRule: '1 concurso por mês, o mais próximo do dia 18',
    groupRule: 'referência Federal reduzida ciclicamente ao total de participantes do grupo',
    windowMonths: 60,
    records: runtimeRecords
  };

  function applyGroupRule(groupSize){
    const size = clampGroupSize(groupSize);
    runtimeRecords.forEach(item => {
      item.originalReference = item.originalReference || item.reference;
      item.reference = groupReference(item.originalReference, size);
    });
    return size;
  }

  function renderOfficialHistoryFallback(){
    const list = document.getElementById('sorteioUnifiedHistoryList');
    if(!list) return;

    const size = storedGroupSize();
    const ordered = records.slice().sort((a, b) => {
      const [da, ma, ya] = a.date.split('/').map(Number);
      const [db, mb, yb] = b.date.split('/').map(Number);
      return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
    }).slice(0, 60);

    const count = document.getElementById('sorteioUnifiedHistoryCount');
    const officialCount = document.getElementById('sorteioOfficialHistoryCount');
    const inRange = document.getElementById('sorteioFederalInRangeCount');

    if(count) count.textContent = ordered.length + ' sorteios';
    if(officialCount) officialCount.textContent = ordered.length;
    if(inRange) inRange.textContent = ordered.length;

    list.innerHTML = ordered.map(item => {
      const original = originalReferenceLabel(item.reference);
      const normalized = groupReference(item.reference, size);
      const label = original === normalized ? normalized : original + ' → ' + normalized;
      return (
        '<div class="radar-unified-history-row official">' +
          '<div class="radar-unified-history-main">' +
            '<div><strong>' + label + '</strong><span>' + item.date + ' · concurso ' + item.contest + '</span></div>' +
            '<div><b>OFICIAL</b><span>1º prêmio ' + item.raw + ' · Federal ' + original + (original === normalized ? '' : ' → grupo ' + normalized) + '</span></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function patchHistoryPresentation(groupSize){
    const size = clampGroupSize(groupSize);
    const list = document.getElementById('sorteioUnifiedHistoryList');

    runtimeRecords.forEach(item => {
      const original = originalReferenceLabel(item.originalReference);
      const normalized = groupReference(item.originalReference, size);
      const row = list?.querySelector('[data-record-id="official-' + item.contest + '"]');
      if(!row) return;

      const primary = row.querySelector('.radar-unified-history-main > div:first-child strong');
      const desiredPrimary = original === normalized ? normalized : original + ' → ' + normalized;
      if(primary && primary.textContent !== desiredPrimary) primary.textContent = desiredPrimary;

      const officialLine = row.querySelector('.radar-unified-history-main > div:nth-child(2) > span');
      const desiredOfficial = '1º prêmio ' + item.raw + ' · Federal ' + original + (original === normalized ? '' : ' → grupo ' + normalized);
      if(officialLine && officialLine.textContent !== desiredOfficial) officialLine.textContent = desiredOfficial;
    });

    const note = document.querySelector('.radar-federal-history-panel .radar-history-note');
    if(note){
      const example = groupReference('7125', size);
      const desired = '<strong>Regra do grupo:</strong> usamos os 4 últimos dígitos da Federal e, se o número passar de ' + size.toLocaleString('pt-BR') + ', ele volta para dentro do grupo. Ex.: 7125 → ' + example + '. A análise de histórico, alertas e cotas livres usa o número já ajustado.';
      if(note.innerHTML !== desired) note.innerHTML = desired;
    }

    const inRange = document.getElementById('sorteioFederalInRangeCount');
    if(inRange){
      inRange.textContent = String(runtimeRecords.length);
      const label = inRange.parentElement?.querySelector('span');
      const desiredLabel = 'Válidos no grupo após a regra';
      if(label && label.textContent !== desiredLabel) label.textContent = desiredLabel;
    }

    const helper = document.getElementById('sorteioNumero')?.closest('.field')?.querySelector('small');
    if(helper){
      const example = groupReference('7125', size);
      const desired = 'Usamos os 4 últimos dígitos da Federal e reduzimos pelo tamanho do grupo. Ex.: grupo ' + size.toLocaleString('pt-BR') + ', 7125 → ' + example + '.';
      if(helper.textContent !== desired) helper.textContent = desired;
    }

    const dbStatus = document.getElementById('sorteioFederalDbStatus');
    if(dbStatus && dbStatus.classList.contains('ok') && !dbStatus.textContent.includes('regra do grupo')){
      dbStatus.textContent += ' · regra do grupo ativa';
    }
  }

  function installHistoryObserver(){
    const list = document.getElementById('sorteioUnifiedHistoryList');
    if(!list || typeof MutationObserver === 'undefined') return;
    historyObserver?.disconnect();
    historyObserver = new MutationObserver(() => patchHistoryPresentation(storedGroupSize()));
    historyObserver.observe(list, {childList: true, subtree: true});
  }

  function prepareManualDraw(){
    const input = document.getElementById('sorteioNumero');
    if(!input) return;
    const digits = String(input.value || '').replace(/\D/g, '');
    if(!digits) return;

    const size = storedGroupSize();
    const original = originalReferenceLabel(digits);
    const normalized = groupReference(digits, size);
    if(!normalized) return;

    pendingManualDraw = {
      raw: digits,
      original,
      normalized,
      groupSize: size
    };

    // O sorteio.js recebe já o número final do grupo; assim toda a lógica de alertas
    // continua a mesma, mas usando a regra correta do consórcio.
    input.value = normalized;
  }

  function patchManualDrawText(){
    if(!pendingManualDraw) return;
    const alertText = document.getElementById('sorteioAlertText');
    if(alertText && !document.getElementById('sorteioAlerta')?.hidden){
      const {original, normalized, groupSize} = pendingManualDraw;
      const explanation = original === normalized
        ? ' Sorteio Federal ' + original + ' → número usado no grupo: ' + normalized + '.'
        : ' Sorteio Federal ' + original + ' → número usado no grupo de ' + groupSize.toLocaleString('pt-BR') + ': ' + normalized + '.';
      const cleaned = alertText.textContent
        .replace(/ Número informado:.*$/,'')
        .replace(/ Número conferido:.*$/,'');
      alertText.textContent = cleaned + explanation;
    }
    pendingManualDraw = null;
  }

  function installInteractionFixes(){
    document.addEventListener('change', event => {
      if(event.target?.id !== 'sorteioGroupSize') return;
      const size = clampGroupSize(event.target.value);
      applyGroupRule(size);
      queueMicrotask(() => patchHistoryPresentation(size));
    }, true);

    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#sorteioCheckBtn');
      if(!button) return;
      prepareManualDraw();
      queueMicrotask(patchManualDrawText);
    }, true);

    document.addEventListener('keydown', event => {
      if(event.target?.id !== 'sorteioNumero' || event.key !== 'Enter') return;
      prepareManualDraw();
      queueMicrotask(patchManualDrawText);
    }, true);
  }

  function boot(){
    renderOfficialHistoryFallback();
    const size = applyGroupRule(storedGroupSize());
    installInteractionFixes();
    installHistoryObserver();
    queueMicrotask(() => patchHistoryPresentation(size));
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  }else{
    boot();
  }
})(window);
