import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
const read=p=>fs.readFileSync(p,'utf8');
const schema=read('supabase/schema.sql');
const names=['transactions','budgets','bills','savings_goals','net_worth_entries','connected_accounts'];
const demo='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const seed=read('supabase/seed/app_review_demo.sql').replace("DEMO_USER uuid := '00000000-0000-0000-0000-000000000000'",`DEMO_USER uuid := '${demo}'`);
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'yorbit-review-seed-'));
const port=55000+Math.floor(Math.random()*4000);
const server=new EmbeddedPostgres({databaseDir:dataDir,user:'postgres',password:'local-test-only',port,persistent:false,onLog:()=>{},onError:()=>{}});
let pool;
try {
 await server.initialise(); await server.start();
 pool=new pg.Pool({host:'localhost',port,user:'postgres',password:'local-test-only',database:'postgres'});
 await pool.query("create database review_fixture encoding 'UTF8' locale 'C' template template0");
 await pool.end();
 pool=new pg.Pool({host:'localhost',port,user:'postgres',password:'local-test-only',database:'review_fixture'});
 await pool.query(`create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
 for(const name of names) await pool.query(schema.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0]);
 await pool.query(read('supabase/migrations/20260903110000_investment_separation.sql'));
 await pool.query(read('supabase/migrations/20260903070000_investment_holdings.sql'));
 await pool.query(`insert into auth.users(id,raw_app_meta_data) values ($1,'{"app_review_fixture":true}'),($2,'{}')`,[demo,other]);
 await pool.query(seed);
 assert.ok(Number((await pool.query('select count(*) from transactions where user_id=$1',[demo])).rows[0].count)>=47);
 assert.equal(Number((await pool.query('select count(*) from transactions where date>current_date')).rows[0].count),0,'Never count future paydays as received income');
 assert.equal(Number((await pool.query('select count(*) from investment_holdings where user_id=$1',[demo])).rows[0].count),2,'Reviewer notes promise holdings');
 assert.equal(Number((await pool.query("select count(*) from connected_accounts where user_id=$1 and sync_status='connected'",[demo])).rows[0].count),0,'Never create a fake live bank connection');
 const before=await pool.query('select id from transactions order by id');
 await assert.rejects(pool.query(seed),/must be empty/,'Rerun cannot erase existing financial data');
 assert.deepEqual((await pool.query('select id from transactions order by id')).rows,before.rows);
 await assert.rejects(pool.query(seed.replaceAll(demo,other)),/dedicated review account/,'Ordinary account is not eligible');
 for(const name of names) assert.equal(Number((await pool.query(`select count(*) from ${name} where user_id=$1`,[other])).rows[0].count),0);
 console.log('PASS: reviewer seed executes on real schema, has no future income, includes holdings, refuses rerun and ordinary accounts');
} finally {
 await pool?.end().catch(()=>{}); await server.stop().catch(()=>{});
 // Resolve the single generated local temp directory before cleanup.
 const resolved=path.resolve(dataDir), tmp=path.resolve(os.tmpdir())+path.sep;
 if(!resolved.startsWith(tmp)||!path.basename(resolved).startsWith('yorbit-review-seed-')) throw new Error('Unsafe temp path');
 fs.rmSync(resolved,{recursive:true,force:true});
}
