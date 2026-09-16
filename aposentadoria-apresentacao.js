(function(){
  'use strict';

  function money(value){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  }

  function parseMoney(value){
    let text=String(value??'').trim().replace(/R\$/g,'').replace(/\s/g,'');
    if(!text) return 0;
    if(text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(text)) text=text.replace(/\./g,'');
    const n=Number(text.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }

  function number(id,fallback){
    const el=document.getElementById(id);
    const n=Number(String(el?.value??'').replace(',','.'));
    return Number.isFinite(n)?n:fallback;
  }

  function waitForView(){
    const view=document.getElementById('view-aposentadoria');
    if(!view){ setTimeout(waitForView,60); return; }
    polish(view);
  }

  function polish(view){
    if(view.dataset.presentationPolished==='1') return;
    view.dataset.presentationPolished='1';

    const heroTitle=view.querySelector('.apos-hero h2');
    const heroEyebrow=view.querySelector('.apos-hero .eyebrow');
    const heroLead=view.querySelector('.apos-hero .lead');
    if(heroEyebrow) heroEyebrow.textContent='Planejamento de longo prazo';
    if(heroTitle) heroTitle.textContent='Projeto de Aposentadoria';
    if(heroLead) heroLead.textContent='Uma projeção objetiva de formação de patrimônio: do crédito contratado ao capital acumulado e à renda mensal projetada no encerramento do grupo.';

    const ref=view.querySelector('.apos-reference');
    if(ref){
      ref.innerHTML=`
        <div><span>Reajuste projetado do crédito</span><strong>6% a.a.</strong></div>
        <div><span>Rentabilidade após contemplação</span><strong>1% a.m.</strong></div>
        <div><span>Renda projetada sobre o patrimônio</span><strong>1% a.m.</strong></div>`;
    }

    const parcelaField=document.getElementById('aposParcela')?.closest('.field');
    if(parcelaField){
      const label=parcelaField.querySelector('label');
      if(label) label.textContent='Parcela de referência do plano';
      let small=parcelaField.querySelector('small');
      if(!small){ small=document.createElement('small'); parcelaField.appendChild(small); }
      small.textContent='Usada apenas para calcular o desembolso total. Não é o foco da apresentação.';
    }

    const result=document.getElementById('aposResultado');
    const firstPanel=result?.querySelector('.panel');
    if(firstPanel){
      const lead=firstPanel.querySelector('.section-heading .lead');
      if(lead) lead.textContent='Visão executiva do plano: quanto foi aportado, quanto o crédito pode representar na contemplação, o patrimônio projetado e a renda mensal estimada.';

      const kpi=firstPanel.querySelector('.apos-kpi');
      if(kpi){
        kpi.classList.add('apos-kpi-executive');
        const cards=kpi.querySelectorAll(':scope > div');
        if(cards[0]) cards[0].querySelector('span').textContent='Aporte total estimado no plano';
        if(cards[1]) cards[1].querySelector('span').textContent='Capital projetado na contemplação';
        if(cards[2]) cards[2].querySelector('span').textContent='Patrimônio projetado ao final';
        if(cards[3]) cards[3].querySelector('span').textContent='Renda mensal projetada';
      }

      const journeys=firstPanel.querySelectorAll('.apos-journey');
      if(journeys[0]){
        const labels=journeys[0].querySelectorAll('span');
        if(labels[0]) labels[0].textContent='Crédito contratado';
        if(labels[1]) labels[1].textContent='Capital na contemplação';
        if(labels[2]) labels[2].textContent='Patrimônio ao final';
      }
      if(journeys[1]){
        const technical=document.createElement('details');
        technical.className='apos-technical-details';
        technical.innerHTML='<summary>Ver evolução das parcelas</summary>';
        journeys[1].parentNode.insertBefore(technical,journeys[1]);
        technical.appendChild(journeys[1]);
      }

      const detail=firstPanel.querySelector('.apos-detail-grid');
      if(detail){
        const labels=detail.querySelectorAll('span');
        if(labels[0]) labels[0].textContent='Aporte até a contemplação';
        if(labels[1]) labels[1].textContent='Período de capitalização';
        if(labels[2]) labels[2].textContent='Crescimento projetado do capital';
        if(labels[3]) labels[3].textContent='Patrimônio final ÷ aporte total';
      }
    }

    const panels=result?.querySelectorAll(':scope > .panel');
    if(panels?.[1]){
      const h2=panels[1].querySelector('h2');
      const lead=panels[1].querySelector('.lead');
      if(h2) h2.textContent='Evolução do projeto';
      if(lead) lead.textContent='Detalhamento técnico para consulta. O cliente pode focar apenas no resumo executivo acima.';
      const wrap=panels[1].querySelector('.table-wrap');
      if(wrap){
        const details=document.createElement('details');
        details.className='apos-technical-details';
        details.innerHTML='<summary>Ver memória de cálculo anual</summary>';
        wrap.parentNode.insertBefore(details,wrap);
        details.appendChild(wrap);
      }
    }

    if(panels?.[2]){
      const h2=panels[2].querySelector('h2');
      const lead=panels[2].querySelector('.lead');
      if(h2) h2.textContent='Resumo executivo';
      if(lead) lead.textContent='Pronto para compartilhar com o cliente em uma conversa comercial ou de planejamento.';
    }

    const style=document.createElement('style');
    style.textContent=`
      #view-aposentadoria .apos-hero{border-color:#3d4b5a;background:linear-gradient(145deg,#111922,#0d141c)}
      #view-aposentadoria .apos-kpi-executive{grid-template-columns:1fr 1fr}
      #view-aposentadoria .apos-kpi-executive>div{min-height:108px;display:flex;flex-direction:column;justify-content:center}
      #view-aposentadoria .apos-kpi-executive>div:nth-child(3),#view-aposentadoria .apos-kpi-executive>div:nth-child(4){border-color:#3b6d50;background:linear-gradient(145deg,#102319,#0c1912)}
      #view-aposentadoria .apos-kpi-executive>div:nth-child(3) strong,#view-aposentadoria .apos-kpi-executive>div:nth-child(4) strong{font-size:28px;color:var(--green)}
      .apos-technical-details{margin-top:12px;border:1px solid var(--line);border-radius:14px;background:#0b1219;padding:11px 13px}
      .apos-technical-details>summary{cursor:pointer;font-size:11px;font-weight:850;color:#cfd8e1}
      .apos-technical-details>.apos-journey,.apos-technical-details>.table-wrap{margin-top:12px}
      @media(max-width:680px){#view-aposentadoria .apos-kpi-executive{grid-template-columns:1fr}#view-aposentadoria .apos-kpi-executive>div:nth-child(3) strong,#view-aposentadoria .apos-kpi-executive>div:nth-child(4) strong{font-size:25px}}
    `;
    document.head.appendChild(style);

    const copyBtn=document.getElementById('aposCopiarBtn');
    if(copyBtn){
      const fresh=copyBtn.cloneNode(true);
      copyBtn.replaceWith(fresh);
      fresh.addEventListener('click',async()=>{
        const credit=parseMoney(document.getElementById('aposCredito')?.value);
        const payment=parseMoney(document.getElementById('aposParcela')?.value);
        const term=Math.round(number('aposPrazo',180));
        const contemplation=Math.round(number('aposContemplacao',60));
        const annual=number('aposReajuste',6)/100;
        const monthly=number('aposRendimento',1)/100;
        const incomeRate=number('aposRendaMensal',1)/100;
        const pre=number('aposParcelaPre',50)/100;
        const cycles=m=>Math.max(0,Math.floor(Math.max(0,m)/12));
        const adjusted=(base,m)=>base*Math.pow(1+annual,cycles(m));
        const capitalAtCont=adjusted(credit,contemplation);
        const finalCapital=capitalAtCont*Math.pow(1+monthly,Math.max(0,term-contemplation));
        let totalPaid=0;
        for(let m=1;m<=term;m++) totalPaid+=adjusted(payment,m)*(m<contemplation?pre:1);
        const income=finalCapital*incomeRate;
        const client=(document.getElementById('aposCliente')?.value||'').trim();
        const text=[
          'PROJETO DE APOSENTADORIA',
          client?`Cliente: ${client}`:'',
          '',
          `Crédito contratado: ${money(credit)}`,
          `Capital projetado na contemplação: ${money(capitalAtCont)}`,
          `Aporte total estimado no plano: ${money(totalPaid)}`,
          `Patrimônio projetado ao final: ${money(finalCapital)}`,
          `Renda mensal projetada: ${money(income)}`,
          '',
          `Premissas: reajuste de ${(annual*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.a., contemplação no mês ${contemplation} e rentabilidade de ${(monthly*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}% a.m. após a contemplação.`,
          '',
          'Simulação matemática para planejamento. Contemplação e rentabilidade não são garantidas.'
        ].filter(Boolean).join('\n');
        try{await navigator.clipboard.writeText(text);}catch(_e){}
        const msg=document.getElementById('aposMessage');
        if(msg){msg.textContent='Resumo executivo copiado.';msg.hidden=false;}
      });
    }
  }

  waitForView();
})();