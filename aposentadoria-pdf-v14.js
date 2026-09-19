(function(){
  'use strict';

  const $ = id => document.getElementById(id);

  function parseMoney(value){
    let text=String(value??'').trim().replace(/R\$/g,'').replace(/\s/g,'');
    if(!text) return 0;
    if(text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(text)) text=text.replace(/\./g,'');
    const n=Number(text.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }
  function num(id,fallback){
    const n=Number(String($(id)?.value??'').replace(',','.'));
    return Number.isFinite(n)?n:fallback;
  }
  function brl(value){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  }
  function pct(value,digits=1){
    return `${(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
  }
  function annualCycle(month){ return Math.max(0,Math.floor((Math.max(1,month)-1)/12)); }
  function creditCycle(month){ return Math.max(0,Math.floor(Math.max(0,month)/12)); }
  function escapeHtml(text){
    return String(text??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  function calculatePdf(){
    const credit=parseMoney($('aposCredito')?.value);
    const reducedPayment=parseMoney($('aposParcela')?.value);
    const fullPayment=parseMoney($('aposParcelaCheia')?.value);
    const term=Math.round(num('aposPrazo',220));
    const contemplation=Math.round(num('aposContemplacao',60));
    const annual=Math.max(0,num('aposReajuste',6))/100;
    const monthly=Math.max(0,num('aposRendimento',1))/100;
    const client=($('aposCliente')?.value||'').trim();

    if(credit<=0||reducedPayment<=0||fullPayment<=0||term<2||contemplation<1||contemplation>=term){
      throw new Error('Revise os dados da simulação antes de gerar o PDF.');
    }

    const remainingMonths=term-contemplation;
    const shortfall=Math.max(0,fullPayment-reducedPayment);
    const deferred=shortfall*contemplation;
    const redistributed=remainingMonths>0?deferred/remainingMonths:0;
    const firstAfterCont=fullPayment+redistributed;
    const capitalAtCont=credit*Math.pow(1+annual,creditCycle(contemplation));
    const finalCapital=capitalAtCont*Math.pow(1+monthly,remainingMonths);
    const monthlyIncome=finalCapital*monthly;

    let totalPaid=0;
    for(let m=1;m<=term;m++){
      totalPaid+=fullPayment*Math.pow(1+annual,annualCycle(m));
    }

    return {client,credit,reducedPayment,fullPayment,term,contemplation,annual,monthly,remainingMonths,firstAfterCont,capitalAtCont,finalCapital,monthlyIncome,totalPaid};
  }

  function openPremiumPdf(){
    let r;
    try{ r=calculatePdf(); }
    catch(error){
      if($('aposMessage')){
        $('aposMessage').textContent=error.message||'Não foi possível gerar o PDF.';
        $('aposMessage').hidden=false;
      }
      return;
    }

    const w=window.open('','_blank');
    if(!w){
      if($('aposMessage')){
        $('aposMessage').textContent='O navegador bloqueou o relatório. Libere pop-ups e tente novamente.';
        $('aposMessage').hidden=false;
      }
      return;
    }

    const client=escapeHtml(r.client||'Cliente');
    const date=new Date().toLocaleDateString('pt-BR');
    const story=`Mantendo a rentabilidade simulada de ${pct(r.monthly*100,2)} a.m., o patrimônio projetado ao fim do grupo é ${brl(r.finalCapital)}, com renda mensal projetada de ${brl(r.monthlyIncome)}.`;

    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Projeto de Aposentadoria</title><style>
      @page{size:A4 portrait;margin:8mm}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      html,body{margin:0;padding:0;background:#edf1f4;color:#17222d;font-family:Arial,Helvetica,sans-serif}
      body{padding:10px}
      .sheet{width:100%;max-width:194mm;margin:0 auto;background:#fff;border:1px solid #dde4ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 36px rgba(17,31,45,.12)}
      .top{min-height:30mm;padding:8mm 9mm;background:#12202d;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:4px solid #ff8a00}
      .brand{display:flex;align-items:center;gap:14px}.logo{width:13mm;height:13mm;border-radius:10px;background:#ff8a00;display:grid;place-items:center;font-size:17px;font-weight:900}.top h1{margin:0;font-size:24px;line-height:1.05}.top p{margin:6px 0 0;color:#b9c4ce;font-size:11px}.date{text-align:right;color:#b9c4ce;font-size:10px;white-space:nowrap}.date b{display:block;color:#fff;font-size:13px;margin-top:3px}
      .content{padding:7mm 9mm 6mm}
      .client{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:8px;padding:10px 12px;background:#f4f7f9;border:1px solid #dce4ea;border-radius:12px}.client span{display:block;color:#6e7d89;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.client b{display:block;margin-top:4px;font-size:13px;color:#182630}
      .section{margin-top:17px}.section-title{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:14px;font-weight:900}.section-title:before{content:'';width:5px;height:18px;border-radius:6px;background:#ff8a00}
      .payflow{display:grid;grid-template-columns:1fr 42px 1fr;gap:8px;align-items:center}.paycard{min-height:84px;border:1px solid #dce4ea;border-radius:14px;padding:14px 12px;display:flex;flex-direction:column;justify-content:center;text-align:center;background:#fff}.paycard span{font-size:10px;font-weight:800;text-transform:uppercase;color:#6d7b86;letter-spacing:.04em}.paycard b{display:block;margin-top:7px;font-size:25px;color:#17222d}.arrow{text-align:center;color:#ff8a00;font-size:30px;font-weight:900}
      .total{margin-top:12px;border-radius:14px;background:#182633;color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px}.total span{font-size:11px;font-weight:800;text-transform:uppercase;color:#c0c9d0}.total b{font-size:26px;white-space:nowrap}
      .hero{margin-top:17px;border-radius:18px;background:linear-gradient(135deg,#edf9f1,#f7fcf8);border:1px solid #9fd2ad;padding:18px 20px}.hero-kicker{font-size:11px;font-weight:900;text-transform:uppercase;color:#428155;letter-spacing:.05em}.hero-main{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;align-items:end;margin-top:7px}.hero-main .capital small,.hero-main .income small{display:block;color:#668073;font-size:10px;font-weight:800;text-transform:uppercase}.hero-main .capital b{display:block;margin-top:6px;font-size:33px;line-height:1;color:#198444}.hero-main .income{padding-left:18px;border-left:1px solid #b9dbc2}.hero-main .income b{display:block;margin-top:6px;font-size:25px;line-height:1.05;color:#198444}.story{margin:13px 0 0;color:#455b4c;font-size:12px;line-height:1.5;font-weight:700}
      .facts{margin-top:15px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fact{border:1px solid #dfe6eb;background:#f8fafb;border-radius:12px;padding:11px 12px;min-height:64px}.fact span{display:block;color:#77858f;font-size:9px;font-weight:800;text-transform:uppercase}.fact b{display:block;margin-top:6px;font-size:16px;color:#1d2a34}.fact small{display:block;margin-top:4px;color:#7b8891;font-size:9px}
      .footer{margin-top:15px;padding-top:10px;border-top:1px solid #e0e6ea;display:flex;justify-content:space-between;gap:18px;color:#697781;font-size:9px;line-height:1.45}.footer strong{color:#3f4d57}.footer .legal{max-width:78%}.footer .tag{white-space:nowrap;text-align:right;font-weight:800;color:#485762}
      .printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:10px;padding:12px 15px;font-weight:900}.print{background:#ff8a00;color:#fff}.close{background:#263440;color:#fff}
      @media(max-width:760px){body{padding:0;background:#fff}.sheet{border:0;border-radius:0;box-shadow:none}.top{padding:18px 16px}.top h1{font-size:22px}.date{display:none}.content{padding:16px}.client{grid-template-columns:1fr 1fr}.payflow{grid-template-columns:1fr}.arrow{transform:rotate(90deg);line-height:1}.hero-main{grid-template-columns:1fr}.hero-main .income{padding:12px 0 0;border-left:0;border-top:1px solid #b9dbc2}.facts{grid-template-columns:1fr}.footer{display:block}.footer .legal{max-width:none}.footer .tag{text-align:left;margin-top:7px}}
      @media print{html,body{background:#fff}body{padding:0}.sheet{max-width:none;border:0;border-radius:0;box-shadow:none}.printbar{display:none}.top,.client,.payflow,.total,.hero,.facts,.footer{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><main class="sheet">
      <header class="top"><div class="brand"><div class="logo">SC</div><div><h1>Projeto de Aposentadoria</h1><p>Planejamento de patrimônio e renda futura</p></div></div><div class="date">Emitido em<b>${date}</b></div></header>
      <div class="content">
        <section class="client"><div><span>Cliente</span><b>${client}</b></div><div><span>Carta</span><b>${brl(r.credit)}</b></div><div><span>Prazo</span><b>${r.term} meses</b></div><div><span>Contemplação</span><b>Mês ${r.contemplation}</b></div></section>

        <section class="section"><div class="section-title">Fluxo de pagamento</div><div class="payflow"><div class="paycard"><span>Parcela reduzida automática</span><b>${brl(r.reducedPayment)}</b></div><div class="arrow">→</div><div class="paycard"><span>1ª parcela após contemplação</span><b>${brl(r.firstAfterCont)}</b></div></div><div class="total"><span>Total projetado pago no grupo</span><b>${brl(r.totalPaid)}</b></div></section>

        <section class="hero"><div class="hero-kicker">Resultado projetado ao fim do grupo</div><div class="hero-main"><div class="capital"><small>Patrimônio projetado</small><b>${brl(r.finalCapital)}</b></div><div class="income"><small>Renda mensal projetada</small><b>${brl(r.monthlyIncome)}/mês</b></div></div><p class="story">${story}</p></section>

        <section class="facts"><div class="fact"><span>Crédito na contemplação</span><b>${brl(r.capitalAtCont)}</b><small>Valor projetado no mês ${r.contemplation}</small></div><div class="fact"><span>Rentabilidade simulada</span><b>${pct(r.monthly*100,2)} a.m.</b><small>Aplicação após contemplação</small></div><div class="fact"><span>Reajuste projetado</span><b>${pct(r.annual*100,1)} a.a.</b><small>Aplicado à projeção do plano</small></div></section>

        <footer class="footer"><div class="legal"><strong>Importante:</strong> projeção matemática para planejamento. A contemplação no mês informado e a rentabilidade futura não são garantidas. O total projetado considera a parcela cheia automática com reajustes anuais ao longo do prazo.</div><div class="tag">Simulação financeira</div></footer>
      </div>
    </main><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
    w.document.close();
  }

  function patch(){
    const view=$('view-aposentadoria');
    const button=$('aposPdfBtn');
    if(!view||view.dataset.calculationCorrected!=='v13'||!button){ setTimeout(patch,80); return; }
    if(view.dataset.pdfPresentation==='v14') return;
    view.dataset.pdfPresentation='v14';
    const fresh=button.cloneNode(true);
    button.replaceWith(fresh);
    fresh.addEventListener('click',openPremiumPdf);
  }

  patch();
})();