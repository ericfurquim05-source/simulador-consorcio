(function(global){
  'use strict';

  const DB = global.FEDERAL_HISTORY_10Y_DB || null;
  const STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const DEFAULT_GROUP_SIZE = 5000;
  const MIN_DISTANCE = 21;
  const RANGE = 10;
  const DAY = 86400000;
  const cache = new Map();
  let backtestToken = 0;

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const pct = (value, digits = 1) => fmt(value, digits) + '%';

  function activeGroupSize(){
    const input = $('sorteioGroupSize');
    return clamp(Math.round(Number(input?.value) || DEFAULT_GROUP_SIZE), 1, 9999);
  }

  function parseDate(value){
    return new Date(String(value) + 'T12:00:00Z').getTime();
  }

  function dateLabel(value){
    if(!value) return 'nenhuma ocorrência';
    const [y,m,d] = value.split('-');
    return `${d}/${m}/${y}`;
  }

  function minusYears(dateValue, years){
    const d = new Date(String(dateValue) + 'T12:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0,10);
  }

  function groupReference(reference, groupSize){
    const digits = String(reference ?? '').replace(/\D/g, '');
    if(!digits) return null;
    const tail = digits.slice(-4).padStart(4,'0');
    let base = Number(tail);
    if(!Number.isFinite(base)) return null;
    if(base === 0) base = 10000;
    return ((base - 1) % groupSize) + 1;
  }

  function mappedRows(groupSize){
    if(!DB?.rows?.length) return [];
    return DB.rows.map(([date, reference]) => ({
      date,
      ms: parseDate(date),
      number: groupReference(reference, groupSize)
    })).filter(item => Number.isInteger(item.number));
  }

  function rowsBetween(rows, start, endExclusive){
    const a = start ? parseDate(start) : -Infinity;
    const b = endExclusive ? parseDate(endExclusive) : Infinity;
    return rows.filter(item => item.ms >= a && item.ms < b);
  }

  function frequency(draws, groupSize){
    const exact = new Uint32Array(groupSize + 1);
    for(const draw of draws) exact[draw.number] += 1;
    const prefix = new Uint32Array(groupSize + 1);
    let total = 0;
    for(let i=1;i<=groupSize;i+=1){
      total += exact[i];
      prefix[i] = total;
    }
    return {exact, prefix};
  }

  function bandBounds(number, radius, groupSize){
    return [Math.max(1, number - radius), Math.min(groupSize, number + radius)];
  }

  function bandCount(prefix, number, radius, groupSize){
    const [from,to] = bandBounds(number, radius, groupSize);
    return prefix[to] - (from > 1 ? prefix[from - 1] : 0);
  }

  function bandWidth(number, radius, groupSize){
    const [from,to] = bandBounds(number, radius, groupSize);
    return to - from + 1;
  }

  function poissonCdf(k, lambda){
    if(lambda <= 0) return 1;
    let term = Math.exp(-lambda);
    let sum = term;
    for(let i=1;i<=k;i+=1){
      term *= lambda / i;
      sum += term;
      if(term < 1e-14) break;
    }
    return clamp(sum, 0, 1);
  }

  function lowIncidenceScore(observed, expected){
    return clamp((1 - poissonCdf(Math.max(0, Math.floor(observed)), Math.max(0, expected))) * 100, 0, 100);
  }

  function upperBound(sorted, value){
    let lo = 0;
    let hi = sorted.length;
    while(lo < hi){
      const mid = (lo + hi) >> 1;
      if(sorted[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function buildAnalysis(groupSize){
    const key = String(groupSize);
    if(cache.has(key)) return cache.get(key);

    const all = mappedRows(groupSize);
    if(!all.length) return null;
    const latest = all[all.length - 1].date;
    const cutoff5 = minusYears(latest, 5);
    const cutoff10 = minusYears(latest, 10);
    const ten = rowsBetween(all, cutoff10, null);
    const five = rowsBetween(all, cutoff5, null);
    const previousFive = rowsBetween(all, cutoff10, cutoff5);
    const f10 = frequency(ten, groupSize);
    const f5 = frequency(five, groupSize);
    const fp = frequency(previousFive, groupSize);

    const lastIndex = new Int32Array(groupSize + 1);
    lastIndex.fill(-1);
    const lastDate = new Array(groupSize + 1).fill(null);
    ten.forEach((draw, index) => {
      const [from,to] = bandBounds(draw.number, RANGE, groupSize);
      for(let n=from;n<=to;n+=1){
        lastIndex[n] = index;
        lastDate[n] = draw.date;
      }
    });

    const stats = new Array(groupSize + 1);
    const rawScores = [];
    for(let n=1;n<=groupSize;n+=1){
      const e10Exact = ten.length / groupSize;
      const e5Exact = five.length / groupSize;
      const e10r5 = ten.length * bandWidth(n,5,groupSize) / groupSize;
      const e10r10 = ten.length * bandWidth(n,10,groupSize) / groupSize;
      const e10r20 = ten.length * bandWidth(n,20,groupSize) / groupSize;
      const e5r10 = five.length * bandWidth(n,10,groupSize) / groupSize;
      const ep5r10 = previousFive.length * bandWidth(n,10,groupSize) / groupSize;

      const exact10 = f10.exact[n];
      const exact5 = f5.exact[n];
      const r5_10 = bandCount(f10.prefix,n,5,groupSize);
      const r10_10 = bandCount(f10.prefix,n,10,groupSize);
      const r20_10 = bandCount(f10.prefix,n,20,groupSize);
      const r10_5 = bandCount(f5.prefix,n,10,groupSize);
      const r10_prev = bandCount(fp.prefix,n,10,groupSize);
      const sinceDraws = lastIndex[n] < 0 ? ten.length : Math.max(0, ten.length - 1 - lastIndex[n]);
      const expectedGap = groupSize / bandWidth(n,10,groupSize);
      const recency = 100 * (1 - Math.exp(-sinceDraws / Math.max(1, expectedGap)));
      const recentRatio = e5r10 ? r10_5 / e5r10 : 0;
      const previousRatio = ep5r10 ? r10_prev / ep5r10 : 0;
      const trend = clamp(50 + (previousRatio - recentRatio) * 25, 0, 100);

      const rawScore =
        lowIncidenceScore(exact10,e10Exact) * 0.05 +
        lowIncidenceScore(exact5,e5Exact) * 0.05 +
        lowIncidenceScore(r5_10,e10r5) * 0.10 +
        lowIncidenceScore(r10_10,e10r10) * 0.20 +
        lowIncidenceScore(r20_10,e10r20) * 0.10 +
        lowIncidenceScore(r10_5,e5r10) * 0.20 +
        recency * 0.15 +
        trend * 0.05;

      stats[n] = {
        number:n, rawScore, exact10, exact5, r5_10, r10_10, r20_10, r10_5, r10_prev,
        e10Exact, e5Exact, e10r5, e10r10, e10r20, e5r10, ep5r10,
        sinceDraws, lastDate:lastDate[n], recency, trend
      };
      rawScores.push(rawScore);
    }

    const sorted = rawScores.slice().sort((a,b)=>a-b);
    for(let n=1;n<=groupSize;n+=1){
      stats[n].index = (upperBound(sorted, stats[n].rawScore) / groupSize) * 100;
    }

    const result = {groupSize, all, ten, five, previousFive, latest, cutoff5, cutoff10, stats};
    cache.set(key, result);
    return result;
  }

  function readRegistered(groupSize){
    const values = [];
    try{
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      for(const client of Array.isArray(stored?.clients) ? stored.clients : []){
        for(const value of Array.isArray(client?.cotas) ? client.cotas : []){
          const n = Number(String(value).replace(/\D/g,''));
          if(Number.isInteger(n) && n >= 1 && n <= groupSize) values.push(n);
        }
      }
    }catch(_error){}
    const pending = String($('sorteioClientQuotas')?.value || '').match(/\d+/g) || [];
    for(const value of pending){
      const n = Number(value.slice(-4));
      if(Number.isInteger(n) && n >= 1 && n <= groupSize) values.push(n);
    }
    return [...new Set(values)];
  }

  function minimumDistance(number, values){
    if(!values.length) return Infinity;
    let min = Infinity;
    for(const value of values) min = Math.min(min, Math.abs(number - value));
    return min;
  }

  function coverageMask(values, groupSize){
    const covered = new Uint8Array(groupSize + 1);
    for(const number of values){
      const [from,to] = bandBounds(number,RANGE,groupSize);
      for(let n=from;n<=to;n+=1) covered[n] = 1;
    }
    return covered;
  }

  function marginalCoverage(number, covered, groupSize){
    const [from,to] = bandBounds(number,RANGE,groupSize);
    let gain = 0;
    for(let n=from;n<=to;n+=1) if(!covered[n]) gain += 1;
    return {gain, width:to-from+1};
  }

  function addCoverage(number, covered, groupSize){
    const [from,to] = bandBounds(number,RANGE,groupSize);
    for(let n=from;n<=to;n+=1) covered[n] = 1;
  }

  function recommendFromStats(stats, groupSize, count, occupied = []){
    const chosen = [];
    const anchors = occupied.slice();
    const covered = coverageMask(anchors, groupSize);
    const limit = Math.min(Math.max(1, count), Math.ceil(groupSize / MIN_DISTANCE));

    for(let step=0;step<limit;step+=1){
      let best = null;
      const allAnchors = anchors.concat(chosen.map(item => item.number));
      for(let n=1;n<=groupSize;n+=1){
        if(allAnchors.includes(n)) continue;
        const nearest = minimumDistance(n, allAnchors);
        if(nearest < MIN_DISTANCE) continue;
        const coverage = marginalCoverage(n, covered, groupSize);
        const gainScore = (coverage.gain / Math.max(1, coverage.width)) * 100;
        const spreadScore = allAnchors.length ? clamp(nearest / (MIN_DISTANCE * 4), 0, 1) * 100 : 100;
        const distribution = gainScore * 0.65 + spreadScore * 0.35;
        const historical = stats[n]?.index ?? 50;
        const combined = distribution * 0.70 + historical * 0.30;
        if(!best || combined > best.combined || (combined === best.combined && historical > best.historical)){
          best = {number:n, combined, historical, distribution, gain:coverage.gain, nearest};
        }
      }
      if(!best) break;
      chosen.push(best);
      addCoverage(best.number, covered, groupSize);
    }
    return chosen;
  }

  function appendQuota(number){
    const textarea = $('sorteioClientQuotas');
    if(!textarea) return;
    const formatted = String(number).padStart(4,'0');
    const existing = String(textarea.value || '').match(/\d+/g)?.map(v=>v.slice(-4).padStart(4,'0')) || [];
    if(!existing.includes(formatted)) existing.push(formatted);
    textarea.value = existing.join(', ');
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
    textarea.focus();
  }

  function renderAnalysis(number){
    const groupSize = activeGroupSize();
    const analysis = buildAnalysis(groupSize);
    const result = $('hist10Result');
    if(!analysis || !result) return;
    const n = clamp(Math.round(Number(number) || 1),1,groupSize);
    const s = analysis.stats[n];
    const top = Math.max(0.1, 100 - s.index);
    const lastText = s.lastDate ? `${dateLabel(s.lastDate)} · ${s.sinceDraws} sorteios atrás` : `não apareceu na faixa ±10 na janela`;
    result.innerHTML = `
      <div class="hist10-score"><span>Índice Histórico de Baixa Incidência</span><strong>${fmt(s.index,0)} / 100</strong><small>Está entre aproximadamente os ${fmt(top,1)}% de números/faixas menos incidentes da janela.</small></div>
      <div class="hist10-grid">
        <div><span>Exato · 10 anos</span><strong>${s.exact10}</strong><small>esperado ${fmt(s.e10Exact,2)}</small></div>
        <div><span>Exato · 5 anos</span><strong>${s.exact5}</strong><small>esperado ${fmt(s.e5Exact,2)}</small></div>
        <div><span>Faixa ±5 · 10 anos</span><strong>${s.r5_10}</strong><small>esperado ${fmt(s.e10r5,2)}</small></div>
        <div><span>Faixa ±10 · 10 anos</span><strong>${s.r10_10}</strong><small>esperado ${fmt(s.e10r10,2)}</small></div>
        <div><span>Faixa ±20 · 10 anos</span><strong>${s.r20_10}</strong><small>esperado ${fmt(s.e10r20,2)}</small></div>
        <div><span>Últimos 5 anos · ±10</span><strong>${s.r10_5}</strong><small>esperado ${fmt(s.e5r10,2)}</small></div>
      </div>
      <div class="hist10-compare"><b>5 anos recentes x 5 anteriores:</b> ${s.r10_5} ocorrências recentes contra ${s.r10_prev} anteriores na faixa ±10. <b>Última ocorrência próxima:</b> ${lastText}.</div>
      <p class="hist10-note">Este índice mede baixa incidência histórica e posição relativa entre as ${groupSize.toLocaleString('pt-BR')} cotas. Ele não significa “chance de sair” e não altera a probabilidade teórica do próximo sorteio.</p>`;
  }

  function renderRecommendations(){
    const groupSize = activeGroupSize();
    const analysis = buildAnalysis(groupSize);
    if(!analysis) return;
    const count = clamp(Math.round(Number($('hist10QuotaCount')?.value) || 20),1,100);
    const occupied = readRegistered(groupSize);
    const picks = recommendFromStats(analysis.stats, groupSize, count, occupied);
    const list = $('hist10Recommendations');
    if(!list) return;
    list.innerHTML = picks.length ? picks.map((pick,index)=>`
      <button type="button" class="hist10-pick" data-hist10-quota="${pick.number}">
        <b>${String(pick.number).padStart(4,'0')}</b>
        <span>#${index+1} · score ${fmt(pick.combined,0)}</span>
        <small>histórico ${fmt(pick.historical,0)} · distribuição ${fmt(pick.distribution,0)}</small>
      </button>`).join('') : '<div class="radar-empty">Não encontrei posições que mantenham a distância mínima de 21 números.</div>';
    list.querySelectorAll('[data-hist10-quota]').forEach(button => button.addEventListener('click',()=>appendQuota(Number(button.dataset.hist10Quota))));
    const meta = $('hist10RecommendationMeta');
    if(meta) meta.textContent = `${picks.length} sugestões · 70% cobertura/distribuição + 30% histórico · distância mínima 21 · ${occupied.length} cota(s) já consideradas`;
  }

  function trainingScores(draws, groupSize){
    const f = frequency(draws, groupSize);
    const lastIndex = new Int32Array(groupSize + 1);
    lastIndex.fill(-1);
    draws.forEach((draw,index)=>{
      const [from,to] = bandBounds(draw.number,RANGE,groupSize);
      for(let n=from;n<=to;n+=1) lastIndex[n] = index;
    });
    const raw = new Array(groupSize + 1);
    const values = [];
    for(let n=1;n<=groupSize;n+=1){
      const ex = f.exact[n];
      const r5 = bandCount(f.prefix,n,5,groupSize);
      const r10 = bandCount(f.prefix,n,10,groupSize);
      const r20 = bandCount(f.prefix,n,20,groupSize);
      const eExact = draws.length/groupSize;
      const e5 = draws.length*bandWidth(n,5,groupSize)/groupSize;
      const e10 = draws.length*bandWidth(n,10,groupSize)/groupSize;
      const e20 = draws.length*bandWidth(n,20,groupSize)/groupSize;
      const since = lastIndex[n] < 0 ? draws.length : draws.length - 1 - lastIndex[n];
      const gap = groupSize / bandWidth(n,10,groupSize);
      const recency = 100*(1-Math.exp(-since/Math.max(1,gap)));
      const score = lowIncidenceScore(ex,eExact)*0.05 + lowIncidenceScore(r5,e5)*0.20 + lowIncidenceScore(r10,e10)*0.35 + lowIncidenceScore(r20,e20)*0.20 + recency*0.20;
      raw[n] = {number:n, rawScore:score};
      values.push(score);
    }
    const sorted = values.slice().sort((a,b)=>a-b);
    for(let n=1;n<=groupSize;n+=1) raw[n].index = upperBound(sorted,raw[n].rawScore)/groupSize*100;
    return raw;
  }

  function rng(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function randomPortfolio(groupSize, count, random){
    const values = Array.from({length:groupSize},(_,i)=>i+1);
    for(let i=values.length-1;i>0;i-=1){
      const j = Math.floor(random()*(i+1));
      [values[i],values[j]] = [values[j],values[i]];
    }
    const blocked = new Uint8Array(groupSize+1);
    const selected = [];
    for(const n of values){
      if(blocked[n]) continue;
      selected.push(n);
      const [from,to] = bandBounds(n,MIN_DISTANCE-1,groupSize);
      for(let x=from;x<=to;x+=1) blocked[x]=1;
      if(selected.length>=count) break;
    }
    return selected;
  }

  function hitCount(portfolio, draws, groupSize){
    const covered = coverageMask(portfolio,groupSize);
    let hits = 0;
    for(const draw of draws) if(covered[draw.number]) hits += 1;
    return hits;
  }

  async function runBacktest(){
    const token = ++backtestToken;
    const output = $('hist10Backtest');
    if(!output || !DB?.rows?.length) return;
    output.innerHTML = '<div class="radar-empty">Rodando backtest 2021–2026…</div>';
    await new Promise(resolve=>setTimeout(resolve,20));
    const groupSize = activeGroupSize();
    const all = mappedRows(groupSize);
    const rows = [];
    let totalTest = 0;
    let totalAlgo = 0;
    let totalRandom = 0;

    for(let year=2021;year<=2026;year+=1){
      if(token !== backtestToken) return;
      const train = rowsBetween(all,`${year-5}-01-01`,`${year}-01-01`);
      const test = rowsBetween(all,`${year}-01-01`,`${year+1}-01-01`);
      if(!train.length || !test.length) continue;
      const stats = trainingScores(train,groupSize);
      const algorithm = recommendFromStats(stats,groupSize,100,[]).map(item=>item.number);
      const algoHits = hitCount(algorithm,test,groupSize);
      let randomHits = 0;
      const random = rng(9000+year);
      const samples = 100;
      for(let sample=0;sample<samples;sample+=1){
        randomHits += hitCount(randomPortfolio(groupSize,algorithm.length,random),test,groupSize);
      }
      const randomAverage = randomHits/samples;
      const algoRate = algoHits/test.length*100;
      const randomRate = randomAverage/test.length*100;
      const lift = randomRate ? (algoRate/randomRate-1)*100 : 0;
      rows.push({year,test:test.length,algoHits,randomAverage,algoRate,randomRate,lift});
      totalTest += test.length;
      totalAlgo += algoHits;
      totalRandom += randomAverage;
    }

    const algoTotalRate = totalTest ? totalAlgo/totalTest*100 : 0;
    const randomTotalRate = totalTest ? totalRandom/totalTest*100 : 0;
    const totalLift = randomTotalRate ? (algoTotalRate/randomTotalRate-1)*100 : 0;
    const verdict = totalLift > 5 ? 'vantagem histórica no período' : totalLift < -5 ? 'desempenho pior que o aleatório no período' : 'sem vantagem material sobre o aleatório';
    output.innerHTML = `
      <div class="hist10-backtest-summary"><span>Backtest consolidado</span><strong>${totalLift>=0?'+':''}${fmt(totalLift,1)}%</strong><small>${verdict}. Algoritmo ${pct(algoTotalRate,1)} x média aleatória ${pct(randomTotalRate,1)}.</small></div>
      <div class="hist10-backtest-rows">${rows.map(row=>`<div><b>${row.year}</b><span>${row.algoHits}/${row.test} hits (${pct(row.algoRate,1)})</span><small>aleatório ${fmt(row.randomAverage,1)} hits · ${row.lift>=0?'+':''}${fmt(row.lift,1)}%</small></div>`).join('')}</div>
      <p class="hist10-note">Teste sem olhar o futuro: cada ano usa apenas os 5 anos anteriores. A carteira tem 100 cotas com distância mínima de 21; a comparação é a média de 100 carteiras aleatórias com a mesma regra. É um teste descritivo, não uma promessa de desempenho futuro.</p>`;
  }

  function injectStyle(){
    if($('hist10Style')) return;
    const style = document.createElement('style');
    style.id = 'hist10Style';
    style.textContent = `
      .hist10-panel{margin-top:16px}.hist10-top{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}.hist10-top .field{flex:1 1 180px}.hist10-top button{flex:0 0 auto}.hist10-score,.hist10-backtest-summary{margin-top:16px;padding:18px;border:1px solid rgba(133,214,170,.28);border-radius:18px;background:rgba(24,45,38,.26)}
      .hist10-score span,.hist10-backtest-summary span{display:block;font-size:12px;opacity:.75}.hist10-score strong,.hist10-backtest-summary strong{display:block;font-size:32px;line-height:1.1;margin:6px 0}.hist10-score small,.hist10-backtest-summary small{display:block;opacity:.78;line-height:1.45}
      .hist10-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.hist10-grid>div{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.025)}.hist10-grid span,.hist10-grid small{display:block;opacity:.72;font-size:12px}.hist10-grid strong{display:block;font-size:22px;margin:5px 0}
      .hist10-compare,.hist10-note{font-size:13px;line-height:1.55;opacity:.82}.hist10-compare{margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.035)}.hist10-note{margin:12px 0 0}
      .hist10-recommendations{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.hist10-pick{text-align:left;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);color:inherit}.hist10-pick b{font-size:20px;display:block}.hist10-pick span,.hist10-pick small{display:block;font-size:11px;opacity:.72;margin-top:3px}.hist10-meta{margin-top:10px;font-size:12px;opacity:.7}
      .hist10-backtest-rows{display:grid;gap:8px;margin-top:12px}.hist10-backtest-rows>div{display:grid;grid-template-columns:56px 1fr;gap:3px 10px;padding:11px 12px;border-radius:13px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)}.hist10-backtest-rows b{grid-row:1/3;font-size:16px}.hist10-backtest-rows span,.hist10-backtest-rows small{font-size:12px;opacity:.78}
      @media(min-width:760px){.hist10-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.hist10-recommendations{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function injectUI(){
    if($('sorteioHistory10Y')) return;
    const anchor = document.querySelector('.radar-probability-panel');
    if(!anchor) return;
    injectStyle();
    const section = document.createElement('section');
    section.id = 'sorteioHistory10Y';
    section.innerHTML = `
      <article class="panel hist10-panel">
        <div class="result-topline"><div><div class="eyebrow">Histórico inteligente</div><h2>10 anos de sorteios da Federal</h2></div><span class="pill">2016–2026</span></div>
        <p class="lead">Todos os 1ºs prêmios da base entram normalizados para o tamanho do grupo. Em grupo de 5.000, 7125 vira 2125. O score mede baixa incidência histórica; não aumenta a chance matemática do próximo sorteio.</p>
        <div class="radar-group-math-kpis"><div><span>Sorteios carregados</span><strong id="hist10DrawCount">—</strong></div><div><span>Janela</span><strong id="hist10Window">—</strong></div><div><span>Regra</span><strong>módulo do grupo</strong></div></div>
        <div class="hist10-top"><div class="field"><label for="hist10Number">Analisar número</label><div class="control"><input id="hist10Number" type="number" min="1" max="5000" value="3000" inputmode="numeric"></div></div><button id="hist10AnalyzeBtn" class="secondary-button" type="button">Analisar histórico</button></div>
        <div id="hist10Result"></div>
      </article>
      <article class="panel hist10-panel">
        <div class="result-topline"><div><div class="eyebrow">Carteira 70/30</div><h2>Cotas recomendadas</h2></div><span class="pill">DISTÂNCIA 21</span></div>
        <p class="lead">A seleção prioriza 70% cobertura/distribuição matemática e 30% baixa incidência histórica, sem repetir faixas já ocupadas.</p>
        <div class="hist10-top"><div class="field"><label for="hist10QuotaCount">Quantidade de cotas</label><div class="control"><input id="hist10QuotaCount" type="number" value="20" min="1" max="100"><span>cotas</span></div></div><button id="hist10RecommendBtn" class="secondary-button" type="button">Gerar carteira</button></div>
        <div id="hist10RecommendationMeta" class="hist10-meta"></div><div id="hist10Recommendations" class="hist10-recommendations"></div>
      </article>
      <article class="panel hist10-panel">
        <div class="result-topline"><div><div class="eyebrow">Validação sem achismo</div><h2>Backtest 2021–2026</h2></div><button id="hist10BacktestBtn" class="secondary-button" type="button">Rodar novamente</button></div>
        <p class="lead">Para cada ano, o sistema fecha os olhos para o futuro, usa somente os 5 anos anteriores, escolhe 100 cotas e compara com carteiras aleatórias sob a mesma distância mínima.</p>
        <div id="hist10Backtest"></div>
      </article>`;
    anchor.insertAdjacentElement('afterend',section);

    const summarySmall = document.querySelector('.radar-federal-history-panel summary small');
    if(summarySmall) summarySmall.textContent = 'Resumo visual mensal; a análise acima usa todos os sorteios da base 2016–2026';

    if(DB){
      $('hist10DrawCount').textContent = DB.drawCount.toLocaleString('pt-BR');
      $('hist10Window').textContent = `${dateLabel(DB.startDate)} → ${dateLabel(DB.endDate)}`;
    }

    $('hist10AnalyzeBtn')?.addEventListener('click',()=>renderAnalysis($('hist10Number')?.value));
    $('hist10Number')?.addEventListener('keydown',event=>{if(event.key==='Enter') renderAnalysis(event.target.value);});
    $('hist10RecommendBtn')?.addEventListener('click',renderRecommendations);
    $('hist10BacktestBtn')?.addEventListener('click',runBacktest);
    $('sorteioGroupSize')?.addEventListener('change',()=>{
      cache.clear();
      const size = activeGroupSize();
      if($('hist10Number')) $('hist10Number').max = size;
      renderAnalysis(Math.min(Number($('hist10Number')?.value)||3000,size));
      renderRecommendations();
      runBacktest();
    });

    if(!DB){
      $('hist10Result').innerHTML = '<div class="message error">A base histórica de 10 anos não carregou.</div>';
      return;
    }
    renderAnalysis($('hist10Number')?.value || 3000);
    renderRecommendations();
    setTimeout(runBacktest,60);
  }

  function init(){
    if(!$('view-sorteio')) return;
    injectUI();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
