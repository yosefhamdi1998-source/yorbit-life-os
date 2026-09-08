import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const ledger = Array.from({length: 51025}, (_, id) => ({id, date:'2026-09-08'}));
let failPage = false;
globalThis.__yorbitPaginationMock = {
  from() {
    let counted = false;
    return {
      select(_fields, options) { counted = options?.count === 'exact'; return this; },
      order() { return this; },
      range(from,to) { return Promise.resolve(failPage && from===2000 ? {data:null,error:{message:'Sample page failed'}} : {data:ledger.slice(from,to+1),count:counted?ledger.length:null,error:null}); },
    };
  },
};
const source = (await readFile(new URL('../src/api/entities.js', import.meta.url),'utf8')).replace("import { supabase } from './supabaseClient';", 'const supabase = globalThis.__yorbitPaginationMock;');
const {entities} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rows = await entities.Transaction.listAll('-date');
assert.equal(rows.length,51025);
assert.equal(new Set(rows.map(row=>row.id)).size,51025);
assert.equal(rows.at(-1).id,51024);
failPage = true;
await assert.rejects(entities.Transaction.listAll('-date'), /Sample page failed/);
delete globalThis.__yorbitPaginationMock;
console.log('Export pagination: 51,025 records retained; page failure rejects instead of returning a partial export.');
