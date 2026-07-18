(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};

  function escapeHtml(text){
    return String(text || '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  function chartRows(result){
    const calc = S.Calculos;
    const values = result.options.map(option => Math.max(0, Number(option.gain) || 0));
    const max = Math.max(...values, 1);
    const palette = {
      consorcio: '#ff8a00',
      renda: '#398fd5',
      poupanca: '#d6a72d'
    };

    return `<div class="pdf-column-chart">${result.options.map(option => {
      const value = Math.max(0, Number(option.gain) || 0);
      const height = value > 0 ? Math.max(12, Math.round(value / max * 78)) : 2;
      const color = palette[option.key] || palette.poupanca;
      return `<div class="pdf-chart-item">
        <b>${escapeHtml(calc.brl(value))}</b>
        <div class="pdf-chart-stage"><span class="pdf-chart-bar" style="height:${height}px;border-left-color:${color}"></span></div>
        <strong>${escapeHtml(option.name)}</strong>
      </div>`;
    }).join('')}</div>`;
  }

  function comparisonCards(result){
    const calc = S.Calculos;
    return `<div class="pdf-comparison-grid">${result.options.map(option => {
      const profitability = option.invested ? option.gain / option.invested * 100 : 0;
      const capitalEfficiency = option.invested ? option.total / option.invested * 1000 : 0;
      const best = option.key === result.best.key ? '<span class="pdf-best">Maior resultado</span>' : '';
      return `<article class="pdf-option-card ${option.key}">
        <div class="pdf-option-head"><h3>${escapeHtml(option.name)}</h3>${best}</div>
        <div class="pdf-option-grid">
          <div><span>Você colocou</span><b>${calc.brl(option.invested)}</b></div>
          <div><span>Ganho estimado</span><b class="gain-value">${calc.brl(option.gain)}</b></div>
          <div><span>Rentabilidade sobre o valor investido</span><b>${calc.percent(profitability, 1)}</b></div>
          <div><span>Retorno a cada R$ 1.000 investidos</span><b>${calc.brl(capitalEfficiency)}</b></div>
        </div>
        <div class="pdf-option-total"><span>Total estimado ao final</span><strong>${calc.brl(option.total)}</strong></div>
      </article>`;
    }).join('')}</div>`;
  }

  function openReport(result, profile){
    const calc = S.Calculos;
    const w = window.open('', '_blank');
    if(!w) throw new Error('O navegador bloqueou a abertura do relatório. Libere os pop-ups e tente novamente.');

    const date = new Date(result.createdAt).toLocaleDateString('pt-BR');
    const client = result.input.client ? escapeHtml(result.input.client) : 'Não informado';
    const company = escapeHtml(profile.company || 'Simulador de Consórcio');
    const consultant = profile.consultant ? escapeHtml(profile.consultant) : 'Não informado';
    const phone = profile.phone ? escapeHtml(profile.phone) : 'Não informado';
    const strategy = result.input.strategy === 'com'
      ? `Com lance fixo de ${calc.percent(result.input.bidRate * 100)}`
      : 'Sem lance';


    w.document.write(`<!doctype html><html lang="pt-BR"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Relatório de Simulação</title>
      <style>
        @page{size:A4 portrait;margin:7mm}
        *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        html,body{margin:0;padding:0}
        body{color:#17202a;font-family:Arial,Helvetica,sans-serif;background:#eef1f4}
        .report{width:196mm;margin:14px auto;background:#fff;padding:9mm;box-shadow:0 10px 40px rgba(0,0,0,.15)}
        .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #ff8a00;padding-bottom:11px}
        .brand{display:flex;align-items:center;gap:10px}
        .mark{width:46px;height:46px;border-radius:12px;background:#ff8a00;color:#fff;display:grid;place-items:center;font-size:19px;font-weight:900}
        .top h1{font-size:24px;line-height:1.08;margin:0}
        .top p{margin:4px 0 0;color:#687480;font-size:12px}
        .date{text-align:right;color:#687480;font-size:11px;line-height:1.4}
        .section{margin-top:14px}
        .section h2{font-size:16px;margin:0 0 7px;color:#27313b}
        .intro{font-size:12.5px;line-height:1.45;color:#47525d;background:#f6f8fa;border:1px solid #e1e6ea;border-radius:9px;padding:10px 12px}
        .identity{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .person{border:1px solid #dfe4e8;border-radius:9px;padding:10px 12px;background:#f8fafb;min-height:64px}
        .person>span{display:block;font-size:10px;color:#6e7984;text-transform:uppercase;letter-spacing:.05em;font-weight:bold}
        .person>b{display:block;margin-top:4px;font-size:15px;color:#1d2730}
        .person small{display:block;margin-top:4px;color:#66727d;font-size:10.5px;line-height:1.3}
        .metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .metric{border:1px solid #dfe4e8;border-radius:9px;padding:9px 11px;background:#f8fafb}
        .metric span{display:block;font-size:10px;color:#6e7984;text-transform:uppercase;letter-spacing:.04em}
        .metric b{display:block;margin-top:4px;font-size:20px}
        .metric.main{border-color:#ffb45d;background:#fff8ef}
        .metric.gain{border-color:#90d7a4;background:#f0fbf3}
        .metric.gain b{color:#248a42}
        .metric-insights{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid #cfe6d5}
        .metric-insights div+div{padding-left:8px;border-left:1px solid #cfe6d5}
        .metric-insights span{display:block;color:#4f6455;font-size:8px;line-height:1.2}
        .metric-insights strong{display:block;margin-top:3px;color:#248a42;font-size:10px;line-height:1.2}
        .growth{display:flex;justify-content:space-between;align-items:center;background:#17212b;color:#fff;border-radius:9px;padding:10px 13px;margin-top:8px}
        .growth div{text-align:center;flex:1}
        .growth span{display:block;color:#aeb9c3;font-size:10px}
        .growth b{display:block;margin-top:4px;font-size:16px}
        .arrow{color:#ff9a22;font-size:18px;flex:0 0 auto!important}
        .chart-help{font-size:11.5px;line-height:1.4;color:#66727d;margin:-1px 0 7px}
        .pdf-column-chart{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border:1px solid #dfe5ea;border-radius:11px;padding:9px 12px 7px;background:#fff}
        .pdf-chart-item{text-align:center;min-width:0}
        .pdf-chart-item>b{display:block;min-height:15px;font-size:10px;color:#26313b;white-space:nowrap}
        .pdf-chart-stage{height:84px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #cfd7dd;margin-top:3px}
        .pdf-chart-bar{display:block;width:0;border-left:30px solid #ff8a00}
        .pdf-chart-item>strong{display:block;margin-top:6px;font-size:10px;color:#3d4852}
        .pdf-comparison-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
        .pdf-option-card{position:relative;border:1px solid #dfe5ea;border-top:4px solid #8b98a4;border-radius:10px;background:#fff;overflow:hidden}
        .pdf-option-card.consorcio{border-top-color:#ff8a00}.pdf-option-card.renda{border-top-color:#398fd5}.pdf-option-card.poupanca{border-top-color:#d6a72d}
        .pdf-option-head{display:flex;justify-content:space-between;align-items:center;gap:5px;padding:7px 8px;border-bottom:1px solid #e5e9ec;background:#f8fafb}
        .pdf-option-head h3{font-size:13px;margin:0;color:#1d2730}
        .pdf-best{display:inline-block;border-radius:999px;background:#ff8a00;color:#fff;padding:3px 5px;font-size:6.5px;font-weight:900;text-transform:uppercase;white-space:nowrap}
        .pdf-option-grid{display:grid;grid-template-columns:1fr 1fr}
        .pdf-option-grid>div{min-height:47px;padding:7px 8px;border-bottom:1px solid #e8ecef}
        .pdf-option-grid>div:nth-child(odd){border-right:1px solid #e8ecef}
        .pdf-option-grid span,.pdf-option-total span{display:block;font-size:7.1px;line-height:1.2;color:#6e7984;text-transform:uppercase;letter-spacing:.03em;font-weight:700}
        .pdf-option-grid b{display:block;margin-top:4px;font-size:10.3px;line-height:1.2;color:#24303a}
        .pdf-option-grid .gain-value{color:#248a42}
        .pdf-option-total{padding:7px 8px 8px;background:#f8fafb}
        .pdf-option-total strong{display:block;margin-top:3px;font-size:15px;line-height:1.1;color:#17202a}
        .fine{font-size:9.5px;color:#5f6b76;line-height:1.42;margin-top:13px;border-top:1px solid #dfe4e8;padding-top:9px}
        .printbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}
        .printbar button{border:0;border-radius:10px;padding:12px 15px;font-weight:800;cursor:pointer}
        .print{background:#ff8a00;color:#fff}.close{background:#27313b;color:#fff}
        @media(max-width:760px){
          body{background:#fff}.report{width:100%;margin:0;padding:14px;box-shadow:none}
          .top h1{font-size:18px}.top p{font-size:10px}.identity{grid-template-columns:1fr 1fr}
        }
        @media print{
          html,body{width:100%;height:auto;background:#fff}
          .report{width:auto;margin:0;padding:0;box-shadow:none}
          .printbar{display:none}
          .top,.identity,.metrics,.growth,.pdf-column-chart,.pdf-comparison-grid,.fine{break-inside:avoid;page-break-inside:avoid}
        }
      </style></head><body><div class="report">
        <div class="top">
          <div class="brand"><div class="mark">SC</div><div><h1>${company}</h1><p>Relatório de Simulação de Consórcio</p></div></div>
          <div class="date">Emitido em<br><b>${date}</b></div>
        </div>

        <div class="section"><div class="intro"><b>O que esta simulação mostra:</b> uma comparação entre o possível ganho com a venda da carta contemplada e o rendimento que o mesmo valor pago em parcelas poderia alcançar na renda fixa ou na poupança, conforme as taxas informadas.</div></div>

        <div class="section">
          <h2>Cliente e consultor</h2>
          <div class="identity">
            <div class="person"><span>Cliente</span><b>${client}</b><small>${result.input.months} meses · ${strategy}</small></div>
            <div class="person"><span>Consultor</span><b>${consultant}</b><small>WhatsApp: ${phone}</small></div>
          </div>
        </div>

        <div class="section">
          <h2>Resumo financeiro</h2>
          <div class="metrics">
            <div class="metric"><span>Parcela inicial</span><b>${calc.brl(result.basePayment)}</b></div>
            <div class="metric"><span>Total pago no período</span><b>${calc.brl(result.totalPaid)}</b></div>
            <div class="metric main"><span>Valor estimado recebido</span><b>${calc.brl(result.received)}</b></div>
            <div class="metric gain"><span>Possível ganho</span><b>${calc.brl(result.consortiumGain)}</b></div>
          </div>
          <div class="growth"><div><span>Carta inicial</span><b>${calc.brl(result.input.credit)}</b></div><div class="arrow">→</div><div><span>Carta corrigida</span><b>${calc.brl(result.correctedCredit)}</b></div></div>
        </div>

        <div class="section">
          <h2>Comparativo dos ganhos estimados</h2>
          <p class="chart-help">Mostra somente o ganho de cada opção. Na renda fixa e na poupança, o mesmo valor das parcelas foi considerado como aporte mensal.</p>
          ${chartRows(result)}
        </div>

        <div class="section">
          <h2>Comparação financeira</h2>
          ${comparisonCards(result)}
        </div>

        <div class="fine"><b>Premissas:</b> INCC ${calc.percent(result.input.incc * 100)} a.a.; venda estimada em ${calc.percent(result.input.saleRate * 100)} do crédito disponível; renda fixa de ${calc.percent(result.input.fixedAnnual * 100)} a.a.; poupança de ${calc.percent(result.input.savingsMonthly * 100, 4)} a.m.; referência: ${escapeHtml(result.input.reference || 'não informada')}.<br><b>Aviso:</b> projeção matemática sem garantia de contemplação, prazo, valor de venda ou rentabilidade. Relatório emitido por ${company}.</div>
      </div>
      <div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div>
    </body></html>`);
    w.document.close();
  }

  S.PDF = {openReport};
})(window);
