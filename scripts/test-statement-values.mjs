import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseStatementAmount, parseStatementDate, skippedStatementRows } from '../src/lib/statementValues.js';
for (const [raw, expected] of [['($42.50)',-42.5], ['(1,234.56)',-1234.56], ['- $42.50',-42.5], ['$-42.50',-42.5], ['+ $900.00',900], ['1,234.56',1234.56], ['.50',0.5], [0,0], ['0',0]]) assert.equal(parseStatementAmount(raw), expected, raw);
for (const raw of ['',null,undefined,'12abc34','1,23','1.2.3','Infinity','--42','(-42)','42.999','2026-09-01','$']) assert.equal(parseStatementAmount(raw),null,String(raw));
for (const [raw,expected] of [['2026-09-01','2026-09-01'], ['2024-02-29','2024-02-29'], ['09/01/2026','2026-09-01'], ['9/1/26','2026-09-01'], ['2026-09-01T00:30:00Z','2026-09-01'], ['2026-09-01 12:00:00','2026-09-01']]) assert.equal(parseStatementDate(raw),expected,raw);
for (const raw of ['',null,'2026-02-30','2025-02-29','2026-13-01','02/30/2026','2/29/25','junk','12','2026','February 30, 2026']) assert.equal(parseStatementDate(raw),null,String(raw));
assert.equal(skippedStatementRows(3,3),undefined);
assert.match(skippedStatementRows(5,3),/3 ready; 2 skipped/);
// Run the actual page normalizer, not a copied implementation.
const source=fs.readFileSync('src/pages/CSVImport.jsx','utf8');
const normalizer=source.slice(source.indexOf('function normalizeRow('),source.indexOf('// pdf.js hands back'));
const normalize=new Function('parseStatementAmount','parseStatementDate','guessCategory',normalizer+'; return normalizeRow;')(parseStatementAmount,parseStatementDate,()=> 'other');
assert.deepEqual(normalize({date:'2026-09-01',description:'Cafe',amount:'($42.50)'}),{title:'Cafe',amount:42.5,type:'expense',category:'other',date:'2026-09-01'});
assert.equal(normalize({date:'',description:'Cafe',amount:42}),null);
assert.equal(normalize({date:'2026-02-30',description:'Cafe',amount:42}),null);
assert.equal(normalize({date:'2026-09-01',description:'Cafe',amount:'12abc34'}),null);
assert.equal(normalize({date:'2026-09-01',description:'Person',amount:'(20)',p2p:true}).exclude_from_budget,true);
console.log('PASS: accounting negatives, malformed amounts, missing/impossible dates, preserved statement dates, actual page normalization, skipped-row disclosure');

// Exercise actual CSV processFiles with in-memory files, including automatic mapping.
const { parseCSV } = await import('../src/lib/csv.js');
const helpers = source.slice(source.indexOf('const DATE_VALUE_RE'), source.indexOf('export default function CSVImport'));
const processBody = source.slice(source.indexOf('  const processFiles ='), source.indexOf('  const handleFiles ='));
const states = {};
const setters = ['setStep','setError','setCollected','setFileSummaries','setPendingMapFiles','setMapIndex'];
const process = new Function('parseCSV','parseStatementAmount','parseStatementDate','skippedStatementRows',...setters,
 helpers + processBody + ';return processFiles;')(parseCSV,parseStatementAmount,parseStatementDate,skippedStatementRows,...setters.map(name=>value=>{states[name]=value;}));
await process([{name:'regression.csv',text:async()=> 'Date,Description,Amount\n2026-09-01,Cafe,($42.50)\n2026-09-02,Freelance,900.00\n2026-02-30,Invalid date,25\n,Missing date,25\n2026-09-03,Malformed amount,12abc34'}]);
assert.equal(states.setStep,'preview');
assert.equal(states.setCollected.length,2);
assert.equal(states.setCollected[0].type,'expense');
assert.equal(states.setCollected[0].amount,42.5);
assert.equal(states.setCollected[1].type,'income');
assert.match(states.setFileSummaries[0].warning,/2 ready; 3 skipped/);
await process([{name:'debit-credit.csv',text:async()=> 'Date,Description,Debit,Credit\n09/01/2026,Cafe,42.50,\n09/02/2026,Freelance,,900.00'}]);
assert.deepEqual(states.setCollected.map(row=>[row.type,row.amount]),[['expense',42.5],['income',900]]);
console.log('PASS: actual file-processing handler preserves accounting signs, split debit/credit, and explicit skipped-row counts');
