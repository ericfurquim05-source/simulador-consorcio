(function(global){
  'use strict';

  const STORAGE_CLIENTS = 'simulador-sorteio-clientes-v1';
  const STORAGE_DRAWS = 'simulador-sorteio-concursos-v1';

  const DEFAULT_CLIENTS = [
    { id: 'loreci-3446', nome: 'Loreci', cota: '3446' },
    { id: 'angela-4559', nome: 'Angela', cota: '4559' },
    { id: 'marcio-1665', nome: 'Marcio', cota: '1665' },
    { id: 'fabio-5986', nome: 'Fábio', cota: '5986' },
    { id: 'alan-6522', nome: 'Alan', cota: '6522' }
  ];

  const state = {
    clients: [],
    draws: [],
    lastResult: null
  };

  const $ = id => document.getElementById(id);

  function escapeHTML(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function uid(prefix){
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO(){
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function dateBR(value){
    if(!value) return 'Data não informada';
    const [year, month, day] = String(value).split('-');
    if(!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  function quota(value){
    return String(value ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  }

  function fullTicket(value){
    return String(value ?? '').replace(/\D/g, '').slice(-5).padStart(5, '0');
  }

  function finalFour(value){
    return fullTicket(value).slice(-4);
  }

  function loadJSON(key, fallback){
    try{
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw ?? fallback;
    }catch{
      return fallback;
    }
  }

  function saveClients(){
    localStorage.setItem(STORAGE_CLIENTS, JSON.stringify(state.clients));
  }

  function saveDraws(){
    localStorage.setItem(STORAGE_DRAWS, JSON.stringify(state.draws));
  }

  function load(){
    const storedClients = loadJSON(STORAGE_CLIENTS, null);
    state.clients = Array.isArray(storedClients) && storedClients.length
      ? storedClients.map(item => ({
          id: String(item.id || uid('cliente')),
          nome: String(item.nome || '').trim(),
          cota: quota(item.cota)
        })).filter(item => item.nome && /^\d{4}$/.test(item.cota))
      : DEFAULT_CLIENTS.map(item => ({...item}));

    state.draws = loadJSON(STORAGE_DRAWS, []);
    if(!Array.isArray(state.draws)) state.draws = [];
    state.draws = state.draws.map(draw => ({
      id: String(draw.id || uid('concurso')),
      concurso: String(draw.concurso || '').trim(),
      data: String(draw.data || ''),
      numeros: Array.isArray(draw.numeros) ? draw.numeros.slice(0, 5).map(fullTicket) : [],
      createdAt: Number(draw.createdAt || Date.now())
    })).filter(draw => draw.concurso && draw.numeros.length === 5);

    saveClients();
    saveDraws();
  }

  function showMessage(id, text, type = 'success'){
    const element = $(id);
    if(!element) return;
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = false;
    clearTimeout(element._timer);
    element._timer = setTimeout(() => { element.hidden = true; }, 5000);
  }

  function extractTickets(text){
    const source = String(text || '');
    const direct = [...source.matchAll(/(^|[^\d])(\d{2}\.?\d{3})(?=[^\d]|$)/g)]
      .map(match => match[2].replace(/\D/g, ''))
      .filter(value => value.length === 5)
      .slice(0, 5)
      .map(fullTicket);
    if(direct.length === 5) return direct;

    const byLine = source.split(/\r?\n/)
      .map(line => line.replace(/\D/g, ''))
      .filter(value => value.length >= 5)
      .map(value => value.slice(-5))
      .slice(0, 5)
      .map(fullTicket);
    return byLine;
  }

  function compareDraw(numbers){
    const finals = numbers.map(finalFour);
    return state.clients.map(client => {
      const clientNumber = Number(client.cota);
      const comparisons = finals.map((final, index) => ({
        premio: index + 1,
        numeroCompleto: numbers[index],
        final,
        distancia: Math.abs(clientNumber - Number(final))
      }));
      comparisons.sort((a, b) => a.distancia - b.distancia || a.premio - b.premio);
      return {...client, melhor: comparisons[0], comparacoes: comparisons};
    }).sort((a, b) => a.melhor.distancia - b.melhor.distancia || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function distanceText(distance){
    if(distance === 0) return 'Coincidência exata';
    return `${distance.toLocaleString('pt-BR')} ${distance === 1 ? 'número' : 'números'} de distância`;
  }

  function saveOrReplaceDraw(draw){
    const existingIndex = state.draws.findIndex(item => item.concurso.toLowerCase() === draw.concurso.toLowerCase());
    if(existingIndex >= 0){
      draw.id = state.draws[existingIndex].id;
      state.draws.splice(existingIndex, 1, draw);
      saveDraws();
      return 'updated';
    }
    state.draws.push(draw);
    saveDraws();
    return 'created';
  }

  function renderLatest(result, draw){
    const section = $('sorteioResultado');
    const list = $('sorteioRanking');
    const winner = result[0];
    const tied = result.filter(item => item.melhor.distancia === winner.melhor.distancia);

    $('sorteioResultadoTitulo').textContent = `Concurso ${draw.concurso}`;
    $('sorteioResultadoData').textContent = dateBR(draw.data);
    $('sorteioPremiosFinais').innerHTML = draw.numeros.map((number, index) => `
      <div><span>${index + 1}º prêmio</span><strong>${escapeHTML(number)}</strong><small>final ${finalFour(number)}</small></div>
    `).join('');

    $('sorteioDestaque').innerHTML = `
      <div>
        <span>${tied.length > 1 ? 'Clientes mais próximos' : 'Cliente mais próximo'}</span>
        <strong>${tied.map(item => escapeHTML(item.nome)).join(' · ')}</strong>
      </div>
      <div>
        <span>Menor distância</span>
        <strong>${distanceText(winner.melhor.distancia)}</strong>
      </div>
    `;

    list.innerHTML = result.map((item, index) => `
      <article class="draw-client-card ${index === 0 ? 'winner' : ''} ${item.melhor.distancia === 0 ? 'exact' : ''}">
        <div class="draw-rank">${index + 1}º</div>
        <div class="draw-client-main">
          <div class="draw-client-title">
            <div><strong>${escapeHTML(item.nome)}</strong><span>Cota ${item.cota}</span></div>
            <b>${distanceText(item.melhor.distancia)}</b>
          </div>
          <div class="draw-client-detail">
            <span>Mais próximo do ${item.melhor.premio}º prêmio</span>
            <strong>${item.melhor.numeroCompleto} · final ${item.melhor.final}</strong>
          </div>
        </div>
      </article>
    `).join('');

    section.hidden = false;
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function renderClients(){
    $('sorteioClientesCount').textContent = `${state.clients.length} ${state.clients.length === 1 ? 'cliente' : 'clientes'}`;
    $('sorteioClientList').innerHTML = state.clients.map(client => `
      <div class="client-edit-row" data-client-id="${escapeHTML(client.id)}">
        <div class="field">
          <label>Nome</label>
          <div class="control"><input data-client-name type="text" maxlength="70" value="${escapeHTML(client.nome)}"></div>
        </div>
        <div class="field client-quota-field">
          <label>Cota</label>
          <div class="control"><input data-client-quota type="text" inputmode="numeric" maxlength="4" value="${client.cota}"></div>
        </div>
        <div class="client-row-actions">
          <button type="button" class="small-action primary" data-save-client>Salvar</button>
          <button type="button" class="small-action danger" data-delete-client>Excluir</button>
        </div>
      </div>
    `).join('');

    $('sorteioClientList').querySelectorAll('[data-client-quota]').forEach(input => {
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
    });

    $('sorteioClientList').querySelectorAll('[data-save-client]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-client-id]');
        const id = row.dataset.clientId;
        const name = row.querySelector('[data-client-name]').value.trim();
        const number = row.querySelector('[data-client-quota]').value.replace(/\D/g, '');
        if(!name || number.length !== 4){
          showMessage('sorteioClientesMessage', 'Informe o nome e uma cota com quatro dígitos.', 'error');
          return;
        }
        const duplicate = state.clients.some(client => client.id !== id && client.cota === number);
        if(duplicate){
          showMessage('sorteioClientesMessage', 'Essa cota já está cadastrada para outro cliente.', 'error');
          return;
        }
        const client = state.clients.find(item => item.id === id);
        client.nome = name;
        client.cota = number;
        saveClients();
        renderAllData();
        showMessage('sorteioClientesMessage', 'Cliente atualizado.');
      });
    });

    $('sorteioClientList').querySelectorAll('[data-delete-client]').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('[data-client-id]');
        const client = state.clients.find(item => item.id === row.dataset.clientId);
        if(!client) return;
        if(!confirm(`Excluir ${client.nome} — cota ${client.cota}?`)) return;
        state.clients = state.clients.filter(item => item.id !== client.id);
        saveClients();
        renderAllData();
        showMessage('sorteioClientesMessage', 'Cliente excluído.');
      });
    });
  }

  function sortedDraws(){
    return [...state.draws].sort((a, b) => {
      if(a.data && b.data && a.data !== b.data) return b.data.localeCompare(a.data);
      return b.createdAt - a.createdAt;
    });
  }

  function renderHistory(){
    const draws = sortedDraws();
    $('sorteioHistoryCount').textContent = `${draws.length} ${draws.length === 1 ? 'concurso salvo' : 'concursos salvos'}`;
    if(!draws.length){
      $('sorteioHistoryList').innerHTML = '<div class="empty-state">Nenhum concurso salvo ainda.</div>';
      return;
    }
    $('sorteioHistoryList').innerHTML = draws.map(draw => {
      const finals = draw.numeros.map(finalFour).join(' · ');
      return `
        <div class="draw-history-row" data-draw-id="${escapeHTML(draw.id)}">
          <div><strong>Concurso ${escapeHTML(draw.concurso)}</strong><span>${dateBR(draw.data)} · finais ${finals}</span></div>
          <div class="draw-history-actions">
            <button type="button" data-open-draw>Ver</button>
            <button type="button" class="danger-text" data-delete-draw>Excluir</button>
          </div>
        </div>
      `;
    }).join('');

    $('sorteioHistoryList').querySelectorAll('[data-open-draw]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-draw-id]').dataset.drawId;
        const draw = state.draws.find(item => item.id === id);
        if(!draw) return;
        const result = compareDraw(draw.numeros);
        state.lastResult = {draw, result};
        renderLatest(result, draw);
      });
    });

    $('sorteioHistoryList').querySelectorAll('[data-delete-draw]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('[data-draw-id]').dataset.drawId;
        const draw = state.draws.find(item => item.id === id);
        if(!draw || !confirm(`Excluir o concurso ${draw.concurso}?`)) return;
        state.draws = state.draws.filter(item => item.id !== id);
        saveDraws();
        renderHistory();
        renderStats();
        showMessage('sorteioHistoryMessage', 'Concurso excluído.');
      });
    });
  }

  function clientStats(client){
    if(!state.draws.length){
      return {client, average: null, best: null, closest: 0, contests: 0};
    }
    let sum = 0;
    let best = Infinity;
    let closest = 0;
    state.draws.forEach(draw => {
      const ranking = compareDraw(draw.numeros);
      const current = ranking.find(item => item.id === client.id);
      if(!current) return;
      sum += current.melhor.distancia;
      best = Math.min(best, current.melhor.distancia);
      const min = ranking[0].melhor.distancia;
      if(current.melhor.distancia === min) closest += 1;
    });
    return {
      client,
      average: sum / state.draws.length,
      best,
      closest,
      contests: state.draws.length
    };
  }

  function renderStats(){
    const stats = state.clients.map(clientStats).sort((a, b) => {
      if(a.average === null) return 1;
      if(b.average === null) return -1;
      return a.average - b.average || b.closest - a.closest;
    });

    if(!state.draws.length){
      $('sorteioStatsGrid').innerHTML = '<div class="empty-state">As estatísticas aparecerão depois do primeiro concurso salvo.</div>';
      return;
    }

    $('sorteioStatsGrid').innerHTML = stats.map((item, index) => `
      <article class="stat-client-card ${index === 0 ? 'top' : ''}">
        <div class="stat-client-head"><strong>${escapeHTML(item.client.nome)}</strong><span>Cota ${item.client.cota}</span></div>
        <div class="stat-client-numbers">
          <div><span>Distância média</span><strong>${Math.round(item.average).toLocaleString('pt-BR')}</strong></div>
          <div><span>Melhor resultado</span><strong>${item.best.toLocaleString('pt-BR')}</strong></div>
          <div><span>Vezes mais próximo</span><strong>${item.closest}</strong></div>
        </div>
      </article>
    `).join('');
  }

  function renderReportSelect(){
    const select = $('sorteioReportClient');
    const previous = select.value;
    select.innerHTML = state.clients.map(client => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.nome)} — cota ${client.cota}</option>`).join('');
    if(state.clients.some(client => client.id === previous)) select.value = previous;
  }

  function renderAllData(){
    renderClients();
    renderHistory();
    renderStats();
    renderReportSelect();
  }

  function addClient(){
    const name = $('sorteioNewClientName').value.trim();
    const number = $('sorteioNewClientQuota').value.replace(/\D/g, '');
    if(!name || number.length !== 4){
      showMessage('sorteioClientesMessage', 'Informe o nome e uma cota com quatro dígitos.', 'error');
      return;
    }
    if(state.clients.some(client => client.cota === number)){
      showMessage('sorteioClientesMessage', 'Essa cota já está cadastrada.', 'error');
      return;
    }
    state.clients.push({id: uid('cliente'), nome: name, cota: number});
    saveClients();
    $('sorteioNewClientName').value = '';
    $('sorteioNewClientQuota').value = '';
    renderAllData();
    showMessage('sorteioClientesMessage', 'Cliente adicionado.');
  }

  function submitDraw(){
    if(!state.clients.length){
      showMessage('sorteioFormMessage', 'Cadastre pelo menos um cliente antes de conferir.', 'error');
      return;
    }
    const contest = $('sorteioConcurso').value.trim();
    const date = $('sorteioData').value;
    const numbers = extractTickets($('sorteioNumeros').value);
    if(!contest){
      showMessage('sorteioFormMessage', 'Informe o número do concurso.', 'error');
      return;
    }
    if(numbers.length !== 5){
      showMessage('sorteioFormMessage', 'Cole os cinco números completos, com cinco dígitos cada.', 'error');
      return;
    }
    const draw = {
      id: uid('concurso'),
      concurso: contest,
      data: date,
      numeros: numbers,
      createdAt: Date.now()
    };
    const status = saveOrReplaceDraw(draw);
    const saved = state.draws.find(item => item.concurso.toLowerCase() === contest.toLowerCase()) || draw;
    const result = compareDraw(saved.numeros);
    state.lastResult = {draw: saved, result};
    renderLatest(result, saved);
    renderHistory();
    renderStats();
    showMessage('sorteioFormMessage', status === 'updated' ? 'Concurso atualizado e conferido.' : 'Concurso salvo e conferido.');
  }

  function reportRows(client){
    return sortedDraws().reverse().map(draw => {
      const ranking = compareDraw(draw.numeros);
      const item = ranking.find(entry => entry.id === client.id);
      const rank = ranking.findIndex(entry => entry.id === client.id) + 1;
      return {draw, item, rank};
    });
  }

  function generateReport(){
    const clientId = $('sorteioReportClient').value;
    const client = state.clients.find(item => item.id === clientId);
    if(!client){
      showMessage('sorteioReportMessage', 'Selecione um cliente.', 'error');
      return;
    }
    if(!state.draws.length){
      showMessage('sorteioReportMessage', 'Salve pelo menos um concurso para gerar o relatório.', 'error');
      return;
    }

    const rows = reportRows(client);
    const stats = clientStats(client);
    const settings = global.Simulador?.Configuracoes?.load?.() || {};
    const company = settings.company || 'Acompanhamento de Consórcio';
    const consultant = settings.consultant || '';
    const phone = settings.phone || '';

    const tableRows = rows.map(({draw, item, rank}) => `
      <tr>
        <td><b>${escapeHTML(draw.concurso)}</b><small>${dateBR(draw.data)}</small></td>
        <td class="tickets">${draw.numeros.map((number, index) => `<span>${index + 1}º: ${number} <i>(${finalFour(number)})</i></span>`).join('')}</td>
        <td><b>${item.melhor.final}</b><small>${item.melhor.premio}º prêmio</small></td>
        <td><b>${item.melhor.distancia.toLocaleString('pt-BR')}</b><small>${distanceText(item.melhor.distancia)}</small></td>
        <td><b>${rank}º</b><small>entre os cadastrados</small></td>
      </tr>
    `).join('');

    const generated = new Date().toLocaleString('pt-BR');
    const report = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de sorteios — ${escapeHTML(client.nome)}</title>
<style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0;background:#fff;font-size:10px}.header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #f28a16;padding:0 0 10px;margin-bottom:10px}.brand{display:flex;gap:10px;align-items:center}.mark{width:38px;height:38px;border-radius:11px;background:#f28a16;color:#fff;display:grid;place-items:center;font-weight:900;font-size:14px}.header h1{font-size:18px;margin:0}.header p{margin:3px 0 0;color:#637181}.meta{text-align:right;color:#637181;line-height:1.45}.client{display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:7px;margin-bottom:10px}.card{border:1px solid #d8e0e7;border-radius:9px;padding:8px;background:#f7f9fb}.card span{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.06em;color:#6b7782}.card strong{display:block;font-size:13px;margin-top:4px}.card.primary{background:#fff3e4;border-color:#f1b56e}.card.primary strong{font-size:16px}.intro{border:1px solid #d8e0e7;border-radius:9px;padding:8px 10px;margin-bottom:10px;color:#44515d;line-height:1.45}.intro b{color:#14202b}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#182633;color:#fff;font-size:7px;text-transform:uppercase;letter-spacing:.05em;padding:7px 6px;text-align:left}td{border-bottom:1px solid #dfe5ea;padding:7px 6px;vertical-align:top}th:nth-child(1){width:12%}th:nth-child(2){width:45%}th:nth-child(3){width:13%}th:nth-child(4){width:17%}th:nth-child(5){width:13%}td b{display:block;font-size:10px}td small{display:block;color:#6c7882;font-size:7px;margin-top:2px;line-height:1.25}.tickets{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}.tickets span{display:block;font-size:7px;background:#f3f6f8;border-radius:4px;padding:4px}.tickets i{font-style:normal;color:#f07b00}.footer{margin-top:9px;border-top:1px solid #d8e0e7;padding-top:7px;color:#68747e;font-size:7px;line-height:1.45}.footer b{color:#26343f}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header class="header"><div class="brand"><div class="mark">SC</div><div><h1>Relatório individual de sorteios</h1><p>${escapeHTML(company)}</p></div></div><div class="meta">Emitido em ${generated}${consultant ? `<br>Consultor: ${escapeHTML(consultant)}` : ''}${phone ? `<br>WhatsApp: ${escapeHTML(phone)}` : ''}</div></header>
<section class="client"><div class="card primary"><span>Cliente acompanhado</span><strong>${escapeHTML(client.nome)} · cota ${client.cota}</strong></div><div class="card"><span>Concursos analisados</span><strong>${stats.contests}</strong></div><div class="card"><span>Melhor distância</span><strong>${stats.best.toLocaleString('pt-BR')}</strong></div><div class="card"><span>Distância média</span><strong>${Math.round(stats.average).toLocaleString('pt-BR')}</strong></div></section>
<div class="intro"><b>Como ler:</b> em cada concurso, o relatório compara a cota ${client.cota} com os quatro últimos dígitos dos cinco prêmios e apresenta o resultado mais próximo.</div>
<table><thead><tr><th>Concurso</th><th>Números sorteados e finais</th><th>Final mais próximo</th><th>Distância</th><th>Posição</th></tr></thead><tbody>${tableRows}</tbody></table>
<div class="footer"><b>Importante:</b> relatório gerado com os resultados cadastrados manualmente no aplicativo. Os números podem ser conferidos nos canais oficiais das Loterias CAIXA. O desempenho anterior não altera a probabilidade de um número em sorteios futuros.</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`;

    const reportWindow = window.open('', '_blank');
    if(!reportWindow){
      showMessage('sorteioReportMessage', 'O navegador bloqueou a abertura do relatório. Permita pop-ups e tente novamente.', 'error');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(report);
    reportWindow.document.close();
  }

  function bind(){
    $('sorteioData').value = todayISO();
    $('sorteioNewClientQuota').addEventListener('input', event => {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
    });
    $('sorteioAddClientBtn').addEventListener('click', addClient);
    $('sorteioConferirBtn').addEventListener('click', submitDraw);
    $('sorteioGenerateReportBtn').addEventListener('click', generateReport);
  }

  function init(){
    load();
    bind();
    renderAllData();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
