(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { propertyType: 'residencial' };

  function number(value){
    const parsed = parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function moneyFromText(value){
    const digits = String(value ?? '').replace(/\D/g, '');
    const parsed = parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brl(value){
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL', maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function pct(value, decimals=1){
    return `${Number(value || 0).toFixed(decimals).replace('.', ',')}%`;
  }

  function formatMoneyInput(element){
    const digits = String(element.value || '').replace(/\D/g, '');
    element.value = digits ? parseInt(digits, 10).toLocaleString('pt-BR') : '';
  }

  function pricePayment(principal, monthlyRate, months){
    if(principal <= 0) return 0;
    if(monthlyRate <= 0) return principal / months;
    const factor = Math.pow(1 + monthlyRate, months);
    return principal * monthlyRate * factor / (factor - 1);
  }

  function priceBalance(principal, monthlyRate, months, paidMonths, payment){
    const k = Math.max(0, Math.min(months, paidMonths));
    if(k >= months || principal <= 0) return 0;
    if(monthlyRate <= 0) return Math.max(0, principal - payment * k);
    const factor = Math.pow(1 + monthlyRate, k);
    return Math.max(0, principal * factor - payment * ((factor - 1) / monthlyRate));
  }

  function showError(message){
    const el = $('patError');
    el.textContent = message;
    el.hidden = false;
  }

  function clearError(){
    $('patError').hidden = true;
  }

  function setPropertyType(type){
    state.propertyType = type;
    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.classList.toggle('active', button.dataset.propertyType === type);
    });
    $('patRentabilidadeAluguel').value = type === 'comercial' ? '0.70' : '0.50';
  }

  function readInput(){
    return {
      propertyValue: moneyFromText($('patValorImovel').value),
      credit: moneyFromText($('patCredito').value),
      ownCapital: moneyFromText($('patCapital').value),
      ownBid: moneyFromText($('patLance').value),
      rentalYield: number($('patRentabilidadeAluguel').value) / 100,
      investmentYield: number($('patRentabilidadeAplicacao').value) / 100,
      consortiumTerm: Math.round(number($('patPrazoConsorcio').value)),
      adminRate: number($('patTaxaAdmin').value) / 100,
      financingRate: number($('patTaxaFinanciamento').value) / 100,
      financingTerm: Math.round(number($('patPrazoFinanciamento').value)),
      contemplationMonth: Math.round(number($('patMesContemplacao').value)),
      analysisYears: number($('patPeriodoAnalise').value),
      appreciation: number($('patValorizacao').value) / 100,
      rentAdjustment: number($('patReajusteAluguel').value) / 100
    };
  }

  function validate(input){
    if(input.propertyValue <= 0) throw new Error('Informe o valor do imóvel.');
    if(input.credit <= 0) throw new Error('Informe o valor da carta.');
    if(input.ownCapital < 0 || input.ownBid < 0) throw new Error('Revise os valores de capital e lance.');
    if(input.ownBid > input.ownCapital) throw new Error('O lance não pode ser maior que o capital próprio disponível.');
    if(input.ownBid > input.credit) throw new Error('O lance não pode ser maior que o valor da carta neste protótipo.');
    if(input.consortiumTerm <= 0 || input.financingTerm <= 0) throw new Error('Revise os prazos informados.');
    if(input.analysisYears <= 0) throw new Error('Informe um período válido para a análise.');
    if(input.contemplationMonth <= 0 || input.contemplationMonth > input.consortiumTerm) throw new Error('Revise o mês estimado da contemplação.');
  }

  function calculate(){
    try{
      const input = readInput();
      validate(input);
      clearError();

      const purchaseComplement = Math.max(0, input.propertyValue - input.credit);
      const capitalUsed = input.ownBid + purchaseComplement;
      if(capitalUsed > input.ownCapital){
        throw new Error('O capital próprio não cobre o lance e a diferença necessária para comprar o imóvel.');
      }

      const preservedCapital = Math.max(0, input.ownCapital - capitalUsed);
      const monthlyInvestmentIncome = preservedCapital * input.investmentYield;
      const monthlyRent = input.propertyValue * input.rentalYield;
      const monthlyIncome = monthlyInvestmentIncome + monthlyRent;

      const totalConsortiumCost = input.credit * (1 + input.adminRate);
      const fullConsortiumPayment = totalConsortiumCost / input.consortiumTerm;
      const consortiumBalanceAfterBid = Math.max(0, totalConsortiumCost - input.ownBid);
      const equivalentConsortiumTerm = fullConsortiumPayment > 0
        ? Math.ceil(consortiumBalanceAfterBid / fullConsortiumPayment)
        : 0;
      const consortiumCashFlow = monthlyIncome - fullConsortiumPayment;
      const consortiumCoverage = fullConsortiumPayment > 0 ? monthlyIncome / fullConsortiumPayment * 100 : 0;

      const financingEntry = Math.min(input.propertyValue, capitalUsed);
      const financedAmount = Math.max(0, input.propertyValue - financingEntry);
      const financingPayment = pricePayment(financedAmount, input.financingRate, input.financingTerm);
      const financingCashFlow = monthlyIncome - financingPayment;
      const financingCoverage = financingPayment > 0 ? monthlyIncome / financingPayment * 100 : 0;
      const totalFinancingCost = financingEntry + financingPayment * input.financingTerm;
      const totalConsortiumEstimated = input.ownBid + consortiumBalanceAfterBid;

      const analysisMonths = Math.round(input.analysisYears * 12);
      const consortiumHoldingMonths = Math.max(0, analysisMonths - input.contemplationMonth + 1);
      const consortiumHoldingYears = consortiumHoldingMonths / 12;
      const propertyFutureConsortium = input.propertyValue * Math.pow(1 + input.appreciation, consortiumHoldingYears);
      const propertyFutureFinancing = input.propertyValue * Math.pow(1 + input.appreciation, input.analysisYears);
      const futureRentConsortium = monthlyRent * Math.pow(1 + input.rentAdjustment, consortiumHoldingYears);

      const consortiumBalanceAtEnd = Math.max(0, consortiumBalanceAfterBid - fullConsortiumPayment * analysisMonths);
      const financingBalanceAtEnd = priceBalance(
        financedAmount,
        input.financingRate,
        input.financingTerm,
        analysisMonths,
        financingPayment
      );

      const netWorthConsortium = propertyFutureConsortium + preservedCapital - consortiumBalanceAtEnd;
      const netWorthFinancing = propertyFutureFinancing + preservedCapital - financingBalanceAtEnd;
      const leverage = capitalUsed > 0 ? input.propertyValue / capitalUsed : 0;

      render({
        input, purchaseComplement, capitalUsed, preservedCapital, monthlyInvestmentIncome,
        monthlyRent, monthlyIncome, totalConsortiumCost, fullConsortiumPayment,
        consortiumBalanceAfterBid, equivalentConsortiumTerm, consortiumCashFlow,
        consortiumCoverage, financingEntry, financedAmount, financingPayment,
        financingCashFlow, financingCoverage, totalFinancingCost, totalConsortiumEstimated,
        propertyFutureConsortium, propertyFutureFinancing, futureRentConsortium,
        consortiumBalanceAtEnd, financingBalanceAtEnd, netWorthConsortium,
        netWorthFinancing, leverage
      });
    }catch(error){
      showError(error.message || 'Não foi possível calcular a comparação.');
    }
  }

  function setFlow(id, value){
    const el = $(id);
    el.textContent = `${value >= 0 ? '+' : '−'}${brl(Math.abs(value))}`;
    el.classList.toggle('positive', value >= 0);
    el.classList.toggle('negative', value < 0);
  }

  function render(result){
    $('patResultSection').hidden = false;
    $('patResLance').textContent = brl(result.input.ownBid);
    $('patResCapitalPreservado').textContent = brl(result.preservedCapital);
    $('patResAluguel').textContent = `${brl(result.monthlyRent)} / mês`;
    $('patResRendimento').textContent = `${brl(result.monthlyInvestmentIncome)} / mês`;
    $('patResPatrimonioAdquirido').textContent = brl(result.input.propertyValue);
    $('patResAlavancagem').textContent = result.leverage > 0
      ? `${result.leverage.toFixed(2).replace('.', ',')}x o capital usado na operação`
      : 'Carta integral para aquisição';

    $('patConsCredito').textContent = brl(result.input.credit);
    $('patConsParcela').textContent = brl(result.fullConsortiumPayment);
    $('patConsPrazo').textContent = `${result.equivalentConsortiumTerm} meses`;
    $('patConsReceita').textContent = brl(result.monthlyIncome);
    setFlow('patConsFluxo', result.consortiumCashFlow);
    $('patConsCoverageText').textContent = `${pct(result.consortiumCoverage)} da parcela coberta`;
    $('patConsCoverageBar').style.width = `${Math.min(100, result.consortiumCoverage)}%`;

    $('patFinEntrada').textContent = brl(result.financingEntry);
    $('patFinValor').textContent = brl(result.financedAmount);
    $('patFinParcela').textContent = brl(result.financingPayment);
    $('patFinReceita').textContent = brl(result.monthlyIncome);
    setFlow('patFinFluxo', result.financingCashFlow);
    $('patFinCoverageText').textContent = `${pct(result.financingCoverage)} da parcela coberta`;
    $('patFinCoverageBar').style.width = `${Math.min(100, result.financingCoverage)}%`;

    const installmentDifference = result.financingPayment - result.fullConsortiumPayment;
    $('patResDiferencaParcela').textContent = `${installmentDifference >= 0 ? 'Financiamento +' : 'Consórcio +'} ${brl(Math.abs(installmentDifference))} / mês`;
    const totalDifference = result.totalFinancingCost - result.totalConsortiumEstimated;
    $('patResDiferencaCusto').textContent = totalDifference >= 0
      ? `${brl(totalDifference)} a mais no financiamento`
      : `${brl(Math.abs(totalDifference))} a mais no consórcio`;

    $('patProjectionTitle').textContent = `Projeção em ${String(result.input.analysisYears).replace('.', ',')} anos`;
    $('patProjImovelCons').textContent = brl(result.propertyFutureConsortium);
    $('patProjImovelFin').textContent = brl(result.propertyFutureFinancing);
    $('patProjSaldoCons').textContent = brl(result.consortiumBalanceAtEnd);
    $('patProjSaldoFin').textContent = brl(result.financingBalanceAtEnd);
    $('patProjLiquidoCons').textContent = brl(result.netWorthConsortium);
    $('patProjLiquidoFin').textContent = brl(result.netWorthFinancing);

    setTimeout(() => $('patResultSection').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function bind(){
    ['patValorImovel','patCredito','patCapital','patLance'].forEach(id => {
      const el = $(id);
      el.addEventListener('input', () => formatMoneyInput(el));
      el.addEventListener('focus', event => event.target.select());
    });

    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.addEventListener('click', () => setPropertyType(button.dataset.propertyType));
    });

    $('patCalcularBtn').addEventListener('click', calculate);
  }

  function init(){
    if(!$('patCalcularBtn')) return;
    bind();
    setPropertyType('residencial');
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
