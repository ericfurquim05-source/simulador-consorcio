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
    const max = Math.max(...result.options.map(option => Math.max(0, option.gain)), 1);
    return result.options.map(option => {
      const width = Math.max(2, Math.min(100, Math.max(0, option.gain) / max * 100));
      const color = option.key === 'consorcio' ? '#ff8a00' : option.key === 'renda' ? '#398fd5' : '#d6a72d';
      return `<div class="chart-row">
        <div class="chart-name"><span>${escapeHtml(option.name)}</span><b>${calc.brl(option.gain)}</b></div>
        <div class="track"><div style="width:${width}%;background:${color}"></div></div>
      </div>`;
    }).join('');
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
        *{box-sizing:border-box}
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
        .growth{display:flex;justify-content:space-between;align-items:center;background:#17212b;color:#fff;border-radius:9px;padding:10px 13px;margin-top:8px}
        .growth div{text-align:center;flex:1}
        .growth span{display:block;color:#aeb9c3;font-size:10px}
        .growth b{display:block;margin-top:4px;font-size:16px}
        .arrow{color:#ff9a22;font-size:18px;flex:0 0 auto!important}
        .chart-help{font-size:11.5px;line-height:1.4;color:#66727d;margin:-1px 0 7px}
        .chart-row{margin:7px 0}
        .chart-name{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-bottom:4px}
        .chart-name b{font-size:12px;white-space:nowrap}
        .track{height:16px;border-radius:6px;background:#edf0f2;overflow:hidden}
        .track div{height:100%;border-radius:5px}
        .table{width:100%;border-collapse:collapse;font-size:11px}
        .table th{background:#17212b;color:#fff;padding:7px 8px;text-align:right}
        .table th:first-child{text-align:left}
        .table td{border-bottom:1px solid #e2e6e9;padding:7px 8px;text-align:right}
        .table td:first-child{text-align:left;font-weight:bold}
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
          .top,.identity,.metrics,.growth,.chart-row,.table,.fine{break-inside:avoid;page-break-inside:avoid}
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
          <h2>Comparação completa</h2>
          <table class="table"><thead><tr><th>Opção</th><th>Valor colocado</th><th>Ganho estimado</th><th>Total final</th></tr></thead><tbody>${result.options.map(option => `<tr><td>${escapeHtml(option.name)}</td><td>${calc.brl(option.invested)}</td><td>${calc.brl(option.gain)}</td><td>${calc.brl(option.total)}</td></tr>`).join('')}</tbody></table>
        </div>

        <div class="fine"><b>Premissas:</b> INCC ${calc.percent(result.input.incc * 100)} a.a.; venda estimada em ${calc.percent(result.input.saleRate * 100)} do crédito disponível; renda fixa de ${calc.percent(result.input.fixedAnnual * 100)} a.a.; poupança de ${calc.percent(result.input.savingsMonthly * 100, 4)} a.m.; referência: ${escapeHtml(result.input.reference || 'não informada')}.<br><b>Aviso:</b> projeção matemática sem garantia de contemplação, prazo, valor de venda ou rentabilidade. Relatório emitido por ${company}.</div>
      </div>
      <div class="printbar"><button class="close" onclick="window.close()">Fechar</button><button class="print" onclick="window.print()">Salvar como PDF / Imprimir</button></div>
    </body></html>`);
    w.document.close();
  }

  S.PDF = {openReport};
})(window);
