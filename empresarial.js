(function(global){
  'use strict';

  const STORAGE_KEY = 'simulador-empresarial-v340';
  const $ = id => document.getElementById(id);
  const S = global.Simulador = global.Simulador || {};
  let currentResult = null;

  function brl(value){
    return new Intl.NumberFormat('pt-BR', {
      style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2
    }).format(Number(value) || 0);
  }

  function nfmt(value, digits){
    return (Number(value) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: digits == null ? 0 : digits,
      maximumFractionDigits: digits == null ? 0 : digits
    });
  }

  function pct(value, digits){
    return nfmt(value, digits == null ? 1 : digits) + '%';
  }

  function parseMoney(value){
    let text = String(value == null ? '' : value).trim().replace(/R\$/g,'').replace(/\s/g,'');
    if(!text) return 0;
    if(text.indexOf(',') >= 0) text = text.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g,'');
    const number = Number(text.replace(/[^0-9.-]/g,''));
    return Number.isFinite(number) ? number : 0;
  }

  function moneyInput(value){
    const number = parseMoney(value);
    return number ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(number) : '';
  }

  function numberValue(id, fallback){
    const el = $(id);
    if(!el) return fallback;
    const value = Number(String(el.value || '').replace(',','.'));
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function ceilQuota(value){
    return Math.max(0, Math.ceil(Number(value) || 0));
  }

  function floorQuota(value){
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function readInput(){
    const projectValue = parseMoney($('empProjeto').value);
    const quotaValue = parseMoney($('empCarta').value);
    const term = Math.round(numberValue('empPrazo', 220));
    const groupSize = Math.round(numberValue('empGroupSize', 5000));
    const analysisMonths = Math.round(numberValue('empMeses', 3));
    const adminRate = clamp(numberValue('empTaxaAdmin', 24.2), 0, 300) / 100;
    const reducedFundPercent = clamp(numberValue('empParcelaReduzidaPct', 50), 0, 100) / 100;
    const reducedOverride = parseMoney($('empParcelaReduzidaManual').value);
    const fullOverride = parseMoney($('empParcelaCheiaManual').value);
    const reducedProjectOverride = parseMoney($('empParcelaReduzidaProjetoManual').value);
    const fullProjectOverride = parseMoney($('empParcelaCheiaProjetoManual').value);
    const contemplations = Math.round(numberValue('empContemplacoes', 0));
    const assetValue = parseMoney($('empBem').value);
    const collateralPercent = clamp(numberValue('empPercentualBem', 80), 0, 100) / 100;
    const assetOwner = $('empTitularBem').value === 'terceiro' ? 'terceiro' : 'proprio';
    const purpose = $('empFinalidade').value || 'reforma';
    const client = String($('empCliente').value || '').trim();

    if(projectValue < 100000 || projectValue > 30000000) throw new Error('Informe um projeto entre R$ 100 mil e R$ 30 milhões.');
    if(quotaValue <= 0) throw new Error('Informe o valor da carta.');
    if(term < 1 || term > 360) throw new Error('Informe um prazo entre 1 e 360 meses.');
    if(groupSize < 1 || groupSize > 9999) throw new Error('Informe um grupo entre 1 e 9.999 cotas.');
    if(analysisMonths < 1 || analysisMonths > term) throw new Error('O período analisado precisa ficar dentro do prazo do grupo.');
    if(contemplations < 0) throw new Error('A quantidade de contemplações não pode ser negativa.');

    return {
      client, projectValue, quotaValue, term, groupSize, analysisMonths, adminRate, reducedFundPercent,
      reducedOverride, fullOverride, reducedProjectOverride, fullProjectOverride, contemplations, assetValue, collateralPercent, assetOwner, purpose
    };
  }

  function calculate(input){
    const quotaCount = ceilQuota(input.projectValue / input.quotaValue);
    const contractedCredit = quotaCount * input.quotaValue;

    const calculatedReducedPerQuota = input.quotaValue * (input.reducedFundPercent + input.adminRate) / input.term;
    const calculatedFullPerQuota = input.quotaValue * (1 + input.adminRate) / input.term;
    let reducedPerQuota = input.reducedOverride > 0 ? input.reducedOverride : calculatedReducedPerQuota;
    let fullPerQuota = input.fullOverride > 0 ? input.fullOverride : calculatedFullPerQuota;
    let reducedProjectPayment = reducedPerQuota * quotaCount;
    let fullProjectPayment = fullPerQuota * quotaCount;
    if(input.reducedProjectOverride > 0){ reducedProjectPayment = input.reducedProjectOverride; reducedPerQuota = reducedProjectPayment / quotaCount; }
    if(input.fullProjectOverride > 0){ fullProjectPayment = input.fullProjectOverride; fullPerQuota = fullProjectPayment / quotaCount; }
    const averageContemplationsMonthly = quotaCount / input.term;
    const averageMonthsPerContemplation = averageContemplationsMonthly > 0 ? 1 / averageContemplationsMonthly : 0;
    const groupAverageContemplationsMonthly = input.groupSize / input.term;
    const quotaShare = Math.min(1, quotaCount / input.groupSize);
    const coverageWidth = 21;
    const maxSeparatedQuotas = Math.ceil(input.groupSize / coverageWidth);
    const theoreticalCoverageCount = Math.min(input.groupSize, quotaCount * coverageWidth);
    const theoreticalCoveragePercentage = input.groupSize ? theoreticalCoverageCount / input.groupSize * 100 : 0;
    const coverageSaturated = quotaCount >= maxSeparatedQuotas;
    const monthlyProbabilityUniform = quotaShare > 0
      ? (1 - Math.pow(1 - quotaShare, groupAverageContemplationsMonthly)) * 100
      : 0;
    const expectedProjectContemplationsMonthly = input.term ? quotaCount / input.term : 0;
    const linearContemplationsRaw = averageContemplationsMonthly * input.analysisMonths;
    const linearContemplationsRounded = Math.min(quotaCount, ceilQuota(linearContemplationsRaw));
    const scenarioContemplations = Math.min(quotaCount, Math.max(0, Math.round(input.contemplations)));

    const eligibleCollateral = input.assetValue * input.collateralPercent;
    const collateralQuotaCapacity = input.assetValue > 0 ? floorQuota(eligibleCollateral / input.quotaValue) : quotaCount;
    const alignedQuotaCapacity = Math.min(quotaCount, collateralQuotaCapacity);
    const alignedCreditCapacity = alignedQuotaCapacity * input.quotaValue;
    const usableContemplations = Math.min(scenarioContemplations, alignedQuotaCapacity);
    const activatedCredit = usableContemplations * input.quotaValue;

    const contributedCapital = reducedProjectPayment * input.analysisMonths;
    const incrementalLiquidity = activatedCredit - contributedCapital;
    const activationMultiple = contributedCapital > 0 ? activatedCredit / contributedCapital : 0;
    const capitalPer100k = activatedCredit > 0 ? contributedCapital / activatedCredit * 100000 : 0;
    const coverageContemplations = Math.min(quotaCount, ceilQuota(contributedCapital / input.quotaValue));

    const paymentAfterScenario = reducedProjectPayment + usableContemplations * Math.max(0, fullPerQuota - reducedPerQuota);
    const annualAdminSimple = input.term > 0 ? (input.adminRate * 100) / (input.term / 12) : 0;
    const projectOverage = contractedCredit - input.projectValue;
    const guaranteeUsage = eligibleCollateral > 0 ? activatedCredit / eligibleCollateral * 100 : 0;

    const comparisonValues = [80000,100000,120000,130000,150000,200000,250000,300000,500000,1000000];
    const quotaComparisons = comparisonValues.map(value => {
      const count = ceilQuota(input.projectValue / value);
      const coverageCount = Math.min(input.groupSize, count * 21);
      const coveragePercentage = input.groupSize ? coverageCount / input.groupSize * 100 : 0;
      const share = Math.min(1, count / input.groupSize);
      const monthlyProbability = share > 0
        ? (1 - Math.pow(1 - share, groupAverageContemplationsMonthly)) * 100
        : 0;
      return {
        quotaValue:value,
        quotaCount:count,
        coverageCount,
        coveragePercentage,
        monthlyProbability,
        averageProjectMonthly: input.term ? count / input.term : 0
      };
    });

    return {
      input, quotaCount, contractedCredit, projectOverage,
      calculatedReducedPerQuota, calculatedFullPerQuota, reducedPerQuota, fullPerQuota,
      reducedProjectPayment, fullProjectPayment,
      averageContemplationsMonthly, averageMonthsPerContemplation,
      groupAverageContemplationsMonthly, quotaShare, theoreticalCoverageCount,
      theoreticalCoveragePercentage, monthlyProbabilityUniform, expectedProjectContemplationsMonthly,
      coverageWidth, maxSeparatedQuotas, coverageSaturated,
      quotaComparisons,
      linearContemplationsRaw, linearContemplationsRounded, scenarioContemplations,
      eligibleCollateral, collateralQuotaCapacity, alignedQuotaCapacity, alignedCreditCapacity,
      usableContemplations, activatedCredit, contributedCapital, incrementalLiquidity,
      activationMultiple, capitalPer100k, coverageContemplations, paymentAfterScenario,
      annualAdminSimple, guaranteeUsage, createdAt:new Date().toISOString()
    };
  }

  function statusText(result){
    if(result.activatedCredit <= 0) return 'Sem crédito ativado no cenário';
    if(result.incrementalLiquidity > 0) return 'Liquidez incremental positiva';
    if(Math.abs(result.incrementalLiquidity) < 1) return 'Crédito ativado igual ao capital aportado';
    return 'Capital aportado ainda supera o crédito ativado';
  }

  function render(result){
    currentResult = result;
    $('empResultado').hidden = false;

    $('empResCotas').textContent = nfmt(result.quotaCount);
    $('empResCreditoContratado').textContent = brl(result.contractedCredit);
    $('empResParcelaReduzida').textContent = brl(result.reducedProjectPayment);
    $('empResParcelaCheia').textContent = brl(result.fullProjectPayment);
    $('empResCapitalAportado').textContent = brl(result.contributedCapital);
    $('empResCreditoAtivado').textContent = brl(result.activatedCredit);
    $('empResLiquidez').textContent = brl(result.incrementalLiquidity);
    $('empResMultiplicador').textContent = nfmt(result.activationMultiple,2) + 'x';
    $('empResStatus').textContent = statusText(result);
    $('empResStatus').className = 'emp-status ' + (result.incrementalLiquidity >= 0 ? 'positive' : 'negative');

    $('empResMediaMes').textContent = nfmt(result.averageContemplationsMonthly,3) + ' cota/mês';
    $('empResGrupoMedia').textContent = nfmt(result.groupAverageContemplationsMonthly,2) + ' cotas/mês';
    $('empResCobertura').textContent = pct(result.theoreticalCoveragePercentage,2);
    $('empResTerritorio').textContent = nfmt(result.theoreticalCoverageCount) + ' / ' + nfmt(result.input.groupSize) + ' referências';
    $('empResParticipacao').textContent = pct(result.quotaShare * 100,3);
    $('empResProbMensal').textContent = pct(result.monthlyProbabilityUniform,2);
    $('empResEsperadoProjeto').textContent = nfmt(result.expectedProjectContemplationsMonthly,3) + ' cota/mês';
    $('empResMaxSemSobreposicao').textContent = nfmt(result.maxSeparatedQuotas) + ' cotas';
    $('empResSaturacao').textContent = result.coverageSaturated ? 'Cobertura saturada' : 'Ainda há território livre';
    $('empResIntervalo').textContent = result.averageMonthsPerContemplation > 0 ? '1 a cada ' + nfmt(result.averageMonthsPerContemplation,2) + ' meses' : '—';
    $('empResMediaPeriodo').textContent = nfmt(result.linearContemplationsRaw,2) + ' ≈ ' + nfmt(result.linearContemplationsRounded) + ' cotas inteiras';
    $('empResContemplacoes').textContent = nfmt(result.usableContemplations) + ' cotas';

    $('empResBemElegivel').textContent = result.input.assetValue > 0 ? brl(result.eligibleCollateral) : 'Não informado';
    $('empResCotasGarantia').textContent = result.input.assetValue > 0 ? nfmt(result.alignedQuotaCapacity) + ' cotas' : 'Sem limite informado';
    $('empResCreditoGarantia').textContent = result.input.assetValue > 0 ? brl(result.alignedCreditCapacity) : 'Não informado';
    $('empResUsoGarantia').textContent = result.input.assetValue > 0 ? pct(result.guaranteeUsage,1) : '—';

    $('empResParcelaCotaReduzida').textContent = brl(result.reducedPerQuota);
    $('empResParcelaCotaCheia').textContent = brl(result.fullPerQuota);
    $('empResParcelaPosCenario').textContent = brl(result.paymentAfterScenario);
    $('empResCotasEquilibrio').textContent = nfmt(result.coverageContemplations) + ' cotas';
    $('empResCapital100').textContent = result.activatedCredit > 0 ? brl(result.capitalPer100k) : '—';
    $('empResTaxaAnual').textContent = pct(result.annualAdminSimple,2) + ' a.a. simples';


    const compareBody = $('empCoverageCompareBody');
    if(compareBody){
      compareBody.innerHTML = result.quotaComparisons.map(item => {
        const active = Math.abs(item.quotaValue - result.input.quotaValue) < 1 ? ' class="active"' : '';
        return '<tr' + active + '>' +
          '<td>' + brl(item.quotaValue) + '</td>' +
          '<td>' + nfmt(item.quotaCount) + '</td>' +
          '<td>' + pct(item.coveragePercentage,2) + '</td>' +
          '<td>' + pct(item.monthlyProbability,2) + '</td>' +
          '<td>' + nfmt(item.averageProjectMonthly,3) + '/mês</td>' +
        '</tr>';
      }).join('');
    }

    const guaranteeWarning = $('empGuaranteeWarning');
    if(result.input.assetValue > 0 && result.scenarioContemplations > result.alignedQuotaCapacity){
      guaranteeWarning.hidden = false;
      guaranteeWarning.textContent = 'O cenário informou ' + result.scenarioContemplations + ' contemplações, mas o bem informado suporta ' + result.alignedQuotaCapacity + ' cotas de ' + brl(result.input.quotaValue) + '. O crédito ativado foi limitado à capacidade matemática da garantia.';
    }else{
      guaranteeWarning.hidden = true;
    }

    $('empResultado').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function calculateAndRender(){
    try{
      const input = readInput();
      const result = calculate(input);
      $('empError').hidden = true;
      save(input);
      render(result);
    }catch(error){
      const el = $('empError');
      el.textContent = error && error.message ? error.message : 'Não foi possível calcular.';
      el.hidden = false;
    }
  }

  function useLinearAverage(){
    try{
      const input = readInput();
      const base = calculate(Object.assign({}, input, {contemplations:0}));
      $('empContemplacoes').value = String(base.linearContemplationsRounded);
      calculateAndRender();
    }catch(error){
      const el = $('empError');
      el.textContent = error.message;
      el.hidden = false;
    }
  }

  function save(input){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        projectValue:input.projectValue, quotaValue:input.quotaValue, term:input.term, groupSize:input.groupSize,
        analysisMonths:input.analysisMonths, adminRate:input.adminRate,
        reducedFundPercent:input.reducedFundPercent, collateralPercent:input.collateralPercent
      }));
    }catch(_error){}
  }

  function restore(){
    let saved = null;
    try{ saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(_error){}
    if(!saved) return;
    if(saved.projectValue) $('empProjeto').value = moneyInput(saved.projectValue);
    if(saved.quotaValue) $('empCarta').value = moneyInput(saved.quotaValue);
    if(saved.term) $('empPrazo').value = saved.term;
    if(saved.groupSize) $('empGroupSize').value = saved.groupSize;
    if(saved.analysisMonths) $('empMeses').value = saved.analysisMonths;
    if(Number.isFinite(saved.adminRate)) $('empTaxaAdmin').value = (saved.adminRate*100).toFixed(2);
    if(Number.isFinite(saved.reducedFundPercent)) $('empParcelaReduzidaPct').value = String(Math.round(saved.reducedFundPercent*100));
    if(Number.isFinite(saved.collateralPercent)) $('empPercentualBem').value = String(Math.round(saved.collateralPercent*100));
  }

  function setPreset(id, value){
    const el = $(id);
    if(!el) return;
    el.value = moneyInput(value);
    el.focus();
    el.blur();
  }

  function copySummary(){
    if(!currentResult) return;
    const r = currentResult;
    const text = [
      'PROJETO EMPRESARIAL DE ATIVAÇÃO DE CRÉDITO',
      r.input.client ? 'Cliente: ' + r.input.client : '',
      'Projeto desejado: ' + brl(r.input.projectValue),
      'Estrutura: ' + r.quotaCount + ' cotas de ' + brl(r.input.quotaValue),
      'Crédito contratado: ' + brl(r.contractedCredit),
      'Prazo: ' + r.input.term + ' meses',
      'Grupo considerado: ' + nfmt(r.input.groupSize) + ' cotas',
      'Cobertura teórica máxima ±10: ' + pct(r.theoreticalCoveragePercentage,2) + ' (' + nfmt(r.theoreticalCoverageCount) + '/' + nfmt(r.input.groupSize) + ' referências)',
      'Máximo sem sobreposição: ' + nfmt(r.maxSeparatedQuotas) + ' cotas',
      'Probabilidade mensal teórica — modelo uniforme: ' + pct(r.monthlyProbabilityUniform,2),
      'Parcela reduzida estimada do projeto: ' + brl(r.reducedProjectPayment) + '/mês',
      'Período analisado: ' + r.input.analysisMonths + ' meses',
      'Capital próprio aportado no período: ' + brl(r.contributedCapital),
      'Contemplações consideradas: ' + r.usableContemplations,
      'Crédito ativado: ' + brl(r.activatedCredit),
      'Liquidez incremental no cenário: ' + brl(r.incrementalLiquidity),
      'Multiplicador de ativação: ' + nfmt(r.activationMultiple,2) + 'x',
      r.input.assetValue > 0 ? 'Bem informado: ' + brl(r.input.assetValue) + ' | capacidade elegível: ' + brl(r.eligibleCollateral) : '',
      '',
      'Observação: liquidez incremental não é lucro. É a diferença entre crédito ativado e capital próprio aportado até o marco analisado. Contemplação e aceitação de garantias dependem das regras e análises do grupo/administradora.'
    ].filter(Boolean).join('\n');

    const done = function(){
      $('empMessage').textContent = 'Resumo copiado.';
      $('empMessage').hidden = false;
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){ fallbackCopy(text); done(); });
    }else{
      fallbackCopy(text); done();
    }
  }

  function fallbackCopy(text){
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function safeFileName(value){
    return String(value || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'cliente';
  }

  function addPdfHeader(doc, title, subtitle, profile){
    doc.setFillColor(19,27,36);
    doc.rect(0,0,210,34,'F');
    doc.setFillColor(255,138,0);
    doc.roundedRect(12,9,14,14,3,3,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('SC',19,18,{align:'center'});
    doc.setFontSize(18);
    doc.text(title,32,15);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(188,198,208);
    doc.text(subtitle,32,22);
    if(profile && profile.consultant){
      doc.setTextColor(230,235,240);
      doc.text(profile.consultant,198,14,{align:'right'});
      if(profile.phone) doc.text(profile.phone,198,20,{align:'right'});
    }
  }

  function pdfCard(doc, x, y, w, h, label, value, highlight){
    if(highlight){ doc.setFillColor(255,248,239); doc.setDrawColor(255,180,93); }
    else{ doc.setFillColor(248,250,251); doc.setDrawColor(222,228,233); }
    doc.roundedRect(x,y,w,h,3,3,'FD');
    doc.setFont('helvetica','bold');
    doc.setFontSize(6.8);
    doc.setTextColor(105,116,127);
    doc.text(String(label).toUpperCase(),x+4,y+6.5,{maxWidth:w-8});
    doc.setFontSize(12.5);
    doc.setTextColor(highlight ? 185 : 31, highlight ? 102 : 40, highlight ? 0 : 50);
    doc.text(String(value),x+4,y+15,{maxWidth:w-8});
  }

  function generatePdf(){
    if(!currentResult) return;
    if(!(global.jspdf && global.jspdf.jsPDF)){
      openPrintFallback(currentResult);
      return;
    }

    const r = currentResult;
    const profile = S.Configuracoes && S.Configuracoes.load ? S.Configuracoes.load() : {};
    const jsPDF = global.jspdf.jsPDF;
    const doc = new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});

    addPdfHeader(doc,'Projeto Empresarial','Ativação de crédito, garantia e fluxo de caixa',profile);
    doc.setTextColor(35,45,55);
    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.text(r.input.client || 'Simulação empresarial',12,46);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100,110,120);
    doc.text('Emitido em ' + new Date(r.createdAt).toLocaleDateString('pt-BR') + ' · cenário de ' + r.input.analysisMonths + ' meses',12,52);

    pdfCard(doc,12,59,59,25,'Projeto desejado',brl(r.input.projectValue),false);
    pdfCard(doc,75,59,59,25,'Crédito estruturado',brl(r.contractedCredit),false);
    pdfCard(doc,138,59,60,25,'Quantidade de cotas',nfmt(r.quotaCount) + ' x ' + brl(r.input.quotaValue),false);

    pdfCard(doc,12,89,59,25,'Capital próprio aportado',brl(r.contributedCapital),false);
    pdfCard(doc,75,89,59,25,'Crédito ativado',brl(r.activatedCredit),true);
    pdfCard(doc,138,89,60,25,'Liquidez incremental',brl(r.incrementalLiquidity),r.incrementalLiquidity>=0);

    pdfCard(doc,12,119,59,25,'Parcela reduzida projeto',brl(r.reducedProjectPayment),false);
    pdfCard(doc,75,119,59,25,'Multiplicador de ativação',nfmt(r.activationMultiple,2) + 'x',true);
    pdfCard(doc,138,119,60,25,'Parcela após cenário',brl(r.paymentAfterScenario),false);

    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(35,45,55);
    doc.text('Alinhamento do bem',12,156);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.8);
    doc.setTextColor(80,90,100);
    const ownerText = r.input.assetOwner === 'terceiro' ? 'Bem de terceiro informado' : 'Bem próprio informado';
    if(r.input.assetValue > 0){
      doc.text(ownerText + ': ' + brl(r.input.assetValue),12,164);
      doc.text('Percentual considerado: ' + pct(r.input.collateralPercent*100,1) + ' · capacidade elegível: ' + brl(r.eligibleCollateral),12,170);
      doc.text('Capacidade matemática: ' + nfmt(r.alignedQuotaCapacity) + ' cotas · ' + brl(r.alignedCreditCapacity),12,176);
    }else{
      doc.text('Nenhum bem foi informado nesta simulação. A capacidade de garantia não foi usada como limitador.',12,164);
    }

    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('Cobertura e probabilidade teórica',12,190);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.4);
    doc.text('Grupo considerado: ' + nfmt(r.input.groupSize) + ' cotas · prazo ' + r.input.term + ' meses',12,198);
    doc.text('Média necessária do grupo: ' + nfmt(r.groupAverageContemplationsMonthly,2) + ' contemplações/mês',12,204);
    doc.text('Cobertura máxima ±10: ' + pct(r.theoreticalCoveragePercentage,2) + ' · ' + nfmt(r.theoreticalCoverageCount) + '/' + nfmt(r.input.groupSize) + ' referências',12,210);
    doc.text('Máximo sem sobreposição: ' + nfmt(r.maxSeparatedQuotas) + ' cotas · ' + (r.coverageSaturated ? 'território saturado' : 'território ainda não saturado'),12,216);
    doc.text('Probabilidade mensal teórica (modelo uniforme): ' + pct(r.monthlyProbabilityUniform,2),12,222);

    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('Referência matemática de contemplação da carteira',12,233);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.8);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.4);
    doc.text('Média linear da carteira: ' + nfmt(r.averageContemplationsMonthly,3) + ' cota/mês',12,241);
    doc.text('Intervalo equivalente: 1 contemplação a cada ' + nfmt(r.averageMonthsPerContemplation,2) + ' meses',12,247);
    doc.text('No período de ' + r.input.analysisMonths + ' meses: ' + nfmt(r.linearContemplationsRaw,2) + ' cotas equivalentes, arredondadas para ' + nfmt(r.linearContemplationsRounded) + ' cotas inteiras.',12,253);

    doc.setDrawColor(225,229,233);
    doc.line(12,261,198,261);
    doc.setFontSize(7.1);
    doc.setTextColor(105,115,125);
    const note1 = 'Liquidez incremental não é lucro: representa crédito ativado menos o capital próprio aportado até o marco analisado. A conta usa a parcela reduzida do projeto até esse marco e mostra separadamente a parcela projetada após as contemplações do cenário.';
    doc.text(doc.splitTextToSize(note1,186),12,267);
    const note2 = 'Contemplação, utilização do crédito, garantias próprias ou de terceiros, percentuais de garantia, liberação e demais condições dependem das regras do grupo, contrato e análise da administradora. A média de contemplação exibida é uma referência matemática linear, não uma previsão ou garantia.';
    doc.text(doc.splitTextToSize(note2,186),12,279);

    doc.addPage();
    addPdfHeader(doc,'Memória de cálculo','Premissas auditáveis da simulação',profile);
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(35,45,55);
    doc.text('Premissas informadas',12,48);

    const rows = [
      ['Projeto desejado', brl(r.input.projectValue)],
      ['Valor da carta', brl(r.input.quotaValue)],
      ['Prazo total do grupo', r.input.term + ' meses'],
      ['Quantidade de cotas do grupo', nfmt(r.input.groupSize)],
      ['Média necessária do grupo', nfmt(r.groupAverageContemplationsMonthly,2) + '/mês'],
      ['Cobertura teórica ±10', pct(r.theoreticalCoveragePercentage,2)],
      ['Máximo sem sobreposição', nfmt(r.maxSeparatedQuotas) + ' cotas'],
      ['Probabilidade mensal teórica', pct(r.monthlyProbabilityUniform,2)],
      ['Taxa administrativa total', pct(r.input.adminRate*100,2)],
      ['Equivalência média simples', pct(r.annualAdminSimple,2) + ' a.a.'],
      ['Parcela reduzida do fundo comum', pct(r.input.reducedFundPercent*100,0)],
      ['Parcela reduzida por cota', brl(r.reducedPerQuota)],
      ['Parcela cheia por cota', brl(r.fullPerQuota)],
      ['Período analisado', r.input.analysisMonths + ' meses'],
      ['Contemplações consideradas', nfmt(r.scenarioContemplations)],
      ['Contemplações utilizáveis no cenário', nfmt(r.usableContemplations)]
    ];
    let y = 57;
    rows.forEach(function(row,idx){
      if(idx % 2 === 0){ doc.setFillColor(248,250,251); doc.rect(12,y-4.2,186,7.2,'F'); }
      doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(95,105,115); doc.text(row[0],15,y);
      doc.setFont('helvetica','bold'); doc.setTextColor(35,45,55); doc.text(row[1],195,y,{align:'right'});
      y += 7.2;
    });

    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Fórmulas principais',12,y+6);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(65,75,85);
    const formulas = [
      'Quantidade de cotas = teto(projeto ÷ valor da carta). Cota quebrada sempre sobe para a próxima cota inteira.',
      'Parcela reduzida por cota = carta × (percentual reduzido + taxa administrativa total) ÷ prazo, salvo valor manual informado.',
      'Parcela cheia por cota = carta × (1 + taxa administrativa total) ÷ prazo, salvo valor manual informado.',
      'Capital próprio aportado = parcela reduzida total do projeto × meses analisados.',
      'Crédito ativado = cotas contempladas utilizáveis × valor da carta, limitado pela capacidade matemática do bem quando informado.',
      'Liquidez incremental = crédito ativado − capital próprio aportado.',
      'Multiplicador de ativação = crédito ativado ÷ capital próprio aportado.',
      'Média linear de contemplação da carteira = quantidade de cotas ÷ prazo do grupo.',
      'Cobertura teórica ±10 = mínimo(cotas do grupo, quantidade de cotas × 21) ÷ cotas do grupo. Pressupõe espaçamento mínimo de 21 e não sobreposição.',
      'Probabilidade mensal teórica = 1 − (1 − participação direta)^(média de contemplações do grupo). É um modelo uniforme aproximado; não é uma garantia nem multiplica a média mensal como se fossem sorteios independentes da Federal.'
    ];
    y += 13;
    formulas.forEach(function(line){
      const parts = doc.splitTextToSize('• ' + line,182);
      doc.text(parts,15,y);
      y += parts.length * 3.8 + 1.5;
    });

    doc.setDrawColor(225,229,233); doc.line(12,Math.min(y+2,282),198,Math.min(y+2,282));
    doc.setFontSize(6.8); doc.setTextColor(100,110,120);
    doc.text(doc.splitTextToSize('Documento de simulação matemática para apoio à reunião. Não substitui proposta, contrato, análise de crédito, avaliação de garantia ou confirmação formal da administradora.',186),12,Math.min(y+8,288));


    doc.addPage();
    addPdfHeader(doc,'Comparação de Tickets','Cobertura matemática por valor de carta',profile);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(35,45,55);
    doc.text('Mesmo projeto, diferentes tamanhos de carta',12,48);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.4);
    doc.setTextColor(95,105,115);
    doc.text('Projeto: ' + brl(r.input.projectValue) + ' · grupo: ' + nfmt(r.input.groupSize) + ' cotas · prazo: ' + r.input.term + ' meses',12,55);
    doc.text('A quantidade de cotas é sempre arredondada para cima. Cobertura ±10 pressupõe distribuição com distância mínima de 21 números.',12,61,{maxWidth:186});

    const cols = [12,55,88,128,164,198];
    let ty = 72;
    doc.setFillColor(19,27,36);
    doc.rect(12,ty-6,186,10,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.1);
    doc.text('Carta',cols[0]+3,ty);
    doc.text('Cotas',cols[1]-3,ty,{align:'right'});
    doc.text('Cobertura',cols[2]-3,ty,{align:'right'});
    doc.text('Chance mensal*',cols[3]-3,ty,{align:'right'});
    doc.text('Média carteira',cols[4]-3,ty,{align:'right'});
    doc.text('Território',cols[5]-3,ty,{align:'right'});
    ty += 10;

    r.quotaComparisons.forEach(function(item,index){
      const active = Math.abs(item.quotaValue - r.input.quotaValue) < 1;
      if(active){ doc.setFillColor(255,248,239); doc.setDrawColor(255,180,93); }
      else if(index % 2 === 0){ doc.setFillColor(248,250,251); doc.setDrawColor(235,238,241); }
      else{ doc.setFillColor(255,255,255); doc.setDrawColor(235,238,241); }
      doc.rect(12,ty-6,186,10,'FD');
      doc.setFont('helvetica',active ? 'bold' : 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(active ? 185 : 45,active ? 102 : 55,active ? 0 : 65);
      doc.text(brl(item.quotaValue),cols[0]+3,ty);
      doc.text(nfmt(item.quotaCount),cols[1]-3,ty,{align:'right'});
      doc.text(pct(item.coveragePercentage,2),cols[2]-3,ty,{align:'right'});
      doc.text(pct(item.monthlyProbability,2),cols[3]-3,ty,{align:'right'});
      doc.text(nfmt(item.averageProjectMonthly,3) + '/mês',cols[4]-3,ty,{align:'right'});
      doc.text(nfmt(item.coverageCount) + '/' + nfmt(r.input.groupSize),cols[5]-3,ty,{align:'right'});
      ty += 10;
    });

    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(35,45,55);
    doc.text('Leitura das métricas',12,ty+8);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.8);
    doc.setTextColor(95,105,115);
    const ticketNote = '* Chance mensal teórica: modelo uniforme aproximado baseado na participação direta das cotas e na média necessária de contemplações do grupo. A cobertura ±10 mede a fração das referências do grupo alcançada pelo território das cotas. As duas métricas são mostradas separadamente para não contar a mesma oportunidade duas vezes.';
    doc.text(doc.splitTextToSize(ticketNote,186),12,ty+15);

    doc.save('projeto-empresarial-' + safeFileName(r.input.client) + '.pdf');
    $('empMessage').textContent = 'PDF profissional gerado.';
    $('empMessage').hidden = false;
  }

  function openPrintFallback(r){
    const w = window.open('','_blank');
    if(!w){
      $('empMessage').textContent = 'O navegador bloqueou o relatório. Libere pop-ups ou tente novamente online para gerar o PDF direto.';
      $('empMessage').className = 'message error';
      $('empMessage').hidden = false;
      return;
    }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Projeto empresarial</title><style>@page{size:A4;margin:12mm}body{font-family:Arial;color:#1f2933}h1{margin:0 0 4px}.box{border:1px solid #dfe4e8;border-radius:10px;padding:12px;margin:8px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.big{font-size:22px;font-weight:800}.muted{color:#687480;font-size:12px}button{position:fixed;right:18px;bottom:18px;padding:12px 16px;background:#ff8a00;color:#fff;border:0;border-radius:10px;font-weight:800}@media print{button{display:none}}</style></head><body><h1>Projeto Empresarial</h1><div class="muted">Simulação matemática</div><div class="grid"><div class="box">Capital aportado<div class="big">'+brl(r.contributedCapital)+'</div></div><div class="box">Crédito ativado<div class="big">'+brl(r.activatedCredit)+'</div></div><div class="box">Liquidez incremental<div class="big">'+brl(r.incrementalLiquidity)+'</div></div><div class="box">Multiplicador<div class="big">'+nfmt(r.activationMultiple,2)+'x</div></div></div><div class="box">Estrutura: '+r.quotaCount+' cotas de '+brl(r.input.quotaValue)+' · prazo '+r.input.term+' meses · parcela reduzida do projeto '+brl(r.reducedProjectPayment)+'</div><p class="muted">Liquidez incremental não é lucro. Contemplação e garantias dependem das condições do grupo e da administradora.</p><button onclick="window.print()">Salvar como PDF</button></body></html>');
    w.document.close();
  }

  function injectStyles(){
    if($('empresarial-styles')) return;
    const style = document.createElement('style');
    style.id = 'empresarial-styles';
    style.textContent = '.app-shell .bottom-nav{grid-template-columns:repeat(6,1fr)!important}.emp-hero{border-color:#5a4624;background:linear-gradient(145deg,#17140f,#101820)}.emp-presets{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.emp-presets button{border:1px solid var(--line);border-radius:999px;background:#101820;color:#d8e0e7;padding:7px 10px;font-size:8px;font-weight:850}.emp-presets button:active{transform:scale(.97)}.emp-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:14px}.emp-kpi>div,.emp-detail-grid>div,.emp-math-grid>div{border:1px solid var(--line);background:#0b1219;border-radius:14px;padding:12px;min-width:0}.emp-kpi span,.emp-detail-grid span,.emp-math-grid span{display:block;color:var(--muted);font-size:8px;line-height:1.35}.emp-kpi strong,.emp-detail-grid strong,.emp-math-grid strong{display:block;margin-top:6px;font-size:16px;overflow-wrap:anywhere}.emp-kpi .highlight{border-color:#6a4d22;background:#21170b}.emp-kpi .highlight strong{color:var(--orange-2);font-size:20px}.emp-kpi .green{border-color:#326948;background:#0e2015}.emp-kpi .green strong{color:var(--green);font-size:20px}.emp-status{display:inline-block;margin-top:10px;padding:7px 10px;border-radius:999px;font-size:8px;font-weight:900}.emp-status.positive{background:#0e2015;color:#7fd39a;border:1px solid #326948}.emp-status.negative{background:#28171a;color:#ff9d9d;border:1px solid #74383d}.emp-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}.emp-math-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}.emp-math-grid strong{font-size:14px}.emp-method{margin-top:12px;border:1px solid #665523;background:#292313;color:#e8dba9;border-radius:14px;padding:12px;font-size:9px;line-height:1.55}.emp-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.emp-coverage-table tr.active td{border-color:#8b5d24;background:#21170b}.emp-coverage-table tr.active td:first-child{color:var(--orange-2)}.emp-inline-action{margin-top:9px}.emp-inline-action .secondary-button{margin:0;width:100%}.emp-warning{margin-top:12px}.emp-section-title{margin-top:16px;font-size:12px;color:#dce4eb}.emp-subline{margin-top:5px;color:var(--muted);font-size:9px;line-height:1.5}@media(max-width:760px){.app-shell .bottom-nav{grid-template-columns:repeat(6,1fr)!important;width:calc(100% - 12px)}.bottom-nav button{padding:7px 2px!important;font-size:6.8px!important}.bottom-nav button span{font-size:14px!important}.emp-kpi{grid-template-columns:1fr 1fr}.emp-detail-grid,.emp-math-grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.emp-kpi,.emp-detail-grid,.emp-math-grid,.emp-actions{grid-template-columns:1fr}.emp-presets{gap:5px}.emp-presets button{padding:6px 8px;font-size:7.5px}}';
    document.head.appendChild(style);
  }

  function sectionHTML(){
    return [
      '<section id="view-empresarial" class="view" data-view="empresarial">',
      '<article class="panel hero-panel emp-hero">',
      '<div class="result-topline"><div><div class="eyebrow">Crédito empresarial</div><h2>Projeto de ativação de crédito</h2></div><span class="pill">EMPRESARIAL</span></div>',
      '<p class="lead">Estruture múltiplas cotas, alinhe um bem e mostre quanto capital próprio foi colocado, quanto crédito foi ativado e qual liquidez incremental o cenário gera.</p>',
      '<div class="form-grid">',
      '<div class="field full"><label for="empCliente">Nome do cliente <span class="optional">opcional</span></label><div class="control"><input id="empCliente" type="text" maxlength="80" placeholder="Ex.: Empresa Silva Ltda." autocomplete="off"></div></div>',
      '<div class="field full"><label for="empProjeto">Tamanho do projeto</label><div class="control money-control"><span>R$</span><input id="empProjeto" type="text" inputmode="decimal" value="1.000.000"></div><div class="emp-presets" data-preset-target="empProjeto"><button type="button" data-money="500000">500 mil</button><button type="button" data-money="1000000">1 mi</button><button type="button" data-money="5000000">5 mi</button><button type="button" data-money="10000000">10 mi</button><button type="button" data-money="20000000">20 mi</button><button type="button" data-money="30000000">30 mi</button></div></div>',
      '<div class="field"><label for="empCarta">Valor de cada carta</label><div class="control money-control"><span>R$</span><input id="empCarta" type="text" inputmode="decimal" value="80.000"></div><div class="emp-presets" data-preset-target="empCarta"><button type="button" data-money="80000">80k</button><button type="button" data-money="100000">100k</button><button type="button" data-money="120000">120k</button><button type="button" data-money="130000">130k</button><button type="button" data-money="150000">150k</button><button type="button" data-money="200000">200k</button><button type="button" data-money="250000">250k</button><button type="button" data-money="500000">500k</button><button type="button" data-money="1000000">1 mi</button></div></div>',
      '<div class="field"><label for="empPrazo">Prazo total do grupo</label><div class="control"><input id="empPrazo" type="number" value="220" min="1" max="360"><span>meses</span></div></div>',
      '<div class="field"><label for="empGroupSize">Quantidade de cotas do grupo</label><div class="control"><input id="empGroupSize" type="number" value="5000" min="1" max="9999"><span>cotas</span></div></div>',
      '<div class="field"><label for="empMeses">Período que quer analisar</label><div class="control"><input id="empMeses" type="number" value="3" min="1" max="360"><span>meses</span></div></div>',
      '<div class="field"><label for="empContemplacoes">Contemplações no cenário</label><div class="control"><input id="empContemplacoes" type="number" value="2" min="0" step="1"><span>cotas</span></div><div class="emp-inline-action"><button id="empUseAverageBtn" class="secondary-button" type="button">Usar média matemática do período</button></div></div>',
      '</div>',
      '<details class="assumptions" open><summary><span>Alinhamento do bem</span><small>Garantia e capacidade matemática</small></summary><div class="form-grid assumptions-grid">',
      '<div class="field"><label for="empBem">Valor do bem</label><div class="control money-control"><span>R$</span><input id="empBem" type="text" inputmode="decimal" value="500.000"></div></div>',
      '<div class="field"><label for="empPercentualBem">Percentual considerado</label><div class="control"><input id="empPercentualBem" type="number" value="80" min="0" max="100" step="1"><span>%</span></div></div>',
      '<div class="field"><label for="empTitularBem">Origem do bem</label><div class="control select-control"><select id="empTitularBem"><option value="proprio">Bem próprio</option><option value="terceiro">Bem de terceiro</option></select></div></div>',
      '<div class="field"><label for="empFinalidade">Finalidade informada</label><div class="control select-control"><select id="empFinalidade"><option value="reforma">Reforma / construção</option><option value="aquisicao">Aquisição imobiliária</option><option value="outro">Outro uso elegível conforme contrato</option></select></div></div>',
      '</div><div class="assumption-footer"><span>O percentual é uma premissa editável. A aceitação do bem, inclusive de terceiro, depende da análise e das regras da administradora.</span></div></details>',
      '<details class="assumptions"><summary><span>Premissas financeiras</span><small>Deixe o app calcular ou informe a parcela real</small></summary><div class="form-grid assumptions-grid">',
      '<div class="field"><label for="empTaxaAdmin">Taxa administrativa total</label><div class="control"><input id="empTaxaAdmin" type="number" value="24.2" min="0" step="0.1"><span>%</span></div></div>',
      '<div class="field"><label for="empParcelaReduzidaPct">Fundo comum na parcela reduzida</label><div class="control"><input id="empParcelaReduzidaPct" type="number" value="50" min="0" max="100" step="1"><span>%</span></div></div>',
      '<div class="field"><label for="empParcelaReduzidaManual">Parcela reduzida por cota <span class="optional">opcional</span></label><div class="control money-control"><span>R$</span><input id="empParcelaReduzidaManual" type="text" inputmode="decimal" placeholder="Calculada automaticamente"></div></div>',
      '<div class="field"><label for="empParcelaCheiaManual">Parcela cheia por cota <span class="optional">opcional</span></label><div class="control money-control"><span>R$</span><input id="empParcelaCheiaManual" type="text" inputmode="decimal" placeholder="Calculada automaticamente"></div></div>',
      '<div class="field"><label for="empParcelaReduzidaProjetoManual">Parcela reduzida total do projeto <span class="optional">opcional</span></label><div class="control money-control"><span>R$</span><input id="empParcelaReduzidaProjetoManual" type="text" inputmode="decimal" placeholder="Ex.: 33.380"></div></div>',
      '<div class="field"><label for="empParcelaCheiaProjetoManual">Parcela cheia total do projeto <span class="optional">opcional</span></label><div class="control money-control"><span>R$</span><input id="empParcelaCheiaProjetoManual" type="text" inputmode="decimal" placeholder="Se houver valor consolidado"></div></div>',
      '</div><div class="assumption-footer"><span>Se tu informar a parcela real da cota, ela prevalece sobre a fórmula. Isso deixa a apresentação auditável pelo contrato daquele grupo.</span></div></details>',
      '<div id="empError" class="message error" hidden></div><button id="empCalcularBtn" class="primary-button" type="button">Calcular projeto empresarial</button>',
      '</article>',
      '<section id="empResultado" class="result-stack" hidden>',
      '<article class="panel"><div class="section-heading"><div><div class="eyebrow">Resumo executivo</div><h2>Quanto capital foi ativado</h2><p class="lead">Os números abaixo separam capital próprio, crédito ativado e obrigação mensal. Liquidez incremental não é tratada como lucro.</p></div></div>',
      '<div class="emp-kpi"><div><span>Cotas inteiras</span><strong id="empResCotas">0</strong></div><div><span>Crédito estruturado</span><strong id="empResCreditoContratado">R$ 0</strong></div><div><span>Parcela reduzida do projeto</span><strong id="empResParcelaReduzida">R$ 0</strong></div><div><span>Parcela cheia do projeto</span><strong id="empResParcelaCheia">R$ 0</strong></div><div><span>Capital próprio aportado</span><strong id="empResCapitalAportado">R$ 0</strong></div><div class="highlight"><span>Crédito ativado</span><strong id="empResCreditoAtivado">R$ 0</strong></div><div class="green"><span>Liquidez incremental</span><strong id="empResLiquidez">R$ 0</strong></div><div class="highlight"><span>Multiplicador</span><strong id="empResMultiplicador">0x</strong></div></div><span id="empResStatus" class="emp-status">—</span><div id="empGuaranteeWarning" class="message warning emp-warning" hidden></div>',
      '<h3 class="emp-section-title">Cobertura matemática do grupo</h3><p class="emp-subline">A cobertura ±10 considera até 21 referências por cota quando elas estão espaçadas em pelo menos 21 números. A probabilidade mensal é um modelo uniforme aproximado, não garantia.</p><div class="emp-math-grid"><div><span>Média necessária do grupo</span><strong id="empResGrupoMedia">0</strong></div><div><span>Cobertura teórica ±10</span><strong id="empResCobertura">0%</strong></div><div><span>Território coberto</span><strong id="empResTerritorio">0</strong></div><div><span>Participação direta no grupo</span><strong id="empResParticipacao">0%</strong></div><div><span>Probabilidade mensal teórica*</span><strong id="empResProbMensal">0%</strong></div><div><span>Valor esperado da carteira</span><strong id="empResEsperadoProjeto">0/mês</strong></div><div><span>Máx. cotas sem sobreposição</span><strong id="empResMaxSemSobreposicao">0</strong></div><div><span>Status do território</span><strong id="empResSaturacao">—</strong></div></div><h3 class="emp-section-title">Média linear da carteira</h3><div class="emp-math-grid"><div><span>Média por mês</span><strong id="empResMediaMes">0</strong></div><div><span>Intervalo equivalente</span><strong id="empResIntervalo">0</strong></div><div><span>Média no período</span><strong id="empResMediaPeriodo">0</strong></div><div><span>Cenário utilizado</span><strong id="empResContemplacoes">0</strong></div><div><span>Cotas para igualar o aporte</span><strong id="empResCotasEquilibrio">0</strong></div><div><span>Capital próprio por R$ 100 mil ativados</span><strong id="empResCapital100">—</strong></div></div>',
      '<article class="panel"><div class="section-heading"><div><div class="eyebrow">Escolha do ticket</div><h2>Quanto do grupo cada valor de carta cobre</h2><p class="lead">Mantendo o mesmo tamanho de projeto, cartas menores geram mais cotas e ampliam a cobertura teórica. O cálculo sempre arredonda a quantidade de cotas para cima.</p></div></div><div class="table-wrap"><table class="comparison-table emp-coverage-table"><thead><tr><th>Valor da carta</th><th>Cotas</th><th>Cobertura ±10</th><th>Chance mensal teórica*</th><th>Média da carteira</th></tr></thead><tbody id="empCoverageCompareBody"></tbody></table></div><div class="emp-method"><b>*Modelo uniforme:</b> não transforma a média de contemplações do grupo em vários sorteios independentes da Federal. É uma aproximação de distribuição das contemplações entre as cotas do grupo.</div></article>',
      '<h3 class="emp-section-title">Capacidade do bem</h3><div class="emp-detail-grid"><div><span>Capacidade elegível do bem</span><strong id="empResBemElegivel">—</strong></div><div><span>Cotas suportadas</span><strong id="empResCotasGarantia">—</strong></div><div><span>Crédito suportado</span><strong id="empResCreditoGarantia">—</strong></div><div><span>Uso da capacidade no cenário</span><strong id="empResUsoGarantia">—</strong></div><div><span>Parcela reduzida por cota</span><strong id="empResParcelaCotaReduzida">—</strong></div><div><span>Parcela cheia por cota</span><strong id="empResParcelaCotaCheia">—</strong></div><div><span>Parcela do projeto após cenário</span><strong id="empResParcelaPosCenario">—</strong></div><div><span>Taxa adm. média simples</span><strong id="empResTaxaAnual">—</strong></div></div>',
      '<div class="emp-method"><b>Leitura correta:</b> o app não chama a diferença de lucro. Ele calcula quanto crédito foi efetivamente ativado frente ao capital próprio colocado até o marco analisado. As parcelas futuras continuam existindo e ficam explícitas na apresentação.</div>',
      '</article>',
      '<article class="panel"><div class="section-heading"><div><div class="eyebrow">Apresentação</div><h2>Entregar ao empresário</h2><p class="lead">Gere um PDF profissional com resumo executivo, memória de cálculo e comparação de tickets para o cliente ou contador conferir.</p></div></div><div class="emp-actions"><button id="empPdfBtn" class="action-button" type="button"><span>▣</span>Gerar PDF profissional</button><button id="empCopiarBtn" class="action-button" type="button"><span>⧉</span>Copiar resumo</button></div><div id="empMessage" class="message success" hidden></div></article>',
      '<article class="disclaimer"><b>Importante:</b> simulação matemática. Não garante contemplação, liberação, aceitação de garantia, uso de bem de terceiro ou disponibilidade do crédito. As condições reais devem ser conferidas no contrato e na análise da administradora.</article>',
      '</section></section>'
    ].join('');
  }

  function injectViewAndNav(){
    if($('view-empresarial')) return;
    const main = document.querySelector('main');
    const settings = $('view-configuracoes');
    if(main){
      const wrapper = document.createElement('div');
      wrapper.innerHTML = sectionHTML();
      const section = wrapper.firstElementChild;
      if(settings) main.insertBefore(section,settings); else main.appendChild(section);
    }

    const nav = document.querySelector('.bottom-nav');
    if(nav){
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.nav = 'empresarial';
      button.innerHTML = '<span>▦</span>Empresarial';
      const settingsButton = nav.querySelector('[data-nav="configuracoes"]');
      if(settingsButton) nav.insertBefore(button,settingsButton); else nav.appendChild(button);
      button.addEventListener('click',function(){
        document.querySelectorAll('.view').forEach(function(item){ item.classList.toggle('active',item.dataset.view === 'empresarial'); });
        document.querySelectorAll('[data-nav]').forEach(function(item){ item.classList.toggle('active',item.dataset.nav === 'empresarial'); });
        window.scrollTo({top:0,behavior:'smooth'});
      });
    }
  }

  function bind(){
    ['empProjeto','empCarta','empBem','empParcelaReduzidaManual','empParcelaCheiaManual','empParcelaReduzidaProjetoManual','empParcelaCheiaProjetoManual'].forEach(function(id){
      const el = $(id);
      if(!el) return;
      el.addEventListener('blur',function(event){ event.target.value = moneyInput(event.target.value); });
      el.addEventListener('focus',function(event){ event.target.select(); });
    });

    document.querySelectorAll('.emp-presets button[data-money]').forEach(function(button){
      button.addEventListener('click',function(){
        const target = button.closest('.emp-presets').dataset.presetTarget;
        setPreset(target,Number(button.dataset.money));
      });
    });

    $('empUseAverageBtn').addEventListener('click',useLinearAverage);
    $('empCalcularBtn').addEventListener('click',calculateAndRender);
    $('empCopiarBtn').addEventListener('click',copySummary);
    $('empPdfBtn').addEventListener('click',generatePdf);
  }

  function init(){
    injectStyles();
    injectViewAndNav();
    restore();
    bind();
  }

  S.Empresarial = {calculate:calculate, brl:brl};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})(window);
