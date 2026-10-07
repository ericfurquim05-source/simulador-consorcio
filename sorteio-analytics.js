(function(global){
  'use strict';

  const DB = global.FEDERAL_HISTORY_10Y_DB || null;
  const CLIENT_STORAGE_KEY = 'simulador-sorteio-radar-v3';
  const STRUCTURE_STORAGE_KEY = 'simulador-sorteio-estrutura-v1';
  const DEFAULT_GROUP_SIZE = 5000;
  const DEFAULT_GROUP_TERM = 220;
  const RANGE = 10;
  const historyCache = new Map();
  const structureCache = new Map();

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const pad = value => String(value).padStart(4, '0');

  function activeGroupSize(){
    return clamp(Math.round(Number($('sorteioGroupSize')?.value) || DEFAULT_GROUP_SIZE), 1, 9999);
  }

  function activeGroupTerm(){
    return clamp(Math.round(Number($('sorteioGroupTerm')?.value) || DEFAULT_GROUP_TERM), 1, 360);
  }

  function loadJSON(key, fallback){
    try{
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    }catch(_error){
      return fallback;
    }
  }

  function parseDate(value){ return new Date(String(value) + 'T12:00:00Z').getTime(); }
  function dateLabel(value){ if(!value) return '—'; const [y,m,d] = String(value).split('-'); return `${d}/${m}/${y}`; }
  function minusYears(dateValue, years){ const d = new Date(String(dateValue) + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - years); return d.toISOString().slice(0,10); }

  function groupReference(reference, groupSize = activeGroupSize()){
    const digits = String(reference ?? '').replace(/\D/g, '');
    if(!digits) return null;
    const tail = digits.slice(-4).padStart(4, '0');
    let base = Number(tail);
    if(!Number.isFinite(base)) return null;
    if(base === 0) base = 10000;
    return ((base - 1) % groupSize) + 1;
  }

  function mappedRows(groupSize){
    if(!DB?.rows?.length) return [];
    return DB.rows.map(([date, reference]) => ({date, ms:parseDate(date), number:groupReference(reference, groupSize)})).filter(item => Number.isInteger(item.number));
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
    for(let i=1;i<=groupSize;i+=1){ total += exact[i]; prefix[i] = total; }
    return {exact, prefix};
  }

  function bandBounds(number, radius, groupSize){ return [Math.max(1, number-radius), Math.min(groupSize, number+radius)]; }
  function bandCount(prefix, number, radius, groupSize){ const [from,to] = bandBounds(number,radius,groupSize); return prefix[to] - (from > 1 ? prefix[from-1] : 0); }
  function bandWidth(number, radius, groupSize){ const [from,to] = bandBounds(number,radius,groupSize); return to-from+1; }

  function poissonCdf(k, lambda){
    if(lambda <= 0) return 1;
    let term = Math.exp(-lambda), sum = term;
    for(let i=1;i<=k;i+=1){ term *= lambda/i; sum += term; if(term < 1e-14) break; }
    return clamp(sum,0,1);
  }

  function lowIncidenceScore(observed, expected){ return clamp((1-poissonCdf(Math.max(0,Math.floor(observed)),Math.max(0,expected)))*100,0,100); }
  function upperBound(sorted, value){ let lo=0, hi=sorted.length; while(lo<hi){ const mid=(lo+hi)>>1; if(sorted[mid] <= value) lo=mid+1; else hi=mid; } return lo; }
  function percentile(values){ const sorted = values.slice().sort((a,b)=>a-b); return value => sorted.length ? upperBound(sorted,value)/sorted.length*100 : 0; }

  function buildHistory(groupSize){
    const key=String(groupSize);
    if(historyCache.has(key)) return historyCache.get(key);
    const all=mappedRows(groupSize);
    if(!all.length) return null;
    const latest=all[all.length-1].date;
    const cutoff5=minusYears(latest,5), cutoff10=minusYears(latest,10);
    const ten=rowsBetween(all,cutoff10,null), five=rowsBetween(all,cutoff5,null), previousFive=rowsBetween(all,cutoff10,cutoff5);
    const f10=frequency(ten,groupSize), f5=frequency(five,groupSize), fp=frequency(previousFive,groupSize);
    const lastIndex=new Int32Array(groupSize+1); lastIndex.fill(-1);
    const lastDate=new Array(groupSize+1).fill(null);
    ten.forEach((draw,index)=>{ const [from,to]=bandBounds(draw.number,RANGE,groupSize); for(let n=from;n<=to;n+=1){lastIndex[n]=index;lastDate[n]=draw.date;} });
    const stats=new Array(groupSize+1), raw=[];
    for(let n=1;n<=groupSize;n+=1){
      const eExact10=ten.length/groupSize, eExact5=five.length/groupSize;
      const e5=ten.length*bandWidth(n,5,groupSize)/groupSize, e10=ten.length*bandWidth(n,10,groupSize)/groupSize, e20=ten.length*bandWidth(n,20,groupSize)/groupSize;
      const eRecent=five.length*bandWidth(n,10,groupSize)/groupSize, ePrevious=previousFive.length*bandWidth(n,10,groupSize)/groupSize;
      const exact10=f10.exact[n], exact5=f5.exact[n], r5=bandCount(f10.prefix,n,5,groupSize), r10=bandCount(f10.prefix,n,10,groupSize), r20=bandCount(f10.prefix,n,20,groupSize);
      const recent=bandCount(f5.prefix,n,10,groupSize), previous=bandCount(fp.prefix,n,10,groupSize);
      const since=lastIndex[n] < 0 ? ten.length : Math.max(0,ten.length-1-lastIndex[n]);
      const expectedGap=groupSize/bandWidth(n,10,groupSize), recency=100*(1-Math.exp(-since/Math.max(1,expectedGap)));
      const recentRatio=eRecent ? recent/eRecent : 0, previousRatio=ePrevious ? previous/ePrevious : 0;
      const trend=clamp(50+(previousRatio-recentRatio)*25,0,100);
      const score=lowIncidenceScore(exact10,eExact10)*0.05+lowIncidenceScore(exact5,eExact5)*0.05+lowIncidenceScore(r5,e5)*0.10+lowIncidenceScore(r10,e10)*0.25+lowIncidenceScore(r20,e20)*0.10+lowIncidenceScore(recent,eRecent)*0.25+recency*0.15+trend*0.05;
      stats[n]={number:n,rawScore:score,exact10,exact5,r5,r10,r20,recent,previous,eExact10,eExact5,e5,e10,e20,eRecent,ePrevious,since,lastDate:lastDate[n]}; raw.push(score);
    }
    const p=percentile(raw); for(let n=1;n<=groupSize;n+=1) stats[n].index=p(stats[n].rawScore);
    const result={groupSize,all,ten,five,previousFive,latest,cutoff5,cutoff10,stats}; historyCache.set(key,result); return result;
  }

  function defaultStructure(){ return {ageMonths:0,currentDepth:'',scheduleText:'',contemplatedText:''}; }
  function loadStructure(){ return {...defaultStructure(),...loadJSON(STRUCTURE_STORAGE_KEY,{})}; }
  function saveStructureData(data){ localStorage.setItem(STRUCTURE_STORAGE_KEY,JSON.stringify(data)); }

  function parseSchedule(text){
    const rows=[];
    String(text||'').split(/\n+/).forEach(line=>{ const m=line.match(/(\d+)\s*-\s*(\d+)\s*[:=]\s*(\d+)/); if(!m) return; const start=Number(m[1]),end=Number(m[2]),depth=Number(m[3]); if(start>=1&&end>=start&&depth>=1) rows.push({start,end,depth}); });
    return rows.sort((a,b)=>a.start-b.start);
  }

  function parseContemplated(text, groupSize){
    const map=new Map(); const regex=/(\d{1,4})\s*[:=@]\s*(\d{1,3})/g; let match;
    while((match=regex.exec(String(text||'')))){ const number=Number(match[1]),month=Number(match[2]); if(number<1||number>groupSize||month<1) continue; const current=map.get(number); if(current===undefined||month<current) map.set(number,month); }
    return map;
  }

  function resolvedStructure(){
    const groupSize=activeGroupSize(), groupTerm=activeGroupTerm(), data=loadStructure();
    const ageMonths=clamp(Math.round(Number(data.ageMonths)||0),0,groupTerm), schedule=parseSchedule(data.scheduleText), scheduled=schedule.find(row=>ageMonths>=row.start&&ageMonths<=row.end), manual=Math.round(Number(data.currentDepth)||0), depth=scheduled?.depth||(manual>=1?manual:0), contemplated=parseContemplated(data.contemplatedText,groupSize);
    return {data,groupSize,groupTerm,ageMonths,schedule,depth,depthSource:scheduled?'faixa histórica':manual>=1?'manual':'não informado',contemplated};
  }

  function lowerBound(array,value){ let lo=0,hi=array.length; while(lo<hi){ const mid=(lo+hi)>>1; if(array[mid]<value) lo=mid+1; else hi=mid; } return lo; }
  function activeNumbersFor(structure, month=structure.ageMonths){ const active=[]; for(let n=1;n<=structure.groupSize;n+=1){ const contemplatedMonth=structure.contemplated.get(n); if(contemplatedMonth!==undefined&&contemplatedMonth<=month) continue; active.push(n); } return active; }

  function candidateQuotas(base, active, depth){
    const result=[], pos=lowerBound(active,base), exact=active[pos]===base;
    if(exact) result.push({number:base,rank:0,direction:'exata',numericDistance:0});
    const upStart=exact?pos+1:pos, downStart=pos-1;
    for(let rank=1;rank<=depth;rank+=1){ const up=active[upStart+rank-1], down=active[downStart-rank+1]; if(up!==undefined) result.push({number:up,rank,direction:'acima',numericDistance:up-base}); if(down!==undefined) result.push({number:down,rank,direction:'abaixo',numericDistance:base-down}); }
    return result;
  }

  function buildReachability(structure){
    const signature=[structure.groupSize,structure.ageMonths,structure.depth,structure.data.contemplatedText].join('|');
    if(structureCache.has(signature)) return structureCache.get(signature);
    const active=activeNumbersFor(structure), activeSet=new Set(active), coverage=Array.from({length:structure.groupSize+1},()=>[]);
    if(structure.depth>0){ for(let base=1;base<=structure.groupSize;base+=1){ for(const item of candidateQuotas(base,active,structure.depth)) coverage[item.number].push(base); } }
    else for(const number of active) coverage[number].push(number);
    const exposureRaw=[],gapRaw=[],metrics=new Array(structure.groupSize+1).fill(null),history=buildHistory(structure.groupSize);
    for(let i=0;i<active.length;i+=1){ const number=active[i],previous=active[i-1],next=active[i+1],leftGap=previous===undefined?number-1:number-previous-1,rightGap=next===undefined?structure.groupSize-number:next-number-1,gap=leftGap+rightGap; exposureRaw.push(coverage[number].length); gapRaw.push(gap); metrics[number]={number,coverage:coverage[number],exposure:coverage[number].length,gap,leftGap,rightGap,historical:history?.stats?.[number]?.index??50}; }
    const exposurePercentile=percentile(exposureRaw),gapPercentile=percentile(gapRaw),ageScore=structure.groupTerm?clamp(structure.ageMonths/structure.groupTerm*100,0,100):0;
    for(const number of active){ const metric=metrics[number]; metric.exposureScore=exposurePercentile(metric.exposure); metric.gapScore=gapPercentile(metric.gap); metric.ageScore=ageScore; metric.score=metric.exposureScore*0.40+metric.gapScore*0.25+metric.historical*0.20+ageScore*0.15; }
    const result={structure,active,activeSet,coverage,metrics,history}; structureCache.set(signature,result); return result;
  }

  function readRegistered(groupSize){
    const values=[],stored=loadJSON(CLIENT_STORAGE_KEY,{});
    for(const client of Array.isArray(stored?.clients)?stored.clients:[]) for(const value of Array.isArray(client?.cotas)?client.cotas:[]){ const n=Number(String(value).replace(/\D/g,'')); if(Number.isInteger(n)&&n>=1&&n<=groupSize) values.push(n); }
    const pending=String($('sorteioClientQuotas')?.value||'').match(/\d+/g)||[]; for(const value of pending){ const n=Number(value.slice(-4)); if(Number.isInteger(n)&&n>=1&&n<=groupSize) values.push(n); }
    return [...new Set(values)];
  }

  function unionCoverage(numbers, engine){ const mask=new Uint8Array(engine.structure.groupSize+1); let count=0; for(const number of numbers){ if(!engine.activeSet.has(number)) continue; for(const base of engine.coverage[number]) if(!mask[base]){mask[base]=1;count+=1;} } return {mask,count}; }
  function marginal(number,mask,engine){ let fresh=0,overlap=0; for(const base of engine.coverage[number]){ if(mask[base]) overlap+=1; else fresh+=1; } return {fresh,overlap,total:fresh+overlap}; }
  function addToMask(number,mask,engine){ for(const base of engine.coverage[number]) mask[base]=1; }

  function recommendPortfolio(count){
    const structure=resolvedStructure(),engine=buildReachability(structure),owned=readRegistered(structure.groupSize).filter(number=>engine.activeSet.has(number)),ownedSet=new Set(owned),baseline=unionCoverage(owned,engine),mask=baseline.mask,picks=[],limit=clamp(Math.round(Number(count)||1),1,Math.min(100,engine.active.length));
    for(let step=0;step<limit;step+=1){ let best=null; for(const number of engine.active){ if(ownedSet.has(number)||picks.some(item=>item.number===number)) continue; const m=marginal(number,mask,engine),metric=engine.metrics[number],candidate={number,...m,score:metric.score,exposure:metric.exposure,historical:metric.historical}; if(!best||candidate.fresh>best.fresh||(candidate.fresh===best.fresh&&candidate.score>best.score)||(candidate.fresh===best.fresh&&candidate.score===best.score&&candidate.overlap<best.overlap)) best=candidate; } if(!best) break; picks.push(best); addToMask(best.number,mask,engine); }
    let finalCoverage=0; for(let n=1;n<=structure.groupSize;n+=1) if(mask[n]) finalCoverage+=1;
    return {structure,engine,owned,currentCoverage:baseline.count,finalCoverage,picks};
  }

  function matchForClients(reference, clients){
    const structure=resolvedStructure(),engine=buildReachability(structure),base=groupReference(reference,structure.groupSize); if(!base) return [];
    const owners=new Map(); for(const client of Array.isArray(clients)?clients:[]) for(const value of Array.isArray(client?.cotas)?client.cotas:[]){ const number=Number(value); if(!owners.has(number)) owners.set(number,[]); owners.get(number).push(client); }
    const matches=[]; for(const item of candidateQuotas(base,engine.active,structure.depth)){ for(const client of owners.get(item.number)||[]){ matches.push({clientId:client.id,nome:client.nome,cota:pad(item.number),distance:item.rank,structuralRank:item.rank,direction:item.rank===0?'exata':`${item.rank}ª ativa ${item.direction} · ${item.numericDistance} números de distância`,numericDistance:item.numericDistance,structural:true,base}); } }
    return matches.sort((a,b)=>a.structuralRank-b.structuralRank||a.numericDistance-b.numericDistance||a.nome.localeCompare(b.nome,'pt-BR'));
  }

  global.SORTEIO_STRUCTURAL_ENGINE={matchesForClients:matchForClients,normalize:groupReference,current:()=>resolvedStructure(),reachability:()=>buildReachability(resolvedStructure())};

  function appendQuota(number){ const textarea=$('sorteioClientQuotas'); if(!textarea) return; const formatted=pad(number),existing=String(textarea.value||'').match(/\d+/g)?.map(v=>pad(Number(v.slice(-4))))||[]; if(!existing.includes(formatted)) existing.push(formatted); textarea.value=existing.join(', '); textarea.dispatchEvent(new Event('input',{bubbles:true})); textarea.focus(); }
  function recommendationLabel(score){ if(score>=80) return 'FORTE'; if(score>=60) return 'BOA'; if(score>=40) return 'MÉDIA'; return 'FRACA'; }
  function scoreClass(score){ if(score>=75) return 'high'; if(score>=50) return 'medium'; return 'low'; }

  function renderQuotaAnalysis(number){
    const target=$('hist10Result'); if(!target) return; const structure=resolvedStructure(),history=buildHistory(structure.groupSize); if(!history){target.innerHTML='<div class="message error">A base histórica de 10 anos não carregou.</div>';return;}
    const n=clamp(Math.round(Number(number)||1),1,structure.groupSize),h=history.stats[n],contemplatedMonth=structure.contemplated.get(n),isActive=contemplatedMonth===undefined||contemplatedMonth>structure.ageMonths,engine=buildReachability(structure),metric=engine.metrics[n],top=Math.max(0.1,100-h.index);
    const historicalBlock=`<div class="hist10-grid"><div><span>Exato · 10 anos</span><strong>${h.exact10}</strong><small>esperado ${fmt(h.eExact10,2)}</small></div><div><span>Exato · 5 anos</span><strong>${h.exact5}</strong><small>esperado ${fmt(h.eExact5,2)}</small></div><div><span>Faixa ±5 · 10 anos</span><strong>${h.r5}</strong><small>esperado ${fmt(h.e5,2)}</small></div><div><span>Faixa ±10 · 10 anos</span><strong>${h.r10}</strong><small>esperado ${fmt(h.e10,2)}</small></div><div><span>Faixa ±20 · 10 anos</span><strong>${h.r20}</strong><small>esperado ${fmt(h.e20,2)}</small></div><div><span>Últimos 5 anos · ±10</span><strong>${h.recent}</strong><small>5 anteriores: ${h.previous}</small></div></div>`;
    if(!isActive){ target.innerHTML=`<div class="hist10-score contemplated"><span>Cota ${pad(n)}</span><strong>CONTEMPLADA</strong><small>Mês ${contemplatedMonth}. Ela sai da estrutura ativa a partir desse mês.</small></div>${historicalBlock}`; return; }
    if(structure.depth<=0){ target.innerHTML=`<div class="hist10-score"><span>Cota ${pad(n)} · histórico</span><strong>${fmt(h.index,0)} / 100</strong><small>Entre aproximadamente os ${fmt(top,1)}% de menores incidências históricas. Configure os níveis reais de aproximação do grupo para liberar o score estrutural.</small></div>${historicalBlock}`; return; }
    const coverage=metric.coverage,from=coverage.length?Math.min(...coverage):null,to=coverage.length?Math.max(...coverage):null;
    target.innerHTML=`<div class="hist10-score ${scoreClass(metric.score)}"><span>Cota ${pad(n)} · Score geral</span><strong>${fmt(metric.score,0)} / 100</strong><small>${recommendationLabel(metric.score)} · ativa no mês ${structure.ageMonths||'atual'} · alcance estrutural calculado por posição entre cotas ativas.</small></div><div class="hist10-grid structural"><div><span>Exposição por aproximação · 40%</span><strong>${fmt(metric.exposureScore,0)}</strong><small>${metric.exposure} resultados-base alcançam esta cota</small></div><div><span>Lacunas ao redor · 25%</span><strong>${fmt(metric.gapScore,0)}</strong><small>${metric.leftGap} removidas à esquerda · ${metric.rightGap} à direita</small></div><div><span>Histórico Federal · 20%</span><strong>${fmt(metric.historical,0)}</strong><small>5 e 10 anos combinados</small></div><div><span>Idade do grupo · 15%</span><strong>${fmt(metric.ageScore,0)}</strong><small>${structure.ageMonths} de ${structure.groupTerm} meses</small></div><div><span>Cobertura estrutural</span><strong>${metric.exposure}</strong><small>${from?pad(from):'—'} até ${to?pad(to):'—'} como extremos dos resultados-base</small></div><div><span>Níveis ativos por lado</span><strong>${structure.depth}</strong><small>fonte: ${structure.depthSource}</small></div></div>${historicalBlock}<p class="hist10-note">O histórico não significa que um número “está para sair”. O score estrutural mede alcance entre cotas ainda ativas e cobertura de resultados-base.</p>`;
  }

  function renderRecommendations(){
    const output=$('hist10Recommendations'),meta=$('hist10RecommendationMeta'); if(!output||!meta) return; const count=clamp(Math.round(Number($('hist10QuotaCount')?.value)||20),1,100),result=recommendPortfolio(count);
    if(result.structure.depth<=0){ meta.textContent='Configure os níveis reais de aproximação do grupo antes de otimizar a carteira.'; output.innerHTML='<div class="radar-empty">Sem inventar 8, 14 ou qualquer outra média: o otimizador só roda quando tu informar a regra real deste grupo.</div>'; return; }
    meta.textContent=`${result.picks.length} sugestões · sem distância mínima fixa · cobertura atual ${result.currentCoverage}/${result.structure.groupSize} → ${result.finalCoverage}/${result.structure.groupSize}`;
    output.innerHTML=result.picks.map((pick,index)=>`<button type="button" class="hist10-pick ${scoreClass(pick.score)}" data-hist10-quota="${pick.number}"><b>${pad(pick.number)}</b><span>#${index+1} · ${recommendationLabel(pick.score)} · score ${fmt(pick.score,0)}</span><small>+${pick.fresh} cobertura nova · ${pick.overlap} sobrepostos · alcance ${pick.exposure}</small></button>`).join('')||'<div class="radar-empty">Nenhuma cota ativa disponível.</div>';
    output.querySelectorAll('[data-hist10-quota]').forEach(button=>button.addEventListener('click',()=>appendQuota(Number(button.dataset.hist10Quota))));
  }

  function renderStructureSummary(){
    const structure=resolvedStructure(),active=activeNumbersFor(structure),status=$('hist10StructureStatus');
    if(status){ status.className='hist10-structure-status '+(structure.depth>0?'ready':'warning'); status.innerHTML=structure.depth>0?`<b>Estrutura ativa:</b> ${active.length.toLocaleString('pt-BR')} cotas vivas · ${structure.contemplated.size.toLocaleString('pt-BR')} contempladas cadastradas · ${structure.depth} nível(is) por lado (${structure.depthSource}).`:`<b>Falta um dado real:</b> informe “níveis de aproximação por lado” ou uma faixa de idade que cubra o mês ${structure.ageMonths}. O sistema não vai inventar essa média.`; }
    if($('hist10ActiveCount')) $('hist10ActiveCount').textContent=active.length.toLocaleString('pt-BR'); if($('hist10RemovedCount')) $('hist10RemovedCount').textContent=structure.contemplated.size.toLocaleString('pt-BR'); if($('hist10DepthCount')) $('hist10DepthCount').textContent=structure.depth?String(structure.depth):'—';
  }

  function saveStructureFromForm(){
    const data={ageMonths:Math.max(0,Math.round(Number($('hist10AgeMonths')?.value)||0)),currentDepth:String($('hist10CurrentDepth')?.value||'').trim(),scheduleText:String($('hist10Schedule')?.value||''),contemplatedText:String($('hist10Contemplated')?.value||'')}; saveStructureData(data); structureCache.clear(); renderStructureSummary(); renderQuotaAnalysis($('hist10Number')?.value||3000); renderRecommendations(); renderMap();
  }

  function drawMap(canvas,engine){
    const width=Math.max(300,Math.round(canvas.clientWidth||320)),cols=100,rows=Math.ceil(engine.structure.groupSize/cols),cell=Math.max(3,Math.floor(width/cols)),cssWidth=cell*cols,cssHeight=cell*rows,ratio=Math.max(1,Math.min(2,global.devicePixelRatio||1));
    canvas.width=cssWidth*ratio; canvas.height=cssHeight*ratio; canvas.style.width=cssWidth+'px'; canvas.style.height=cssHeight+'px'; const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio);
    for(let number=1;number<=engine.structure.groupSize;number+=1){ const idx=number-1,x=(idx%cols)*cell,y=Math.floor(idx/cols)*cell,metric=engine.metrics[number]; if(!metric) ctx.fillStyle='#5b626b'; else if(metric.score>=75) ctx.fillStyle='#35b66f'; else if(metric.score>=50) ctx.fillStyle='#d6a43b'; else ctx.fillStyle='#b95a5a'; ctx.fillRect(x,y,Math.max(1,cell-0.4),Math.max(1,cell-0.4)); }
    canvas._map={cols,cell,groupSize:engine.structure.groupSize};
  }

  function renderMap(){ const canvas=$('hist10Map'); if(!canvas) return; const structure=resolvedStructure(),engine=buildReachability(structure); drawMap(canvas,engine); if($('hist10MapMeta')) $('hist10MapMeta').textContent=structure.depth>0?'Verde = score alto · amarelo = médio · vermelho = baixo · cinza = contemplada. Toque no mapa para analisar a cota.':'Mapa parcial: configure as aproximações reais para calcular exposição e score estrutural.'; }

  function rewriteDrawAlert(){
    const wrap=$('sorteioAlerta'); if(!wrap||wrap.hidden) return; const structure=resolvedStructure(),list=$('sorteioAlertList'),rows=list?.querySelectorAll('.radar-match-row')?.length||0,exact=list?.querySelector('.radar-match-row.exact');
    if(exact){ $('sorteioAlertBadge').textContent='EXATA'; $('sorteioAlertText').textContent='A cota exata está ativa e cadastrada. Confira o resultado oficial do grupo.'; }
    else if(rows){ $('sorteioAlertBadge').textContent='ATIVAS'; $('sorteioAlertTitle').textContent=rows===1?'1 cota alcançada pelas aproximações ativas':`${rows} cotas alcançadas pelas aproximações ativas`; $('sorteioAlertText').textContent=structure.depth>0?`A conferência respeitou a ordem das cotas ainda ativas: até ${structure.depth} nível(is) acima e abaixo do número-base.`:'Somente coincidência exata foi considerada porque os níveis reais de aproximação ainda não foram informados.'; }
    else{ $('sorteioAlertBadge').textContent=structure.depth>0?'SEM ALCANCE':'EXATO'; $('sorteioAlertTitle').textContent=structure.depth>0?'Nenhuma cota cadastrada entrou no alcance ativo':'Nenhuma coincidência exata'; $('sorteioAlertText').textContent=structure.depth>0?'O sistema pulou cotas já contempladas e percorreu somente as cotas ainda ativas.':'Configure os níveis reais de aproximação para analisar além da coincidência exata.'; }
  }

  function injectStyle(){
    if($('hist10Style')) return; const style=document.createElement('style'); style.id='hist10Style'; style.textContent=`.hist10-panel{margin-top:16px}.hist10-top{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}.hist10-top .field{flex:1 1 180px}.hist10-top button{flex:0 0 auto}.hist10-score{margin-top:16px;padding:18px;border:1px solid rgba(133,214,170,.28);border-radius:18px;background:rgba(24,45,38,.26)}.hist10-score.medium{border-color:rgba(214,164,59,.35)}.hist10-score.low{border-color:rgba(185,90,90,.35)}.hist10-score.contemplated{border-color:rgba(125,133,143,.35)}.hist10-score span{display:block;font-size:12px;opacity:.75}.hist10-score strong{display:block;font-size:32px;line-height:1.1;margin:6px 0}.hist10-score small{display:block;opacity:.78;line-height:1.45}.hist10-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.hist10-grid>div{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.025)}.hist10-grid span,.hist10-grid small{display:block;opacity:.72;font-size:12px}.hist10-grid strong{display:block;font-size:22px;margin:5px 0}.hist10-note{font-size:13px;line-height:1.55;opacity:.82;margin:12px 0 0}.hist10-structure-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.hist10-structure-status{padding:12px 14px;border-radius:14px;margin:12px 0;font-size:13px;line-height:1.5}.hist10-structure-status.ready{background:rgba(53,182,111,.10);border:1px solid rgba(53,182,111,.26)}.hist10-structure-status.warning{background:rgba(214,164,59,.10);border:1px solid rgba(214,164,59,.26)}.hist10-recommendations{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.hist10-pick{text-align:left;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);color:inherit}.hist10-pick.high{border-color:rgba(53,182,111,.32)}.hist10-pick.medium{border-color:rgba(214,164,59,.30)}.hist10-pick.low{border-color:rgba(185,90,90,.30)}.hist10-pick b{font-size:20px;display:block}.hist10-pick span,.hist10-pick small{display:block;font-size:11px;opacity:.72;margin-top:3px}.hist10-meta{margin-top:10px;font-size:12px;opacity:.72}.hist10-map-wrap{overflow:auto;margin-top:12px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(0,0,0,.12)}#hist10Map{display:block;max-width:none}.hist10-map-meta{font-size:12px;opacity:.72;margin-top:8px}.hist10-hidden-legacy{display:none!important}.hist10-textarea textarea{min-height:112px;font-family:inherit}.hist10-subtle{font-size:12px;opacity:.68;line-height:1.5;margin-top:6px}@media(min-width:760px){.hist10-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.hist10-recommendations{grid-template-columns:repeat(4,minmax(0,1fr))}.hist10-structure-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`; document.head.appendChild(style);
  }

  function injectUI(){
    if($('sorteioHistory10Y')) return; injectStyle(); document.querySelector('.radar-probability-panel')?.classList.add('hist10-hidden-legacy'); document.querySelector('.radar-free-panel')?.classList.add('hist10-hidden-legacy'); const anchor=document.querySelector('.radar-draw-panel'); if(!anchor) return; const saved=loadStructure(),section=document.createElement('section'); section.id='sorteioHistory10Y'; section.innerHTML=`<article class="panel hist10-panel"><div class="result-topline"><div><div class="eyebrow">Estrutura real do grupo</div><h2>Cotas ativas, contempladas e aproximações</h2></div><span class="pill">SEM DISTÂNCIA FIXA</span></div><p class="lead">A aproximação é posição entre cotas ainda ativas. Se 3001, 3002 e 3003 já saíram, a 3004 pode ser a 1ª ativa acima do 3000. O sistema não usa mais “20 números” como regra de seleção.</p><div class="hist10-structure-grid"><div class="field"><label for="hist10AgeMonths">Idade do grupo</label><div class="control"><input id="hist10AgeMonths" type="number" min="0" max="360" value="${Number(saved.ageMonths)||0}"><span>meses</span></div></div><div class="field"><label for="hist10CurrentDepth">Níveis por lado neste mês</label><div class="control"><input id="hist10CurrentDepth" type="number" min="1" max="200" value="${String(saved.currentDepth||'')}"></div><small>1 = 1ª ativa acima + 1ª ativa abaixo.</small></div><div><span>Ativas agora</span><strong id="hist10ActiveCount">—</strong><small class="hist10-subtle">total do grupo menos as já contempladas</small></div><div><span>Já contempladas</span><strong id="hist10RemovedCount">—</strong><small class="hist10-subtle">retiradas da fila ativa</small></div></div><div class="form-grid" style="margin-top:12px"><div class="field full hist10-textarea"><label for="hist10Schedule">Média real por idade do grupo <span class="optional">opcional</span></label><div class="control textarea-control"><textarea id="hist10Schedule" rows="4" placeholder="Formato: início-fim: níveis reais por lado">${String(saved.scheduleText||'')}</textarea></div><small>Preenche com teus dados reais por faixa. Se houver uma faixa cobrindo a idade atual, ela substitui o valor manual acima.</small></div><div class="field full hist10-textarea"><label for="hist10Contemplated">Cotas já contempladas + mês</label><div class="control textarea-control"><textarea id="hist10Contemplated" rows="6" placeholder="2998:7&#10;2999:12&#10;3001:4">${String(saved.contemplatedText||'')}</textarea></div><small>Formato cota:mês. Quem aparece aqui deixa de ser cota ativa a partir daquele mês.</small></div></div><button id="hist10SaveStructure" class="primary-button" type="button">Salvar estrutura e recalcular</button><div id="hist10StructureStatus"></div><div class="radar-group-math-kpis"><div><span>Sorteios Federal carregados</span><strong id="hist10DrawCount">—</strong></div><div><span>Janela histórica</span><strong id="hist10Window">—</strong></div><div><span>Níveis ativos agora</span><strong id="hist10DepthCount">—</strong></div></div></article><article class="panel hist10-panel"><div class="result-topline"><div><div class="eyebrow">Análise de cota</div><h2>Score estrutural + histórico</h2></div><span class="pill">40 · 25 · 20 · 15</span></div><div class="hist10-top"><div class="field"><label for="hist10Number">Cota</label><div class="control"><input id="hist10Number" type="number" min="1" max="${activeGroupSize()}" value="3000" inputmode="numeric"></div></div><button id="hist10AnalyzeBtn" class="secondary-button" type="button">Analisar cota</button></div><div id="hist10Result"></div></article><article class="panel hist10-panel"><div class="result-topline"><div><div class="eyebrow">Mapa do grupo</div><h2>Alcance estrutural das cotas</h2></div><span class="pill">ATIVAS</span></div><p class="lead">Cinza já saiu. As cotas ativas são classificadas pelo score de exposição, lacunas, histórico e idade.</p><div class="hist10-map-wrap"><canvas id="hist10Map" aria-label="Mapa das cotas do grupo"></canvas></div><div id="hist10MapMeta" class="hist10-map-meta"></div></article><article class="panel hist10-panel"><div class="result-topline"><div><div class="eyebrow">Otimizador de carteira</div><h2>Máxima cobertura com mínima sobreposição</h2></div><span class="pill">DINÂMICO</span></div><p class="lead">Duas cotas podem estar perto numericamente e ainda assim fazer sentido. O que importa é quantos resultados-base cada uma cobre e quanto essa cobertura repete a tua carteira atual.</p><div class="hist10-top"><div class="field"><label for="hist10QuotaCount">Quantas novas cotas</label><div class="control"><input id="hist10QuotaCount" type="number" value="20" min="1" max="100"><span>cotas</span></div></div><button id="hist10RecommendBtn" class="secondary-button" type="button">Otimizar carteira</button></div><div id="hist10RecommendationMeta" class="hist10-meta"></div><div id="hist10Recommendations" class="hist10-recommendations"></div></article>`; anchor.insertAdjacentElement('afterend',section);
    const summarySmall=document.querySelector('.radar-federal-history-panel summary small'); if(summarySmall) summarySmall.textContent='Resumo mensal visual; o motor estatístico usa todos os 1ºs prêmios da base de 10 anos'; if(DB){$('hist10DrawCount').textContent=DB.drawCount.toLocaleString('pt-BR');$('hist10Window').textContent=`${dateLabel(DB.startDate)} → ${dateLabel(DB.endDate)}`;}
    renderStructureSummary(); renderQuotaAnalysis(3000); renderRecommendations(); requestAnimationFrame(renderMap);
    $('hist10SaveStructure')?.addEventListener('click',saveStructureFromForm); $('hist10AnalyzeBtn')?.addEventListener('click',()=>renderQuotaAnalysis($('hist10Number')?.value)); $('hist10Number')?.addEventListener('keydown',event=>{if(event.key==='Enter')renderQuotaAnalysis(event.target.value);}); $('hist10RecommendBtn')?.addEventListener('click',renderRecommendations);
    $('hist10Map')?.addEventListener('click',event=>{const map=event.currentTarget._map;if(!map)return;const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,col=Math.floor(x/map.cell),row=Math.floor(y/map.cell),number=row*map.cols+col+1;if(number<1||number>map.groupSize)return;$('hist10Number').value=number;renderQuotaAnalysis(number);$('hist10Result')?.scrollIntoView({behavior:'smooth',block:'center'});});
    $('sorteioGroupSize')?.addEventListener('change',()=>{historyCache.clear();structureCache.clear();if($('hist10Number'))$('hist10Number').max=activeGroupSize();renderStructureSummary();renderQuotaAnalysis(Math.min(Number($('hist10Number')?.value)||3000,activeGroupSize()));renderRecommendations();renderMap();}); $('sorteioGroupTerm')?.addEventListener('change',()=>{structureCache.clear();renderStructureSummary();renderRecommendations();renderMap();}); $('sorteioCheckBtn')?.addEventListener('click',()=>setTimeout(rewriteDrawAlert,0)); $('sorteioNumero')?.addEventListener('keydown',event=>{if(event.key==='Enter')setTimeout(rewriteDrawAlert,0);}); global.addEventListener('resize',()=>requestAnimationFrame(renderMap),{passive:true});
  }

  function init(){ if(!$('view-sorteio')) return; injectUI(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})(window);
