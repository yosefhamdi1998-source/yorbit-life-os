import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const ledger = Array.from({length: 51025}, (_, id) => ({id, date:'2026-09-08'}));
let failPage = false;
globalThis.__yorbitPaginationMock = {
  from() {
    let counted = false;
    const ordering = [];
    return {
      select(_fields, options) { counted = options?.count === 'exact'; return this; },
      order(column, options) { ordering.push({column, ...options}); return this; },
      eq() { return this; },
      range(from,to) {
        // SQL may return equal-date rows in a different order per request.
        // Simulate that legal behavior unless a unique ID order is requested.
        const stable = ordering.some(order => order.column === 'id');
        const pageLedger = stable || from === 0 ? ledger : [...ledger.slice(1), ledger[0]];
        return Promise.resolve(failPage && from===2000 ? {data:null,error:{message:'Sample page failed'}} : {data:pageLedger.slice(from,to+1),count:counted?ledger.length:null,error:null});
      },
    };
  },
};
const source = (await readFile(new URL('../src/api/entities.js', import.meta.url),'utf8')).replace("import { supabase } from './supabaseClient';", 'const supabase = globalThis.__yorbitPaginationMock;');
const {entities} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rows = await entities.Transaction.listAll('-date');
assert.equal(rows.length,51025);
assert.equal(new Set(rows.map(row=>row.id)).size,51025);
assert.equal(rows.at(-1).id,51024);
for (const read of [() => entities.Transaction.list('-date'), () => entities.Transaction.filter({}, '-date'), () => entities.Bill.list('-created_date')]) {
  const paged = await read();
  assert.equal(paged.length, ledger.length);
  assert.equal(new Set(paged.map(row => row.id)).size, ledger.length, 'Tied dates must not duplicate or skip records between pages');
}
failPage = true;
await assert.rejects(entities.Transaction.listAll('-date'), /Sample page failed/);
delete globalThis.__yorbitPaginationMock;
console.log('Export pagination: 51,025 records retained; page failure rejects instead of returning a partial export.');
