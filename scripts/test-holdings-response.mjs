import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
const code=transformSync(fs.readFileSync('supabase/functions/_shared/holdingsSnapshot.ts','utf8'),{loader:'ts',format:'esm'}).code;
const {buildHoldingsSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const valid=()=>({accounts:[{account_id:'a'}],securities:[{security_id:'s',name:'Synthetic'}],holdings:[{account_id:'a',security_id:'s',quantity:1,institution_value:20,iso_currency_code:'USD'}]});
assert.equal(buildHoldingsSnapshot(valid(),'a').length,1);
assert.equal(buildHoldingsSnapshot({...valid(),holdings:[]},'a').length,0);
for(const mutate of [d=>delete d.accounts,d=>d.accounts=[],d=>delete d.holdings,d=>delete d.securities,d=>d.securities=[],d=>d.holdings.push({...d.holdings[0]}),d=>d.holdings[0].quantity=NaN,d=>d.holdings[0].institution_value=null,d=>delete d.holdings[0].iso_currency_code]){
 const data=valid();mutate(data);assert.throws(()=>buildHoldingsSnapshot(data,'a'));
}
const data=valid();data.holdings.push({...data.holdings[0],account_id:'other',institution_value:999});assert.equal(buildHoldingsSnapshot(data,'a').length,1);
const crypto=valid();crypto.holdings[0].iso_currency_code=null;crypto.holdings[0].unofficial_currency_code='BTC';assert.equal(buildHoldingsSnapshot(crypto,'a')[0].currency,'BTC');
console.log('PASS: complete and empty holdings snapshots accepted; malformed, partial and duplicate security IDs rejected; account and currency preserved');
