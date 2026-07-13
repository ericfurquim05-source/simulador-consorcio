(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};

  function escapeHtml(text){return String(text||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  function chartRows(result,metric){
    const calc=S.Calculos;const max=Math.max(...result.options.map(o=>Math.max(0,o[metric])),1);
    return result.options.map(o=>{
      const width=Math.max(2,Math.min(100,Math.max(0,o[metric])/max*100));
      const color=o.key==='consorcio'?'#ff8a00':o.key==='renda'?'#398fd5':'#d6a72d';
      return `<div class="chart-row"><div class="chart-name">${o.name}<b>${calc.brl(o[metric])}</b></div><div class="track"><div style="width:${width}%;background:${color}"></div></div></div>`;
    }).join('');
  }

  function openReport(result,profile){
    const calc=S.Calculos;
    const w=window.open('','_blank');
    if(!w) throw new Error('O navegador bloqueou a abertura do relatório. Libere os pop-ups e tente novamente.');
    const date=new Date(result.createdAt).toLocaleDateString('pt-BR');
    const client=result.input.client?escapeHtml(result.input.client):'Não informado';
    const company=escapeHtml(profile.company||'Simulador de Consórcio');
    const consultant=profile.consultant?escapeHtml(profile.consultant):'Não informado';
    const phone=profile.phone?escapeHtml(profile.phone):'Não informado';
    const strategy=result.input.strategy==='com'?`Com lance fixo de ${calc.percent(result.input.bidRate*100)}`:'Sem lance';
    const dFixed=result.consortiumGain-result.fixedGain;
    const dSavings=result.consortiumGain-result.savingsGain;
    const conclusion=`Neste cenário, ${result.best.name.toLowerCase()} apresentou o maior resultado estimado. O consórcio ficou ${dFixed>=0?'acima':'abaixo'} da renda fixa em ${calc.brl(Math.abs(dFixed))} e ${dSavings>=0?'acima':'abaixo'} da poupança em ${calc.brl(Math.abs(dSavings))}.`;

    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório de Simulação</title><style>
      @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#17202a;font-family:Arial,Helvetica,sans-serif;background:#eef1f4}.report{width:210mm;min-height:297mm;margin:20px auto;background:#fff;padding:16mm;box-shadow:0 10px 40px rgba(0,0,0,.15)}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #ff8a00;padding-bottom:14px}.brand{display:flex;align-items:center;gap:12px}.mark{width:48px;height:48px;border-radius:14px;background:#ff8a00;color:#fff;display:grid;place-items:center;font-size:19px;font-weight:900}.top h1{font-size:22px;margin:0}.top p{margin:4px 0 0;color:#687480;font-size:11px}.date{text-align:right;color:#687480;font-size:10px}.section{margin-top:20px}.section h2{font-size:15px;margin:0 0 10px;color:#27313b}.info{display:grid;grid-template-columns:1fr 1fr;gap:8px}.info div,.metric{border:1px solid #dfe4e8;border-radius:10px;padding:10px;background:#f8fafb}.info span,.metric span{display:block;font-size:9px;color:#6e7984;text-transform:uppercase;letter-spacing:.04em}.info b,.metric b{display:block;margin-top:4px;font-size:12px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px}.metric b{font-size:18px}.metric.main{border-color:#ffb45d;background:#fff8ef}.metric.gain{border-color:#90d7a4;background:#f0fbf3}.metric.gain b{color:#248a42}
      .growth{display:flex;justify-content:space-between;align-items:center;background:#17212b;color:#fff;border-radius:12px;padding:14px;margin-top:10px}.growth div{text-align:center}.growth span{display:block;color:#aeb9c3;font-size:9px}.growth b{display:block;margin-top:4px;font-size:16px}.arrow{color:#ff9a22;font-size:22px}.chart-row{margin:10px 0}.chart-name{display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px}.chart-name b{font-size:11px}.track{height:19px;border-radius:7px;background:#edf0f2;overflow:hidden}.track div{height:100%;border-radius:7px}.table{width:100%;border-collapse:collapse;font-size:10px}.table th{background:#17212b;color:#fff;padding:8px;text-align:right}.table th:first-child{text-align:left}.table td{border-bottom:1px solid #e2e6e9;padding:8px;text-align:right}.table td:first-child{text-align:left;font-weight:bold}.conclusion{border-left:4px solid #ff8a00;background:#fff7ec;padding:12px;font-size:11px;line-height:1.55}.fine{font-size:8.5px;color:#6e7984;line-height:1.45;margin-top:18px}.signature{display:flex;justify-content:space-between;border-top:1px solid #dfe4e8;margin-top:20px;padding-top:10px;color:#5f6b76;font-size:9px}.printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.printbar button{border:0;border-radius:10px;padding:12px 15px;font-weight:800;cursor:pointer}.print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}@media print{body{background:#fff}.report{margin:0;box-shadow:none;width:auto;min-height:auto;padding:0}.printbar{display:none}.section{break-inside:avoid}}
    </style></head><body><div class="report">
      <div class="top"><div class="brand"><div class="mark">SC</div><div><h1>${company}</h1><p>Relatório de Simulação de Consórcio</p></div></div><div class="date">Emitido em<br><b>${date}</b></div></div>
      <div class="section"><h2>Identificação</h2><div class="info"><div><span>Cliente</span><b>${client}</b></div><div><span>Consultor</span><b>${consultant}</b></div><div><span>WhatsApp</span><b>${phone}</b></div><div><span>Estratégia</span><b>${strategy}</b></div></div></div>
      <div class="section"><h2>Resumo financeiro</h2><div class="metrics"><div class="metric"><span>Parcela inicial</span><b>${calc.brl(result.basePayment)}</b></div><div class="metric"><span>Total pago</span><b>${calc.brl(result.totalPaid)}</b></div><div class="metric main"><span>Valor estimado recebido</span><b>${calc.brl(result.received)}</b></div><div class="metric gain"><span>Possível ganho</span><b>${calc.brl(result.consortiumGain)}</b></div></div><div class="growth"><div><span>Carta inicial</span><b>${calc.brl(result.input.credit)}</b></div><div class="arrow">→</div><div><span>Carta corrigida</span><b>${calc.brl(result.correctedCredit)}</b></div></div></div>
      <div class="section"><h2>Comparativo de resultados</h2>${chartRows(result,'gain')}</div>
      <div class="section"><h2>Comparação completa</h2><table class="table"><thead><tr><th>Opção</th><th>Valor colocado</th><th>Ganho estimado</th><th>Total final</th></tr></thead><tbody>${result.options.map(o=>`<tr><td>${o.name}</td><td>${calc.brl(o.invested)}</td><td>${calc.brl(o.gain)}</td><td>${calc.brl(o.total)}</td></tr>`).join('')}</tbody></table></div>
      <div class="section"><h2>Leitura do cenário</h2><div class="conclusion">${conclusion}</div></div>
      <div class="fine"><b>Premissas:</b> INCC ${calc.percent(result.input.incc*100)} a.a.; venda estimada em ${calc.percent(result.input.saleRate*100)} do crédito disponível; renda fixa de ${calc.percent(result.input.fixedAnnual*100)} a.a.; poupança de ${calc.percent(result.input.savingsMonthly*100,4)} a.m.; referência informada: ${escapeHtml(result.input.reference||'não informada')}.<br><br><b>Aviso:</b> esta simulação é uma projeção matemática e não representa garantia de contemplação, prazo, valor de venda ou rentabilidade. Os resultados dependem das condições reais da cota, da administradora e do mercado.</div>
      <div class="signature"><span>${company}</span><span>Simulador de Consórcio</span></div>
    </div><div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div></body></html>`);
    w.document.close();
  }

  S.PDF={openReport};
})(window);
