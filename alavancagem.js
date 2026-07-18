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

  function pct(value){
    return `${(Math.max(0, Number(value) || 0) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}%`;
  }

  function formatMoneyInput(element){
    if(!element) return;
    const digits = String(element.value || '').replace(/\D/g, '');
    element.value = digits ? parseInt(digits, 10).toLocaleString('pt-BR') : '';
  }

  function updateRentPreview(){
    const propertyValue = moneyFromText(valueOf('patValorImovel', '250.000'));
    const rentalYield = number(valueOf('patRentabilidadeAluguel', '0.50')) / 100;
    const monthlyRent = Math.max(0, propertyValue * rentalYield);
    setText('patAluguelPreview', `Estimativa atual: ${brl(monthlyRent)} por mês.`);
    return monthlyRent;
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
    updateRentPreview();
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

    const totalBid = Math.max(0, linearInstallment * installments);
    const embeddedBid = Math.max(0, totalBid * embeddedShare);
    const ownBid = Math.max(0, totalBid - embeddedBid);
    const denominator = adjustedCredit > 0 ? adjustedCredit : 1;

    return {
      mode,
      adjustedCredit,
      totalBid,
      embeddedBid,
      ownBid,
      totalRate: totalBid / denominator,
      embeddedRate: embeddedBid / denominator,
      ownRate: ownBid / denominator
    };
  }

  function updateBidPreview(){
    const summary = get('patLanceResumo');
    const mode = String(valueOf('patModalidadeLance', 'sem')).toLowerCase();
    const preview = bidPreviewFromForm();
    if(summary) summary.hidden = mode === 'sem';
    if(mode === 'sem') return;

    setText('patLancePercentualTotal', pct(preview.totalRate));
    setText('patLanceCartaPreview', brl(preview.adjustedCredit));
    setText('patLanceTotalPreview', brl(preview.totalBid));
    setText('patLanceTotalPercentPreview', `${pct(preview.totalRate)} da carta`);
    setText('patLanceEmbutidoPreview', brl(preview.embeddedBid));
    setText('patLanceEmbutidoPercentPreview', `${pct(preview.embeddedRate)} da carta`);
    setText('patLanceProprioPreview', brl(preview.ownBid));
    setText('patLanceProprioPercentPreview', `${pct(preview.ownRate)} da carta`);
    setText(
      'patLanceResumoTexto',
      `Em uma carta estimada em ${brl(preview.adjustedCredit)}, o lance de ${brl(preview.totalBid)} representa ${pct(preview.totalRate)} do crédito. Desse total, ${brl(preview.embeddedBid)} será embutido e ${brl(preview.ownBid)} será pago com recursos próprios.`
    );
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
      updateBidPreview();
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
      updateBidPreview();
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
    updateBidPreview();
  }

  function applyVersionDefaults(){
    const key = 'patrimonio-defaults-v2.2.13';
    try{
      if(sessionStorage.getItem(key)) return;
      const property = get('patValorImovel');
      const credit = get('patCredito');
      const rent = get('patRentabilidadeAluguel');
      const system = get('patSistemaFinanciamento');
      if(property) property.value = '250.000';
      if(credit) credit.value = '250.000';
      if(rent) rent.value = '0.50';
      if(system) system.value = 'price';
      sessionStorage.setItem(key, '1');
    }catch(_error){
      // Mantém os valores declarados no HTML quando o armazenamento não estiver disponível.
    }
  }

  function readInput(){
    return {
      propertyValue: moneyFromText(valueOf('patValorImovel')),
      credit: moneyFromText(valueOf('patCredito')),
      bidMode: String(valueOf('patModalidadeLance', 'sem')).toLowerCase(),
      bidInstallments: Math.round(number(valueOf('patParcelasLance', '0'))),
      embeddedBidShare: number(valueOf('patPercentualEmbutidoLance', '0')) / 100,
      rentalYield: number(valueOf('patRentabilidadeAluguel', '0.50')) / 100,
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
    const bidRateBase = adjustedCredit > 0 ? adjustedCredit : 1;
    const totalBidRate = totalBidUsed / bidRateBase;
    const ownBidRate = ownBidUsed / bidRateBase;
    const embeddedBidRate = embeddedBidUsed / bidRateBase;
    const totalPaid = totalInstallmentsPaid + ownBidUsed + purchaseComplement;
    const rentAtContemplation = input.propertyValue * input.rentalYield * Math.pow(1 + input.rentAdjustment, completedYears);
    const propertyValueAtEnd = futureValue(input.propertyValue, input.appreciation, input.consortiumTerm);

    return {
      bidMode: bid.mode,
      bidLabel: bid.label,
      bidInstallments: bid.installments,
      linearBidInstallment,
      totalBid: totalBidUsed,
      totalBidRate,
      ownBidRate,
      embeddedBidRate,
      adjustedCredit,
      embeddedBid: embeddedBidUsed,
      netCredit,
      propertyAtContemplation,
      purchaseComplement,
      ownBid: ownBidUsed,
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

  function render(input, consortium, financing){
    const resultSection = get('patResultSection');
    if(resultSection) resultSection.hidden = false;

    setText('patResModalidadeLance', consortium.bidLabel);
    setText('patResParcelasLance', consortium.bidInstallments > 0 ? `${consortium.bidInstallments} parcelas` : 'Não se aplica');
    setText('patResParcelaLinearLance', consortium.bidInstallments > 0 ? brl(consortium.linearBidInstallment) : 'Não se aplica');
    setText('patResLanceTotal', brl(consortium.totalBid));
    setText('patResLancePercentual', pct(consortium.totalBidRate));
    setText('patResCartaContemplacao', brl(consortium.adjustedCredit));
    setText('patResCreditoLiquido', brl(consortium.netCredit));
    setText('patResLanceProprio', brl(consortium.ownBid));
    setText('patResLanceProprioPercentual', pct(consortium.ownBidRate));
    setText('patResLanceEmbutido', brl(consortium.embeddedBid));
    setText('patResLanceEmbutidoPercentual', pct(consortium.embeddedBidRate));
    setText('patResComplemento', brl(consortium.purchaseComplement));

    const resultBidSummary = get('patResultLanceResumo');
    const hasBid = consortium.bidMode !== 'sem' && consortium.bidInstallments > 0;
    if(resultBidSummary) resultBidSummary.hidden = !hasBid;
    if(hasBid){
      const installmentsRate = input.consortiumTerm > 0 ? consortium.bidInstallments / input.consortiumTerm : 0;
      setText('patResultLanceParcelas', `${consortium.bidInstallments} parcelas de ${input.consortiumTerm} (${pct(installmentsRate)} do prazo)`);
      setText('patResultLancePercentual', `${pct(consortium.totalBidRate)} da carta`);
      setText('patResultLanceCarta', brl(consortium.adjustedCredit));
      setText('patResultLanceTotal', brl(consortium.totalBid));
      setText('patResultLanceTotalPct', `${pct(consortium.totalBidRate)} da carta`);
      setText('patResultLanceEmbutido', brl(consortium.embeddedBid));
      setText('patResultLanceEmbutidoPct', `${pct(consortium.embeddedBidRate)} da carta`);
      setText('patResultLanceProprio', brl(consortium.ownBid));
      setText('patResultLanceProprioPct', `${pct(consortium.ownBidRate)} da carta`);
      setText('patResultLanceTexto', `${consortium.bidInstallments} parcelas representam ${pct(installmentsRate)} do prazo do grupo. O lance de ${brl(consortium.totalBid)} equivale a ${pct(consortium.totalBidRate)} da carta estimada na contemplação.`);
    }

    const sharedMonthlyRent = input.propertyValue * input.rentalYield;
    setText('patConsAluguel', brl(sharedMonthlyRent));
    setText('patConsTotalPago', brl(consortium.totalPaid));
    setText('patFinAluguel', brl(sharedMonthlyRent));
    setText('patFinTotalPago', brl(financing.totalPaid));
    setText('patConsPrazoBadge', `${input.consortiumTerm} meses`);
    setText('patConsParcelaInicial', brl(consortium.initialFullPayment));
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
    applyVersionDefaults();
    ['patValorImovel','patCredito','patCustosFinanciamento'].forEach(id => {
      const element = get(id);
      if(!element) return;
      element.addEventListener('input', () => {
        formatMoneyInput(element);
        if(id === 'patValorImovel') updateRentPreview();
      });
      element.addEventListener('focus', event => event.target.select());
    });

    document.querySelectorAll('[data-property-type]').forEach(button => {
      button.addEventListener('click', () => setPropertyType(button.dataset.propertyType));
    });

    const rentalYieldInput = get('patRentabilidadeAluguel');
    if(rentalYieldInput) rentalYieldInput.addEventListener('input', updateRentPreview);

    const bidMode = get('patModalidadeLance');
    if(bidMode) bidMode.addEventListener('change', event => updateBidControls(event.target.value));

    const consortiumTerm = get('patPrazoConsorcio');
    if(consortiumTerm) consortiumTerm.addEventListener('input', () => {
      if(state.bidMode === 'livre') updateBidControls('livre');
      updateBidPreview();
    });

    ['patCredito','patTaxaAdmin','patReajusteConsorcio','patMesContemplacao','patParcelasLance','patPercentualEmbutidoLance'].forEach(id => {
      const element = get(id);
      if(element) element.addEventListener('input', updateBidPreview);
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
    updateRentPreview();
    updateBidPreview();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
