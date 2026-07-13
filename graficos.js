(function(global){
  'use strict';
  const S = global.Simulador = global.Simulador || {};
  const colors = {consorcio:'consorcio',renda:'renda',poupanca:'poupanca'};

  function render(container,result,metric='gain'){
    const calc = S.Calculos;
    const values = result.options.map(o=>Math.max(0,o[metric]));
    const max = Math.max(...values,1);
    container.innerHTML = result.options.map(option=>{
      const value = option[metric];
      const width = Math.max(2,Math.min(100,(Math.max(0,value)/max)*100));
      const subtitle = metric==='gain'?'Ganho estimado':'Total final';
      return `<div class="chart-row">
        <div class="chart-label"><div><b>${option.name}</b><span>${subtitle}</span></div><span class="chart-exact">${calc.brl(value)}</span></div>
        <div class="bar-track" aria-label="${option.name}: ${calc.brl(value)}">
          <div class="bar-fill ${colors[option.key]}" style="width:${width}%"><span class="bar-value">${calc.brl(value)}</span></div>
        </div>
      </div>`;
    }).join('');
  }

  function difference(container,result){
    const calc = S.Calculos;
    const dFixed = result.consortiumGain-result.fixedGain;
    const dSavings = result.consortiumGain-result.savingsGain;
    function item(label,value){
      const cls=value>=0?'positive':'negative';
      const prefix=value>=0?'+':'';
      return `<div class="difference-item"><span>${label}</span><strong class="${cls}">${prefix}${calc.brl(value)}</strong></div>`;
    }
    container.innerHTML = item('Consórcio x renda fixa',dFixed)+item('Consórcio x poupança',dSavings);
  }

  S.Graficos = {render,difference};
})(window);
