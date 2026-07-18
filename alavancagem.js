(function(global){
  'use strict';

  const get = id => document.getElementById(id);
  const state = { propertyType: 'residencial', bidMode: 'sem' };

  const BID_LABELS = {
    sem: 'Sem lance',
    fixo: 'Lance fixo',
    limitado: 'Lance limitado',
    livre: 'Lance livre'
  };

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

  function toggleFinancingRateType(type){
    const normalized = type === 'tr' ? 'tr' : 'prefixada';
    const field = get('patTRFinanciamentoField');
    const input = get('patTRFinanciamento');
    if(field) field.hidden = normalized !== 'tr';
    if(input) input.disabled = normalized !== 'tr';
  }

  function bidPreviewFromForm(){
    const mode = String(valueOf('patModalidadeLance', 'sem')).toLowerCase();
    const credit = moneyFromText(valueOf('patCredito'));
    const term = Math.max(1, Math.round(number(valueOf('patPrazoConsorcio', '220'))));
    const adminRate = number(valueOf('patTaxaAdmin', '24.2')) / 100;
    const annualAdjustment = number(valueOf('patReajusteConsorcio', '5.5')) / 100;
    const contemplationMonth = Math.max(1, Math.round(number(valueOf('patMesContemplacao', '24'))));
    const completedYears = Math.floor((contemplationMonth - 1) / 12);
    const adjustedCredit = credit * Math.pow(1 + annualAdjustment, completedYears);
    const linearInstallment = term > 0 ? adjustedCredit * (1 + adminRate) / term : 0;
    let installments = 0;
    let embeddedShare = 0;
    if(mode === 'fixo'){
      installments = 44;
      embeddedShare = 1;
    }else if(mode === 'limitado' || mode === 'livre'){
      installments = Math.max(0, Math.round(number(valueOf('patParcelasLance', '0'))));
      embeddedShare = Math.min(0.5, Math.max(0, number(valueOf('patPercentualEmbutidoLance', '0')) / 100));
    }
    const totalBid = linearInstallment * installments;
    return { totalBid, ownBid: Math.max(0, totalBid * (1 - embeddedShare)) };
  }

  function updateOwnResourcePreview(){
    const field = get('patRecursoProprioPrevistoField');
    const output = get('patRecursoProprioPrevisto');
    const mode = String(valueOf('patModalidadeLance', 'sem')).toLowerCase();
    if(field) field.hidden = mode === 'sem';
    if(output) output.textContent = brl(bidPreviewFromForm().ownBid);
  }

  function updateBidControls(mode){
    state.bidMode = BID_LABELS[mode] ? mode : 'sem';

    const modeSelect = get('patModalidadeLance');
    const installmentsField = get('patParcelasLanceField');
    const embeddedField = get('patEmbutidoLanceField');
    const installmentsInput = get('patParcelasLance');
    const embeddedInput = get('patPercentualEmbutidoLance');
    const ruleText = get('patLanceRegraTexto');
    const term = Math.max(1, Math.round(number(valueOf('patPrazoConsorcio', '220'))));

    if(modeSelect) modeSelect.value = state.bidMode;

    if(state.bidMode === 'sem'){
      if(installmentsField) installmentsField.hidden = true;
      if(embeddedField) embeddedField.hidden = true;
      if(installmentsInput){ installmentsInput.value = '0'; installmentsInput.disabled = true; }
      if(embeddedInput){ embeddedInput.value = '0'; embeddedInput.disabled = true; }
      if(ruleText) ruleText.textContent = 'A contemplação é simulada sem oferta de lance.';
      updateOwnResourcePreview();
      return;
    }

    if(installmentsField) installmentsField.hidden = false;
    if(embeddedField) embeddedField.hidden = false;

    if(state.bidMode === 'fixo'){
      if(installmentsInput){
        installmentsInput.value = '44';
        installmentsInput.min = '44';
        installmentsInput.max = '44';
        installmentsInput.disabled = true;
      }
      if(embeddedInput){
        embeddedInput.value = '100';
        embeddedInput.min = '100';
        embeddedInput.max = '100';
        embeddedInput.disabled = true;
      }
      if(ruleText) ruleText.textContent = 'Oferta fixa de 44 parcelas. Nesta regra, o lance pode ser integralmente embutido.';
      updateOwnResourcePreview();
      return;
    }

    if(installmentsInput){
      installmentsInput.disabled = false;
      installmentsInput.min = '1';
      installmentsInput.max = state.bidMode === 'limitado' ? '88' : String(term);
      const current = Math.round(number(installmentsInput.value));
      const maximum = state.bidMode === 'limitado' ? 88 : term;
      if(current < 1 || current > maximum) installmentsInput.value = state.bidMode === 'limitado' ? '88' : String(Math.min(88, term));
    }

    if(embeddedInput){
      embeddedInput.disabled = false;
      embeddedInput.min = '0';
      embeddedInput.max = '50';
      const current = number(embeddedInput.value);
      if(current < 0 || current > 50) embeddedInput.value = '50';
      if(current === 100 || current === 0) embeddedInput.value = '50';
    }

    if(ruleText){
      ruleText.textContent = state.bidMode === 'limitado'
        ? 'De 1 a 88 parcelas. Até 50% do lance ofertado pode ser embutido; o restante usa recursos próprios.'
        : 'Quantidade de parcelas editável. Até 50% do lance ofertado pode ser embutido; o restante usa recursos próprios.';
    }
    updateOwnResourcePreview();
  }

  function readInput(){
    return {
      propertyValue: moneyFromText(valueOf('patValorImovel')),
      credit: moneyFromText(valueOf('patCredito')),
      bidMode: String(valueOf('patModalidadeLance', 'sem')).toLowerCase(),
      bidInstallments: Math.round(number(valueOf('patParcelasLance', '0'))),
      embeddedBidShare: number(valueOf('patPercentualEmbutidoLance', '0')) / 100,
      rentalYield: number(valueOf('patRentabilidadeAluguel', '0.50')) / 100,
      investmentYield: number(valueOf('patRentabilidadeAplicacao', '1')) / 100,
      consortiumTerm: Math.round(number(valueOf('patPrazoConsorcio', '220'))),
      adminRate: number(valueOf('patTaxaAdmin', '24.2')) / 100,
      consortiumAdjustment: number(valueOf('patReajusteConsorcio', '5.5')) / 100,
      reducedPaymentRate: number(valueOf('patParcelaReduzida', '50')) / 100,
      contemplationMonth: Math.round(number(valueOf('patMesContemplacao', '24'))),
      financingEntryRate: number(valueOf('patEntradaFinanciamento', '20')) / 100,
      financingSystem: String(valueOf('patSistemaFinanciamento', 'price')).toLowerCase(),
      financingRateType: String(valueOf('patIndexadorFinanciamento', 'prefixada')).toLowerCase(),
      financingAnnualRate: number(valueOf('patTaxaFinanciamento', '11.50')) / 100,
      financingTRMonthly: String(valueOf('patIndexadorFinanciamento', 'prefixada')).toLowerCase() === 'tr'
        ? number(valueOf('patTRFinanciamento', '0.17')) / 100
        : 0,
      financingTerm: Math.round(number(valueOf('patPrazoFinanciamento', '360'))),
      financingMonthlyCosts: moneyFromText(valueOf('patCustosFinanciamento', '0')),
      appreciation: number(valueOf('patValorizacao', '5')) / 100,
      rentAdjustment: number(valueOf('patReajusteAluguel', '5')) / 100
    };
  }

  function normalizeBid(input){
    const mode = BID_LABELS[input.bidMode] ? input.bidMode : 'sem';
    if(mode === 'sem') return { mode, label: BID_LABELS[mode], installments: 0, embeddedShare: 0 };
    if(mode === 'fixo') return { mode, label: BID_LABELS[mode], installments: 44, embeddedShare: 1 };
    return {
      mode,
      label: BID_LABELS[mode],
      installments: input.bidInstallments,
      embeddedShare: input.embeddedBidShare
    };
  }

  function validate(input){
    if(input.propertyValue <= 0) throw new Error('Informe o valor do imóvel.');
    if(input.credit <= 0) throw new Error('Informe o valor da carta.');
    if(input.consortiumTerm <= 0 || input.financingTerm <= 0) throw new Error('Revise os prazos informados.');
    if(input.reducedPaymentRate <= 0 || input.reducedPaymentRate > 1) throw new Error('Revise o percentual da parcela antes da contemplação.');
    if(input.financingEntryRate < 0 || input.financingEntryRate >= 1) throw new Error('A entrada do financiamento deve ficar abaixo de 100%.');
    if(!['sac','price'].includes(input.financingSystem)) throw new Error('Revise o sistema de amortização do financiamento.');
    if(!['prefixada','tr'].includes(input.financingRateType)) throw new Error('Revise a modalidade da taxa do financiamento.');
    if(input.financingAnnualRate < 0 || input.financingTRMonthly < 0 || input.financingMonthlyCosts < 0) throw new Error('Revise as taxas e custos do financiamento.');
    if(input.contemplationMonth <= 0 || input.contemplationMonth > input.consortiumTerm) throw new Error('Revise o mês estimado da contemplação.');

    const bid = normalizeBid(input);
    if(bid.mode === 'fixo' && input.consortiumTerm < 44) throw new Error('O prazo original do grupo deve permitir a oferta de 44 parcelas.');
    if(bid.mode === 'limitado' && (bid.installments < 1 || bid.installments > 88)) throw new Error('No lance limitado, informe de 1 a 88 parcelas.');
    if(bid.mode === 'livre' && (bid.installments < 1 || bid.installments > input.consortiumTerm)) throw new Error('No lance livre, informe uma quantidade válida de parcelas.');
    if(['limitado','livre'].includes(bid.mode) && (bid.embeddedShare < 0 || bid.embeddedShare > 0.5)) throw new Error('No lance limitado ou livre, a parte embutida pode representar no máximo 50% do lance ofertado.');
  }

  function simulateCapitalUntilContemplation(input, initialFullPayment, initialCapital){
    let capital = Math.max(0, initialCapital);
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
    const bid = normalizeBid(input);
    let balance = input.credit * (1 + input.adminRate);
    let currentFullPayment = balance / input.consortiumTerm;
    const initialFullPayment = currentFullPayment;
    const initialReducedPayment = initialFullPayment * input.reducedPaymentRate;

    const completedYears = Math.floor((input.contemplationMonth - 1) / 12);
    const adjustedCredit = input.credit * Math.pow(1 + input.consortiumAdjustment, completedYears);
    const linearBidInstallment = adjustedCredit * (1 + input.adminRate) / input.consortiumTerm;
    const requestedTotalBid = linearBidInstallment * bid.installments;
    const capitalInitiallyReserved = Math.max(0, requestedTotalBid * (1 - bid.embeddedShare));
    const capitalAtContemplation = simulateCapitalUntilContemplation(input, initialFullPayment, capitalInitiallyReserved);
    const propertyAtContemplation = futureValue(input.propertyValue, input.appreciation, input.contemplationMonth - 1);

    let totalInstallmentsPaid = 0;
    let totalBidUsed = 0;
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
        totalBidUsed = Math.min(requestedTotalBid, balance);
        const maxEmbeddedByRule = totalBidUsed * bid.embeddedShare;
        const maxEmbeddedByCredit = bid.mode === 'fixo' ? adjustedCredit : adjustedCredit * 0.5;
        embeddedBidUsed = Math.min(maxEmbeddedByRule, maxEmbeddedByCredit, adjustedCredit);
        ownBidUsed = Math.max(0, totalBidUsed - embeddedBidUsed);
        balance = Math.max(0, balance - totalBidUsed);

        const remainingMonths = input.consortiumTerm - month + 1;
        currentFullPayment = remainingMonths > 0 ? balance / remainingMonths : 0;
        paymentAtContemplation = currentFullPayment;
      }

      const payment = Math.min(balance, currentFullPayment);
      totalInstallmentsPaid += payment;
      balance = Math.max(0, balance - payment);
    }

    const netCredit = Math.max(0, adjustedCredit - embeddedBidUsed);
    const purchaseComplement = Math.max(0, propertyAtContemplation - netCredit);
    const totalPaid = totalInstallmentsPaid + ownBidUsed + purchaseComplement;
    const capitalRequired = ownBidUsed + purchaseComplement;
    const capitalGap = Math.max(0, capitalRequired - capitalAtContemplation);
    const capitalRemaining = Math.max(0, capitalAtContemplation - capitalRequired);
    const initialInvestmentIncome = capitalInitiallyReserved * input.investmentYield;
    const rentAtContemplation = input.propertyValue * input.rentalYield * Math.pow(1 + input.rentAdjustment, completedYears);
    const propertyValueAtEnd = futureValue(input.propertyValue, input.appreciation, input.consortiumTerm);

    return {
      bidMode: bid.mode,
      bidLabel: bid.label,
      bidInstallments: bid.installments,
      linearBidInstallment,
      totalBid: totalBidUsed,
      adjustedCredit,
      embeddedBid: embeddedBidUsed,
      netCredit,
      propertyAtContemplation,
      purchaseComplement,
      ownBid: ownBidUsed,
      capitalInitiallyReserved,
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
    const interestMonthly = annualToMonthly(input.financingAnnualRate);
    const monthlyRent = input.propertyValue * input.rentalYield;
    const monthlyCosts = input.financingMonthlyCosts;

    let balance = financedAmount;
    let initialPayment = 0;
    let finalPayment = 0;
    let totalInstallments = 0;

    for(let month = 1; month <= input.financingTerm; month += 1){
      const remainingMonths = input.financingTerm - month + 1;
      balance *= 1 + input.financingTRMonthly;

      let amortization = 0;
      let basePayment = 0;

      if(input.financingSystem === 'sac'){
        amortization = remainingMonths > 0 ? balance / remainingMonths : balance;
        const interest = balance * interestMonthly;
        basePayment = amortization + interest;
      }else{
        basePayment = pricePayment(balance, interestMonthly, remainingMonths);
        const interest = balance * interestMonthly;
        amortization = Math.max(0, basePayment - interest);
      }

      const payment = basePayment + monthlyCosts;
      if(month === 1) initialPayment = payment;
      finalPayment = payment;
      totalInstallments += payment;
      balance = Math.max(0, balance - amortization);
    }

    const totalPaid = entry + totalInstallments;
    const propertyValueAtEnd = futureValue(input.propertyValue, input.appreciation, input.financingTerm);

    return {
      entry,
      financedAmount,
      payment: initialPayment,
      finalPayment,
      monthlyRent,
      totalPaid,
      propertyValueAtEnd,
      interestMonthly,
      monthlyCosts,
      system: input.financingSystem
    };
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
        label.textContent = 'Valor mensal que ainda sai do bolso';
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

    setText('patResModalidadeLance', consortium.bidLabel);
    setText('patResParcelasLance', consortium.bidInstallments > 0 ? `${consortium.bidInstallments} parcelas` : 'Não se aplica');
    setText('patResParcelaLinearLance', consortium.bidInstallments > 0 ? brl(consortium.linearBidInstallment) : 'Não se aplica');
    setText('patResLanceTotal', brl(consortium.totalBid));
    setText('patResCartaContemplacao', brl(consortium.adjustedCredit));
    setText('patResCreditoLiquido', brl(consortium.netCredit));
    setText('patResCapitalContemplacao', brl(consortium.capitalAtContemplation));
    setText('patResLanceProprio', brl(consortium.ownBid));
    setText('patResLanceEmbutido', brl(consortium.embeddedBid));
    setText('patResComplemento', brl(consortium.purchaseComplement));

    setText('patAntesRendimento', `${brl(consortium.initialInvestmentIncome)} / mês`);
    setText('patAntesParcela', `${brl(consortium.initialReducedPayment)} / mês`);
    setMonthlyResult('patAntesSaldoLabel', 'patAntesSaldo', consortium.initialInvestmentIncome, consortium.initialReducedPayment);

    const alert = get('patCapitalAlert');
    if(alert){
      alert.textContent = consortium.capitalGap > 0
        ? `No mês estimado da contemplação, ainda faltariam ${brl(consortium.capitalGap)} para cobrir a parte própria do lance e o complemento do imóvel.`
        : `Depois da parte própria do lance e do complemento do imóvel, restariam aproximadamente ${brl(consortium.capitalRemaining)} do capital projetado.`;
      alert.hidden = false;
    }

    setText('patConsPrazoBadge', `${input.consortiumTerm} meses`);
    setText('patConsParcelaInicial', brl(consortium.initialFullPayment));
    setText('patConsParcela', brl(consortium.paymentAtContemplation));
    setText('patConsAluguel', brl(consortium.rentAtContemplation));
    setMonthlyResult('patConsSaldoLabel', 'patConsSaldo', consortium.rentAtContemplation, consortium.paymentAtContemplation);
    setText('patConsTotal', brl(consortium.totalPaid));
    setText('patConsImovelFinal', brl(consortium.propertyValueAtEnd));

    setText('patFinPrazoBadge', `${input.financingTerm} meses`);
    setText('patFinPrazoDetalhe', `${input.financingTerm} meses`);
    setText('patFinTaxaDetalhe', `${(input.financingAnnualRate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`);
    setText('patFinIndexadorDetalhe', input.financingRateType === 'tr' ? 'Taxa + TR' : 'Prefixada');
    setText('patFinTRDetalhe', input.financingRateType === 'tr'
      ? `${(input.financingTRMonthly * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m.`
      : 'Não se aplica');
    setText('patFinSistemaDetalhe', input.financingSystem === 'sac' ? 'SAC' : 'Price');
    setText('patFinCustosDetalhe', brl(input.financingMonthlyCosts));
    setText('patFinEntrada', brl(financing.entry));
    setText('patFinValor', brl(financing.financedAmount));
    setText('patFinParcela', brl(financing.payment));
    setText('patFinParcelaFinal', brl(financing.finalPayment));
    setText('patFinAluguel', brl(financing.monthlyRent));
    setMonthlyResult('patFinSaldoLabel', 'patFinSaldo', financing.monthlyRent, financing.payment);
    setText('patFinTotal', brl(financing.totalPaid));
    setText('patFinImovelFinal', brl(financing.propertyValueAtEnd));

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
    ['patValorImovel','patCredito','patCustosFinanciamento'].forEach(id => {
      const element = get(id);
      if(!element) return;
      element.addEventListener('input', () => formatMoneyInput(element));
      element.addEventListener('focus', event => event.target.select());
    });

    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.addEventListener('click', () => setPropertyType(button.dataset.propertyType));
    });

    const bidMode = get('patModalidadeLance');
    if(bidMode) bidMode.addEventListener('change', event => updateBidControls(event.target.value));

    const consortiumTerm = get('patPrazoConsorcio');
    if(consortiumTerm) consortiumTerm.addEventListener('input', () => {
      if(state.bidMode === 'livre') updateBidControls('livre');
      updateOwnResourcePreview();
    });

    ['patCredito','patTaxaAdmin','patReajusteConsorcio','patMesContemplacao','patParcelasLance','patPercentualEmbutidoLance'].forEach(id => {
      const element = get(id);
      if(element) element.addEventListener('input', updateOwnResourcePreview);
    });

    const rateType = get('patIndexadorFinanciamento');
    if(rateType) rateType.addEventListener('change', event => toggleFinancingRateType(event.target.value));

    const calculateButton = get('patCalcularBtn');
    if(calculateButton) calculateButton.addEventListener('click', calculate);
  }

  function init(){
    if(!get('patCalcularBtn')) return;
    bind();
    setPropertyType(state.propertyType);
    updateBidControls(valueOf('patModalidadeLance', 'sem'));
    toggleFinancingRateType(valueOf('patIndexadorFinanciamento', 'prefixada'));
    updateOwnResourcePreview();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
