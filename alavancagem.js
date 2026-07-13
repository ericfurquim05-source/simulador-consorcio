(function(global){
  'use strict';

  const get = id => document.getElementById(id);
  const state = { propertyType: 'residencial' };

  function valueOf(id, fallback = ''){
    const element = get(id);
    return element && 'value' in element ? element.value : fallback;
  }

  function setText(id, text){
    const element = get(id);
    if(element) element.textContent = text;
    return element;
  }

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
    if(!element) return;
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
    const element = get('patError');
    if(!element) return;
    element.textContent = message;
    element.hidden = false;
  }

  function clearError(){
    const element = get('patError');
    if(element) element.hidden = true;
  }

  function setPropertyType(type){
    state.propertyType = type;
    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.classList.toggle('active', button.dataset.propertyType === type);
    });
    const yieldInput = get('patRentabilidadeAluguel');
    if(yieldInput) yieldInput.value = type === 'comercial' ? '0.70' : '0.50';
  }

  function readInput(){
    return {
      propertyValue: moneyFromText(valueOf('patValorImovel')),
      credit: moneyFromText(valueOf('patCredito')),
      ownCapital: moneyFromText(valueOf('patCapital')),
      ownBid: moneyFromText(valueOf('patLance')),
      embeddedBidRate: number(valueOf('patLanceEmbutido', '0')) / 100,
      rentalYield: number(valueOf('patRentabilidadeAluguel', '0.50')) / 100,
      investmentYield: number(valueOf('patRentabilidadeAplicacao', '1')) / 100,
      consortiumTerm: Math.round(number(valueOf('patPrazoConsorcio', '220'))),
      adminRate: number(valueOf('patTaxaAdmin', '24.2')) / 100,
      consortiumAdjustment: number(valueOf('patReajusteConsorcio', '5')) / 100,
      reducedPaymentRate: number(valueOf('patParcelaReduzida', '50')) / 100,
      contemplationMonth: Math.round(number(valueOf('patMesContemplacao', '24'))),
      financingEntryRate: number(valueOf('patEntradaFinanciamento', '20')) / 100,
      financingAnnualRate: number(valueOf('patTaxaFinanciamento', '12')) / 100,
      financingTerm: Math.round(number(valueOf('patPrazoFinanciamento', '360'))),
      appreciation: number(valueOf('patValorizacao', '5')) / 100,
      rentAdjustment: number(valueOf('patReajusteAluguel', '5')) / 100
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
    const label = get(labelId);
    const value = get(valueId);
    const difference = income - payment;

    if(label && value){
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
    }
    return Math.max(0, payment - income);
  }

  function render(input, consortium, financing){
    const resultSection = get('patResultSection');
    if(resultSection) resultSection.hidden = false;

    setText('patResCartaContemplacao', brl(consortium.adjustedCredit));
    setText('patResCreditoLiquido', brl(consortium.netCredit));
    setText('patResCapitalContemplacao', brl(consortium.capitalAtContemplation));
    setText('patResCapitalNecessario', brl(consortium.capitalRequired));
    setText('patResLanceProprio', brl(consortium.ownBid));
    setText('patResLanceEmbutido', brl(consortium.embeddedBid));
    setText('patResComplemento', brl(consortium.purchaseComplement));

    setText('patAntesRendimento', `${brl(consortium.initialInvestmentIncome)} / mês`);
    setText('patAntesParcela', `${brl(consortium.initialReducedPayment)} / mês`);
    setMonthlyResult('patAntesSaldoLabel', 'patAntesSaldo', consortium.initialInvestmentIncome, consortium.initialReducedPayment);

    const alert = get('patCapitalAlert');
    if(alert){
      alert.textContent = consortium.capitalGap > 0
        ? `No mês estimado da contemplação, ainda faltariam ${brl(consortium.capitalGap)} para cobrir o lance próprio e o complemento do imóvel.`
        : `Depois do lance e do complemento do imóvel, restariam aproximadamente ${brl(consortium.capitalRemaining)} do capital projetado.`;
      alert.hidden = false;
    }

    setText('patConsPrazoBadge', `${input.consortiumTerm} meses`);
    setText('patConsParcelaInicial', brl(consortium.initialFullPayment));
    setText('patConsParcela', brl(consortium.paymentAtContemplation));
    setText('patConsAluguel', brl(consortium.rentAtContemplation));
    const consortiumPocket = setMonthlyResult('patConsSaldoLabel', 'patConsSaldo', consortium.rentAtContemplation, consortium.paymentAtContemplation);
    setText('patConsTotal', brl(consortium.totalPaid));
    setText('patConsImovelFinal', brl(consortium.propertyValueAtEnd));

    setText('patFinPrazoBadge', `${input.financingTerm} meses`);
    setText('patFinEntrada', brl(financing.entry));
    setText('patFinValor', brl(financing.financedAmount));
    setText('patFinParcela', brl(financing.payment));
    setText('patFinAluguel', brl(financing.monthlyRent));
    const financingPocket = setMonthlyResult('patFinSaldoLabel', 'patFinSaldo', financing.monthlyRent, financing.payment);
    setText('patFinTotal', brl(financing.totalPaid));
    setText('patFinImovelFinal', brl(financing.propertyValueAtEnd));

    const totalDifference = financing.totalPaid - consortium.totalPaid;
    setText(
      'patResDiferencaCusto',
      totalDifference >= 0
        ? `${brl(totalDifference)} a mais no financiamento`
        : `${brl(Math.abs(totalDifference))} a mais no consórcio`
    );

    const monthlyDifference = financingPocket - consortiumPocket;
    setText(
      'patResDiferencaMensal',
      monthlyDifference >= 0
        ? `${brl(monthlyDifference)} a menos do bolso no consórcio`
        : `${brl(Math.abs(monthlyDifference))} a menos do bolso no financiamento`
    );

    if(resultSection){
      setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
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
      console.error('Erro no comparativo patrimonial:', error);
      showError(error.message || 'Não foi possível calcular o comparativo.');
    }
  }

  function bind(){
    ['patValorImovel','patCredito','patCapital','patLance'].forEach(id => {
      const element = get(id);
      if(!element) return;
      element.addEventListener('input', () => formatMoneyInput(element));
      element.addEventListener('focus', event => event.target.select());
    });

    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.addEventListener('click', () => setPropertyType(button.dataset.propertyType));
    });

    const calculateButton = get('patCalcularBtn');
    if(calculateButton) calculateButton.addEventListener('click', calculate);
  }

  function init(){
    if(!get('patCalcularBtn')) return;
    bind();
    setPropertyType(state.propertyType);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
