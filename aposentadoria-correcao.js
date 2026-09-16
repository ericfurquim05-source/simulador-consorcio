(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'simulador-aposentadoria-financeira-v8';
  const MIGRATION_KEY = 'simulador-aposentadoria-financeira-v8-migrated';

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
  function phaseCycles(month,startMonth){ return Math.max(0,Math.floor(Math.max(0,month-startMonth)/12)); }
  function adjustedCredit(base,rate,month){ return base*Math.pow(1+rate,creditCycles(month)); }

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
    if(reducedPayment<=0) throw new Error('Informe a parcela após contratação.');
    if(term<2||term>360) throw new Error('Informe um prazo entre 2 e 360 meses.');
    if(contemplation<1||contemplation>=term) throw new Error('A contemplação precisa ocorrer antes do fim do grupo.');

    return {client,credit,reducedPayment,term,contemplation,annual,adminRate,monthly};
  }

  function calculate(input){
    const contractualTotal=input.credit*(1+input.adminRate);
    const fullBasePayment=contractualTotal/input.term;
    const remainingMonths=input.term-input.contemplation;

    // Regra comercial definida para a parcela pós-contemplação:
    // parcela cheia atual + saldo pago a menor distribuído no prazo restante.
    const monthlyShortfall=Math.max(0,fullBasePayment-input.reducedPayment);
    const deferredAtCont=monthlyShortfall*input.contemplation;
    const redistributedPerMonth=remainingMonths>0?deferredAtCont/remainingMonths:0;
    const firstFullAfterCont=fullBasePayment+redistributedPerMonth;

    const capitalAtCont=adjustedCredit(input.credit,input.annual,input.contemplation);
    const investmentMonths=remainingMonths;
    const finalCapital=capitalAtCont*Math.pow(1+input.monthly,investmentMonths);
    const projectedMonthlyIncome=finalCapital*input.monthly;

    let totalPaid=0;
    const cumulative=[];
    const monthPayments=[];

    for(let m=1;m<=input.contemplation;m++){
      const payment=input.reducedPayment*Math.pow(1+input.annual,phaseCycles(m,1));
      totalPaid+=payment;
      monthPayments[m]=payment;
      cumulative[m]=totalPaid;
    }

    const paidUntilCont=totalPaid;

    for(let m=input.contemplation+1;m<=input.term;m++){
      const payment=firstFullAfterCont*Math.pow(1+input.annual,phaseCycles(m,input.contemplation+1));
      totalPaid+=payment;
      monthPayments[m]=payment;
      cumulative[m]=totalPaid;
    }

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
      input,contractualTotal,fullBasePayment,monthlyShortfall,deferredAtCont,remainingMonths,
      redistributedPerMonth,firstFullAfterCont,capitalAtCont,investmentMonths,finalCapital,
      projectedMonthlyIncome,totalPaid,paidUntilCont,timeline
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

    if($('aposHeadline')) $('aposHeadline').textContent=result.input.client
      ? `Projeto de aposentadoria · ${result.input.client}`
      : 'Projeto de aposentadoria';

    const firstPanel=out.querySelector(':scope > .panel');
    const resultLead=firstPanel?.querySelector('.section-heading .lead');
    if(resultLead) resultLead.textContent='Uma leitura simples do plano: parcela após contratação, parcela após contemplação, total pago, saldo da aplicação e renda mensal projetada.';

    const kpi=out.querySelector('.apos-kpi');
    if(kpi){
      kpi.innerHTML=`
        <div><span>Total pago em parcelas até o fim</span><strong>${brl(result.totalPaid)}</strong></div>
        <div class="apos-highlight"><span>Saldo projetado da aplicação no encerramento</span><strong>${brl(result.finalCapital)}</strong></div>
        <div class="apos-highlight"><span>Renda mensal projetada a ${pct(result.input.monthly*100,2)} a.m.</span><strong>${brl(result.projectedMonthlyIncome)}/mês</strong></div>
        <div><span>Patrimônio que permanece aplicado</span><strong>${brl(result.finalCapital)}</strong><small>Se o rendimento mensal continuar cobrindo a retirada.</small></div>`;
    }

    const journeys=firstPanel?.querySelectorAll('.apos-journey');
    const creditJourney=journeys?.[0];
    if(creditJourney){
      const labels=creditJourney.querySelectorAll('span');
      const values=creditJourney.querySelectorAll('strong');
      if(labels[0]) labels[0].textContent='Carta contratada';
      if(labels[1]) labels[1].textContent=`Capital aplicado no mês ${result.input.contemplation}`;
      if(labels[2]) labels[2].textContent='Saldo no fim do grupo';
      if(values[0]) values[0].textContent=brl(result.input.credit);
      if(values[1]) values[1].textContent=brl(result.capitalAtCont);
      if(values[2]) values[2].textContent=brl(result.finalCapital);
    }

    let parcelJourney=firstPanel?.querySelector('.apos-parcela-principal');
    if(!parcelJourney){
      const technical=firstPanel?.querySelector('.apos-technical-details');
      const existing=technical?.querySelector('.apos-journey');
      if(existing){
        parcelJourney=existing;
        parcelJourney.classList.add('apos-parcela-principal');
        creditJourney?.insertAdjacentElement('afterend',parcelJourney);
        if(!technical.querySelector('.apos-journey')) technical.remove();
      }else if(creditJourney){
        parcelJourney=document.createElement('div');
        parcelJourney.className='apos-journey apos-parcela-principal';
        creditJourney.insertAdjacentElement('afterend',parcelJourney);
      }
    }
    if(parcelJourney){
      parcelJourney.innerHTML=`
        <div><span>Parcela após contratação</span><strong>${brl(result.input.reducedPayment)}</strong></div>
        <div class="apos-arrow">→</div>
        <div><span>1ª parcela após contemplação</span><strong>${brl(result.firstFullAfterCont)}</strong></div>`;
    }

    const detail=out.querySelector('.apos-detail-grid');
    if(detail){
      const cards=detail.querySelectorAll(':scope > div');
      if(cards[0]) cards[0].innerHTML=`<span>Contemplação simulada</span><strong>Mês ${result.input.contemplation}</strong>`;
      if(cards[1]) cards[1].innerHTML=`<span>Tempo com o capital aplicado</span><strong>${result.investmentMonths} meses</strong>`;
      if(cards[2]) cards[2].innerHTML=`<span>Aplicação financeira utilizada</span><strong>${pct(result.input.monthly*100,2)} a.m.</strong>`;
      if(cards[3]) cards[3].innerHTML=`<span>Reajuste anual do plano</span><strong>${pct(result.input.annual*100,1)} a.a.</strong>`;
    }

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
      `Parcela após contratação: ${brl(r.input.reducedPayment)}`,
      `Contemplação simulada: mês ${r.input.contemplation}`,
      `1ª parcela após contemplação: ${brl(r.firstFullAfterCont)}`,
      `Total pago em parcelas até o fim: ${brl(r.totalPaid)}`,
      '',
      `Capital aplicado na contemplação: ${brl(r.capitalAtCont)}`,
      `Saldo projetado da aplicação no encerramento: ${brl(r.finalCapital)}`,
      `Renda mensal projetada a ${pct(r.input.monthly*100,2)} a.m.: ${brl(r.projectedMonthlyIncome)}`,
      `Patrimônio mantido aplicado: ${brl(r.finalCapital)}`,
      '',
      `Premissas: reajuste ${pct(r.input.annual*100,1)} a.a.; aplicação financeira ${pct(r.input.monthly*100,2)} a.m.; taxa administrativa total ${pct(r.input.adminRate*100,1)}.`,
      '',
      'A renda mensal é uma projeção condicionada à manutenção da rentabilidade informada. Contemplação e rentabilidade futura não são garantidas.'
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
      @page{size:A4 portrait;margin:7mm}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{margin:0;background:#e9edf1;color:#18222d;font-family:Arial,Helvetica,sans-serif}
      .report{width:196mm;margin:8px auto;background:#fff;box-shadow:0 10px 28px rgba(18,30,42,.12);overflow:hidden}
      .top{padding:9mm 10mm 7mm;background:linear-gradient(135deg,#0e1822,#172432);color:#fff;display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid #ff8a00}
      .brand{display:flex;align-items:center;gap:10px}.logo{width:40px;height:40px;border-radius:10px;background:#ff8a00;display:grid;place-items:center;font-weight:900}.top h1{margin:0;font-size:21px}.top p{margin:3px 0 0;color:#b8c4cf;font-size:8px}.date{text-align:right;font-size:8px;color:#b8c4cf}.date b{color:#fff;font-size:10px}
      .body{padding:7mm 10mm 7mm}.intro{padding:8px 10px;border:1px solid #dce3e8;background:#f7f9fb;border-radius:9px;font-size:9px;line-height:1.4;color:#45515d}
      .section{margin-top:10px}.title{display:flex;align-items:center;gap:6px;margin-bottom:6px}.title i{width:4px;height:14px;border-radius:6px;background:#ff8a00}.title h2{font-size:12px;margin:0}.sub{margin:2px 0 0 10px;color:#77828c;font-size:7px}
      .parcel-flow{display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;gap:6px}.step{border:1px solid #dce3e8;border-radius:9px;padding:9px;background:#fff;text-align:center;min-height:58px;display:flex;flex-direction:column;justify-content:center}.step span{font-size:7px;color:#687581;text-transform:uppercase;font-weight:700}.step b{margin-top:4px;font-size:16px}.arrow{text-align:center;color:#ff8a00;font-size:20px;font-weight:900}
      .metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}.card{border:1px solid #dce3e8;border-radius:9px;padding:9px;background:#f9fbfc;min-height:62px}.card span{display:block;font-size:7px;text-transform:uppercase;color:#6b7884;font-weight:700}.card b{display:block;margin-top:4px;font-size:15px}.card.highlight{border-color:#92cfa3;background:#f0faf3}.card.highlight b{color:#218743;font-size:18px}.card small{display:block;margin-top:3px;color:#738078;font-size:6.5px}
      .credit-flow{display:grid;grid-template-columns:1fr 22px 1fr 22px 1fr;align-items:center;gap:4px}.credit-flow .step{min-height:52px;padding:7px 5px}.credit-flow .step b{font-size:12px}.credit-flow .arrow{font-size:16px}
      .premises{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.premise{border:1px solid #e1e6ea;border-radius:7px;padding:6px 8px;background:#fbfcfd}.premise span{display:block;font-size:6.5px;text-transform:uppercase;color:#75818c;font-weight:700}.premise b{display:block;margin-top:2px;font-size:10px}
      .fine{margin-top:9px;padding-top:6px;border-top:1px solid #dfe5e9;color:#65717c;font-size:6.6px;line-height:1.35}.printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:9px;padding:11px 14px;font-weight:800}.print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}
      @media(max-width:760px){body{background:#fff}.report{width:100%;margin:0}.top{padding:18px 14px}.body{padding:14px}.metrics,.premises{grid-template-columns:1fr}.parcel-flow,.credit-flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg)}.date{display:none}}
      @media print{body{background:#fff}.report{width:auto;margin:0;box-shadow:none}.printbar{display:none}.top,.intro,.section,.metrics,.parcel-flow,.credit-flow,.premises,.fine{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="report">
      <div class="top"><div class="brand"><div class="logo">SC</div><div><h1>Projeto de Aposentadoria</h1><p>Formação de patrimônio e renda mensal projetada</p></div></div><div class="date">Emitido em<br><b>${date}</b></div></div>
      <div class="body">
        <div class="intro"><b>Cliente:</b> ${client} · <b>Carta:</b> ${brl(r.input.credit)} · <b>Prazo:</b> ${r.input.term} meses · <b>Contemplação simulada:</b> mês ${r.input.contemplation}. Aplicação projetada a ${pct(r.input.monthly*100,2)} a.m. após a contemplação.</div>
        <div class="section"><div class="title"><i></i><div><h2>Fluxo da parcela</h2><div class="sub">Valor inicial e primeira parcela após a contemplação.</div></div></div><div class="parcel-flow"><div class="step"><span>Parcela após contratação</span><b>${brl(r.input.reducedPayment)}</b></div><div class="arrow">→</div><div class="step"><span>1ª parcela após contemplação</span><b>${brl(r.firstFullAfterCont)}</b></div></div></div>
        <div class="section"><div class="title"><i></i><div><h2>Resumo do projeto</h2></div></div><div class="metrics"><div class="card"><span>Total pago em parcelas até o fim</span><b>${brl(r.totalPaid)}</b></div><div class="card highlight"><span>Saldo da aplicação no encerramento</span><b>${brl(r.finalCapital)}</b></div><div class="card highlight"><span>Renda mensal projetada a ${pct(r.input.monthly*100,2)} a.m.</span><b>${brl(r.projectedMonthlyIncome)}/mês</b></div><div class="card"><span>Patrimônio mantido aplicado</span><b>${brl(r.finalCapital)}</b><small>Se o rendimento continuar cobrindo a retirada.</small></div></div></div>
        <div class="section"><div class="title"><i></i><div><h2>Caminho do crédito</h2></div></div><div class="credit-flow"><div class="step"><span>Carta contratada</span><b>${brl(r.input.credit)}</b></div><div class="arrow">→</div><div class="step"><span>Capital aplicado no mês ${r.input.contemplation}</span><b>${brl(r.capitalAtCont)}</b></div><div class="arrow">→</div><div class="step"><span>Saldo no fim do grupo</span><b>${brl(r.finalCapital)}</b></div></div></div>
        <div class="section"><div class="title"><i></i><div><h2>Premissas</h2></div></div><div class="premises"><div class="premise"><span>Reajuste anual</span><b>${pct(r.input.annual*100,1)} a.a.</b></div><div class="premise"><span>Aplicação financeira</span><b>${pct(r.input.monthly*100,2)} a.m.</b></div><div class="premise"><span>Taxa administrativa</span><b>${pct(r.input.adminRate*100,1)}</b></div></div></div>
        <div class="fine"><b>Importante:</b> projeção matemática para planejamento. Contemplação e rentabilidade não são garantidas. Para retirar a renda mensal sem consumir o patrimônio nominal, a rentabilidade precisa continuar suficiente para cobrir a retirada.</div>
      </div>
    </div><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
    w.document.close();
  }

  function patchFields(view){
    const payment=$('aposParcela');
    const field=payment?.closest('.field');
    if(field){
      const label=field.querySelector('label');
      if(label) label.textContent='Parcela após contratação';
      let small=field.querySelector('small');
      if(!small){small=document.createElement('small');field.appendChild(small);}
      small.textContent='Valor da parcela reduzida que começa a ser paga após a contratação.';
    }

    const oldFull=$('aposParcelaCheia')?.closest('.field');
    if(oldFull) oldFull.remove();

    const assumptions=view.querySelector('.assumptions-grid');
    if(assumptions && !$('aposTaxaAdmin')){
      const admin=document.createElement('div');
      admin.className='field';
      admin.innerHTML=`<label for="aposTaxaAdmin">Taxa administrativa total</label><div class="control"><input id="aposTaxaAdmin" type="number" value="${num('cfgTaxa',24.2).toFixed(2)}" step="0.1" min="0"><span>%</span></div><small>Usada para calcular a parcela cheia atual.</small>`;
      assumptions.appendChild(admin);
    }

    const pre=$('aposParcelaPre')?.closest('.field');
    if(pre) pre.hidden=true;
    const separateIncome=$('aposRendaMensal')?.closest('.field');
    if(separateIncome) separateIncome.hidden=true;

    const ref=view.querySelector('.apos-reference');
    if(ref){
      ref.innerHTML=`<div><span>Reajuste do plano</span><strong>${num('aposReajuste',6).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.a.</strong></div><div><span>Aplicação financeira após contemplação</span><strong>${num('aposRendimento',1).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.m.</strong></div><div><span>Renda mensal no encerramento</span><strong>Mesmo rendimento da aplicação</strong></div>`;
    }
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
    const term=$('aposPrazo');
    if(term && Number(term.value)===180) term.value='220';
    if($('aposRendimento')) $('aposRendimento').value='1.00';
    try{localStorage.setItem(MIGRATION_KEY,'1');}catch(_e){}
  }

  function injectStyles(){
    if(document.getElementById('apos-v8-styles')) return;
    const style=document.createElement('style');
    style.id='apos-v8-styles';
    style.textContent=`
      #view-aposentadoria .apos-parcela-principal{margin-top:10px;border:1px solid #42566b;background:linear-gradient(145deg,#101a24,#0d141c);border-radius:16px;padding:12px;grid-template-columns:1fr auto 1fr}
      #view-aposentadoria .apos-parcela-principal>div:not(.apos-arrow){background:#111b25}
      #view-aposentadoria .apos-kpi>div small{display:block;margin-top:6px;color:var(--muted);font-size:9px;line-height:1.35}
      #view-aposentadoria .apos-kpi .apos-highlight strong{font-size:25px}
      @media(max-width:680px){#view-aposentadoria .apos-parcela-principal{padding:10px;grid-template-columns:1fr}.apos-parcela-principal .apos-arrow{transform:rotate(90deg)}}
    `;
    document.head.appendChild(style);
  }

  function wait(){
    const view=$('view-aposentadoria');
    if(!view || view.dataset.presentationPolished!=='1'){setTimeout(wait,70);return;}
    if(view.dataset.calculationCorrected==='v8') return;
    view.dataset.calculationCorrected='v8';
    patchFields(view);
    migrateDefaults();
    patchButtons();
    bindMoney();
    injectStyles();
  }

  wait();
})();