(function(global){
  'use strict';

  const S = global.Simulador;
  const $ = id => document.getElementById(id);

  const state = {
    strategy: 'sem',
    result: null,
    chartMetric: 'gain',
    settings: S.Configuracoes.load(),
    deferredInstall: null
  };

  function showMessage(id, text, type='success'){
    const el = $(id);
    el.textContent = text;
    el.className = `message ${type}`;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.hidden = true; }, 3400);
  }

  function formatCredit(){
    const el = $('credito');
    const digits = String(el.value || '').replace(/\D/g, '');
    el.value = digits ? parseInt(digits, 10).toLocaleString('pt-BR') : '';
  }

  function setStrategy(value){
    state.strategy = value;
    document.querySelectorAll('[data-strategy]').forEach(button => {
      button.classList.toggle('active', button.dataset.strategy === value);
    });
  }

  function navigate(view){
    document.querySelectorAll('.view').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    document.querySelectorAll('[data-nav]').forEach(button => {
      button.classList.toggle('active', button.dataset.nav === view);
    });
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function syncSettingsUI(){
    const settings = state.settings;
    $('empresa').value = settings.company;
    $('consultor').value = settings.consultant;
    $('telefone').value = settings.phone;
    $('cfgTaxa').value = settings.adminRate;
    $('cfgPrazo').value = settings.term;
    $('cfgLance').value = settings.bidRate;
    $('cfgReferencia').value = settings.reference;
    $('taxaAdminResumo').textContent = S.Calculos.percent(settings.adminRate, 1);
  }

  function readInput(){
    const settings = state.settings;
    return {
      client: $('cliente').value,
      strategy: state.strategy,
      credit: $('credito').value,
      months: $('meses').value,
      term: settings.term,
      adminRate: settings.adminRate,
      incc: $('incc').value,
      bidRate: settings.bidRate,
      saleRate: $('venda').value,
      fixedAnnual: $('selic').value,
      savingsMonthly: $('poupanca').value,
      reference: settings.reference
    };
  }

  function renderTable(result){
    $('comparisonTableBody').innerHTML = result.options.map(option => {
      const badge = option.key === result.best.key
        ? '<span class="best-badge">MAIOR RESULTADO</span>'
        : '';
      const gainClass = option.gain >= 0 ? 'positive' : 'negative';
      const profitability = option.invested ? option.gain / option.invested * 100 : 0;
      const capitalEfficiency = option.invested ? option.total / option.invested : 0;
      return `<tr>
        <td>${option.name}${badge}</td>
        <td>${S.Calculos.brl(option.invested)}</td>
        <td class="${gainClass}">${S.Calculos.brl(option.gain)}</td>
        <td class="${gainClass}">${S.Calculos.percent(profitability, 1)}</td>
        <td class="total-estimated">${S.Calculos.brl(option.total)}</td>
        <td>${S.Calculos.brl(capitalEfficiency * 1000)}</td>
      </tr>`;
    }).join('');
  }

  function renderResult(result){
    state.result = result;
    $('resultSection').hidden = false;
    const detailsBox = $('detailsBox');
    const detailsButton = $('toggleDetailsBtn');
    detailsBox.hidden = true;
    detailsButton.textContent = 'Ver detalhes do cálculo';
    detailsButton.setAttribute('aria-expanded', 'false');
    $('resultTitle').textContent = `Cenário em ${result.input.months} meses`;
    $('strategyBadge').textContent = result.input.strategy === 'com'
      ? `Com lance de ${S.Calculos.percent(result.input.bidRate * 100)}`
      : 'Sem lance';

    $('resParcela').textContent = S.Calculos.brl(result.basePayment);
    $('resInvestido').textContent = S.Calculos.brl(result.totalPaid);
    $('resRecebido').textContent = S.Calculos.brl(result.received);
    $('resGanho').textContent = S.Calculos.brl(result.consortiumGain);
    $('resGanho').classList.toggle('negative', result.consortiumGain < 0);

    $('resCreditoInicial').textContent = S.Calculos.brl(result.input.credit);
    $('resCreditoCorrigido').textContent = S.Calculos.brl(result.correctedCredit);
    $('resCreditoLiquido').textContent = S.Calculos.brl(result.netCredit);
    $('resReajustes').textContent = result.adjustments;
    $('resIncc').textContent = `${S.Calculos.percent(result.input.incc * 100)} a.a.`;
    $('resVenda').textContent = S.Calculos.percent(result.input.saleRate * 100);
    $('resSelic').textContent = `${S.Calculos.percent(result.input.fixedAnnual * 100)} a.a.`;
    $('resPoupanca').textContent =
      `${S.Calculos.percent(result.input.savingsMonthly * 100, 4)} a.m.`;

    S.Graficos.render($('comparisonChart'), result, state.chartMetric);
    renderTable(result);

    setTimeout(() => {
      $('resultSection').scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 80);
  }

  function calculate(){
    try{
      const result = S.Calculos.calculate(readInput());
      $('formError').hidden = true;
      renderResult(result);
    }catch(error){
      $('formError').textContent = error.message || 'Não foi possível calcular.';
      $('formError').hidden = false;
    }
  }

  async function copySummary(){
    if(!state.result) return;
    const text = S.Calculos.summaryText(state.result, state.settings);
    try{
      await navigator.clipboard.writeText(text);
      showMessage('actionMessage', 'Resumo copiado.');
    }catch{
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showMessage('actionMessage', 'Resumo copiado.');
    }
  }

  async function share(){
    if(!state.result) return;
    const text = S.Calculos.summaryText(state.result, state.settings);

    if(navigator.share){
      try{
        await navigator.share({title: 'Simulação de Consórcio', text});
        return;
      }catch(error){
        if(error.name === 'AbortError') return;
      }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  function numericOrDefault(id, fallback){
    const value = Number($(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function saveSettings(){
    state.settings = S.Configuracoes.save({
      company: $('empresa').value.trim(),
      consultant: $('consultor').value.trim(),
      phone: $('telefone').value.trim(),
      adminRate: Math.max(0, numericOrDefault('cfgTaxa', 24.2)),
      term: Math.min(220, Math.max(1, Math.round(numericOrDefault('cfgPrazo', 220)))),
      bidRate: Math.min(100, Math.max(0, numericOrDefault('cfgLance', 25))),
      reference: $('cfgReferencia').value.trim() || 'Não informada'
    });

    syncSettingsUI();
    showMessage('settingsMessage', 'Configurações salvas neste aparelho.');
  }

  function resetSettings(){
    state.settings = S.Configuracoes.reset();
    syncSettingsUI();
    showMessage('settingsMessage', 'Configurações restauradas.');
  }

  function install(){
    if(state.deferredInstall){
      state.deferredInstall.prompt();
      state.deferredInstall.userChoice.finally(() => {
        state.deferredInstall = null;
      });
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('installInstructions').innerHTML = isIOS
      ? '<p>No iPhone ou iPad:</p><ol><li>Abra este site no Safari.</li><li>Toque em <b>Compartilhar</b>.</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li></ol>'
      : '<p>No Android:</p><ol><li>Abra este site no Chrome.</li><li>Toque nos três pontos.</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li></ol>';

    $('installDialog').showModal();
  }

  function bind(){
    $('credito').addEventListener('input', formatCredit);
    $('credito').addEventListener('focus', event => event.target.select());

    document.querySelectorAll('[data-strategy]').forEach(button => {
      button.addEventListener('click', () => setStrategy(button.dataset.strategy));
    });

    $('calculateBtn').addEventListener('click', calculate);

    $('toggleDetailsBtn').addEventListener('click', () => {
      const box = $('detailsBox');
      box.hidden = !box.hidden;
      const expanded = !box.hidden;
      $('toggleDetailsBtn').textContent = expanded
        ? 'Ocultar detalhes do cálculo'
        : 'Ver detalhes do cálculo';
      $('toggleDetailsBtn').setAttribute('aria-expanded', String(expanded));
    });

    document.querySelectorAll('[data-chart-metric]').forEach(button => {
      button.addEventListener('click', () => {
        state.chartMetric = button.dataset.chartMetric;
        document.querySelectorAll('[data-chart-metric]').forEach(item => {
          item.classList.toggle('active', item === button);
        });
        if(state.result){
          S.Graficos.render($('comparisonChart'), state.result, state.chartMetric);
        }
      });
    });

    $('pdfBtn').addEventListener('click', () => {
      if(!state.result) return;
      try{
        S.PDF.openReport(state.result, state.settings);
      }catch(error){
        showMessage('actionMessage', error.message, 'error');
      }
    });

    $('copyBtn').addEventListener('click', copySummary);
    $('shareBtn').addEventListener('click', share);

    document.querySelectorAll('[data-nav]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.nav));
    });

    $('openSettingsInline').addEventListener('click', () => navigate('configuracoes'));
    $('saveSettingsBtn').addEventListener('click', saveSettings);
    $('resetSettingsBtn').addEventListener('click', resetSettings);
    $('installBtn').addEventListener('click', install);

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      state.deferredInstall = event;
    });
  }

  function initPWA(){
    if('serviceWorker' in navigator){
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./service-worker.js', { updateViaCache: 'none' })
          .then(registration => registration.update())
          .catch(() => {});
      });
    }
  }

  function init(){
    syncSettingsUI();
    formatCredit();
    setStrategy('sem');
    bind();
    initPWA();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
