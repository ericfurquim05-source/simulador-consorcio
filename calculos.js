(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};

  function number(value){
    const parsed = parseFloat(String(value ?? '').replace(',','.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function moneyFromText(value){
    const digits = String(value ?? '').replace(/\D/g,'');
    const parsed = parseInt(digits,10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brl(value){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  }

  function percent(value, decimals=2){
    return `${Number(value||0).toFixed(decimals).replace('.',',')}%`;
  }

  function calcFlow(payments, monthlyRate){
    let balance = 0;
    for(const payment of payments){
      balance = (balance + payment) * (1 + monthlyRate);
    }
    return balance;
  }

  function validate(input){
    if(input.credit <= 0) throw new Error('Informe um valor válido para a carta.');
    if(input.months <= 0) throw new Error('Informe uma quantidade válida de meses.');
    if(input.term <= 0 || input.term > 220) throw new Error('O prazo total precisa estar entre 1 e 220 meses.');
    if(input.months > input.term) throw new Error('O período da simulação não pode ser maior que o prazo total do grupo.');
    if(input.incc < 0 || input.saleRate < 0 || input.saleRate > 1 || input.fixedAnnual < 0 || input.savingsMonthly < 0) throw new Error('Revise as taxas informadas.');
    if(input.bidRate < 0 || input.bidRate > 1) throw new Error('Revise o percentual do lance.');
  }

  function calculate(raw){
    const input = {
      client: String(raw.client || '').trim(),
      strategy: raw.strategy === 'com' ? 'com' : 'sem',
      credit: moneyFromText(raw.credit),
      months: Math.floor(number(raw.months)),
      term: Math.floor(number(raw.term)),
      adminRate: number(raw.adminRate)/100,
      incc: number(raw.incc)/100,
      bidRate: number(raw.bidRate)/100,
      saleRate: number(raw.saleRate)/100,
      fixedAnnual: number(raw.fixedAnnual)/100,
      savingsMonthly: number(raw.savingsMonthly)/100,
      reference: String(raw.reference || '').trim()
    };
    validate(input);

    const basePayment = input.credit * (0.50 + input.adminRate) / input.term;
    const payments = [];
    let currentPayment = basePayment;
    let totalPaid = 0;

    for(let month=1; month<=input.months; month++){
      if(month > 1 && (month-1)%12 === 0) currentPayment *= 1 + input.incc;
      payments.push(currentPayment);
      totalPaid += currentPayment;
    }

    // Regra definida para a projeção: períodos fechados de 12 meses já consideram o reajuste do ciclo seguinte.
    const adjustments = Math.floor(input.months/12);
    const correctedCredit = input.credit * Math.pow(1+input.incc, adjustments);
    const appliedBid = input.strategy === 'com' ? input.bidRate : 0;
    const netCredit = correctedCredit * (1-appliedBid);
    const received = netCredit * input.saleRate;
    const consortiumGain = received - totalPaid;
    const consortiumRoi = totalPaid ? consortiumGain/totalPaid*100 : 0;
    const consortiumCapitalEfficiency = totalPaid ? received/totalPaid : 0;

    const fixedMonthly = Math.pow(1+input.fixedAnnual,1/12)-1;
    const fixedBalance = calcFlow(payments,fixedMonthly);
    const fixedGain = fixedBalance-totalPaid;
    const savingsBalance = calcFlow(payments,input.savingsMonthly);
    const savingsGain = savingsBalance-totalPaid;

    const options = [
      {key:'consorcio',name:'Consórcio',invested:totalPaid,gain:consortiumGain,total:received},
      {key:'renda',name:'Renda fixa',invested:totalPaid,gain:fixedGain,total:fixedBalance},
      {key:'poupanca',name:'Poupança',invested:totalPaid,gain:savingsGain,total:savingsBalance}
    ];
    const best = options.reduce((a,b)=>b.gain>a.gain?b:a,options[0]);

    return {
      id:`sim-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      createdAt:new Date().toISOString(),
      input,
      basePayment,payments,totalPaid,adjustments,correctedCredit,netCredit,received,
      consortiumGain,consortiumRoi,consortiumCapitalEfficiency,fixedMonthly,fixedBalance,fixedGain,savingsBalance,savingsGain,
      options,best
    };
  }

  function summaryText(result,profile){
    const c = result.input.client ? `Cliente: ${result.input.client}\n` : '';
    const company = profile.company ? `${profile.company}\n` : '';
    const consultant = profile.consultant ? `Consultor: ${profile.consultant}\n` : '';
    const phone = profile.phone ? `WhatsApp: ${profile.phone}\n` : '';
    const strategy = result.input.strategy === 'com' ? `Com lance fixo de ${percent(result.input.bidRate*100)}` : 'Sem lance';
    return `${company}${consultant}${phone}\nSIMULAÇÃO DE CONSÓRCIO\n${c}Valor da carta: ${brl(result.input.credit)}\nPeríodo: ${result.input.months} meses\nEstratégia: ${strategy}\nParcela inicial aproximada: ${brl(result.basePayment)}\nTotal pago: ${brl(result.totalPaid)}\nCarta corrigida: ${brl(result.correctedCredit)}\nValor estimado recebido: ${brl(result.received)}\nPossível ganho: ${brl(result.consortiumGain)}\n\nCOMPARAÇÃO\nRenda fixa — ganho estimado bruto: ${brl(result.fixedGain)}\nPoupança — ganho estimado: ${brl(result.savingsGain)}\n\nProjeção sem garantia de contemplação, venda ou rentabilidade.`;
  }

  S.Calculos = {calculate,brl,percent,moneyFromText,summaryText};
})(window);
