'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const db=process.env.KINOJO_BALANCE_NATIVE==='1'?await require('./helpers/storage-native-db.cjs')():new(require(process.env.PGLITE_MODULE||'@electric-sql/pglite').PGlite)();try{
 await db.exec('create schema private');const sql=fs.readFileSync('supabase/migrations/20261106011916_sanctuary_balanced_teams.sql','utf8');
 await db.exec(sql.match(/CREATE FUNCTION private\.kinojo_sm_balance_layout_v554[\s\S]*?\$f\$;/)[0]);
 const positions=n=>Array.from({length:n},(_,f)=>[1,2].flatMap(p=>Array.from({length:5},(_,s)=>({force:f+1,party:p,slot:s+1,position:`${f+1}:${p}:${s+1}`,class:'ALL',minimum:3000})))).flat();
 const people=(families,characters)=>Array.from({length:families},(_,f)=>Array.from({length:characters},(_,c)=>({key:`family${f}:${c}`,family:`family${f}`,role:c===0?'MAIN':'ALT',power:1200000-f*17513-c*63000,itemLevel:4000,class:'CLERIC',locked:false}))).flat();
 const call=async(p,s,seed='stable-seed')=>(await db.query('select private.kinojo_sm_balance_layout_v554($1,$2,$3) layout',[JSON.stringify(p),JSON.stringify(s),seed])).rows[0].layout;
 const check=(result,p,s)=>{assert.equal(result.length,p.length);assert.equal(new Set(result.map(x=>x.key)).size,p.length);assert.equal(new Set(result.map(x=>x.position)).size,p.length);const byKey=new Map(p.map(x=>[x.key,x]));
  for(const force of new Set(s.map(x=>x.force))){const rows=result.filter(x=>Number(x.position.split(':')[0])===force);assert.equal(new Set(rows.map(x=>byKey.get(x.key).family)).size,rows.length);const mains=rows.filter(x=>byKey.get(x.key).role==='MAIN');if(mains.length&&mains.length<=5)assert.equal(new Set(mains.map(x=>x.position.split(':')[1])).size,1);}
  for(const pin of p.filter(x=>x.locked))assert.equal(result.find(x=>x.key===pin.key).position,pin.position);
 };
 let p=people(10,2),s=positions(2);let result=await call(p,s);check(result,p,s);assert.deepEqual(await call(p,s),result,'same input/seed is stable');
 p=people(7,2);result=await call(p,s);check(result,p,s);assert.equal(Math.abs(result.filter(x=>x.position.startsWith('1:')).length-result.filter(x=>x.position.startsWith('2:')).length),0,'partial forces keep equal headcount');
 p[0]={...p[0],locked:true,position:'1:2:3'};result=await call(p,s);check(result,p,s);
 await assert.rejects(call(people(1,3),positions(2)),/포스 수/);
 await assert.rejects(call([{...people(1,1)[0],locked:true,position:'1:1:1',class:'RANGER'}],positions(1).map(x=>({...x,class:'CLERIC'}))),/잠금/);
 await assert.rejects(call(people(1,1).map(x=>({...x,itemLevel:1})),positions(1)),/배치할 수 없습니다/);
 await assert.rejects(call([{...people(1,1)[0],locked:true,position:'1:1:1'},{...people(1,1)[0],key:'other',locked:true,position:'1:1:2'}],positions(1)),/포스 수|잠금/);
 await assert.rejects(call([{...people(1,1)[0],locked:true,position:'1:1:1'},{...people(1,1)[0],key:'other',family:'other',locked:true,position:'1:2:1'}],positions(1)),/잠금/);
 if(process.env.KINOJO_BALANCE_NATIVE==='1'){p=people(10,5);s=positions(5);const start=performance.now();result=await call(p,s);check(result,p,s);assert.deepEqual([1,2,3,4,5].map(f=>result.filter(x=>x.position.startsWith(f+':')&&p.find(y=>y.key===x.key).role==='MAIN').length),[2,2,2,2,2]);console.log('50-character layout ms',Math.round(performance.now()-start));
  p=people(10,9);s=positions(9);result=await call(p,s);check(result,p,s);
 }
 console.log('PASS balance layout: stable seed, full/partial, same-family separation, mains co-located, exact pins, class/eligibility rejection');
 }finally{await db.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
