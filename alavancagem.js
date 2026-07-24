(function(global){
  'use strict';

  const get = id => document.getElementById(id);
  const STORAGE_KEY = 'simulador-patrimonio-v2.5.0';
  const state = { cotas: [], result: null, evolutionIndex: 0, saveTimer: null };

  const STRATEGIES = {
    sorteio: 'Sorteio',
    sem: 'Sem lance',
    fixo: 'Lance fixo',
    limitado: 'Lance limitado',
    livre: 'Lance livre'
  };

  function uid(){ return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`; }
  function num(v, fallback = 0){
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }
  function parseMoney(v){
    let s = String(v ?? '').trim().replace(/R\$/g,'').replace(/\s/g,'');
    if(!s) return 0;
    if(s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
    const n = Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }
  function brl(v){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
  }
  function moneyInput(v, cents = true){
    return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:cents?2:0,maximumFractionDigits:cents?2:0}).format(Number(v)||0);
  }
  function pct(v, digits = 1){
    return `${(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
  }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function dateISO(){ return new Date().toISOString().slice(0,10); }
  function dateBR(value){
    if(!value) return 'Não informada';
    const [y,m,d] = value.split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  function addMonths(dateValue, months){
    const base = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
    base.setMonth(base.getMonth() + Math.max(0,months));
    return base;
  }
  function monthYear(date){ return new Intl.DateTimeFormat('pt-BR',{month:'2-digit',year:'numeric'}).format(date); }
  function annualToMonthly(rate){ return Math.pow(1 + rate, 1/12) - 1; }
  function pricePayment(principal, rate, months){
    if(principal <= 0 || months <= 0) return 0;
    if(rate <= 0) return principal / months;
    const f = Math.pow(1+rate,months);
    return principal*rate*f/(f-1);
  }

  function defaultCota(index = 0){
    const first = index === 0;
    return {
      id: uid(),
      group: first ? '12193' : '12194',
      credit: first ? 250000 : 100000,
      firstPayment: first ? 1422.50 : 567.10,
      term: first ? 219 : 219,
      contemplationMonth: first ? 60 : 48,
      strategy: 'sorteio',
      bidInstallments: 44,
      embeddedPercent: 100,
      prePaymentPercent: 100,
      bidApplication: 'parcela'
    };
  }

  function readGlobal(){
    return {
      client: (get('patCliente')?.value || '').trim(),
      startDate: get('patDataInicio')?.value || dateISO(),
      adjustment: clamp(num(get('patReajusteCredito')?.value,5),0,100)/100,
      rentalYield: clamp(num(get('patRendimentoAluguel')?.value,0.6),0,100)/100,
      appreciation: clamp(num(get('patValorizacaoImovel')?.value,4.82),0,100)/100,
      docsRate: clamp(num(get('patDocumentacao')?.value,3),0,100)/100,
      adminRate: clamp(num(get('patTaxaAdmin')?.value,24.2),0,300)/100,
      bidOriginalTerm: Math.max(1,Math.round(num(get('patPrazoOriginalLance')?.value,220))),
      financingEntry: clamp(num(get('patFinEntrada')?.value,20),0,100)/100,
      financingSystem: get('patFinSistema')?.value === 'sac' ? 'sac' : 'price',
      financingAnnual: clamp(num(get('patFinTaxa')?.value,11.5),0,100)/100,
      financingTerm: Math.max(1,Math.round(num(get('patFinPrazo')?.value,360)))
    };
  }

  function savePlanSoon(){
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(savePlan,250);
  }
  function savePlan(){
    try{
      const g = readGlobal();
      localStorage.setItem(STORAGE_KEY,JSON.stringify({
        client:g.client,startDate:g.startDate,adjustment:g.adjustment*100,rentalYield:g.rentalYield*100,
        appreciation:g.appreciation*100,docsRate:g.docsRate*100,adminRate:g.adminRate*100,
        bidOriginalTerm:g.bidOriginalTerm,cotas:state.cotas
      }));
    }catch(_e){}
  }
  function loadPlan(){
    let saved = null;
    try{ saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); }catch(_e){}
    if(saved && Array.isArray(saved.cotas) && saved.cotas.length){
      state.cotas = saved.cotas.map((c,i)=>({...defaultCota(i),...c,id:c.id||uid()}));
      if(get('patCliente')) get('patCliente').value = saved.client || '';
      if(get('patDataInicio')) get('patDataInicio').value = saved.startDate || dateISO();
      if(get('patReajusteCredito')) get('patReajusteCredito').value = num(saved.adjustment,5).toFixed(2);
      if(get('patRendimentoAluguel')) get('patRendimentoAluguel').value = num(saved.rentalYield,0.6).toFixed(2);
      if(get('patValorizacaoImovel')) get('patValorizacaoImovel').value = num(saved.appreciation,4.82).toFixed(2);
      if(get('patDocumentacao')) get('patDocumentacao').value = num(saved.docsRate,3).toFixed(2);
      if(get('patTaxaAdmin')) get('patTaxaAdmin').value = num(saved.adminRate,24.2).toFixed(2);
      if(get('patPrazoOriginalLance')) get('patPrazoOriginalLance').value = Math.round(num(saved.bidOriginalTerm,220));
    }else{
      state.cotas = [defaultCota(0)];
      if(get('patDataInicio')) get('patDataInicio').value = dateISO();
    }
  }

  function normalizeCota(c){
    c.credit = Math.max(1000,num(c.credit));
    c.firstPayment = Math.max(0,num(c.firstPayment));
    c.term = Math.max(1,Math.round(num(c.term,219)));
    c.contemplationMonth = clamp(Math.round(num(c.contemplationMonth,60)),1,c.term);
    c.prePaymentPercent = clamp(num(c.prePaymentPercent,100),1,100);
    c.strategy = STRATEGIES[c.strategy] ? c.strategy : 'sorteio';
    if(c.strategy === 'fixo'){
      c.bidInstallments = 44;c.embeddedPercent = 100;
    }else if(c.strategy === 'limitado'){
      c.bidInstallments = clamp(Math.round(num(c.bidInstallments,88)),1,88);
      c.embeddedPercent = clamp(num(c.embeddedPercent,50),0,50);
    }else if(c.strategy === 'livre'){
      c.bidInstallments = clamp(Math.round(num(c.bidInstallments,88)),1,Math.max(1,c.term));
      c.embeddedPercent = clamp(num(c.embeddedPercent,50),0,50);
    }else{
      c.bidInstallments = 0;c.embeddedPercent = 0;
    }
    c.bidApplication = c.bidApplication === 'prazo' ? 'prazo' : 'parcela';
    return c;
  }

  function cotaEditor(c,index){
    normalizeCota(c);
    const hasBid = ['fixo','limitado','livre'].includes(c.strategy);
    const locked = c.strategy === 'fixo';
    return `<details class="retirement-quota-editor" data-cota-id="${c.id}" ${index===0?'open':''}>
      <summary>
        <span><b>${index+1}ª cota · ${index+1}º imóvel</b><small>Grupo ${esc(c.group||'não informado')} · ${brl(c.credit)} · ${STRATEGIES[c.strategy]}</small></span>
        <strong>${monthYear(addMonths(readGlobal().startDate,c.contemplationMonth))}</strong>
      </summary>
      <div class="retirement-quota-body">
        <div class="form-grid">
          <div class="field"><label>Grupo</label><div class="control"><input data-field="group" value="${esc(c.group)}" inputmode="numeric"></div></div>
          <div class="field"><label>Crédito inicial</label><div class="control money-control"><span>R$</span><input data-field="credit" data-money="1" value="${moneyInput(c.credit,false)}" inputmode="numeric"></div></div>
          <div class="field"><label>Prazo da cota</label><div class="control"><input data-field="term" type="number" value="${c.term}" min="1"><span>meses</span></div></div>
          <div class="field"><label>1ª parcela</label><div class="control money-control"><span>R$</span><input data-field="firstPayment" data-money="1" value="${moneyInput(c.firstPayment,true)}" inputmode="decimal"></div><small>Valor informado no plano; pode ser ajustado.</small></div>
          <div class="field"><label>Mês estimado da contemplação</label><div class="control"><input data-field="contemplationMonth" type="number" value="${c.contemplationMonth}" min="1" max="${c.term}"><span>mês</span></div></div>
          <div class="field"><label>Estratégia</label><div class="control select-control"><select data-field="strategy">
            ${Object.entries(STRATEGIES).map(([v,l])=>`<option value="${v}" ${c.strategy===v?'selected':''}>${l}</option>`).join('')}
          </select></div></div>
          <div class="field"><label>Parcela antes da contemplação</label><div class="control"><input data-field="prePaymentPercent" type="number" value="${c.prePaymentPercent}" min="1" max="100"><span>% da informada</span></div></div>
          <div class="field"><label>Aplicação do lance</label><div class="control select-control"><select data-field="bidApplication" ${hasBid?'':'disabled'}><option value="parcela" ${c.bidApplication==='parcela'?'selected':''}>Reduzir parcelas</option><option value="prazo" ${c.bidApplication==='prazo'?'selected':''}>Reduzir prazo</option></select></div></div>
          <div class="field" ${hasBid?'':'hidden'}><label>Parcelas ofertadas no lance</label><div class="control"><input data-field="bidInstallments" type="number" value="${c.bidInstallments}" min="1" max="${c.strategy==='limitado'?88:c.term}" ${locked?'disabled':''}><span>parcelas</span></div></div>
          <div class="field" ${hasBid?'':'hidden'}><label>Parte embutida</label><div class="control"><input data-field="embeddedPercent" type="number" value="${c.embeddedPercent}" min="0" max="${c.strategy==='fixo'?100:50}" ${locked?'disabled':''}><span>% do lance</span></div></div>
        </div>
        <div class="retirement-quota-actions">
          <button type="button" data-action="recalculate-payment">Recalcular 1ª parcela</button>
          ${state.cotas.length>1?'<button type="button" data-action="remove" class="danger">Remover cota</button>':''}
        </div>
      </div>
    </details>`;
  }

  function renderCotas(){
    const box = get('patCotasEditor');
    if(!box) return;
    box.innerHTML = state.cotas.map(cotaEditor).join('');
    const badge = get('patQuotaCountBadge');
    if(badge) badge.textContent = `${state.cotas.length} ${state.cotas.length===1?'cota':'cotas'}`;
  }

  function updateCotaFromElement(el){
    const editor = el.closest('[data-cota-id]');
    if(!editor) return;
    const c = state.cotas.find(x=>x.id===editor.dataset.cotaId);
    if(!c) return;
    const field = el.dataset.field;
    if(!field) return;
    if(el.dataset.money) c[field] = parseMoney(el.value);
    else if(['group','strategy','bidApplication'].includes(field)) c[field] = el.value;
    else c[field] = num(el.value);
    normalizeCota(c);
    const summary = editor.querySelector('summary small');
    const right = editor.querySelector('summary>strong');
    if(summary) summary.textContent = `Grupo ${c.group||'não informado'} · ${brl(c.credit)} · ${STRATEGIES[c.strategy]}`;
    if(right) right.textContent = monthYear(addMonths(readGlobal().startDate,c.contemplationMonth));
    savePlanSoon();
  }

  function recalculateFirstPayment(c){
    const g = readGlobal();
    c.firstPayment = c.credit*(1+g.adminRate)/Math.max(1,c.term);
  }

  function bidData(c,g,adjustedCredit){
    let installments = 0, embeddedShare = 0;
    if(c.strategy==='fixo'){ installments=44;embeddedShare=1; }
    if(c.strategy==='limitado'){ installments=clamp(c.bidInstallments,1,88);embeddedShare=clamp(c.embeddedPercent/100,0,.5); }
    if(c.strategy==='livre'){ installments=clamp(c.bidInstallments,1,c.term);embeddedShare=clamp(c.embeddedPercent/100,0,.5); }
    const linear = adjustedCredit*(1+g.adminRate)/Math.max(1,g.bidOriginalTerm);
    const total = Math.min(adjustedCredit,linear*installments);
    const embedded = Math.min(adjustedCredit,total*embeddedShare);
    const own = Math.max(0,total-embedded);
    return {installments,linear,total,embedded,own};
  }

  function simulateCota(raw,index,g){
    const c = normalizeCota({...raw});
    if(c.credit<=0) throw new Error(`Informe o crédito da ${index+1}ª cota.`);
    if(c.firstPayment<=0) throw new Error(`Informe a primeira parcela da ${index+1}ª cota.`);
    const adjustments = Math.floor(c.contemplationMonth/12);
    const adjustedCredit = c.credit*Math.pow(1+g.adjustment,adjustments);
    const paymentAtContemplation = c.firstPayment*Math.pow(1+g.adjustment,adjustments);
    const bid = bidData(c,g,adjustedCredit);
    const releasedCredit = Math.max(0,adjustedCredit-bid.embedded);
    const documentation = releasedCredit*g.docsRate;
    const purchasePower = Math.max(0,releasedCredit-documentation);
    const initialRent = purchasePower*g.rentalYield;
    const remainingMonths = Math.max(0,c.term-c.contemplationMonth);
    const remainingFullYears = Math.max(0,Math.floor(remainingMonths/12));
    const finalProperty = purchasePower*Math.pow(1+g.appreciation,remainingFullYears);
    const finalRent = finalProperty*g.rentalYield;

    let balance = c.firstPayment*c.term;
    let paidInstallments = 0;
    let paidBeforeContemplation = 0;
    let paymentAfterContemplation = 0;
    let contemplated = false;
    const rows=[];
    const startYear = new Date(`${g.startDate}T12:00:00`).getFullYear();

    for(let month=1;month<=c.term && balance>0.005;month+=1){
      if(month>1 && (month-1)%12===0) balance*=1+g.adjustment;
      const cycle=Math.floor((month-1)/12);
      const indexedPayment=c.firstPayment*Math.pow(1+g.adjustment,cycle);
      let payment;
      if(month<=c.contemplationMonth){
        payment=indexedPayment*(c.prePaymentPercent/100);
      }else if(c.bidApplication==='prazo'){
        payment=Math.min(indexedPayment,balance);
      }else{
        payment=balance/Math.max(1,c.term-month+1);
      }
      payment=Math.min(payment,balance);
      balance=Math.max(0,balance-payment);
      paidInstallments+=payment;
      if(month<=c.contemplationMonth) paidBeforeContemplation+=payment;
      if(month===c.contemplationMonth){
        contemplated=true;
        balance=Math.max(0,balance-bid.total);
      }
      if(month===c.contemplationMonth+1) paymentAfterContemplation=payment;
      if(month%12===0 || month===c.term || balance<=0.005){
        const yearNo=Math.ceil(month/12);
        const creditCycle=Math.max(0,yearNo-1);
        rows.push({
          year:yearNo,
          calendarYear:startYear+yearNo-1,
          credit:c.credit*Math.pow(1+g.adjustment,creditCycle),
          payment,
          paid:paidInstallments+(month>=c.contemplationMonth?bid.own:0),
          balance:month<c.contemplationMonth?null:balance,
          contemplation: c.contemplationMonth>month-12 && c.contemplationMonth<=month
        });
      }
    }
    if(!paymentAfterContemplation) paymentAfterContemplation = paymentAtContemplation;
    const totalPaid=paidInstallments+bid.own;
    const acquisitionDate=addMonths(g.startDate,c.contemplationMonth);
    return {
      ...c,index,adjustments,adjustedCredit,paymentAtContemplation,bid,releasedCredit,documentation,purchasePower,
      initialRent,remainingMonths,remainingFullYears,finalProperty,finalRent,balance,totalPaid,paidBeforeContemplation,
      contributionUntilPurchase:paidBeforeContemplation+bid.own,paymentAfterContemplation,rows,acquisitionDate,
      acquisitionLabel:monthYear(acquisitionDate),strategyLabel:STRATEGIES[c.strategy],contemplated
    };
  }

  function calculateResult(){
    const g=readGlobal();
    const cotas=state.cotas.map((c,i)=>simulateCota(c,i,g));
    const sum=key=>cotas.reduce((a,c)=>a+(Number(c[key])||0),0);
    return {g,cotas,totals:{
      initialCredit:sum('credit'),releasedCredit:sum('releasedCredit'),firstPayment:sum('firstPayment'),
      initialRent:sum('initialRent'),finalRent:sum('finalRent'),contribution:sum('contributionUntilPurchase'),
      finalProperty:sum('finalProperty'),totalPaid:sum('totalPaid'),purchasePower:sum('purchasePower')
    }};
  }

  function summaryCard(c){
    return `<article class="retirement-summary-card">
      <div class="retirement-summary-head"><div><b>${c.index+1}º imóvel</b><span>Grupo ${esc(c.group||'não informado')} · ${c.strategyLabel}</span></div><strong>${c.acquisitionLabel}</strong></div>
      <div class="retirement-summary-metrics">
        <div><span>Crédito inicial</span><strong>${brl(c.credit)}</strong></div>
        <div><span>Contemplação estimada</span><strong>${c.contemplationMonth}º mês</strong></div>
        <div><span>Aporte até aquisição</span><strong>${brl(c.contributionUntilPurchase)}</strong></div>
        <div><span>Crédito liberado</span><strong>${brl(c.releasedCredit)}</strong></div>
        <div><span>Aluguel inicial</span><strong>${brl(c.initialRent)}</strong></div>
        <div><span>Imóvel ao final</span><strong>${brl(c.finalProperty)}</strong></div>
        <div><span>Aluguel ao final</span><strong>${brl(c.finalRent)}</strong></div>
      </div>
    </article>`;
  }

  function timelineCard(c){
    const bidText=c.bid.total>0
      ? `O lance projetado é de ${brl(c.bid.total)}, sendo ${brl(c.bid.embedded)} embutidos e ${brl(c.bid.own)} em recursos próprios.`
      : 'A contemplação foi projetada sem lance vencedor.';
    return `<article class="retirement-timeline-item">
      <div class="retirement-timeline-marker">${c.index+1}</div>
      <div class="retirement-timeline-card">
        <div class="retirement-timeline-head"><b>${c.index+1}º imóvel</b><span>Crédito planejado: ${brl(c.credit)} · crédito reajustado: <strong>${brl(c.adjustedCredit)}</strong></span></div>
        <p>Grupo <b>${esc(c.group||'não informado')}</b>, prazo de <b>${c.term} meses</b>, com contemplação estimada no <b>${c.contemplationMonth}º mês</b> pela estratégia <b>${c.strategyLabel}</b>. A parcela inicial informada é de <b>${brl(c.firstPayment)}</b> e a parcela estimada após a contemplação é de <b>${brl(c.paymentAfterContemplation)}</b>.</p>
        <p>${bidText} Após documentação estimada em ${brl(c.documentation)}, o poder de compra projetado é de <b>${brl(c.purchasePower)}</b>.</p>
        <p>O aluguel inicial projetado é de <b>${brl(c.initialRent)}</b>. Nos ${c.remainingFullYears} anos completos restantes, o imóvel poderá atingir <b>${brl(c.finalProperty)}</b> e gerar aluguel de <b>${brl(c.finalRent)}</b>.</p>
        <div class="retirement-timeline-resume">Resumo: imóvel projetado em <b>${brl(c.finalProperty)}</b> e aluguel de <b>${brl(c.finalRent)}</b></div>
      </div>
    </article>`;
  }

  function renderEvolution(index){
    if(!state.result) return;
    const c=state.result.cotas[index]||state.result.cotas[0];
    state.evolutionIndex=c.index;
    get('patEvolutionSnapshot').innerHTML=`
      <div><span>Crédito contratado</span><strong>${brl(c.credit)}</strong></div>
      <div><span>Crédito na contemplação</span><strong>${brl(c.adjustedCredit)}</strong></div>
      <div><span>Saldo após o lance</span><strong>${brl(Math.max(0,(c.rows.find(r=>r.contemplation)?.balance ?? 0)))}</strong></div>
      <div><span>Total pago estimado</span><strong>${brl(c.totalPaid)}</strong></div>`;
    get('patEvolutionBody').innerHTML=c.rows.map(r=>`<tr class="${r.contemplation?'contemplation-row':''}">
      <td>${r.year} (${r.calendarYear})${r.contemplation?'<small>Contemplação</small>':''}</td>
      <td>${brl(r.credit)}</td><td>${brl(r.payment)}</td><td>${brl(r.paid)}</td><td>${r.balance===null?'—':brl(r.balance)}</td>
    </tr>`).join('');
  }

  function renderFinancing(){
    if(!state.result) return;
    const g=readGlobal();
    const property=state.result.totals.purchasePower;
    const entry=property*g.financingEntry;
    const principal=Math.max(0,property-entry);
    const rate=annualToMonthly(g.financingAnnual);
    let first=0,totalInstallments=0,balance=principal;
    if(g.financingSystem==='price'){
      first=pricePayment(principal,rate,g.financingTerm);
      totalInstallments=first*g.financingTerm;
    }else{
      const amort=principal/g.financingTerm;
      for(let m=1;m<=g.financingTerm;m+=1){
        const p=amort+balance*rate;if(m===1)first=p;totalInstallments+=p;balance=Math.max(0,balance-amort);
      }
    }
    const total=entry+totalInstallments;
    get('patFinComparison').innerHTML=`<div class="retirement-financing-cards">
      <div><span>Imóveis considerados</span><strong>${brl(property)}</strong></div>
      <div><span>Aluguel inicial projetado</span><strong>${brl(state.result.totals.initialRent)}</strong></div>
      <div><span>Parcela do consórcio</span><strong>${brl(state.result.totals.firstPayment)}</strong></div>
      <div><span>Parcela do financiamento</span><strong>${brl(first)}</strong></div>
      <div><span>Total pago no consórcio</span><strong>${brl(state.result.totals.totalPaid)}</strong></div>
      <div><span>Total pago no financiamento</span><strong>${brl(total)}</strong></div>
    </div>`;
  }

  function renderResult(result){
    state.result=result;
    get('patResultSection').hidden=false;
    get('patResCotas').textContent=result.cotas.length;
    get('patResCreditoInicial').textContent=brl(result.totals.initialCredit);
    get('patResCreditoLiberado').textContent=brl(result.totals.releasedCredit);
    get('patResPrimeiraParcela').textContent=brl(result.totals.firstPayment);
    get('patResAluguelInicial').textContent=brl(result.totals.initialRent);
    get('patResAluguelFinal').textContent=brl(result.totals.finalRent);
    get('patResAporteTotal').textContent=brl(result.totals.contribution);
    get('patResPatrimonioFinal').textContent=brl(result.totals.finalProperty);
    get('patResumoCotas').innerHTML=result.cotas.map(summaryCard).join('');
    get('patTimeline').innerHTML=result.cotas.map(timelineCard).join('');
    const select=get('patCotaEvolucao');
    select.innerHTML=result.cotas.map(c=>`<option value="${c.index}">${c.index+1}ª cota · Grupo ${esc(c.group||'não informado')} · ${brl(c.credit)}</option>`).join('');
    renderEvolution(0);renderFinancing();
    setTimeout(()=>get('patResultSection').scrollIntoView({behavior:'smooth',block:'start'}),80);
  }

  function calculate(){
    try{
      get('patError').hidden=true;
      state.cotas.forEach(normalizeCota);
      savePlan();
      renderResult(calculateResult());
    }catch(e){
      get('patError').textContent=e.message||'Não foi possível gerar o planejamento.';
      get('patError').hidden=false;
    }
  }

  function showAction(text){
    const box=get('patActionMessage');box.textContent=text;box.hidden=false;clearTimeout(box._t);box._t=setTimeout(()=>box.hidden=true,3000);
  }

  function copySummary(){
    if(!state.result) return;
    const r=state.result;
    const lines=[
      'APOSENTADORIA IMOBILIÁRIA',
      r.g.client?`Cliente: ${r.g.client}`:'',
      `Cotas: ${r.cotas.length}`,
      `Crédito inicial: ${brl(r.totals.initialCredit)}`,
      `Crédito liberado planejado: ${brl(r.totals.releasedCredit)}`,
      `Aluguel inicial projetado: ${brl(r.totals.initialRent)}`,
      `Patrimônio estimado ao final: ${brl(r.totals.finalProperty)}`,
      `Aluguel estimado ao final: ${brl(r.totals.finalRent)}`,
      '',...r.cotas.map(c=>`${c.index+1}ª cota: ${brl(c.credit)} · ${c.strategyLabel} · contemplação no ${c.contemplationMonth}º mês · imóvel projetado em ${brl(c.finalProperty)}.`)
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(lines).then(()=>showAction('Resumo copiado.')).catch(()=>showAction('Não foi possível copiar automaticamente.'));
  }

  function pdfHTML(r){
    const settings=global.Simulador?.Configuracoes?.load?.()||{};
    const client=r.g.client||'Não informado';
    const summaryRows=r.cotas.map(c=>`<tr><td>${c.index+1}º imóvel</td><td>${brl(c.credit)}</td><td>${c.strategyLabel}<br><small>${c.contemplationMonth}º mês</small></td><td>${brl(c.contributionUntilPurchase)}</td><td>${brl(c.releasedCredit)}</td><td>${brl(c.initialRent)}</td><td>${brl(c.finalProperty)}</td><td>${brl(c.finalRent)}</td></tr>`).join('');
    const details=r.cotas.map(c=>`<section class="detail"><h3>${c.index+1}º imóvel <span>Grupo ${esc(c.group||'não informado')}</span></h3><p>Crédito planejado de <b>${brl(c.credit)}</b>, contemplação estimada no <b>${c.contemplationMonth}º mês</b> por <b>${c.strategyLabel}</b>. Crédito reajustado de <b>${brl(c.adjustedCredit)}</b> e crédito liberado de <b>${brl(c.releasedCredit)}</b>.</p><p>Após documentação estimada de <b>${brl(c.documentation)}</b>, o poder de compra é de <b>${brl(c.purchasePower)}</b>. Aluguel inicial de <b>${brl(c.initialRent)}</b>, imóvel projetado ao final em <b>${brl(c.finalProperty)}</b> e aluguel final de <b>${brl(c.finalRent)}</b>.</p><div class="resume">Parcela inicial ${brl(c.firstPayment)} · Parcela após contemplação ${brl(c.paymentAfterContemplation)} · Aporte até aquisição ${brl(c.contributionUntilPurchase)}</div></section>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Aposentadoria Imobiliária</title><style>
      @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#26323c;margin:0;font-size:10px}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f18a00;padding-bottom:10px;margin-bottom:12px}header h1{margin:0;font-size:22px}header p{margin:4px 0 0;color:#65727d}.brand{font-weight:800}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0 14px}.kpis div{border:1px solid #d9e0e5;border-radius:8px;padding:9px}.kpis span{display:block;color:#6b7780;font-size:8px;text-transform:uppercase}.kpis b{display:block;font-size:15px;margin-top:4px}.kpis .green b{color:#159447}h2{font-size:16px;margin:16px 0 8px}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#eef2f4;text-align:left;padding:6px}td{border-bottom:1px solid #dfe5e9;padding:6px;vertical-align:top}.detail{border:1px solid #dbe2e7;border-radius:9px;padding:10px;margin:9px 0;break-inside:avoid}.detail h3{margin:0 0 7px;font-size:14px}.detail h3 span{float:right;color:#2484bd;font-size:9px}.detail p{line-height:1.5;margin:5px 0}.resume{background:#eff9f2;border:1px solid #b8dec4;color:#176f36;padding:7px;border-radius:6px;font-weight:700}.notes{margin-top:14px;border-top:1px solid #ccd4da;padding-top:8px;color:#68757e;font-size:8px;line-height:1.5}.signature{text-align:center;margin-top:20px}.signature b{font-size:13px}.page-break{break-before:page}@media print{button{display:none}}
    </style></head><body>
      <header><div><div class="brand">${esc(settings.company||'Aposentadoria Imobiliária')}</div><h1>Planejamento Patrimonial</h1><p>Cliente: ${esc(client)} · Início: ${dateBR(r.g.startDate)}</p></div><div><b>Emitido em</b><br>${new Date().toLocaleDateString('pt-BR')}</div></header>
      <div class="kpis"><div><span>Cotas</span><b>${r.cotas.length}</b></div><div><span>Crédito inicial</span><b>${brl(r.totals.initialCredit)}</b></div><div class="green"><span>Crédito liberado</span><b>${brl(r.totals.releasedCredit)}</b></div><div><span>1ª parcela total</span><b>${brl(r.totals.firstPayment)}</b></div><div><span>Aluguel inicial</span><b>${brl(r.totals.initialRent)}</b></div><div class="green"><span>Patrimônio ao final</span><b>${brl(r.totals.finalProperty)}</b></div></div>
      <h2>Planejamento resumido</h2><table><thead><tr><th>Imóvel</th><th>Crédito</th><th>Contemplação</th><th>Aporte</th><th>Crédito liberado</th><th>Aluguel inicial</th><th>Imóvel final</th><th>Aluguel final</th></tr></thead><tbody>${summaryRows}</tbody></table>
      <div class="page-break"></div><h2>Planejamento detalhado</h2>${details}
      <div class="notes"><b>Premissas:</b> reajuste de crédito e parcelas ${pct(r.g.adjustment*100,2)} a.a.; aluguel ${pct(r.g.rentalYield*100,2)} do imóvel ao mês; valorização do imóvel ${pct(r.g.appreciation*100,2)} a.a.; documentação ${pct(r.g.docsRate*100,2)} do crédito líquido. Projeção matemática sem garantia de contemplação, valorização, aluguel ou aprovação de crédito.</div>
      <div class="signature"><b>${esc(settings.consultant||'Consultor')}</b><br>${esc(settings.phone||'')}</div>
      <script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
  }

  function generatePDF(){
    if(!state.result) return;
    const w=window.open('','_blank');
    if(!w){ showAction('O navegador bloqueou a janela do relatório.');return; }
    w.document.open();w.document.write(pdfHTML(state.result));w.document.close();
  }

  function bind(){
    get('patCotasEditor').addEventListener('input',e=>updateCotaFromElement(e.target));
    get('patCotasEditor').addEventListener('change',e=>{
      updateCotaFromElement(e.target);
      if(e.target.dataset.field==='strategy') renderCotas();
    });
    get('patCotasEditor').addEventListener('blur',e=>{
      if(e.target.dataset.money){
        const c=state.cotas.find(x=>x.id===e.target.closest('[data-cota-id]')?.dataset.cotaId);
        if(c) e.target.value=moneyInput(c[e.target.dataset.field],e.target.dataset.field==='firstPayment');
      }
    },true);
    get('patCotasEditor').addEventListener('click',e=>{
      const action=e.target.dataset.action;if(!action)return;
      const id=e.target.closest('[data-cota-id]')?.dataset.cotaId;
      const index=state.cotas.findIndex(x=>x.id===id);if(index<0)return;
      if(action==='remove'){state.cotas.splice(index,1);renderCotas();savePlanSoon();}
      if(action==='recalculate-payment'){recalculateFirstPayment(state.cotas[index]);renderCotas();savePlanSoon();}
    });
    get('patAdicionarCotaBtn').addEventListener('click',()=>{state.cotas.push(defaultCota(state.cotas.length));renderCotas();savePlanSoon();});
    get('patCalcularBtn').addEventListener('click',calculate);
    get('patCotaEvolucao').addEventListener('change',e=>renderEvolution(Number(e.target.value)||0));
    get('patCompararFinBtn').addEventListener('click',renderFinancing);
    get('patGerarPdfBtn').addEventListener('click',generatePDF);
    get('patCopiarResumoBtn').addEventListener('click',copySummary);
    ['patCliente','patDataInicio','patReajusteCredito','patRendimentoAluguel','patValorizacaoImovel','patDocumentacao','patTaxaAdmin','patPrazoOriginalLance'].forEach(id=>get(id)?.addEventListener('input',savePlanSoon));
  }

  function init(){
    if(!get('patCotasEditor')) return;
    loadPlan();renderCotas();bind();
  }
  document.addEventListener('DOMContentLoaded',init);
})(window);
