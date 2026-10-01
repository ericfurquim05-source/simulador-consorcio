(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};
  if(!S.PDF || typeof S.PDF.openReport !== 'function') return;

  const legacyOpenReport = S.PDF.openReport.bind(S.PDF);

  function safeFileName(value){
    return String(value || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'cliente';
  }

  function brl(value){
    if(S.Calculos && S.Calculos.brl) return S.Calculos.brl(value);
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  }

  function pct(value, digits){
    return (Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:digits||1,maximumFractionDigits:digits||1}) + '%';
  }

  function header(doc, profile, subtitle){
    doc.setFillColor(19,27,36);
    doc.rect(0,0,210,34,'F');
    doc.setFillColor(255,138,0);
    doc.roundedRect(12,9,14,14,3,3,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('SC',19,18,{align:'center'});
    doc.setFontSize(18);
    doc.text(profile.company || 'Simulador de Consórcio',32,15);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(188,198,208);
    doc.text(subtitle,32,22);
    if(profile.consultant){
      doc.setTextColor(230,235,240);
      doc.text(profile.consultant,198,14,{align:'right'});
      if(profile.phone) doc.text(profile.phone,198,20,{align:'right'});
    }
  }

  function card(doc,x,y,w,h,label,value,kind){
    if(kind === 'orange'){
      doc.setFillColor(255,248,239); doc.setDrawColor(255,180,93);
    }else if(kind === 'green'){
      doc.setFillColor(241,251,244); doc.setDrawColor(144,215,164);
    }else{
      doc.setFillColor(248,250,251); doc.setDrawColor(222,228,233);
    }
    doc.roundedRect(x,y,w,h,3,3,'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(105,116,127);
    doc.text(String(label).toUpperCase(),x+4,y+6.5,{maxWidth:w-8});
    doc.setFontSize(12.5);
    if(kind === 'green') doc.setTextColor(36,138,66);
    else if(kind === 'orange') doc.setTextColor(185,102,0);
    else doc.setTextColor(31,40,50);
    doc.text(String(value),x+4,y+15,{maxWidth:w-8});
  }

  function drawOption(doc,x,y,w,h,option,best){
    const gainPct = option.invested ? option.gain / option.invested * 100 : 0;
    doc.setFillColor(250,251,252); doc.setDrawColor(222,228,233);
    doc.roundedRect(x,y,w,h,3,3,'FD');
    if(best){
      doc.setFillColor(255,138,0); doc.roundedRect(x+3,y+3,18,5,2,2,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(5.2); doc.setFont('helvetica','bold');
      doc.text('DESTAQUE',x+12,y+6.6,{align:'center'});
    }
    doc.setTextColor(31,40,50); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(option.name,x+4,y+14);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(105,116,127);
    doc.text('Investido',x+4,y+22); doc.text('Ganho estimado',x+4,y+34); doc.text('Resultado estimado',x+4,y+46); doc.text('Retorno / investido',x+4,y+58);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(35,45,55);
    doc.text(brl(option.invested),x+w-4,y+22,{align:'right'});
    doc.text(brl(option.gain),x+w-4,y+34,{align:'right'});
    doc.text(brl(option.total),x+w-4,y+46,{align:'right'});
    doc.text(pct(gainPct,1),x+w-4,y+58,{align:'right'});
  }

  function downloadReport(result, profile){
    if(!(global.jspdf && global.jspdf.jsPDF)) return legacyOpenReport(result,profile);

    const jsPDF = global.jspdf.jsPDF;
    const doc = new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    profile = profile || {};
    const strategy = result.input.strategy === 'com' ? 'Com lance de ' + pct(result.input.bidRate*100,1) : 'Sem lance';
    const client = result.input.client || 'Cliente não informado';

    header(doc,profile,'Relatório profissional de simulação');
    doc.setFont('helvetica','bold'); doc.setTextColor(35,45,55); doc.setFontSize(14); doc.text(client,12,46);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(100,110,120);
    doc.text(strategy + ' · ' + result.input.months + ' meses · emitido em ' + new Date(result.createdAt).toLocaleDateString('pt-BR'),12,52);

    card(doc,12,60,59,25,'Carta inicial',brl(result.input.credit),'');
    card(doc,75,60,59,25,'Parcela inicial',brl(result.basePayment),'');
    card(doc,138,60,60,25,'Total pago no período',brl(result.totalPaid),'');
    card(doc,12,90,59,25,'Carta corrigida',brl(result.correctedCredit),'');
    card(doc,75,90,59,25,'Valor estimado recebido',brl(result.received),'orange');
    card(doc,138,90,60,25,'Resultado estimado',brl(result.consortiumGain),result.consortiumGain>=0?'green':'');

    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(35,45,55); doc.text('Comparação financeira',12,128);
    const options = result.options || [];
    const bestKey = result.best && result.best.key;
    if(options[0]) drawOption(doc,12,136,58,65,options[0],options[0].key===bestKey);
    if(options[1]) drawOption(doc,76,136,58,65,options[1],options[1].key===bestKey);
    if(options[2]) drawOption(doc,140,136,58,65,options[2],options[2].key===bestKey);

    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(35,45,55); doc.text('Premissas registradas',12,216);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(85,95,105);
    const premises = [
      'INCC: ' + pct(result.input.incc*100,1) + ' a.a.',
      'Venda estimada: ' + pct(result.input.saleRate*100,1) + ' do crédito disponível',
      'Renda fixa: ' + pct(result.input.fixedAnnual*100,2) + ' a.a.',
      'Poupança: ' + pct(result.input.savingsMonthly*100,4) + ' a.m.',
      'Taxa administrativa total: ' + pct(result.input.adminRate*100,1),
      'Prazo total do grupo: ' + result.input.term + ' meses'
    ];
    doc.text(premises.slice(0,3),12,224);
    doc.text(premises.slice(3),108,224);

    doc.setDrawColor(225,229,233); doc.line(12,251,198,251);
    doc.setFontSize(7.2); doc.setTextColor(100,110,120);
    const note = 'Projeção matemática baseada nas premissas informadas. Não existe garantia de contemplação, prazo, valor de venda ou rentabilidade. Valores de renda fixa são brutos e podem estar sujeitos a tributação. Confira sempre as condições contratuais do grupo.';
    doc.text(doc.splitTextToSize(note,186),12,258);

    doc.save('simulacao-consorcio-' + safeFileName(result.input.client) + '.pdf');
  }

  S.PDF.openReport = downloadReport;
})(window);
