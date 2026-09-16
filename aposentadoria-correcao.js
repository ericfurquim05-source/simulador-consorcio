(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'simulador-aposentadoria-financeira-v4';
  const MIGRATION_KEY = 'simulador-aposentadoria-financeira-v4-migrated';

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
  function creditCycles(month){ return Math.max(0,Math.floor(Math.max(0,month)/12)); }
  function paymentCycles(month){ return Math.max(0,Math.floor((Math.max(1,month)-1)/12)); }
  function adjustedCredit(base,rate,month){ return base*Math.pow(1+rate,creditCycles(month)); }
  function adjustedReduced(base,rate,month){ return base*Math.pow(1+rate,paymentCycles(month)); }

  function read(){
    const credit=parseMoney($('aposCredito')?.value);
    const reducedPayment=parseMoney($('aposParcela')?.value);
    const term=Math.round(num('aposPrazo',220));
    const contemplation=Math.round(num('aposContemplacao',60));
    const annual=clamp(num('aposReajuste',6),0,100)/100;
    const adminRate=clamp(num('aposTaxaAdmin',num('cfgTaxa',24.2)),0,300)/100;
    const monthly=clamp(num('aposRendimento',1),0,100)/100;
    const client=($('aposCliente')?.value||'').trim();

    if(credit<=0) throw new Error('Informe o valor da carta.');
    if(reducedPayment<=0) throw new Error('Informe a parcela reduzida inicial.');
    if(term<2||term>360) throw new Error('Informe um prazo entre 2 e 360 meses.');
    if(contemplation<1||contemplation>=term) throw new Error('A contemplação precisa ocorrer antes do fim do grupo.');

    return {client,credit,reducedPayment,term,contemplation,annual,adminRate,monthly};
  }

  function calculate(input){
    const contractualTotal=input.credit*(1+input.adminRate);
    const fullBasePayment=contractualTotal/input.term;
    const contCycle=creditCycles(input.contemplation);
    const fullPaymentAtContBase=fullBasePayment*Math.pow(1+input.annual,contCycle);
    const capitalAtCont=adjustedCredit(input.credit,input.annual,input.contemplation);
    const investmentMonths=Math.max(0,input.term-input.contemplation);
    const finalCapital=capitalAtCont*Math.pow(1+input.monthly,investmentMonths);
    const projectedMonthlyReturn=finalCapital*input.monthly;

    let paidUntilCont=0;
    let deferredAtCont=0;
    const cumulative=[];
    const monthPayments=[];

    for(let m=1;m<=input.contemplation;m++){
      const cycle=paymentCycles(m);
      const reduced=adjustedReduced(input.reducedPayment,input.annual,m);
      const theoreticalFull=fullBasePayment*Math.pow(1+input.annual,cycle);
      const shortfall=Math.max(0,theoreticalFull-reduced);
      const forwardFactor=Math.pow(1+input.annual,Math.max(0,contCycle-cycle));
      deferredAtCont+=shortfall*forwardFactor;
      paidUntilCont+=reduced;
      monthPayments[m]=reduced;
      cumulative[m]=paidUntilCont;
    }

    const remainingMonths=input.term-input.contemplation;
    const redistributedPerMonth=remainingMonths>0?deferredAtCont/remainingMonths:0;
    const firstFullAfterCont=fullPaymentAtContBase+redistributedPerMonth;

    let totalPaid=paidUntilCont;
    for(let m=input.contemplation+1;m<=input.term;m++){
      const cycleDelta=Math.max(0,paymentCycles(m)-contCycle);
      const payment=firstFullAfterCont*Math.pow(1+input.annual,cycleDelta);
      totalPaid+=payment;
      monthPayments[m]=payment;
      cumulative[m]=totalPaid;
    }

    const paymentAtCont=adjustedReduced(input.reducedPayment,input.annual,input.contemplation);
    const finalPayment=monthPayments[input.term]||firstFullAfterCont;
    const applicationGain=finalCapital-capitalAtCont;
    const netDifference=finalCapital-totalPaid;
    const ratio=totalPaid>0?finalCapital/totalPaid:0;

    const months=[];
    for(let m=12;m<input.term;m+=12) months.push(m);
    [input.contemplation,input.contemplation+1,input.term].forEach(m=>{
      if(m>=1&&m<=input.term&&!months.includes(m)) months.push(m);
    });
    months.sort((a,b)=>a-b);

    const timeline=months.map(m=>({
      month:m,
      credit:adjustedCredit(input.credit,input.annual,m),
      payment:monthPayments[m]||0,
      paid:cumulative[m]||totalPaid,
      invested:m<input.contemplation?0:capitalAtCont*Math.pow(1+input.monthly,Math.max(0,m-input.contemplation)),
      isCont:m===input.contemplation,
      isFirstFull:m===input.contemplation+1,
      isEnd:m===input.term
    }));

    return {
      input,contractualTotal,fullBasePayment,fullPaymentAtContBase,deferredAtCont,redistributedPerMonth,
      capitalAtCont,investmentMonths,finalCapital,projectedMonthlyReturn,totalPaid,paidUntilCont,paymentAtCont,
      firstFullAfterCont,finalPayment,applicationGain,netDifference,ratio,timeline
    };
  }

  function resultOrError(){
    try{
      const input=read();
      const result=calculate(input);
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify({adminRate:input.adminRate*100}));}catch(_e){}
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

  function render(result){
    const out=$('aposResultado');
    if(!out) return;
    out.hidden=false;

    const kpi=out.querySelector('.apos-kpi');
    if(kpi){
      const cards=kpi.querySelectorAll(':scope > div');
      if(cards[0]){cards[0].querySelector('span').textContent='Carta contratada';cards[0].querySelector('strong').textContent=brl(result.input.credit);}
      if(cards[1]){cards[1].querySelector('span').textContent='Total pago no grupo';cards[1].querySelector('strong').textContent=brl(result.totalPaid);}
      if(cards[2]){cards[2].querySelector('span').textContent='Patrimônio projetado no fim';cards[2].querySelector('strong').textContent=brl(result.finalCapital);}
      if(cards[3]){cards[3].querySelector('span').textContent='Patrimônio final − total pago';cards[3].querySelector('strong').textContent=brl(result.netDifference);}
    }

    if($('aposResTotalPago')) $('aposResTotalPago').textContent=brl(result.input.credit);
    if($('aposResCartaContemplacao')) $('aposResCartaContemplacao').textContent=brl(result.totalPaid);
    if($('aposResCapitalFinal')) $('aposResCapitalFinal').textContent=brl(result.finalCapital);
    if($('aposResRenda')) $('aposResRenda').textContent=brl(result.netDifference);

    if($('aposResCartaHoje')) $('aposResCartaHoje').textContent=brl(result.input.credit);
    if($('aposResCartaMeio')) $('aposResCartaMeio').textContent=brl(result.capitalAtCont);
    if($('aposResCartaFim')) $('aposResCartaFim').textContent=brl(result.finalCapital);

    if($('aposResParcelaHoje')) $('aposResParcelaHoje').textContent=brl(result.input.reducedPayment);
    if($('aposResParcelaContemplacao')) $('aposResParcelaContemplacao').textContent=brl(result.firstFullAfterCont);
    if($('aposResParcelaFim')) $('aposResParcelaFim').textContent=brl(result.finalPayment);

    if($('aposResPagoContemplacao')) $('aposResPagoContemplacao').textContent=brl(result.capitalAtCont);
    if($('aposResMesesRendendo')) $('aposResMesesRendendo').textContent=`${result.investmentMonths} meses`;
    if($('aposResGanhoAplicacao')) $('aposResGanhoAplicacao').textContent=brl(result.applicationGain);
    if($('aposResEficiencia')) $('aposResEficiencia').textContent=`${brl(result.projectedMonthlyReturn)}/mês`;

    const detail=out.querySelector('.apos-detail-grid');
    if(detail){
      const labels=detail.querySelectorAll('span');
      if(labels[0]) labels[0].textContent='Capital aplicado na contemplação';
      if(labels[1]) labels[1].textContent='Tempo rendendo no banco';
      if(labels[2]) labels[2].textContent='Rendimento acumulado da aplicação';
      if(labels[3]) labels[3].textContent=`Rendimento mensal projetado a ${pct(result.input.monthly*100,2)} a.m.`;
    }

    if($('aposTimelineBody')){
      $('aposTimelineBody').innerHTML=result.timeline.map(item=>`<tr class="${item.isCont?'apos-milestone':''} ${item.isEnd?'apos-end':''}">
        <td>${rowLabel(item)}</td><td>${brl(item.credit)}</td><td>${brl(item.payment)}</td><td>${brl(item.paid)}</td><td>${item.invested?brl(item.invested):'—'}</td>
      </tr>`).join('');
    }

    if($('aposHeadline')) $('aposHeadline').textContent=result.input.client?`Projeto de aposentadoria · ${result.input.client}`:'Projeto de aposentadoria';

    const technical=document.querySelector('#view-aposentadoria .apos-technical-details .apos-journey');
    if(technical){
      const labels=technical.querySelectorAll('span');
      if(labels[0]) labels[0].textContent='Parcela reduzida inicial';
      if(labels[1]) labels[1].textContent='1ª parcela após contemplação';
      if(labels[2]) labels[2].textContent='Parcela projetada no fim';
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
      `Contemplação projetada: mês ${r.input.contemplation}`,
      `Capital aplicado na contemplação: ${brl(r.capitalAtCont)}`,
      `Total pago no grupo: ${brl(r.totalPaid)}`,
      `Patrimônio projetado no fim do grupo: ${brl(r.finalCapital)}`,
      `Patrimônio final menos total pago: ${brl(r.netDifference)}`,
      `Rendimento acumulado da aplicação: ${brl(r.applicationGain)}`,
      `Rendimento mensal projetado sobre o patrimônio final a ${pct(r.input.monthly*100,2)} a.m.: ${brl(r.projectedMonthlyReturn)}`,
      '',
      `Premissas: reajuste do crédito e parcelas de ${pct(r.input.annual*100)} a.a.; aplicação financeira de ${pct(r.input.monthly*100,2)} a.m.; taxa administrativa total de ${pct(r.input.adminRate*100)}.`,
      '',
      'Projeção matemática para planejamento. Contemplação e rentabilidade não são garantidas.'
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
      @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#eef1f4;color:#17202a;font-family:Arial,Helvetica,sans-serif}.report{width:190mm;margin:14px auto;background:#fff;padding:10mm;box-shadow:0 10px 35px rgba(0,0,0,.13)}.top{display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid #ff8a00;padding-bottom:12px}.logo{width:44px;height:44px;border-radius:12px;background:#ff8a00;color:#fff;display:grid;place-items:center;font-weight:900}.mark{display:flex;gap:10px;align-items:center}.top h1{margin:0;font-size:24px}.top p,.date{margin:4px 0 0;color:#687480;font-size:10px}.intro{margin-top:14px;padding:11px;border:1px solid #e1e6ea;background:#f6f8fa;border-radius:10px;font-size:12px;line-height:1.45}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.card{border:1px solid #dfe4e8;border-radius:10px;padding:12px;background:#f8fafb}.card span{display:block;font-size:9px;text-transform:uppercase;color:#6e7984;font-weight:700}.card b{display:block;margin-top:5px;font-size:20px}.highlight{border-color:#90d7a4;background:#f0fbf3}.highlight b{color:#248a42;font-size:23px}.journey{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:13px}.step{border:1px solid #dfe4e8;border-radius:10px;padding:12px;text-align:center}.step span{display:block;font-size:9px;color:#6e7984}.step b{display:block;margin-top:5px;font-size:16px}.arrow{color:#ff8a00;font-size:22px}.tech{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.fine{margin-top:15px;padding-top:9px;border-top:1px solid #dfe4e8;color:#5f6b76;font-size:9px;line-height:1.45}.printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:10px;padding:12px 15px;font-weight:800;cursor:pointer}.print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}@media(max-width:760px){body{background:#fff}.report{width:100%;margin:0;padding:14px;box-shadow:none}.metrics,.tech,.journey{grid-template-columns:1fr}.arrow{transform:rotate(90deg);text-align:center}}@media print{body{background:#fff}.report{width:auto;margin:0;padding:0;box-shadow:none}.printbar{display:none}}
    </style></head><body><div class="report"><div class="top"><div class="mark"><div class="logo">SC</div><div><h1>Projeto de Aposentadoria</h1><p>Aplicação financeira do crédito contemplado</p></div></div><div class="date">Emitido em<br><b>${date}</b></div></div><div class="intro"><b>Cliente:</b> ${client}<br>Projeção objetiva: quanto será pago ao longo do grupo e quanto o capital aplicado pode representar no encerramento.</div><div class="metrics"><div class="card"><span>Carta contratada</span><b>${brl(r.input.credit)}</b></div><div class="card"><span>Total pago no grupo</span><b>${brl(r.totalPaid)}</b></div><div class="card highlight"><span>Patrimônio projetado no fim</span><b>${brl(r.finalCapital)}</b></div><div class="card highlight"><span>Patrimônio final − total pago</span><b>${brl(r.netDifference)}</b></div></div><div class="journey"><div class="step"><span>Carta contratada</span><b>${brl(r.input.credit)}</b></div><div class="arrow">→</div><div class="step"><span>Capital aplicado no mês ${r.input.contemplation}</span><b>${brl(r.capitalAtCont)}</b></div><div class="arrow">→</div><div class="step"><span>Patrimônio final</span><b>${brl(r.finalCapital)}</b></div></div><div class="tech"><div class="card"><span>Tempo da aplicação</span><b>${r.investmentMonths} meses</b></div><div class="card"><span>Taxa usada na aplicação</span><b>${pct(r.input.monthly*100,2)} a.m.</b></div><div class="card"><span>Rendimento acumulado da aplicação</span><b>${brl(r.applicationGain)}</b></div><div class="card"><span>Rendimento mensal projetado no final</span><b>${brl(r.projectedMonthlyReturn)}/mês</b></div><div class="card"><span>1ª parcela pós-contemplação</span><b>${brl(r.firstFullAfterCont)}</b></div><div class="card"><span>Parcela projetada no fim</span><b>${brl(r.finalPayment)}</b></div></div><div class="fine"><b>Importante:</b> projeção matemática para planejamento. O cenário usa aplicação financeira de ${pct(r.input.monthly*100,2)} ao mês. Contemplação e rentabilidade não são garantidas, e a rentabilidade efetiva pode variar.</div></div><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
    w.document.close();
  }

  function patchFields(view){
    const payment=$('aposParcela');
    const paymentField=payment?.closest('.field');
    if(paymentField){
      const label=paymentField.querySelector('label');
      if(label) label.textContent='Parcela reduzida inicial';
      let small=paymentField.querySelector('small');
      if(!small){small=document.createElement('small');paymentField.appendChild(small);}
      small.textContent='Valor efetivamente pago antes da contemplação.';
    }

    const oldFull=$('aposParcelaCheia')?.closest('.field');
    if(oldFull) oldFull.remove();

    const assumptions=view.querySelector('.assumptions-grid');
    if(assumptions && !$('aposTaxaAdmin')){
      const field=document.createElement('div');
      field.className='field';
      field.innerHTML=`<label for="aposTaxaAdmin">Taxa administrativa total</label><div class="control"><input id="aposTaxaAdmin" type="number" value="${num('cfgTaxa',24.2).toFixed(2)}" step="0.1" min="0"><span>%</span></div><small>Usada para calcular a parcela cheia-base do plano.</small>`;
      assumptions.appendChild(field);
    }

    const pre=$('aposParcelaPre')?.closest('.field');
    if(pre) pre.hidden=true;
    const income=$('aposRendaMensal')?.closest('.field');
    if(income) income.hidden=true;

    const ref=view.querySelector('.apos-reference');
    if(ref){
      ref.innerHTML=`<div><span>Reajuste projetado</span><strong>${num('aposReajuste',6).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.a.</strong></div><div><span>Aplicação financeira após contemplação</span><strong>${num('aposRendimento',1).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.m.</strong></div><div><span>Objetivo</span><strong>Total pago × patrimônio final</strong></div>`;
    }

    const heroLead=view.querySelector('.apos-hero .lead');
    if(heroLead) heroLead.textContent='Veja, de forma simples, quanto será pago no grupo e quanto o crédito aplicado após a contemplação pode representar no final.';
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
    const el=$('aposParcela');
    if(el){
      el.addEventListener('focus',e=>e.target.select());
      el.addEventListener('blur',e=>{const n=parseMoney(e.target.value);if(n>0)e.target.value=formatMoneyInput(n);});
    }
  }

  function migrateDefaults(){
    let migrated=false;
    try{migrated=localStorage.getItem(MIGRATION_KEY)==='1';}catch(_e){}
    if(migrated) return;
    const reduced=$('aposParcela');
    const term=$('aposPrazo');
    if(reduced && parseMoney(reduced.value)>=500) reduced.value=formatMoneyInput(337.27);
    if(term && Number(term.value)===180) term.value='220';
    if($('aposRendimento')) $('aposRendimento').value='1.00';
    try{localStorage.setItem(MIGRATION_KEY,'1');}catch(_e){}
  }

  function wait(){
    const view=$('view-aposentadoria');
    if(!view || view.dataset.presentationPolished!=='1'){setTimeout(wait,70);return;}
    if(view.dataset.calculationCorrected==='v4') return;
    view.dataset.calculationCorrected='v4';
    patchFields(view);
    migrateDefaults();
    patchButtons();
    bindMoney();
  }

  wait();
})();