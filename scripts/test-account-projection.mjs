import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const queries=[];
globalThis.__accountMock={
 auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})},
 from(table){return {
  select(fields){queries.push({table,fields});return this;},
  order(){return this;},eq(){return this;},insert(){return this;},update(){return this;},
  range:async()=>({data:[],error:null,count:0}),single:async()=>({data:{id:'fixture'},error:null})
 };}
};
const source=(await readFile(new URL('../src/api/entities.js',import.meta.url),'utf8')).replace("import { supabase } from './supabaseClient';",'const supabase = globalThis.__accountMock;');
const {entities}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
await entities.ConnectedAccount.list();await entities.ConnectedAccount.filter({sync_status:'connected'});
await entities.ConnectedAccount.create({account_name:'Fixture'});await entities.ConnectedAccount.update('fixture',{sync_status:'disconnected'});
assert.equal(queries.length,4);
for(const {fields} of queries){assert.ok(fields);assert.ok(!fields.includes('*'));assert.ok(!fields.includes('access_token'));for(const key of ['id','sync_status','current_balance','history_start_date'])assert.ok(fields.split(',').includes(key));}
await entities.Bill.list();assert.equal(queries.at(-1).fields,'*');
console.log('PASS: account list/filter/create/update responses request only public fields; other entity behavior preserved');
