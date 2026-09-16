(function(){
  'use strict';

  const STORAGE_KEY = 'simulador-aposentadoria-financeira-v1';
  const $ = id => document.getElementById(id);

  function brl(value){
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function pct(value, digits = 1){
    return `${(Number(value) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })}%`;
  }

  function parseMoney(value){
    let text = String(value ?? '').trim().replace(/R\$/g, '').replace(/\s/g, '');
    if(!text) return 0;
    if(text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
    const number = Number(text.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function formatMoneyInput(value){
    const number = parseMoney(value);
    return number
      ? new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2}).format(number)
      : '';
  }

  function number(id, fallback){
    const value = Number(String($(id)?.value ?? '').replace(',', '.'));
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function adjustmentCycles(month){
    return Math.max(0, Math.floor(Math.max(0, month) / 12));
  }

  function adjusted(base, annualRate, month){
    return base * Math.pow(1 + annualRate, adjustmentCycles(month));
  }

  function paymentForMonth(baseFullPayment, annualRate, month, contemplationMonth, prePercent){
    const full = adjusted(baseFullPayment, annualRate, month);
    return month < contemplationMonth ? full * prePercent : full;
  }

  function investmentBalanceAtMonth(capitalAtContemplation, monthlyReturn, contemplationMonth, month){
    if(month < contemplationMonth) return 0;
    const monthsInvested = Math.max(0, month - contemplationMonth);
    return capitalAtContemplation * Math.pow(1 + monthlyReturn, monthsInvested);
  }

  function readInput(){
    const credit = parseMoney($('aposCredito').value);
    const fullPayment = parseMoney($('aposParcela').value);
    const term = Math.round(number('aposPrazo', 180));
    const contemplationMonth = Math.round(number('aposContemplacao', 60));
    const annualAdjustment = clamp(number('aposReajuste', 6), 0, 100) / 100;
    const monthlyReturn = clamp(number('aposRendimento', 1), 0, 100) / 100;
    const retirementRate = clamp(number('aposRendaMensal', 1), 0, 100) / 100;
    const prePaymentPercent = clamp(number('aposParcelaPre', 50), 0, 100) / 100;

    if(credit <= 0) throw new Error('Informe o valor da carta.');
    if(fullPayment <= 0) throw new Error('Informe a parcela cheia atual.');
    if(term < 1 || term > 360) throw new Error('Informe um prazo entre 1 e 360 meses.');
    if(contemplationMonth < 1 || contemplationMonth > term){
      throw new Error('O mês de contemplação precisa estar dentro do prazo do grupo.');
    }

    return {
      client: ($('aposCliente').value || '').trim(),
      credit,
      fullPayment,
      term,
      contemplationMonth,
      annualAdjustment,
      monthlyReturn,
      retirementRate,
      prePaymentPercent
    };
  }

  function calculate(input){
    const creditAtContemplation = adjusted(input.credit, input.annualAdjustment, input.contemplationMonth);
    const paymentAtContemplation = adjusted(input.fullPayment, input.annualAdjustment, input.contemplationMonth);
    const finalPayment = adjusted(input.fullPayment, input.annualAdjustment, input.term);
    const investmentMonths = Math.max(0, input.term - input.contemplationMonth);
    const finalCapital = creditAtContemplation * Math.pow(1 + input.monthlyReturn, investmentMonths);
    const projectedMonthlyIncome = finalCapital * input.retirementRate;

    let totalPaid = 0;
    let paidUntilContemplation = 0;
    const paidByMonth = [];

    for(let month = 1; month <= input.term; month += 1){
      const payment = paymentForMonth(
        input.fullPayment,
        input.annualAdjustment,
        month,
        input.contemplationMonth,
        input.prePaymentPercent
      );
      totalPaid += payment;
      if(month <= input.contemplationMonth) paidUntilContemplation += payment;
      paidByMonth[month] = totalPaid;
    }

    const gainAfterContemplation = finalCapital - creditAtContemplation;
    const capitalToPaidRatio = totalPaid > 0 ? finalCapital / totalPaid : 0;

    const timelineMonths = [];
    for(let month = 12; month < input.term; month += 12) timelineMonths.push(month);
    if(!timelineMonths.includes(input.contemplationMonth)) timelineMonths.push(input.contemplationMonth);
    if(!timelineMonths.includes(input.term)) timelineMonths.push(input.term);
    timelineMonths.sort((a, b) => a - b);

    const timeline = timelineMonths.map(month => ({
      month,
      credit: adjusted(input.credit, input.annualAdjustment, month),
      payment: paymentForMonth(
        input.fullPayment,
        input.annualAdjustment,
        month,
        input.contemplationMonth,
        input.prePaymentPercent
      ),
      paid: paidByMonth[month] || totalPaid,
      invested: investmentBalanceAtMonth(
        creditAtContemplation,
        input.monthlyReturn,
        input.contemplationMonth,
        month
      ),
      isContemplation: month === input.contemplationMonth,
      isEnd: month === input.term
    }));

    return {
      input,
      creditAtContemplation,
      paymentAtContemplation,
      finalPayment,
      investmentMonths,
      finalCapital,
      projectedMonthlyIncome,
      totalPaid,
      paidUntilContemplation,
      gainAfterContemplation,
      capitalToPaidRatio,
      timeline
    };
  }

  function save(input){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        client: input.client,
        credit: input.credit,
        fullPayment: input.fullPayment,
        term: input.term,
        contemplationMonth: input.contemplationMonth,
        annualAdjustment: input.annualAdjustment * 100,
        monthlyReturn: input.monthlyReturn * 100,
        retirementRate: input.retirementRate * 100,
        prePaymentPercent: input.prePaymentPercent * 100
      }));
    }catch(_error){}
  }

  function restore(){
    let saved = null;
    try{ saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(_error){}
    if(!saved) return;
    if($('aposCliente')) $('aposCliente').value = saved.client || '';
    if($('aposCredito')) $('aposCredito').value = formatMoneyInput(saved.credit || 100000);
    if($('aposParcela')) $('aposParcela').value = formatMoneyInput(saved.fullPayment || 540);
    if($('aposPrazo')) $('aposPrazo').value = Math.round(saved.term || 180);
    if($('aposContemplacao')) $('aposContemplacao').value = Math.round(saved.contemplationMonth || 60);
    if($('aposReajuste')) $('aposReajuste').value = Number(saved.annualAdjustment ?? 6).toFixed(2);
    if($('aposRendimento')) $('aposRendimento').value = Number(saved.monthlyReturn ?? 1).toFixed(2);
    if($('aposRendaMensal')) $('aposRendaMensal').value = Number(saved.retirementRate ?? 1).toFixed(2);
    if($('aposParcelaPre')) $('aposParcelaPre').value = Number(saved.prePaymentPercent ?? 50).toFixed(0);
  }

  function rowLabel(item){
    if(item.isContemplation) return `Mês ${item.month} · contemplação`;
    if(item.isEnd) return `Mês ${item.month} · fim do grupo`;
    return `Mês ${item.month}`;
  }

  function render(result){
    const box = $('aposResultado');
    box.hidden = false;

    $('aposResTotalPago').textContent = brl(result.totalPaid);
    $('aposResCartaContemplacao').textContent = brl(result.creditAtContemplation);
    $('aposResCapitalFinal').textContent = brl(result.finalCapital);
    $('aposResRenda').textContent = `${brl(result.projectedMonthlyIncome)}/mês`;

    $('aposResCartaHoje').textContent = brl(result.input.credit);
    $('aposResCartaMeio').textContent = brl(result.creditAtContemplation);
    $('aposResCartaFim').textContent = brl(result.finalCapital);

    $('aposResParcelaHoje').textContent = brl(result.input.fullPayment);
    $('aposResParcelaContemplacao').textContent = brl(result.paymentAtContemplation);
    $('aposResParcelaFim').textContent = brl(result.finalPayment);

    $('aposResPagoContemplacao').textContent = brl(result.paidUntilContemplation);
    $('aposResMesesRendendo').textContent = `${result.investmentMonths} meses`;
    $('aposResGanhoAplicacao').textContent = brl(result.gainAfterContemplation);
    $('aposResEficiencia').textContent = `${result.capitalToPaidRatio.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;

    $('aposTimelineBody').innerHTML = result.timeline.map(item => `
      <tr class="${item.isContemplation ? 'apos-milestone' : ''} ${item.isEnd ? 'apos-end' : ''}">
        <td>${rowLabel(item)}</td>
        <td>${brl(item.credit)}</td>
        <td>${brl(item.payment)}</td>
        <td>${brl(item.paid)}</td>
        <td>${item.invested ? brl(item.invested) : '—'}</td>
      </tr>
    `).join('');

    $('aposHeadline').textContent = result.input.client
      ? `Projeção de aposentadoria · ${result.input.client}`
      : 'Projeção de aposentadoria';

    setTimeout(() => box.scrollIntoView({behavior: 'smooth', block: 'start'}), 80);
  }

  async function copySummary(){
    let result;
    try{ result = calculate(readInput()); }catch(error){
      showError(error.message);
      return;
    }

    const text = [
      'PROJEÇÃO DE APOSENTADORIA',
      result.input.client ? `Cliente: ${result.input.client}` : '',
      `Carta inicial: ${brl(result.input.credit)}`,
      `Mês estimado de contemplação: ${result.input.contemplationMonth}`,
      `Carta projetada na contemplação: ${brl(result.creditAtContemplation)}`,
      `Reajuste utilizado: ${pct(result.input.annualAdjustment * 100, 1)} a.a.`,
      `Rentabilidade projetada após contemplação: ${pct(result.input.monthlyReturn * 100, 2)} a.m.`,
      `Total estimado pago no consórcio: ${brl(result.totalPaid)}`,
      `Patrimônio projetado no fim do grupo: ${brl(result.finalCapital)}`,
      `Renda mensal projetada: ${brl(result.projectedMonthlyIncome)}/mês`,
      '',
      'Projeção matemática. Contemplação e rentabilidade não são garantidas. O recebimento do crédito em dinheiro depende das condições legais, contratuais e da quitação das obrigações aplicáveis.'
    ].filter(Boolean).join('\n');

    try{
      await navigator.clipboard.writeText(text);
      $('aposMessage').textContent = 'Resumo copiado.';
      $('aposMessage').hidden = false;
    }catch(_error){
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      $('aposMessage').textContent = 'Resumo copiado.';
      $('aposMessage').hidden = false;
    }
  }

  function showError(message){
    const el = $('aposError');
    el.textContent = message || 'Não foi possível calcular.';
    el.hidden = false;
  }

  function calculateAndRender(){
    try{
      const input = readInput();
      const result = calculate(input);
      $('aposError').hidden = true;
      save(input);
      render(result);
    }catch(error){
      showError(error.message);
    }
  }

  function injectStyles(){
    const style = document.createElement('style');
    style.id = 'aposentadoria-financeira-styles';
    style.textContent = `
      .bottom-nav{grid-template-columns:repeat(5,1fr)!important}
      .apos-hero{border-color:#314f42;background:linear-gradient(145deg,#111b1a,#101820)}
      .apos-reference{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:14px 0}
      .apos-reference>div,.apos-kpi>div,.apos-detail-grid>div{border:1px solid var(--line);background:#0b1219;border-radius:14px;padding:13px;min-width:0}
      .apos-reference span,.apos-kpi span,.apos-detail-grid span{display:block;font-size:9px;color:var(--muted);line-height:1.35}
      .apos-reference strong,.apos-kpi strong,.apos-detail-grid strong{display:block;margin-top:6px;font-size:17px;overflow-wrap:anywhere}
      .apos-kpi{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:15px}
      .apos-kpi .apos-highlight{border-color:#326948;background:#0e2015}
      .apos-kpi .apos-highlight strong{color:var(--green);font-size:24px}
      .apos-journey{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:14px}
      .apos-journey>div:not(.apos-arrow){background:#0b1219;border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center;min-width:0}
      .apos-journey span{display:block;font-size:9px;color:var(--muted);line-height:1.35}
      .apos-journey strong{display:block;font-size:16px;margin-top:6px;overflow-wrap:anywhere}
      .apos-arrow{color:var(--orange);font-size:22px;font-weight:900}
      .apos-detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px}
      .apos-table{width:100%;border-collapse:separate;border-spacing:0 7px;min-width:760px}
      .apos-table th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:right;padding:0 9px}
      .apos-table th:first-child{text-align:left}
      .apos-table td{background:#0b1219;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:11px 9px;text-align:right;font-size:11px}
      .apos-table td:first-child{text-align:left;border-left:1px solid var(--line);border-radius:11px 0 0 11px;font-weight:800}
      .apos-table td:last-child{border-right:1px solid var(--line);border-radius:0 11px 11px 0}
      .apos-table tr.apos-milestone td{background:#20170d;border-color:#6e481d}
      .apos-table tr.apos-end td{background:#0e2015;border-color:#326948}
      .apos-note{margin-top:12px;padding:12px 13px;border:1px solid #665523;background:#292313;color:#e8dba9;border-radius:14px;font-size:10px;line-height:1.55}
      .apos-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}
      @media(max-width:680px){
        .bottom-nav{grid-template-columns:repeat(5,1fr)!important;width:calc(100% - 16px)}
        .bottom-nav button{padding:7px 3px;font-size:7.5px}.bottom-nav button span{font-size:15px}
        .apos-reference,.apos-kpi,.apos-detail-grid{grid-template-columns:1fr 1fr}
        .apos-journey{grid-template-columns:1fr;gap:6px}
        .apos-arrow{transform:rotate(90deg);text-align:center;line-height:1}
      }
    `;
    document.head.appendChild(style);
  }

  function sectionHTML(){
    return `
      <section id="view-aposentadoria" class="view" data-view="aposentadoria">
        <article class="panel hero-panel apos-hero">
          <div class="result-topline">
            <div>
              <div class="eyebrow">Formação de renda futura</div>
              <h2>Aposentadoria Financeira</h2>
            </div>
            <span class="pill">PROJEÇÃO</span>
          </div>
          <p class="lead">Projete a carta até a contemplação, simule o capital rendendo depois de contemplado e veja quanto esse patrimônio poderia representar no fim do grupo.</p>

          <div class="form-grid">
            <div class="field full">
              <label for="aposCliente">Nome do cliente <span class="optional">opcional</span></label>
              <div class="control"><input id="aposCliente" type="text" maxlength="80" placeholder="Ex.: João da Silva" autocomplete="off"></div>
            </div>
            <div class="field">
              <label for="aposCredito">Valor inicial da carta</label>
              <div class="control money-control"><span>R$</span><input id="aposCredito" type="text" inputmode="decimal" value="100.000"></div>
            </div>
            <div class="field">
              <label for="aposParcela">Parcela cheia atual</label>
              <div class="control money-control"><span>R$</span><input id="aposParcela" type="text" inputmode="decimal" value="540"></div>
            </div>
            <div class="field">
              <label for="aposPrazo">Prazo total do grupo</label>
              <div class="control"><input id="aposPrazo" type="number" value="180" min="1" max="360"><span>meses</span></div>
            </div>
            <div class="field">
              <label for="aposContemplacao">Mês estimado da contemplação</label>
              <div class="control"><input id="aposContemplacao" type="number" value="60" min="1" max="360"><span>mês</span></div>
            </div>
          </div>

          <div class="apos-reference">
            <div><span>Reajuste de crédito e parcela</span><strong>6% a.a.</strong></div>
            <div><span>Rendimento após contemplação</span><strong>1% a.m.</strong></div>
            <div><span>Renda projetada no fim</span><strong>1% a.m.</strong></div>
          </div>

          <details class="assumptions">
            <summary><span>Premissas da projeção</span><small>Valores editáveis</small></summary>
            <div class="form-grid assumptions-grid">
              <div class="field">
                <label for="aposReajuste">Reajuste anual</label>
                <div class="control"><input id="aposReajuste" type="number" value="6.00" step="0.1" min="0"><span>% a.a.</span></div>
              </div>
              <div class="field">
                <label for="aposRendimento">Rentabilidade do capital</label>
                <div class="control"><input id="aposRendimento" type="number" value="1.00" step="0.01" min="0"><span>% a.m.</span></div>
              </div>
              <div class="field">
                <label for="aposParcelaPre">Parcela antes da contemplação</label>
                <div class="control"><input id="aposParcelaPre" type="number" value="50" step="1" min="0" max="100"><span>% da cheia</span></div>
              </div>
              <div class="field">
                <label for="aposRendaMensal">Renda mensal projetada no fim</label>
                <div class="control"><input id="aposRendaMensal" type="number" value="1.00" step="0.01" min="0"><span>% do patrimônio</span></div>
              </div>
            </div>
            <div class="assumption-footer">
              <span>O modelo usa reajustes por ciclos anuais e capitalização mensal após a contemplação.</span>
            </div>
          </details>

          <div id="aposError" class="message error" hidden></div>
          <button id="aposCalcularBtn" class="primary-button" type="button">Projetar aposentadoria</button>
        </article>

        <section id="aposResultado" class="result-stack" hidden>
          <article class="panel">
            <div class="section-heading">
              <div>
                <div class="eyebrow">Resultado</div>
                <h2 id="aposHeadline">Projeção de aposentadoria</h2>
                <p class="lead">Quanto saiu do bolso durante o plano e quanto o capital aplicado poderia representar no encerramento do grupo.</p>
              </div>
            </div>

            <div class="apos-kpi">
              <div><span>Total estimado pago no consórcio</span><strong id="aposResTotalPago">R$ 0,00</strong></div>
              <div><span>Carta projetada na contemplação</span><strong id="aposResCartaContemplacao">R$ 0,00</strong></div>
              <div class="apos-highlight"><span>Patrimônio projetado no fim do grupo</span><strong id="aposResCapitalFinal">R$ 0,00</strong></div>
              <div class="apos-highlight"><span>Renda mensal projetada</span><strong id="aposResRenda">R$ 0,00/mês</strong></div>
            </div>

            <div class="apos-journey">
              <div><span>Carta hoje</span><strong id="aposResCartaHoje">R$ 0,00</strong></div>
              <div class="apos-arrow">→</div>
              <div><span>Capital na contemplação</span><strong id="aposResCartaMeio">R$ 0,00</strong></div>
              <div class="apos-arrow">→</div>
              <div><span>Capital no fim do grupo</span><strong id="aposResCartaFim">R$ 0,00</strong></div>
            </div>

            <div class="apos-journey">
              <div><span>Parcela cheia hoje</span><strong id="aposResParcelaHoje">R$ 0,00</strong></div>
              <div class="apos-arrow">→</div>
              <div><span>Parcela cheia na contemplação</span><strong id="aposResParcelaContemplacao">R$ 0,00</strong></div>
              <div class="apos-arrow">→</div>
              <div><span>Parcela cheia no fim</span><strong id="aposResParcelaFim">R$ 0,00</strong></div>
            </div>

            <div class="apos-detail-grid">
              <div><span>Pago até a contemplação</span><strong id="aposResPagoContemplacao">R$ 0,00</strong></div>
              <div><span>Tempo do capital rendendo</span><strong id="aposResMesesRendendo">0 meses</strong></div>
              <div><span>Ganho projetado da aplicação</span><strong id="aposResGanhoAplicacao">R$ 0,00</strong></div>
              <div><span>Patrimônio final / total pago</span><strong id="aposResEficiencia">0,00x</strong></div>
            </div>
          </article>

          <article class="panel">
            <div class="section-heading">
              <div>
                <div class="eyebrow">Evolução</div>
                <h2>Crédito, parcela e patrimônio ao longo do tempo</h2>
                <p class="lead">A linha destacada marca a contemplação. A última linha mostra o encerramento do grupo.</p>
              </div>
            </div>
            <div class="table-wrap">
              <table class="apos-table">
                <thead><tr><th>Momento</th><th>Crédito projetado</th><th>Parcela do mês</th><th>Total pago</th><th>Capital aplicado</th></tr></thead>
                <tbody id="aposTimelineBody"></tbody>
              </table>
            </div>
          </article>

          <article class="panel">
            <h2>Resumo para apresentar</h2>
            <p class="lead">A projeção mostra formação de patrimônio e renda futura. Ela não compara financiamento, aluguel ou compra de imóvel.</p>
            <div class="apos-actions">
              <button id="aposCopiarBtn" class="action-button" type="button"><span>⧉</span>Copiar resumo</button>
            </div>
            <div id="aposMessage" class="message success" hidden></div>
            <div class="apos-note"><b>Importante:</b> esta é uma projeção matemática, não uma promessa de resultado. A contemplação e a rentabilidade não são garantidas. O recebimento do crédito em dinheiro depende das condições legais e contratuais aplicáveis e da quitação das obrigações exigidas.</div>
          </article>
        </section>
      </section>
    `;
  }

  function injectViewAndNav(){
    if($('view-aposentadoria')) return;

    const main = document.querySelector('main');
    const sorteio = $('view-sorteio');
    if(main){
      const wrapper = document.createElement('div');
      wrapper.innerHTML = sectionHTML().trim();
      const section = wrapper.firstElementChild;
      if(sorteio) main.insertBefore(section, sorteio);
      else main.appendChild(section);
    }

    const nav = document.querySelector('.bottom-nav');
    if(nav){
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.nav = 'aposentadoria';
      button.innerHTML = '<span>◈</span>Aposentadoria';
      const settingsButton = nav.querySelector('[data-nav="configuracoes"]');
      if(settingsButton) nav.insertBefore(button, settingsButton);
      else nav.appendChild(button);

      button.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(item => {
          item.classList.toggle('active', item.dataset.view === 'aposentadoria');
        });
        document.querySelectorAll('[data-nav]').forEach(item => {
          item.classList.toggle('active', item.dataset.nav === 'aposentadoria');
        });
        window.scrollTo({top: 0, behavior: 'smooth'});
      });
    }
  }

  function bind(){
    ['aposCredito', 'aposParcela'].forEach(id => {
      $(id)?.addEventListener('blur', event => {
        event.target.value = formatMoneyInput(event.target.value);
      });
      $(id)?.addEventListener('focus', event => event.target.select());
    });
    $('aposCalcularBtn')?.addEventListener('click', calculateAndRender);
    $('aposCopiarBtn')?.addEventListener('click', copySummary);
  }

  function init(){
    injectStyles();
    injectViewAndNav();
    restore();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();