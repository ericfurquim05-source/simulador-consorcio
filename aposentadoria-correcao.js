(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'simulador-aposentadoria-correcao-v3';
  const MIGRATION_KEY = 'simulador-aposentadoria-correcao-v3-migrated';

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
    const n=Number(value)||0;
    return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
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
    const withdrawal=clamp(num('aposRendaMensal',0.5),0,100)/100;
    const client=($('aposCliente')?.value||'').trim();

    if(credit<=0) throw new Error('Informe o valor da carta.');
    if(reducedPayment<=0) throw new Error('Informe a parcela reduzida inicial.');
    if(term<2||term>360) throw new Error('Informe um prazo entre 2 e 360 meses.');
    if(contemplation<1||contemplation>=term) throw new Error('A contemplação precisa ocorrer antes do fim do grupo.');

    return {client,credit,reducedPayment,term,contemplation,annual,adminRate,monthly,withdrawal};
  }

  function calculate(input){
    const contractualTotal=input.credit*(1+input.adminRate);
    const fullBasePayment=contractualTotal/input.term;
    const contCycle=creditCycles(input.contemplation);
    const fullPaymentAtContBase=fullBasePayment*Math.pow(1+input.annual,contCycle);
    const capitalAtCont=adjustedCredit(input.credit,input.annual,input.contemplation);
    const investmentMonths=Math.max(0,input.term-input.contemplation);
    const finalCapital=capitalAtCont*Math.pow(1+input.monthly,investmentMonths);
    const monthlyIncome=finalCapital*input.withdrawal;

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
    const gain=finalCapital-capitalAtCont;
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
      capitalAtCont,investmentMonths,finalCapital,monthlyIncome,totalPaid,paidUntilCont,paymentAtCont,
      firstFullAfterCont,finalPayment,gain,ratio,timeline
    };
  }

  function saveInputs(input){
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify({adminRate:input.adminRate*100,withdrawal:input.withdrawal*100}));
    }catch(_e){}
  }

  function restoreInputs(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(_e){}
    if($('aposTaxaAdmin')) $('aposTaxaAdmin').value=Number(saved?.adminRate??num('cfgTaxa',24.2)).toFixed(2);
    if($('aposRendaMensal')) $('aposRendaMensal').value=Number(saved?.withdrawal??0.5).toFixed(2);
  }

  function migrateDefaults(){
    let migrated=false;
    try{migrated=localStorage.getItem(MIGRATION_KEY)==='1';}catch(_e){}
    if(migrated) return;
    const reduced=$('aposParcela');
    const term=$('aposPrazo');
    const withdrawal=$('aposRendaMensal');
    if(reduced && parseMoney(reduced.value)>=500) reduced.value=formatMoneyInput(337.27);
    if(term && Number(term.value)===180) term.value='220';
    if(withdrawal && Number(String(withdrawal.value).replace(',','.'))>=1) withdrawal.value='0.50';
    try{localStorage.setItem(MIGRATION_KEY,'1');}catch(_e){}
  }

  function updateCalculatedFullInfo(){
    const box=$('aposParcelaBaseInfo');
    if(!box) return;
    try{
      const credit=parseMoney($('aposCredito')?.value);
      const term=Math.max(1,Math.round(num('aposPrazo',220)));
      const admin=clamp(num('aposTaxaAdmin',num('cfgTaxa',24.2)),0,300)/100;
      const full=credit>0?credit*(1+admin)/term:0;
      box.textContent=`Parcela cheia-base calculada hoje: ${brl(full)}. Após a contemplação, o saldo não pago na fase reduzida é atualizado e redistribuído no prazo restante.`;
    }catch(_e){}
  }

  function rowLabel(item){
    if(item.isCont) return `Mês ${item.month} · última reduzida / contemplação`;
    if(item.isFirstFull) return `Mês ${item.month} · 1ª parcela pós-contemplação`;
    if(item.isEnd) return `Mês ${item.month} · fim do grupo`;
    return `Mês ${item.month}`;
  }

  function render(result){
    const out=$('aposResultado');
    if(!out) return;
    out.hidden=false;

    if($('aposResTotalPago')) $('aposResTotalPago').textContent=brl(result.totalPaid);
    if($('aposResCartaContemplacao')) $('aposResCartaContemplacao').textContent=brl(result.capitalAtCont);
    if($('aposResCapitalFinal')) $('aposResCapitalFinal').textContent=brl(result.finalCapital);
    if($('aposResRenda')) $('aposResRenda').textContent=`${brl(result.monthlyIncome)}/mês`;
    if($('aposResCartaHoje')) $('aposResCartaHoje').textContent=brl(result.input.credit);
    if($('aposResCartaMeio')) $('aposResCartaMeio').textContent=brl(result.capitalAtCont);
    if($('aposResCartaFim')) $('aposResCartaFim').textContent=brl(result.finalCapital);
    if($('aposResParcelaHoje')) $('aposResParcelaHoje').textContent=brl(result.input.reducedPayment);
    if($('aposResParcelaContemplacao')) $('aposResParcelaContemplacao').textContent=brl(result.firstFullAfterCont);
    if($('aposResParcelaFim')) $('aposResParcelaFim').textContent=brl(result.finalPayment);
    if($('aposResPagoContemplacao')) $('aposResPagoContemplacao').textContent=brl(result.paidUntilCont);
    if($('aposResMesesRendendo')) $('aposResMesesRendendo').textContent=`${result.investmentMonths} meses`;
    if($('aposResGanhoAplicacao')) $('aposResGanhoAplicacao').textContent=brl(result.gain);
    if($('aposResEficiencia')) $('aposResEficiencia').textContent=`${result.ratio.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}x`;

    if($('aposTimelineBody')){
      $('aposTimelineBody').innerHTML=result.timeline.map(item=>`<tr class="${item.isCont?'apos-milestone':''} ${item.isFirstFull?'apos-first-full':''} ${item.isEnd?'apos-end':''}">
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

  function resultOrError(){
    try{
      const input=read();
      const result=calculate(input);
      saveInputs(input);
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

  async function copySummary(){
    const r=resultOrError();
    if(!r) return;
    const text=[
      'PROJETO DE APOSENTADORIA',
      r.input.client?`Cliente: ${r.input.client}`:'',
      '',
      `Crédito contratado: ${brl(r.input.credit)}`,
      `Parcela reduzida inicial: ${brl(r.input.reducedPayment)}`,
      `Parcela cheia-base calculada: ${brl(r.fullBasePayment)}`,
      `1ª parcela projetada após contemplação: ${brl(r.firstFullAfterCont)}`,
      `Aporte até a contemplação: ${brl(r.paidUntilCont)}`,
      `Capital projetado na contemplação: ${brl(r.capitalAtCont)}`,
      `Aporte total estimado no plano: ${brl(r.totalPaid)}`,
      `Patrimônio projetado ao final: ${brl(r.finalCapital)}`,
      `Renda mensal projetada: ${brl(r.monthlyIncome)}`,
      '',
      `Premissas: taxa administrativa ${pct(r.input.adminRate*100)}; reajuste ${pct(r.input.annual*100)} a.a.; contemplação no mês ${r.input.contemplation}; rendimento ${pct(r.input.monthly*100,2)} a.m.; retirada ilustrativa ${pct(r.input.withdrawal*100,2)} a.m.`,
      '',
      'A parcela pós-contemplação considera a diferença não paga durante a fase reduzida, atualizada até a contemplação e redistribuída nas parcelas restantes. Projeção matemática para planejamento; contemplação e rentabilidade não são garantidas.'
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
    const date=new Date().toLocaleDateString('pt-BR');
    const client=escapeHtml(r.input.client||'Não informado');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Projeto de Aposentadoria</title><style>
      @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#eef1f4;color:#17202a;font-family:Arial,Helvetica,sans-serif}.report{width:190mm;margin:14px auto;background:#fff;padding:10mm;box-shadow:0 10px 35px rgba(0,0,0,.13)}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #ff8a00;padding-bottom:12px}.mark{display:flex;align-items:center;gap:10px}.logo{width:44px;height:44px;border-radius:12px;background:#ff8a00;color:#fff;display:grid;place-items:center;font-weight:900}.top h1{margin:0;font-size:24px}.top p{margin:4px 0 0;color:#687480;font-size:11px}.date{text-align:right;font-size:10px;color:#687480}.intro{margin-top:14px;padding:11px 12px;border-radius:10px;background:#f6f8fa;border:1px solid #e1e6ea;font-size:12px;line-height:1.45}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.card{border:1px solid #dfe4e8;border-radius:10px;padding:11px 12px;background:#f8fafb}.card span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#6e7984;font-weight:700}.card b{display:block;margin-top:5px;font-size:18px}.card.highlight{border-color:#90d7a4;background:#f0fbf3}.card.highlight b{color:#248a42;font-size:22px}.journey{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:12px}.step{border:1px solid #dfe4e8;border-radius:10px;padding:12px;text-align:center;background:#fff}.step span{display:block;color:#6e7984;font-size:9px}.step b{display:block;margin-top:5px;font-size:16px}.arrow{font-size:22px;color:#ff8a00}.section{margin-top:16px}.section h2{font-size:15px;margin:0 0 8px}.tech{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.tech .card b{font-size:14px}.fine{margin-top:16px;border-top:1px solid #dfe4e8;padding-top:9px;color:#5f6b76;font-size:9px;line-height:1.45}.printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:10px;padding:12px 15px;font-weight:800;cursor:pointer}.print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}@media(max-width:760px){body{background:#fff}.report{width:100%;margin:0;padding:14px;box-shadow:none}.metrics,.tech{grid-template-columns:1fr}.journey{grid-template-columns:1fr}.arrow{transform:rotate(90deg);text-align:center}}@media print{body{background:#fff}.report{width:auto;margin:0;padding:0;box-shadow:none}.printbar{display:none}.top,.intro,.metrics,.journey,.section,.fine{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="report"><div class="top"><div class="mark"><div class="logo">SC</div><div><h1>Projeto de Aposentadoria</h1><p>Projeção de formação de patrimônio e renda futura</p></div></div><div class="date">Emitido em<br><b>${date}</b></div></div><div class="intro"><b>Cliente:</b> ${client}<br>Esta simulação mostra o caminho do crédito contratado até o patrimônio projetado no encerramento do grupo, considerando as premissas informadas.</div><div class="metrics"><div class="card"><span>Aporte até a contemplação</span><b>${brl(r.paidUntilCont)}</b></div><div class="card"><span>Aporte total estimado no plano</span><b>${brl(r.totalPaid)}</b></div><div class="card highlight"><span>Patrimônio projetado ao final</span><b>${brl(r.finalCapital)}</b></div><div class="card highlight"><span>Renda mensal projetada</span><b>${brl(r.monthlyIncome)}/mês</b></div></div><div class="journey"><div class="step"><span>Crédito contratado</span><b>${brl(r.input.credit)}</b></div><div class="arrow">→</div><div class="step"><span>Capital na contemplação</span><b>${brl(r.capitalAtCont)}</b></div><div class="arrow">→</div><div class="step"><span>Patrimônio ao final</span><b>${brl(r.finalCapital)}</b></div></div><div class="section"><h2>Parcela e premissas</h2><div class="tech"><div class="card"><span>Parcela reduzida inicial</span><b>${brl(r.input.reducedPayment)}</b></div><div class="card"><span>Parcela cheia-base hoje</span><b>${brl(r.fullBasePayment)}</b></div><div class="card"><span>1ª parcela após contemplação</span><b>${brl(r.firstFullAfterCont)}</b></div><div class="card"><span>Parcela projetada no fim</span><b>${brl(r.finalPayment)}</b></div><div class="card"><span>Taxa administrativa</span><b>${pct(r.input.adminRate*100)}</b></div><div class="card"><span>Reajuste anual</span><b>${pct(r.input.annual*100)} a.a.</b></div><div class="card"><span>Contemplação projetada</span><b>Mês ${r.input.contemplation}</b></div><div class="card"><span>Rendimento após contemplação</span><b>${pct(r.input.monthly*100,2)} a.m.</b></div><div class="card"><span>Retirada ilustrativa</span><b>${pct(r.input.withdrawal*100,2)} a.m.</b></div></div></div><div class="fine"><b>Memória da parcela:</b> a parcela cheia-base é calculada por crédito × (1 + taxa administrativa) ÷ prazo. Até a contemplação, o plano considera a parcela reduzida reajustada. A diferença para a parcela cheia é atualizada até a contemplação e redistribuída pelas parcelas restantes; depois, as parcelas seguem os reajustes anuais projetados.<br><br><b>Importante:</b> projeção matemática para planejamento. A contemplação e a rentabilidade não são garantidas.</div></div><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
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
      small.id='aposParcelaBaseInfo';
      small.textContent='A parcela cheia será calculada automaticamente.';
    }

    const obsolete=$('aposParcelaCheia')?.closest('.field');
    if(obsolete) obsolete.remove();

    if(!$('aposTaxaAdmin')){
      const reajuste=$('aposReajuste')?.closest('.field');
      const field=document.createElement('div');
      field.className='field';
      field.innerHTML=`<label for="aposTaxaAdmin">Taxa administrativa total</label><div class="control"><input id="aposTaxaAdmin" type="number" value="${Number(num('cfgTaxa',24.2)).toFixed(2)}" step="0.1" min="0"><span>%</span></div><small>Usada para calcular automaticamente a parcela cheia-base.</small>`;
      if(reajuste) reajuste.insertAdjacentElement('afterend',field);
    }

    const pre=$('aposParcelaPre')?.closest('.field');
    if(pre) pre.hidden=true;
    const income=$('aposRendaMensal');
    if(income){
      const field=income.closest('.field');
      const label=field?.querySelector('label');
      if(label) label.textContent='Taxa de retirada para renda futura';
      const suffix=field?.querySelector('.control span');
      if(suffix) suffix.textContent='% do patrimônio / mês';
    }
    const ref=view.querySelector('.apos-reference');
    if(ref){
      const cards=ref.querySelectorAll(':scope > div');
      if(cards[2]) cards[2].innerHTML='<span>Retirada ilustrativa para renda</span><strong>0,5% a.m.</strong>';
    }

    const style=document.createElement('style');
    style.textContent='.apos-table tr.apos-first-full td{background:#14202b;border-color:#42617c}';
    document.head.appendChild(style);
    updateCalculatedFullInfo();
  }

  function patchButtons(){
    const calc=$('aposCalcularBtn');
    if(calc){
      const fresh=calc.cloneNode(true);calc.replaceWith(fresh);
      fresh.addEventListener('click',()=>{const r=resultOrError();if(r) render(r);});
    }
    const actions=document.querySelector('#view-aposentadoria .apos-actions');
    if(actions && !$('aposPdfBtn')){
      actions.style.gridTemplateColumns='1fr 1fr';
      const pdf=document.createElement('button');
      pdf.id='aposPdfBtn';pdf.className='action-button';pdf.type='button';pdf.innerHTML='<span>▣</span>Gerar PDF';
      actions.insertBefore(pdf,actions.firstChild);
    }
    const pdf=$('aposPdfBtn');
    if(pdf){const fresh=pdf.cloneNode(true);pdf.replaceWith(fresh);fresh.addEventListener('click',openPdf);}
    const copy=$('aposCopiarBtn');
    if(copy){const fresh=copy.cloneNode(true);copy.replaceWith(fresh);fresh.addEventListener('click',copySummary);}
  }

  function bindInputs(){
    ['aposParcela','aposCredito'].forEach(id=>{
      const el=$(id);if(!el) return;
      el.addEventListener('focus',e=>e.target.select());
      el.addEventListener('blur',e=>{const n=parseMoney(e.target.value);if(n>0)e.target.value=formatMoneyInput(n);updateCalculatedFullInfo();});
    });
    ['aposPrazo','aposTaxaAdmin','aposReajuste'].forEach(id=>$(id)?.addEventListener('input',updateCalculatedFullInfo));
  }

  function wait(){
    const view=$('view-aposentadoria');
    if(!view || view.dataset.presentationPolished!=='1'){setTimeout(wait,70);return;}
    if(view.dataset.calculationCorrectedV3==='1') return;
    view.dataset.calculationCorrectedV3='1';
    patchFields(view);
    migrateDefaults();
    restoreInputs();
    updateCalculatedFullInfo();
    patchButtons();
    bindInputs();
  }

  wait();
})();