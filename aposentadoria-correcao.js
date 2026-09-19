(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'simulador-aposentadoria-financeira-v15';
  const MIGRATION_KEY = 'simulador-aposentadoria-financeira-v15-migrated';

  function brl(value){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  }
  function pct(value,digits=1){
    return `${(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
  }
  function parseMoney(value){
    let text=String(value??'').trim().replace(/R\$/g,'').replace(/\s/g,'');
    if(!text) return 0;
    if(text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(text)) text=text.replace(/\./g,'');
    const n=Number(text.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }
  function formatMoneyInput(value){
    return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  }
  function num(id,fallback){
    const n=Number(String($(id)?.value??'').replace(',','.'));
    return Number.isFinite(n)?n:fallback;
  }
  function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
  function annualCycle(month){ return Math.max(0,Math.floor((Math.max(1,month)-1)/12)); }
  function creditCycle(month){ return Math.max(0,Math.floor(Math.max(0,month)/12)); }

  function currentAdminRate(){
    const visible=Number(String($('cfgTaxa')?.value??'').replace(',','.'));
    if(Number.isFinite(visible)&&visible>=0) return visible/100;
    try{
      const saved=window.Simulador?.Configuracoes?.load?.();
      const rate=Number(saved?.adminRate);
      if(Number.isFinite(rate)&&rate>=0) return rate/100;
    }catch(_e){}
    return 0.242;
  }

  function automaticPayments(credit,term){
    const safeCredit=Math.max(0,Number(credit)||0);
    const safeTerm=Math.max(1,Math.round(Number(term)||220));
    const adminRate=currentAdminRate();
    return {
      adminRate,
      reducedPayment:safeCredit*(0.50+adminRate)/safeTerm,
      fullPayment:safeCredit*(1+adminRate)/safeTerm
    };
  }

  function syncAutomaticPayments(){
    const credit=parseMoney($('aposCredito')?.value);
    const term=Math.round(num('aposPrazo',220));
    if(credit<=0||term<=0) return automaticPayments(0,term);
    const values=automaticPayments(credit,term);
    if($('aposParcela')) $('aposParcela').value=formatMoneyInput(values.reducedPayment);
    if($('aposParcelaCheia')) $('aposParcelaCheia').value=formatMoneyInput(values.fullPayment);
    return values;
  }

  function ensureFullPaymentField(){
    if($('aposParcelaCheia')) return;
    const reduced=$('aposParcela');
    const reducedField=reduced?.closest('.field');
    if(!reducedField) return;

    const fullField=document.createElement('div');
    fullField.className='field';
    fullField.id='aposParcelaCheiaField';
    fullField.innerHTML=`
      <label for="aposParcelaCheia">Parcela cheia automática</label>
      <div class="control money-control"><span>R$</span><input id="aposParcelaCheia" type="text" inputmode="decimal" value="0,00" readonly aria-readonly="true"></div>
      <small>Calculada automaticamente pela carta, taxa administrativa e prazo do grupo.</small>`;
    reducedField.insertAdjacentElement('afterend',fullField);
  }

  function read(){
    const credit=parseMoney($('aposCredito')?.value);
    const term=Math.round(num('aposPrazo',220));
    const automatic=automaticPayments(credit,term);
    const reducedPayment=automatic.reducedPayment;
    const fullPayment=automatic.fullPayment;
    if($('aposParcela')) $('aposParcela').value=formatMoneyInput(reducedPayment);
    if($('aposParcelaCheia')) $('aposParcelaCheia').value=formatMoneyInput(fullPayment);
    const contemplation=Math.round(num('aposContemplacao',60));
    const annual=clamp(num('aposReajuste',6),0,100)/100;
    const monthly=clamp(num('aposRendimento',1),0,100)/100;
    const client=($('aposCliente')?.value||'').trim();

    if(credit<=0) throw new Error('Informe o valor da carta.');
    if(term<2||term>360) throw new Error('Informe um prazo entre 2 e 360 meses.');
    if(contemplation<1||contemplation>=term) throw new Error('A contemplação precisa ocorrer antes do fim do grupo.');

    return {client,credit,reducedPayment,fullPayment,term,contemplation,annual,monthly};
  }

  function calculate(input){
    const remainingMonths=input.term-input.contemplation;
    const baseShortfall=Math.max(0,input.fullPayment-input.reducedPayment);
    const deferredAtCont=baseShortfall*input.contemplation;
    const redistributedPerMonth=remainingMonths>0?deferredAtCont/remainingMonths:0;
    const firstFullAfterCont=input.fullPayment+redistributedPerMonth;

    const contCreditFactor=Math.pow(1+input.annual,creditCycle(input.contemplation));
    const capitalAtCont=input.credit*contCreditFactor;
    const investmentMonths=remainingMonths;
    const finalCapital=capitalAtCont*Math.pow(1+input.monthly,investmentMonths);
    const projectedMonthlyIncome=finalCapital*input.monthly;

    // Total do plano: soma a parcela cheia automática em cada mês,
    // aplicando o reajuste anual a cada bloco de 12 meses do grupo inteiro.
    let totalPaid=0;
    let paidUntilCont=0;
    const monthPayments=[];
    const cumulative=[];
    const contCycle=creditCycle(input.contemplation);

    for(let m=1;m<=input.term;m++){
      const fullProjected=input.fullPayment*Math.pow(1+input.annual,annualCycle(m));
      totalPaid+=fullProjected;
      cumulative[m]=totalPaid;

      if(m<=input.contemplation){
        const reducedProjected=input.reducedPayment*Math.pow(1+input.annual,annualCycle(m));
        paidUntilCont+=reducedProjected;
        monthPayments[m]=reducedProjected;
      }else{
        const futureCycles=Math.max(0,annualCycle(m)-contCycle);
        monthPayments[m]=firstFullAfterCont*Math.pow(1+input.annual,futureCycles);
      }
    }

    const months=[];
    for(let m=12;m<input.term;m+=12) months.push(m);
    [input.contemplation,input.contemplation+1,input.term].forEach(m=>{
      if(m>=1&&m<=input.term&&!months.includes(m)) months.push(m);
    });
    months.sort((a,b)=>a-b);

    const timeline=months.map(m=>({
      month:m,
      credit:input.credit*Math.pow(1+input.annual,creditCycle(m)),
      payment:monthPayments[m]||0,
      paid:cumulative[m]||totalPaid,
      invested:m<input.contemplation?0:capitalAtCont*Math.pow(1+input.monthly,Math.max(0,m-input.contemplation)),
      isCont:m===input.contemplation,
      isFirstFull:m===input.contemplation+1,
      isEnd:m===input.term
    }));

    return {
      input,remainingMonths,baseShortfall,deferredAtCont,redistributedPerMonth,firstFullAfterCont,
      capitalAtCont,investmentMonths,finalCapital,projectedMonthlyIncome,totalPaid,paidUntilCont,timeline
    };
  }

  function save(input){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({
      reducedPayment:input.reducedPayment,
      fullPayment:input.fullPayment,
      adminRate:currentAdminRate()*100,
      term:input.term,
      annual:input.annual*100,
      monthly:input.monthly*100
    }));}catch(_e){}
  }

  function resultOrError(){
    try{
      const input=read();
      const result=calculate(input);
      save(input);
      if($('aposError')) $('aposError').hidden=true;
      return result;
    }catch(error){
      if($('aposError')){
        $('aposError').textContent=error.message||'Não foi possível calcular.';
        $('aposError').hidden=false;
      }
      return null;
    }
  }

  function rowLabel(item){
    if(item.isCont) return `Mês ${item.month} · contemplação`;
    if(item.isFirstFull) return `Mês ${item.month} · 1ª parcela pós-contemplação`;
    if(item.isEnd) return `Mês ${item.month} · fim do grupo`;
    return `Mês ${item.month}`;
  }

  function ensureMemoryBox(parcelJourney){
    if(!parcelJourney||$('aposMemory')) return;
    const details=document.createElement('details');
    details.id='aposMemory';
    details.className='apos-memory';
    details.innerHTML='<summary>Ver memória da parcela pós-contemplação</summary><div id="aposMemoryBody"></div>';
    parcelJourney.insertAdjacentElement('afterend',details);
  }

  function render(result){
    const out=$('aposResultado');
    if(!out) return;
    out.hidden=false;

    if($('aposHeadline')) $('aposHeadline').textContent=result.input.client
      ? `Projeto de aposentadoria · ${result.input.client}`
      : 'Projeto de aposentadoria';

    const firstPanel=out.querySelector(':scope > .panel');
    const resultLead=firstPanel?.querySelector('.section-heading .lead');
    if(resultLead) resultLead.textContent='Cálculo baseado nas parcelas reduzida e cheia calculadas automaticamente.';

    const kpi=out.querySelector('.apos-kpi');
    if(kpi){
      kpi.innerHTML=`
        <div><span>Total pago em parcelas até o fim</span><strong>${brl(result.totalPaid)}</strong><small>Parcela cheia projetada com reajuste anual durante todo o prazo.</small></div>
        <div class="apos-highlight"><span>Saldo projetado da aplicação no encerramento</span><strong>${brl(result.finalCapital)}</strong></div>
        <div class="apos-highlight"><span>Renda mensal projetada a ${pct(result.input.monthly*100,2)} a.m.</span><strong>${brl(result.projectedMonthlyIncome)}/mês</strong></div>
        <div><span>Patrimônio que permanece aplicado</span><strong>${brl(result.finalCapital)}</strong><small>Se o rendimento continuar cobrindo a retirada.</small></div>`;
    }

    const creditJourney=$('aposResCartaHoje')?.closest('.apos-journey') || firstPanel?.querySelector('.apos-journey');
    if(creditJourney){
      creditJourney.innerHTML=`
        <div><span>Carta contratada</span><strong>${brl(result.input.credit)}</strong></div>
        <div class="apos-arrow">→</div>
        <div><span>Crédito corrigido no mês ${result.input.contemplation}</span><strong>${brl(result.capitalAtCont)}</strong></div>
        <div class="apos-arrow">→</div>
        <div><span>Saldo da aplicação no fim</span><strong>${brl(result.finalCapital)}</strong></div>`;
    }

    let parcelJourney=$('aposResParcelaHoje')?.closest('.apos-journey') || firstPanel?.querySelectorAll('.apos-journey')?.[1];
    if(!parcelJourney&&creditJourney){
      parcelJourney=document.createElement('div');
      parcelJourney.className='apos-journey apos-parcela-principal';
      creditJourney.insertAdjacentElement('afterend',parcelJourney);
    }
    if(parcelJourney){
      parcelJourney.classList.add('apos-parcela-principal');
      parcelJourney.innerHTML=`
        <div><span>Parcela reduzida após contratação</span><strong>${brl(result.input.reducedPayment)}</strong></div>
        <div class="apos-arrow">→</div>
        <div><span>1ª parcela após contemplação</span><strong>${brl(result.firstFullAfterCont)}</strong></div>`;
    }

    ensureMemoryBox(parcelJourney);
    if($('aposMemoryBody')){
      $('aposMemoryBody').innerHTML=`
        <div><span>Parcela cheia automática</span><strong>${brl(result.input.fullPayment)}</strong></div>
        <div><span>Diferença mensal base</span><strong>${brl(result.baseShortfall)}</strong></div>
        <div><span>Diferença acumulada em ${result.input.contemplation} meses</span><strong>${brl(result.deferredAtCont)}</strong></div>
        <div><span>Dividida por ${result.remainingMonths} meses restantes</span><strong>+ ${brl(result.redistributedPerMonth)}/mês</strong></div>`;
    }

    const detail=out.querySelector('.apos-detail-grid');
    if(detail){
      const cards=detail.querySelectorAll(':scope > div');
      if(cards[0]) cards[0].innerHTML=`<span>Contemplação simulada</span><strong>Mês ${result.input.contemplation}</strong>`;
      if(cards[1]) cards[1].innerHTML=`<span>Tempo com o capital aplicado</span><strong>${result.investmentMonths} meses</strong>`;
      if(cards[2]) cards[2].innerHTML=`<span>Aplicação financeira utilizada</span><strong>${pct(result.input.monthly*100,2)} a.m.</strong>`;
      if(cards[3]) cards[3].innerHTML=`<span>Reajuste anual projetado</span><strong>${pct(result.input.annual*100,1)} a.a.</strong>`;
    }

    const headers=out.querySelectorAll('.apos-table thead th');
    if(headers[2]) headers[2].textContent='Parcela do fluxo';
    if(headers[3]) headers[3].textContent='Total das parcelas cheias';

    if($('aposTimelineBody')){
      $('aposTimelineBody').innerHTML=result.timeline.map(item=>`<tr class="${item.isCont?'apos-milestone':''} ${item.isEnd?'apos-end':''}">
        <td>${rowLabel(item)}</td><td>${brl(item.credit)}</td><td>${brl(item.payment)}</td><td>${brl(item.paid)}</td><td>${item.invested?brl(item.invested):'—'}</td>
      </tr>`).join('');
    }

    setTimeout(()=>out.scrollIntoView({behavior:'smooth',block:'start'}),60);
  }

  async function copySummary(){
    const r=resultOrError();
    if(!r) return;
    const text=[
      'PROJETO DE APOSENTADORIA',
      r.input.client?`Cliente: ${r.input.client}`:'',
      '',
      `Carta contratada: ${brl(r.input.credit)}`,
      `Parcela reduzida após contratação: ${brl(r.input.reducedPayment)}`,
      `Parcela cheia automática: ${brl(r.input.fullPayment)}`,
      `Contemplação simulada: mês ${r.input.contemplation}`,
      `1ª parcela após contemplação: ${brl(r.firstFullAfterCont)}`,
      `Total pago em parcelas até o fim: ${brl(r.totalPaid)}`,
      '',
      `Crédito corrigido na contemplação: ${brl(r.capitalAtCont)}`,
      `Saldo projetado da aplicação no encerramento: ${brl(r.finalCapital)}`,
      `Renda mensal projetada a ${pct(r.input.monthly*100,2)} a.m.: ${brl(r.projectedMonthlyIncome)}`,
      '',
      `Memória: diferença de ${brl(r.baseShortfall)} × ${r.input.contemplation} meses = ${brl(r.deferredAtCont)}; dividida por ${r.remainingMonths} meses = ${brl(r.redistributedPerMonth)}/mês.`,
      '',
      'O total pago considera a parcela cheia automática, reajustada anualmente durante todo o prazo do grupo.',
      'Projeção matemática para planejamento. A contemplação e a rentabilidade futura não são garantidas.'
    ].filter(Boolean).join('\n');
    try{await navigator.clipboard.writeText(text);}catch(_e){}
    if($('aposMessage')){$('aposMessage').textContent='Resumo executivo copiado.';$('aposMessage').hidden=false;}
  }

  function escapeHtml(text){
    return String(text??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  function openPdf(){
    const r=resultOrError();
    if(!r) return;
    const w=window.open('','_blank');
    if(!w){
      if($('aposMessage')){$('aposMessage').textContent='O navegador bloqueou o relatório. Libere pop-ups e tente novamente.';$('aposMessage').hidden=false;}
      return;
    }
    const client=escapeHtml(r.input.client||'Não informado');
    const date=new Date().toLocaleDateString('pt-BR');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Projeto de Aposentadoria</title><style>
      @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#e9edf1;color:#18222d;font-family:Arial,Helvetica,sans-serif}.report{width:196mm;margin:8px auto;background:#fff;box-shadow:0 10px 28px rgba(18,30,42,.12);overflow:hidden}.top{padding:9mm 10mm 7mm;background:#14202b;color:#fff;display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid #ff8a00}.brand{display:flex;align-items:center;gap:10px}.logo{width:40px;height:40px;border-radius:10px;background:#ff8a00;display:grid;place-items:center;font-weight:900}.top h1{margin:0;font-size:21px}.top p{margin:3px 0 0;color:#b8c4cf;font-size:8px}.date{text-align:right;font-size:8px;color:#b8c4cf}.date b{color:#fff;font-size:10px}.body{padding:7mm 10mm}.intro{padding:8px 10px;border:1px solid #dce3e8;background:#f7f9fb;border-radius:9px;font-size:9px;line-height:1.4}.section{margin-top:9px}.title{font-size:12px;font-weight:800;margin-bottom:5px;border-left:4px solid #ff8a00;padding-left:6px}.flow{display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;gap:6px}.credit{display:grid;grid-template-columns:1fr 20px 1fr 20px 1fr;align-items:center;gap:4px}.step{border:1px solid #dce3e8;border-radius:9px;padding:8px;text-align:center;min-height:55px;display:flex;flex-direction:column;justify-content:center}.step span,.card span,.premise span{font-size:7px;text-transform:uppercase;color:#687581;font-weight:700}.step b{margin-top:4px;font-size:15px}.arrow{text-align:center;color:#ff8a00;font-size:18px;font-weight:900}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}.card{border:1px solid #dce3e8;border-radius:9px;padding:9px;background:#f9fbfc;min-height:60px}.card b{display:block;margin-top:4px;font-size:15px}.highlight{border-color:#92cfa3;background:#f0faf3}.highlight b{color:#218743;font-size:18px}.memory{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.premise{border:1px solid #e1e6ea;border-radius:7px;padding:6px 8px}.premise b{display:block;margin-top:2px;font-size:10px}.fine{margin-top:8px;padding-top:6px;border-top:1px solid #dfe5e9;color:#65717c;font-size:6.5px;line-height:1.35}.printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:9px;padding:11px 14px;font-weight:800}.print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}@media(max-width:760px){body{background:#fff}.report{width:100%;margin:0}.top{padding:18px 14px}.body{padding:14px}.metrics,.memory,.flow,.credit{grid-template-columns:1fr}.arrow{transform:rotate(90deg)}.date{display:none}}@media print{body{background:#fff}.report{width:auto;margin:0;box-shadow:none}.printbar{display:none}.top,.intro,.section,.metrics,.flow,.credit,.memory,.fine{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="report"><div class="top"><div class="brand"><div class="logo">SC</div><div><h1>Projeto de Aposentadoria</h1><p>Projeção financeira com memória de cálculo</p></div></div><div class="date">Emitido em<br><b>${date}</b></div></div><div class="body"><div class="intro"><b>Cliente:</b> ${client} · <b>Carta:</b> ${brl(r.input.credit)} · <b>Prazo:</b> ${r.input.term} meses · <b>Contemplação simulada:</b> mês ${r.input.contemplation}. Parcela cheia automática: <b>${brl(r.input.fullPayment)}</b>.</div><div class="section"><div class="title">Fluxo da parcela</div><div class="flow"><div class="step"><span>Parcela reduzida após contratação</span><b>${brl(r.input.reducedPayment)}</b></div><div class="arrow">→</div><div class="step"><span>1ª parcela após contemplação</span><b>${brl(r.firstFullAfterCont)}</b></div></div></div><div class="section"><div class="title">Resumo do projeto</div><div class="metrics"><div class="card"><span>Total pago em parcelas até o fim</span><b>${brl(r.totalPaid)}</b></div><div class="card highlight"><span>Saldo da aplicação no encerramento</span><b>${brl(r.finalCapital)}</b></div><div class="card highlight"><span>Renda mensal projetada</span><b>${brl(r.projectedMonthlyIncome)}/mês</b></div><div class="card"><span>Crédito corrigido na contemplação</span><b>${brl(r.capitalAtCont)}</b></div></div></div><div class="section"><div class="title">Memória da parcela pós-contemplação</div><div class="memory"><div class="premise"><span>Parcela cheia</span><b>${brl(r.input.fullPayment)}</b></div><div class="premise"><span>Diferença mensal</span><b>${brl(r.baseShortfall)}</b></div><div class="premise"><span>Acumulado até contemplação</span><b>${brl(r.deferredAtCont)}</b></div><div class="premise"><span>Redistribuição mensal</span><b>${brl(r.redistributedPerMonth)}</b></div></div></div><div class="section"><div class="title">Caminho do crédito</div><div class="credit"><div class="step"><span>Carta contratada</span><b>${brl(r.input.credit)}</b></div><div class="arrow">→</div><div class="step"><span>Crédito no mês ${r.input.contemplation}</span><b>${brl(r.capitalAtCont)}</b></div><div class="arrow">→</div><div class="step"><span>Saldo da aplicação no fim</span><b>${brl(r.finalCapital)}</b></div></div></div><div class="fine"><b>Importante:</b> o total pago considera a parcela cheia automática, reajustada anualmente durante todo o prazo. A parcela pós-contemplação usa a diferença acumulada dividida pelo prazo restante. Projeção matemática para planejamento; contemplação e rentabilidade futura não são garantidas.</div></div></div><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
    w.document.close();
  }

  function patchFields(view){
    ensureFullPaymentField();

    const reduced=$('aposParcela');
    const field=reduced?.closest('.field');
    if(field){
      const label=field.querySelector('label');
      if(label) label.textContent='Parcela reduzida automática';
      reduced.readOnly=true;
      reduced.setAttribute('aria-readonly','true');
      let small=field.querySelector('small');
      if(!small){small=document.createElement('small');field.appendChild(small);}
      small.textContent='Calculada automaticamente: (50% da carta + taxa administrativa total) ÷ prazo.';
    }

    const pre=$('aposParcelaPre')?.closest('.field');
    if(pre) pre.hidden=true;
    const separateIncome=$('aposRendaMensal')?.closest('.field');
    if(separateIncome) separateIncome.hidden=true;
    const oldAdmin=$('aposTaxaAdmin')?.closest('.field');
    if(oldAdmin) oldAdmin.remove();

    const ref=view.querySelector('.apos-reference');
    if(ref){
      const admin=(currentAdminRate()*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2});
      ref.innerHTML=`<div><span>Parcelas</span><strong>Cálculo automático</strong></div><div><span>Taxa administrativa</span><strong>${admin}% total</strong></div><div><span>Aplicação após contemplação</span><strong>${num('aposRendimento',1).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.m.</strong></div>`;
    }

    const heroLead=view.querySelector('.apos-hero .lead');
    if(heroLead) heroLead.textContent='Informe a carta e o prazo. As parcelas reduzida e cheia são calculadas automaticamente pela taxa administrativa configurada.';

    const footer=view.querySelector('.assumption-footer');
    if(footer) footer.textContent='As parcelas base são automáticas. O reajuste anual é aplicado ao fluxo ao longo do prazo para calcular a projeção.';
  }

  function patchButtons(){
    const calc=$('aposCalcularBtn');
    if(calc){
      const fresh=calc.cloneNode(true);calc.replaceWith(fresh);
      fresh.textContent='Calcular projeto';
      fresh.addEventListener('click',()=>{const r=resultOrError();if(r) render(r);});
    }

    const actions=document.querySelector('#view-aposentadoria .apos-actions');
    if(actions){
      actions.style.gridTemplateColumns='1fr 1fr';
      let pdf=$('aposPdfBtn');
      if(!pdf){
        pdf=document.createElement('button');
        pdf.id='aposPdfBtn';pdf.className='action-button';pdf.type='button';pdf.innerHTML='<span>▣</span>Gerar PDF';
        actions.insertBefore(pdf,actions.firstChild);
      }
      const freshPdf=pdf.cloneNode(true);pdf.replaceWith(freshPdf);freshPdf.addEventListener('click',openPdf);
    }

    const copy=$('aposCopiarBtn');
    if(copy){
      const fresh=copy.cloneNode(true);copy.replaceWith(fresh);fresh.addEventListener('click',copySummary);
    }
  }

  function bindMoney(){
    const credit=$('aposCredito');
    if(credit){
      credit.addEventListener('input',syncAutomaticPayments);
      credit.addEventListener('blur',()=>{
        const n=parseMoney(credit.value);
        if(n>0) credit.value=formatMoneyInput(n);
        syncAutomaticPayments();
      });
    }
    const term=$('aposPrazo');
    if(term){
      term.addEventListener('input',syncAutomaticPayments);
      term.addEventListener('change',syncAutomaticPayments);
    }
    const cfgRate=$('cfgTaxa');
    if(cfgRate){
      cfgRate.addEventListener('input',syncAutomaticPayments);
      cfgRate.addEventListener('change',syncAutomaticPayments);
    }
    syncAutomaticPayments();
  }

  function migrateDefaults(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(_e){}
    if(saved){
      if($('aposPrazo')&&saved.term) $('aposPrazo').value=String(saved.term);
      if($('aposReajuste')&&Number.isFinite(saved.annual)) $('aposReajuste').value=Number(saved.annual).toFixed(2);
      if($('aposRendimento')&&Number.isFinite(saved.monthly)) $('aposRendimento').value=Number(saved.monthly).toFixed(2);
    }

    if($('aposPrazo')&&Number($('aposPrazo').value)===180) $('aposPrazo').value='220';
    if($('aposRendimento')&&!$('aposRendimento').value) $('aposRendimento').value='1.00';
    syncAutomaticPayments();
    try{localStorage.setItem(MIGRATION_KEY,'1');}catch(_e){}
  }

  function injectStyles(){
    if($('apos-v15-styles')) return;
    const style=document.createElement('style');
    style.id='apos-v15-styles';
    style.textContent=`
      #view-aposentadoria input[readonly]{opacity:.9;cursor:not-allowed;background:#0b1219;border-color:#33475a} 
      #view-aposentadoria .apos-parcela-principal{margin-top:10px;border:1px solid #42566b;background:linear-gradient(145deg,#101a24,#0d141c);border-radius:16px;padding:12px;grid-template-columns:1fr auto 1fr}
      #view-aposentadoria .apos-parcela-principal>div:not(.apos-arrow){background:#111b25}
      #view-aposentadoria .apos-kpi>div small{display:block;margin-top:6px;color:var(--muted);font-size:9px;line-height:1.35}
      #view-aposentadoria .apos-kpi .apos-highlight strong{font-size:25px}
      #view-aposentadoria .apos-memory{margin-top:8px;border:1px solid #33485d;border-radius:12px;background:#0d151e;color:#c9d2da;overflow:hidden}
      #view-aposentadoria .apos-memory summary{cursor:pointer;padding:10px 12px;font-size:10px;font-weight:800;color:#dfe7ee}
      #view-aposentadoria #aposMemoryBody{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:0 10px 10px}
      #view-aposentadoria #aposMemoryBody>div{padding:8px;border:1px solid #25384a;border-radius:9px;background:#101b25}
      #view-aposentadoria #aposMemoryBody span{display:block;color:#8fa0ae;font-size:8px;text-transform:uppercase}
      #view-aposentadoria #aposMemoryBody strong{display:block;margin-top:3px;font-size:12px;color:#fff}
      #view-aposentadoria .field small{display:block;margin-top:5px;color:var(--muted);font-size:8px;line-height:1.35}
      @media(max-width:680px){#view-aposentadoria .apos-parcela-principal{padding:10px;grid-template-columns:1fr}.apos-parcela-principal .apos-arrow{transform:rotate(90deg)}#view-aposentadoria #aposMemoryBody{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function wait(){
    const view=$('view-aposentadoria');
    if(!view||view.dataset.presentationPolished!=='1'){setTimeout(wait,70);return;}
    if(view.dataset.calculationCorrected==='v15') return;
    view.dataset.calculationCorrected='v15';
    patchFields(view);
    migrateDefaults();
    patchButtons();
    bindMoney();
    injectStyles();
  }

  wait();
})();