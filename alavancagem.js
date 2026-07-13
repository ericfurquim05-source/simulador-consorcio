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

  function futureValue(value, annualRate, months){
    return value * Math.pow(1 + annualRate, months / 12);
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
      consortiumAdjustment: number($('patReajusteConsorcio').value) / 100,
      reducedPaymentRate: number($('patParcelaReduzida').value) / 100,
      contemplationMonth: Math.round(number($('patMesContemplacao').value)),
      financingEntryRate: number($('patEntradaFinanciamento').value) / 100,
      financingAnnualRate: number($('patTaxaFinanciamento').value) / 100,
      financingTerm: Math.round(number($('patPrazoFinanciamento').value)),
      appreciation: number($('patValorizacao').value) / 100,
      rentAdjustment: number($('patReajusteAluguel').value) / 100
    };
  }

  function validate(input){
    if(input.propertyValue <= 0) throw new Error('Informe o valor do imóvel.');
    if(input.credit <= 0) throw new Error('Informe o valor da carta.');
    if(input.ownCapital < 0 || input.ownBid < 0) throw new Error('Revise os valores de capital e lance.');
    if(input.embeddedBidRate < 0 || input.embeddedBidRate >= 1) throw new Error('O lance embutido deve ficar abaixo de 100% da carta.');
    if(input.consortiumTerm <= 0 || input.financingTerm <= 0) throw new Error('Revise os prazos informados.');
    if(input.reducedPaymentRate <= 0 || input.reducedPaymentRate > 1) throw new Error('Revise o percentual da parcela antes da contemplação.');
    if(input.financingEntryRate < 0 || input.financingEntryRate >= 1) throw new Error('A entrada do financiamento deve ficar abaixo de 100%.');
    if(input.contemplationMonth <= 0 || input.contemplationMonth > input.consortiumTerm) throw new Error('Revise o mês estimado da contemplação.');
  }

  function simulateCapitalUntilContemplation(input, initialFullPayment){
    let capital = input.ownCapital;
    let currentFullPayment = initialFullPayment;

    for(let month = 1; month < input.contemplationMonth; month += 1){
      if(month > 1 && (month - 1) % 12 === 0){
        currentFullPayment *= 1 + input.consortiumAdjustment;
      }
      const income = capital * input.investmentYield;
      const reducedPayment = currentFullPayment * input.reducedPaymentRate;
      capital = Math.max(0, capital + income - reducedPayment);
    }
    return capital;
  }

  function simulateConsortium(input){
    let balance = input.credit * (1 + input.adminRate);
    let currentFullPayment = balance / input.consortiumTerm;
    const initialFullPayment = currentFullPayment;
    const initialReducedPayment = initialFullPayment * input.reducedPaymentRate;
    const capitalAtContemplation = simulateCapitalUntilContemplation(input, initialFullPayment);

    const completedYears = Math.floor((input.contemplationMonth - 1) / 12);
    const adjustedCredit = input.credit * Math.pow(1 + input.consortiumAdjustment, completedYears);
    const embeddedBidRequested = adjustedCredit * input.embeddedBidRate;
    const propertyAtContemplation = futureValue(input.propertyValue, input.appreciation, input.contemplationMonth - 1);
    const netCredit = Math.max(0, adjustedCredit - embeddedBidRequested);
    const purchaseComplement = Math.max(0, propertyAtContemplation - netCredit);

    let totalInstallmentsPaid = 0;
    let ownBidUsed = 0;
    let embeddedBidUsed = 0;
    let paymentAtContemplation = initialFullPayment;

    for(let month = 1; month <= input.consortiumTerm; month += 1){
      if(month > 1 && (month - 1) % 12 === 0){
        balance *= 1 + input.consortiumAdjustment;
        currentFullPayment *= 1 + input.consortiumAdjustment;
      }

      if(month < input.contemplationMonth){
        const payment = Math.min(balance, currentFullPayment * input.reducedPaymentRate);
        totalInstallmentsPaid += payment;
        balance = Math.max(0, balance - payment);
        continue;
      }

      if(month === input.contemplationMonth){
        ownBidUsed = Math.min(input.ownBid, balance);
        balance = Math.max(0, balance - ownBidUsed);
        embeddedBidUsed = Math.min(embeddedBidRequested, balance);
        balance = Math.max(0, balance - embeddedBidUsed);

        const remainingMonths = input.consortiumTerm - month + 1;
        currentFullPayment = remainingMonths > 0 ? balance / remainingMonths : 0;
        paymentAtContemplation = currentFullPayment;
      }

      const payment = Math.min(balance, currentFullPayment);
      totalInstallmentsPaid += payment;
      balance = Math.max(0, balance - payment);
    }

    const totalPaid = totalInstallmentsPaid + ownBidUsed + purchaseComplement;
    const capitalRequired = ownBidUsed + purchaseComplement;
    const capitalGap = Math.max(0, capitalRequired - capitalAtContemplation);
    const capitalRemaining = Math.max(0, capitalAtContemplation - capitalRequired);
    const initialInvestmentIncome = input.ownCapital * input.investmentYield;
    const rentAtContemplation = input.propertyValue * input.rentalYield * Math.pow(1 + input.rentAdjustment, completedYears);
    const propertyValueAtEnd = futureValue(input.propertyValue, input.appreciation, input.consortiumTerm);

    return {
      adjustedCredit,
      embeddedBid: embeddedBidUsed,
      netCredit,
      propertyAtContemplation,
      purchaseComplement,
      ownBid: ownBidUsed,
      capitalAtContemplation,
      capitalRequired,
      capitalGap,
      capitalRemaining,
      initialInvestmentIncome,
      initialReducedPayment,
      initialFullPayment,
      paymentAtContemplation,
      rentAtContemplation,
      totalPaid,
      propertyValueAtEnd
    };
  }

  function simulateFinancing(input){
    const entry = input.propertyValue * input.financingEntryRate;
    const financedAmount = Math.max(0, input.propertyValue - entry);
    const monthlyRate = annualToMonthly(input.financingAnnualRate);
    const payment = pricePayment(financedAmount, monthlyRate, input.financingTerm);
    const monthlyRent = input.propertyValue * input.rentalYield;
    const totalPaid = entry + payment * input.financingTerm;
    const propertyValueAtEnd = futureValue(input.propertyValue, input.appreciation, input.financingTerm);

    return { entry, financedAmount, payment, monthlyRent, totalPaid, propertyValueAtEnd };
  }

  function setMonthlyResult(labelId, valueId, income, payment){
    const label = $(labelId);
    const value = $(valueId);
    const difference = income - payment;

    if(difference >= 0){
      label.textContent = 'Sobra mensal após pagar a parcela';
      value.textContent = brl(difference);
      value.classList.add('positive');
      value.classList.remove('negative');
    }else{
      label.textContent = 'Complemento mensal do bolso';
      value.textContent = brl(Math.abs(difference));
      value.classList.add('negative');
      value.classList.remove('positive');
    }
    return Math.max(0, payment - income);
  }

  function render(input, consortium, financing){
    $('patResultSection').hidden = false;

    $('patResCartaContemplacao').textContent = brl(consortium.adjustedCredit);
    $('patResCreditoLiquido').textContent = brl(consortium.netCredit);
    $('patResCapitalContemplacao').textContent = brl(consortium.capitalAtContemplation);
    $('patResCapitalNecessario').textContent = brl(consortium.capitalRequired);
    $('patResLanceProprio').textContent = brl(consortium.ownBid);
    $('patResLanceEmbutido').textContent = brl(consortium.embeddedBid);
    $('patResComplemento').textContent = brl(consortium.purchaseComplement);

    $('patAntesRendimento').textContent = `${brl(consortium.initialInvestmentIncome)} / mês`;
    $('patAntesParcela').textContent = `${brl(consortium.initialReducedPayment)} / mês`;
    setMonthlyResult('patAntesSaldoLabel', 'patAntesSaldo', consortium.initialInvestmentIncome, consortium.initialReducedPayment);

    const alert = $('patCapitalAlert');
    if(consortium.capitalGap > 0){
      alert.textContent = `No mês estimado da contemplação, ainda faltariam ${brl(consortium.capitalGap)} para cobrir o lance próprio e o complemento do imóvel.`;
      alert.hidden = false;
    }else{
      alert.textContent = `Depois do lance e do complemento do imóvel, restariam aproximadamente ${brl(consortium.capitalRemaining)} do capital projetado.`;
      alert.hidden = false;
    }

    $('patConsPrazoBadge').textContent = `${input.consortiumTerm} meses`;
    $('patConsParcelaInicial').textContent = brl(consortium.initialFullPayment);
    $('patConsParcela').textContent = brl(consortium.paymentAtContemplation);
    $('patConsAluguel').textContent = brl(consortium.rentAtContemplation);
    const consortiumPocket = setMonthlyResult('patConsSaldoLabel', 'patConsSaldo', consortium.rentAtContemplation, consortium.paymentAtContemplation);
    $('patConsTotal').textContent = brl(consortium.totalPaid);
    $('patConsImovelFinal').textContent = brl(consortium.propertyValueAtEnd);

    $('patFinPrazoBadge').textContent = `${input.financingTerm} meses`;
    $('patFinEntrada').textContent = brl(financing.entry);
    $('patFinValor').textContent = brl(financing.financedAmount);
    $('patFinParcela').textContent = brl(financing.payment);
    $('patFinAluguel').textContent = brl(financing.monthlyRent);
    const financingPocket = setMonthlyResult('patFinSaldoLabel', 'patFinSaldo', financing.monthlyRent, financing.payment);
    $('patFinTotal').textContent = brl(financing.totalPaid);
    $('patFinImovelFinal').textContent = brl(financing.propertyValueAtEnd);

    const totalDifference = financing.totalPaid - consortium.totalPaid;
    $('patResDiferencaCusto').textContent = totalDifference >= 0
      ? `${brl(totalDifference)} a mais no financiamento`
      : `${brl(Math.abs(totalDifference))} a mais no consórcio`;

    const monthlyDifference = financingPocket - consortiumPocket;
    $('patResDiferencaMensal').textContent = monthlyDifference >= 0
      ? `${brl(monthlyDifference)} a menos do bolso no consórcio`
      : `${brl(Math.abs(monthlyDifference))} a menos do bolso no financiamento`;

    setTimeout(() => $('patResultSection').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function calculate(){
    try{
      const input = readInput();
      validate(input);
      clearError();
      const consortium = simulateConsortium(input);
      const financing = simulateFinancing(input);
      render(input, consortium, financing);
    }catch(error){
      showError(error.message || 'Não foi possível calcular o comparativo.');
    }
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
