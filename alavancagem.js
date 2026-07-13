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

  function annualToMonthly(annualRate){
    return Math.pow(1 + annualRate, 1 / 12) - 1;
  }

  function pricePayment(principal, monthlyRate, months){
    if(principal <= 0 || months <= 0) return 0;
    if(monthlyRate <= 0) return principal / months;
    const factor = Math.pow(1 + monthlyRate, months);
    return principal * monthlyRate * factor / (factor - 1);
  }

  function adjustedRentTotal(baseRent, annualAdjustment, months){
    let total = 0;
    for(let month = 0; month < Math.max(0, months); month += 1){
      const year = Math.floor(month / 12);
      total += baseRent * Math.pow(1 + annualAdjustment, year);
    }
    return total;
  }

  function simulateCapitalBefore(initialCapital, monthlyYield, monthlyPayment, months){
    let capital = initialCapital;
    let externalContribution = 0;
    for(let month = 0; month < months; month += 1){
      const income = capital * monthlyYield;
      const available = capital + income;
      if(available >= monthlyPayment){
        capital = available - monthlyPayment;
      }else{
        externalContribution += monthlyPayment - available;
        capital = 0;
      }
    }
    return { capital, externalContribution };
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
      embeddedBidRate: number($('patLanceEmbutido').value) / 100,
      rentalYield: number($('patRentabilidadeAluguel').value) / 100,
      investmentYield: number($('patRentabilidadeAplicacao').value) / 100,
      consortiumTerm: Math.round(number($('patPrazoConsorcio').value)),
      adminRate: number($('patTaxaAdmin').value) / 100,
      reducedPaymentRate: number($('patParcelaReduzida').value) / 100,
      contemplationMonth: Math.round(number($('patMesContemplacao').value)),
      financingEntryRate: number($('patEntradaFinanciamento').value) / 100,
      financingAnnualRate: number($('patTaxaFinanciamento').value) / 100,
      financingTerm: Math.round(number($('patPrazoFinanciamento').value)),
      analysisYears: number($('patPeriodoAnalise').value),
      appreciation: number($('patValorizacao').value) / 100,
      rentAdjustment: number($('patReajusteAluguel').value) / 100
    };
  }

  function validate(input){
    if(input.propertyValue <= 0) throw new Error('Informe o valor do imóvel.');
    if(input.credit <= 0) throw new Error('Informe o valor da carta.');
    if(input.ownCapital < 0 || input.ownBid < 0) throw new Error('Revise os valores de capital e lance.');
    if(input.embeddedBidRate < 0 || input.embeddedBidRate >= 1) throw new Error('O lance embutido deve ficar abaixo de 100% da carta.');
    if(input.ownBid > input.ownCapital) throw new Error('O lance próprio não pode ser maior que o capital disponível no início.');
    if(input.consortiumTerm <= 0 || input.financingTerm <= 0) throw new Error('Revise os prazos informados.');
    if(input.reducedPaymentRate <= 0 || input.reducedPaymentRate > 1) throw new Error('Revise o percentual da parcela antes da contemplação.');
    if(input.financingEntryRate < 0 || input.financingEntryRate >= 1) throw new Error('A entrada do financiamento deve ficar abaixo de 100%.');
    if(input.analysisYears <= 0) throw new Error('Informe um período válido para o comparativo.');
    if(input.contemplationMonth <= 0 || input.contemplationMonth > input.consortiumTerm) throw new Error('Revise o mês estimado da contemplação.');
  }

  function setFlow(id, value){
    const el = $(id);
    el.textContent = `${value >= 0 ? '+' : '−'}${brl(Math.abs(value))}`;
    el.classList.toggle('positive', value >= 0);
    el.classList.toggle('negative', value < 0);
  }

  function calculate(){
    try{
      const input = readInput();
      validate(input);
      clearError();

      const embeddedBid = input.credit * input.embeddedBidRate;
      const netCredit = Math.max(0, input.credit - embeddedBid);
      const purchaseComplement = Math.max(0, input.propertyValue - netCredit);

      const totalConsortiumCost = input.credit * (1 + input.adminRate);
      const fullConsortiumPayment = totalConsortiumCost / input.consortiumTerm;
      const reducedConsortiumPayment = fullConsortiumPayment * input.reducedPaymentRate;
      const monthsBeforeContemplation = Math.max(0, input.contemplationMonth - 1);

      const capitalSimulation = simulateCapitalBefore(
        input.ownCapital,
        input.investmentYield,
        reducedConsortiumPayment,
        monthsBeforeContemplation
      );
      const capitalAtContemplation = capitalSimulation.capital;
      const capitalRequiredAtContemplation = input.ownBid + purchaseComplement;
      if(capitalRequiredAtContemplation > capitalAtContemplation){
        throw new Error(`No mês ${input.contemplationMonth}, o capital estimado não cobre o lance e o complemento do imóvel. Faltariam ${brl(capitalRequiredAtContemplation - capitalAtContemplation)}.`);
      }

      const capitalAfterPurchase = Math.max(0, capitalAtContemplation - capitalRequiredAtContemplation);
      const initialInvestmentIncome = input.ownCapital * input.investmentYield;
      const beforeCashFlow = initialInvestmentIncome - reducedConsortiumPayment;
      const beforeCoverage = reducedConsortiumPayment > 0 ? initialInvestmentIncome / reducedConsortiumPayment * 100 : 0;

      const monthlyRent = input.propertyValue * input.rentalYield;
      const remainingCapitalIncome = capitalAfterPurchase * input.investmentYield;
      const afterMonthlyIncome = monthlyRent + remainingCapitalIncome;
      const afterCashFlow = afterMonthlyIncome - fullConsortiumPayment;
      const afterCoverage = fullConsortiumPayment > 0 ? afterMonthlyIncome / fullConsortiumPayment * 100 : 0;

      const prePaymentsTotal = reducedConsortiumPayment * monthsBeforeContemplation;
      const consortiumBalanceAfterContemplation = Math.max(
        0,
        totalConsortiumCost - prePaymentsTotal - input.ownBid - embeddedBid
      );
      const postContemplationMonths = fullConsortiumPayment > 0
        ? Math.ceil(consortiumBalanceAfterContemplation / fullConsortiumPayment)
        : 0;
      const estimatedConsortiumTerm = monthsBeforeContemplation + postContemplationMonths;
      const totalConsortiumOperation = Math.max(0, totalConsortiumCost - embeddedBid + purchaseComplement);

      const financingEntry = input.propertyValue * input.financingEntryRate;
      if(financingEntry > input.ownCapital){
        throw new Error(`A entrada configurada no financiamento exige ${brl(financingEntry)}, acima do capital próprio disponível.`);
      }
      const financedAmount = Math.max(0, input.propertyValue - financingEntry);
      const financingMonthlyRate = annualToMonthly(input.financingAnnualRate);
      const financingPayment = pricePayment(financedAmount, financingMonthlyRate, input.financingTerm);
      const financingRemainingCapital = Math.max(0, input.ownCapital - financingEntry);
      const financingInvestmentIncome = financingRemainingCapital * input.investmentYield;
      const financingMonthlyIncome = monthlyRent + financingInvestmentIncome;
      const financingCashFlow = financingMonthlyIncome - financingPayment;
      const totalFinancingOperation = financingEntry + financingPayment * input.financingTerm;

      const analysisMonths = Math.round(input.analysisYears * 12);
      const consortiumRentMonths = Math.max(0, analysisMonths - input.contemplationMonth + 1);
      const consortiumAccumulatedRent = adjustedRentTotal(monthlyRent, input.rentAdjustment, consortiumRentMonths);
      const financingAccumulatedRent = adjustedRentTotal(monthlyRent, input.rentAdjustment, analysisMonths);

      render({
        input,
        embeddedBid,
        netCredit,
        purchaseComplement,
        capitalAtContemplation,
        capitalAfterPurchase,
        initialInvestmentIncome,
        reducedConsortiumPayment,
        beforeCashFlow,
        beforeCoverage,
        monthlyRent,
        remainingCapitalIncome,
        fullConsortiumPayment,
        afterCashFlow,
        afterCoverage,
        estimatedConsortiumTerm,
        totalConsortiumOperation,
        consortiumAccumulatedRent,
        financingEntry,
        financedAmount,
        financingPayment,
        financingCashFlow,
        totalFinancingOperation,
        financingAccumulatedRent
      });
    }catch(error){
      showError(error.message || 'Não foi possível calcular a estratégia.');
    }
  }

  function render(result){
    $('patResultSection').hidden = false;

    $('patResCapitalInicial').textContent = brl(result.input.ownCapital);
    $('patResCapitalContemplacao').textContent = brl(result.capitalAtContemplation);
    $('patResCreditoLiquido').textContent = brl(result.netCredit);
    $('patResCapitalRestante').textContent = brl(result.capitalAfterPurchase);
    $('patResLanceProprio').textContent = brl(result.input.ownBid);
    $('patResLanceEmbutido').textContent = brl(result.embeddedBid);
    $('patResComplemento').textContent = brl(result.purchaseComplement);

    $('patAntesRendimento').textContent = `${brl(result.initialInvestmentIncome)} / mês`;
    $('patAntesParcela').textContent = `${brl(result.reducedConsortiumPayment)} / mês`;
    setFlow('patAntesFluxo', result.beforeCashFlow);
    $('patAntesCoverageText').textContent = `${pct(result.beforeCoverage)} da parcela coberta pelo rendimento inicial`;
    $('patAntesCoverageBar').style.width = `${Math.min(100, result.beforeCoverage)}%`;

    $('patDepoisAluguel').textContent = `${brl(result.monthlyRent)} / mês`;
    $('patDepoisRendimento').textContent = `${brl(result.remainingCapitalIncome)} / mês`;
    $('patDepoisParcela').textContent = `${brl(result.fullConsortiumPayment)} / mês`;
    setFlow('patDepoisFluxo', result.afterCashFlow);
    $('patDepoisCoverageText').textContent = `${pct(result.afterCoverage)} da parcela coberta pelo aluguel e pelo capital restante`;
    $('patDepoisCoverageBar').style.width = `${Math.min(100, result.afterCoverage)}%`;

    $('patConsPrazoBadge').textContent = `${result.estimatedConsortiumTerm} meses estimados`;
    $('patConsParcela').textContent = brl(result.fullConsortiumPayment);
    $('patConsCredito').textContent = brl(result.netCredit);
    $('patConsTotal').textContent = brl(result.totalConsortiumOperation);
    $('patConsAluguelAcumulado').textContent = brl(result.consortiumAccumulatedRent);
    setFlow('patConsFluxo', result.afterCashFlow);

    $('patFinPrazoBadge').textContent = `${result.input.financingTerm} meses`;
    $('patFinEntrada').textContent = brl(result.financingEntry);
    $('patFinValor').textContent = brl(result.financedAmount);
    $('patFinParcela').textContent = brl(result.financingPayment);
    $('patFinTotal').textContent = brl(result.totalFinancingOperation);
    $('patFinAluguelAcumulado').textContent = brl(result.financingAccumulatedRent);
    setFlow('patFinFluxo', result.financingCashFlow);

    const totalDifference = result.totalFinancingOperation - result.totalConsortiumOperation;
    $('patResDiferencaCusto').textContent = totalDifference >= 0
      ? `${brl(totalDifference)} a mais no financiamento`
      : `${brl(Math.abs(totalDifference))} a mais no consórcio`;

    const termDifference = result.input.financingTerm - result.estimatedConsortiumTerm;
    $('patResDiferencaPrazo').textContent = termDifference >= 0
      ? `${termDifference} meses a mais no financiamento`
      : `${Math.abs(termDifference)} meses a mais no consórcio`;

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
