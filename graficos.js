(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};
  const colors = {consorcio:'consorcio',renda:'renda',poupanca:'poupanca'};

  function render(container,result,metric='gain'){
    const calc = S.Calculos;
    const values = result.options.map(option => Math.max(0, Number(option[metric]) || 0));
    const max = Math.max(...values, 1);
    const subtitle = metric === 'gain' ? 'Ganho estimado' : 'Total estimado';

    container.innerHTML = `<div class="vertical-chart">${result.options.map(option => {
      const value = Number(option[metric]) || 0;
      const ratio = Math.max(0, value) / max;
      const height = value > 0 ? Math.max(8, Math.min(100, ratio * 100)) : 2;
      return `<div class="vertical-chart-item">
        <div class="vertical-chart-value">${calc.brl(value)}</div>
        <div class="vertical-chart-track" aria-label="${option.name}: ${calc.brl(value)}">
          <div class="vertical-chart-fill ${colors[option.key]}" style="height:${height}%"></div>
        </div>
        <div class="vertical-chart-label"><b>${option.name}</b><span>${subtitle}</span></div>
      </div>`;
    }).join('')}</div>`;
  }

  S.Graficos = {render};
})(window);
