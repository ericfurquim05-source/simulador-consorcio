import fs from 'node:fs/promises';

// Gera a base compacta usada pelo radar histórico de 10 anos.
const SOURCE_URL = 'https://lotoagora.com.br/downloads/federal-historico.json';
const OUT = 'federal-history-10y.js';
const START = '2016-01-01';

const response = await fetch(SOURCE_URL, {
  headers: {
    accept: 'application/json',
    'user-agent': 'Mozilla/5.0',
    referer: 'https://lotoagora.com.br/downloads/federal/'
  }
});

if (!response.ok) throw new Error(`Falha ao baixar histórico Federal: ${response.status}`);
const data = await response.json();

const rows = (data.draws || [])
  .filter(draw => draw?.date >= START && Array.isArray(draw?.tickets))
  .map(draw => {
    const first = draw.tickets.find(ticket => Number(ticket?.position) === 1);
    if (!first?.number) return null;
    const ref = Number(String(first.number).replace(/\D/g, '').slice(-4));
    return [draw.date, Number.isFinite(ref) ? ref : 0];
  })
  .filter(Boolean)
  .sort((a, b) => a[0].localeCompare(b[0]));

if (!rows.length) throw new Error('Histórico Federal veio vazio.');

const bytes = [];
let previous = new Date(rows[0][0] + 'T12:00:00Z');
let maxDelta = 0;

for (let i = 0; i < rows.length; i += 1) {
  const [date, ref] = rows[i];
  const current = new Date(date + 'T12:00:00Z');
  const delta = i === 0 ? 0 : Math.round((current - previous) / 86400000);
  if (delta < 0 || delta > 255) throw new Error(`Intervalo inválido ${delta} dias em ${date}`);
  maxDelta = Math.max(maxDelta, delta);
  bytes.push(delta, (ref >> 8) & 255, ref & 255);
  previous = current;
}

const encoded = Buffer.from(bytes).toString('base64');
const sourceEndpoint = data.source || 'https://servicebus3.caixa.gov.br/portaldeloterias/api/resultados/download?modalidade=Federal';
const sourceUpdatedAt = data.updatedAt || null;
const missingCount = Array.isArray(data.missingContests) ? data.missingContests.length : 0;

const output = `(function(g){'use strict';const b64=${JSON.stringify(encoded)};const bin=atob(b64);let d=new Date(${JSON.stringify(rows[0][0] + 'T12:00:00Z')});const rows=[];for(let i=0;i<bin.length;i+=3){const delta=bin.charCodeAt(i);if(rows.length)d=new Date(d.getTime()+delta*86400000);const ref=(bin.charCodeAt(i+1)<<8)|bin.charCodeAt(i+2);rows.push([d.toISOString().slice(0,10),String(ref).padStart(4,'0')]);}g.FEDERAL_HISTORY_10Y_DB=Object.freeze({version:'2026-10-07.3',source:'CAIXA Federal (espelho histórico LotoAgora)',sourceEndpoint:${JSON.stringify(sourceEndpoint)},sourceUpdatedAt:${JSON.stringify(sourceUpdatedAt)},startDate:rows[0][0],endDate:rows[rows.length-1][0],drawCount:rows.length,missingContests:${missingCount},rows:Object.freeze(rows.map(r=>Object.freeze(r)))});})(window);\n`;

await fs.writeFile(OUT, output, 'utf8');
console.log(JSON.stringify({out: OUT, draws: rows.length, start: rows[0][0], end: rows.at(-1)[0], maxDelta, bytes: Buffer.byteLength(output)}));
